'use client';

import React, { useEffect, useState, useMemo, Suspense, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { squareApi, favoritesApi, notesApi, authApi } from '@/lib/api/client';
import { toast } from 'sonner';
import { Search, Heart, List, Folder, Tag, MessageSquare, Check, Trash2, Pin, ChevronDown, ChevronUp } from 'lucide-react';

import UserAvatar from '@/components/ui/UserAvatar';

const NotePreviewEditor = dynamic(() => import('@/components/notes/InitializedMDXEditor'), {
  ssr: false,
  loading: () => <div style={{ padding: '20px', color: '#666', border: '2px dashed #000', borderRadius: '8px' }}>加载内容预览引擎中…</div>
});

interface NoteLike {
  user_id: string;
}

interface Profile {
  username: string | null;
  avatar_url?: string | null;
}

interface PublicNote {
  id: string;
  user_id: string;
  title: string;
  content: string;
  tags: string[] | null;
  category: string | null;
  created_at: string;
  profiles: Profile | null;
  note_likes: NoteLike[];
  favorites: { user_id: string }[];
}

interface CommentLike {
  user_id: string;
}

interface NoteComment {
  id: string;
  user_id: string;
  parent_id: string | null;
  reply_to_user_id: string | null;
  content: string;
  is_deleted: boolean;
  is_pinned: boolean;
  created_at: string;
  profiles: { username: string | null; avatar_url?: string | null } | null;
  reply_to_profile?: { username: string | null; avatar_url?: string | null } | null;
  comment_likes: CommentLike[];
}

interface CommentNode extends NoteComment {
  replies: CommentNode[];
}

function formatCommentsToTree(flatComments: unknown[]): CommentNode[] {
  const map: Record<string, CommentNode> = {};
  const roots: CommentNode[] = [];

  const coercedComments = flatComments as {
    id: string;
    user_id: string;
    note_id: string;
    content: string;
    parent_id: string | null;
    reply_to_user_id: string | null;
    is_deleted: boolean;
    is_pinned: boolean;
    created_at: string;
    profiles: unknown;
    reply_to_profile?: unknown;
    comment_likes: CommentLike[];
  }[];

  coercedComments.forEach(comment => {
    map[comment.id] = { 
      ...comment, 
      profiles: Array.isArray(comment.profiles) 
        ? (comment.profiles[0] as { username: string | null; avatar_url?: string | null }) 
        : (comment.profiles as { username: string | null; avatar_url?: string | null }),
      reply_to_profile: Array.isArray(comment.reply_to_profile) 
        ? (comment.reply_to_profile[0] as { username: string | null; avatar_url?: string | null }) 
        : (comment.reply_to_profile as { username: string | null; avatar_url?: string | null }),
      comment_likes: Array.isArray(comment.comment_likes) ? comment.comment_likes : [],
      replies: [] 
    };
  });

  coercedComments.forEach(comment => {
    const node = map[comment.id];
    if (comment.parent_id) {
      const parent = map[comment.parent_id];
      if (parent) {
        parent.replies.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  });

  return roots;
}

// Helper to strip markdown formatting for plain text excerpts
function stripMarkdown(md: string): string {
  if (!md) return '';
  return md
    .replace(/#+\s+/g, '') // Remove headers
    .replace(/\*\*|__/g, '') // Remove bold
    .replace(/\*|_/g, '') // Remove italic
    .replace(/```[\s\S]*?```/g, ' ') // Remove code blocks
    .replace(/`([^`]+)`/g, '$1') // Remove inline code
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Remove link formatting (keep text)
    .replace(/!\[[^\]]*\]\([^\)]+\)/g, '') // Remove images
    .replace(/[-*+]\s+/g, '') // Remove list bullets
    .replace(/^\s*>\s+/gm, '') // Remove blockquotes
    .replace(/\s+/g, ' ') // Flatten whitespace
    .trim();
}

export default function NoteSquare() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: '60px', fontWeight: 'bold' }}>正在为您搜罗广场上的好记…</div>}>
      <NoteSquareContent />
    </Suspense>
  );
}

function NoteSquareContent() {
  const previewEditorRef = React.useRef<import('@mdxeditor/editor').MDXEditorMethods | null>(null);
  const [notes, setNotes] = useState<PublicNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'latest' | 'likes'>('latest');

  const [mounted, setMounted] = useState(false);
  const [fetchedSingleNote, setFetchedSingleNote] = useState<PublicNote | null>(null);

  // Comments State
  const [comments, setComments] = useState<CommentNode[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  // Sorting & Collapse States
  const [commentSortBy, setCommentSortBy] = useState<'hot' | 'latest'>('hot');
  const [collapsedCommentIds, setCollapsedCommentIds] = useState<Set<string>>(new Set());

  const toggleRepliesCollapse = (commentId: string) => {
    setCollapsedCommentIds(prev => {
      const next = new Set(prev);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
  };

  const router = useRouter();
  const searchParams = useSearchParams();
  const noteIdParam = searchParams.get('noteId');

  useEffect(() => {
    setTimeout(() => setMounted(true), 0);
  }, []);

  useEffect(() => {
    async function initPage() {
      try {
        const [me, publicNotes] = await Promise.all([
          authApi.getMe().catch(() => null),
          squareApi.listNotes()
        ]);

        if (me) {
          setCurrentUserId(me.id);
        }

        const coercedNotes: PublicNote[] = (publicNotes || []).map((n: any) => ({
          id: n.id,
          user_id: n.user_id,
          title: n.title,
          content: n.content || '',
          tags: n.tags || [],
          category: n.category || null,
          created_at: n.created_at,
          profiles: n.author || null,
          note_likes: n.is_liked ? [{ user_id: me?.id || '' }] : [],
          favorites: n.is_favorited ? [{ user_id: me?.id || '' }] : []
        }));

        setNotes(coercedNotes);
      } catch (err) {
        console.error('Failed to fetch public notes:', err);
        const errMsg = err instanceof Error ? err.message : JSON.stringify(err);
        toast.error(`加载广场笔记失败: ${errMsg}`);
      } finally {
        setLoading(false);
      }
    }

    initPage();
  }, []);

  useEffect(() => {
    if (!noteIdParam) {
      setTimeout(() => setFetchedSingleNote(null), 0);
      return;
    }
    const found = notes.find(n => n.id === noteIdParam);
    if (found) {
      setTimeout(() => setFetchedSingleNote(null), 0);
      return;
    }

    async function fetchSingleNote() {
      try {
        const data = await notesApi.get(noteIdParam!);
        if (data) {
          setFetchedSingleNote({
            id: data.id,
            user_id: data.user_id,
            title: data.title,
            content: data.content || '',
            tags: data.tags || [],
            category: data.category || null,
            created_at: data.created_at,
            profiles: null,
            note_likes: [],
            favorites: [],
          });
        }
      } catch (err) {
        console.error('Failed to fetch individual public note:', err);
      }
    }
    fetchSingleNote();
  }, [noteIdParam, notes]);

  const activeNote = useMemo(() => {
    if (!noteIdParam) return null;
    const inList = notes.find(n => n.id === noteIdParam);
    return inList || fetchedSingleNote;
  }, [noteIdParam, notes, fetchedSingleNote]);

  const headings = useMemo(() => {
    if (!activeNote?.content) return [];
    const lines = activeNote.content.split('\n');
    const items: { text: string; level: number }[] = [];
    lines.forEach((line) => {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2].trim()
          .replace(/\*\*|__/g, '')
          .replace(/\*|_/g, '');
        items.push({ text, level });
      }
    });
    return items;
  }, [activeNote]);

  const handleHeadingClick = (headingText: string) => {
    const container = document.getElementById('note-preview-content-container');
    if (!container) return;
    const elements = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
    let targetElement: Element | null = null;
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (el.textContent?.trim().toLowerCase().includes(headingText.toLowerCase().trim())) {
        targetElement = el;
        break;
      }
    }
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const sortedComments = useMemo(() => {
    const sorted = [...comments];
    
    sorted.sort((a, b) => {
      // 1. Pinned comments always go first
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      
      // 2. Sort by hot or latest
      if (commentSortBy === 'hot') {
        const likesA = a.comment_likes?.length || 0;
        const likesB = b.comment_likes?.length || 0;
        if (likesB !== likesA) {
          return likesB - likesA;
        }
      }
      
      // Default to latest (newest first) for top-level
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    
    // Sort replies of each root comment chronologically (oldest first)
    sorted.forEach(root => {
      if (root.replies) {
        root.replies = [...root.replies].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      }
    });
    
    return sorted;
  }, [comments, commentSortBy]);

  const handleCommentPinToggle = async (commentId: string, currentPinned: boolean) => {
    if (!currentUserId || !activeNote) return;
    
    const toastId = toast.loading(currentPinned ? '正在取消置顶...' : '正在置顶评论...');
    try {
      await squareApi.togglePinComment(commentId, !currentPinned);
      toast.success(currentPinned ? '已取消置顶' : '已成功置顶该评论', { id: toastId });
      fetchNoteComments(activeNote.id);
    } catch (err) {
      console.error('Failed to toggle pin comment:', err);
      toast.error('操作失败，请重试', { id: toastId });
    }
  };

  useEffect(() => {
    if (activeNote) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [activeNote]);

  const openNoteModal = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('noteId', id);
    router.push(`/square?${params.toString()}`, { scroll: false });
  };

  const closeNoteModal = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('noteId');
    const query = params.toString();
    router.push(query ? `/square?${query}` : '/square', { scroll: false });
  };

  const handleCopyShareLink = (noteId: string) => {
    const shareUrl = `${window.location.origin}/square?noteId=${noteId}`;
    navigator.clipboard.writeText(shareUrl)
      .then(() => {
        toast.success('分享链接已成功复制到剪贴板！');
      })
      .catch(err => {
        console.error('Failed to copy link:', err);
        toast.error('复制链接失败，请手动复制');
      });
  };

  const handleCloneNote = async (note: PublicNote) => {
    if (!currentUserId) {
      toast.warning('请先登录账户以克隆导入笔记');
      return;
    }

    const toastId = toast.loading('正在导入笔记...');
    try {
      const data = await notesApi.create({
        title: `${note.title} (已克隆)`,
        content: note.content,
        tags: note.tags || [],
        category: note.category || '',
        is_public: false
      });

      toast.success('已成功导入，正在为您打开笔记...', { id: toastId });
      closeNoteModal();
      router.push(`/notes?noteId=${data.id}`);
    } catch (err) {
      console.error('Failed to clone note:', err);
      toast.error('导入失败，请稍后重试', { id: toastId });
    }
  };

  const fetchNoteComments = useCallback(async (noteId: string) => {
    setLoadingComments(true);
    try {
      const fullComments = await squareApi.getComments(noteId);
      const tree = formatCommentsToTree(fullComments || []);
      setComments(tree);
    } catch (err) {
      console.error('Failed to fetch comments:', err);
    } finally {
      setLoadingComments(false);
    }
  }, []);

  useEffect(() => {
    if (activeNote) {
      fetchNoteComments(activeNote.id);
    } else {
      setTimeout(() => {
        setComments([]);
        setActiveReplyId(null);
        setNewCommentText('');
        setReplyText('');
      }, 0);
    }
  }, [activeNote, fetchNoteComments]);

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserId) {
      toast.warning('请先登录以发表评论');
      return;
    }
    if (!newCommentText.trim() || !activeNote) return;

    try {
      await squareApi.createComment({
        note_id: activeNote.id,
        content: newCommentText.trim()
      });
      setNewCommentText('');
      toast.success('发表评论成功！');
      fetchNoteComments(activeNote.id);
    } catch (err) {
      console.error('Failed to post comment:', err);
      toast.error('发表评论失败，请重试');
    }
  };

  const handleInsertReply = async (parentComment: CommentNode, replyTargetUser: string) => {
    if (!currentUserId) {
      toast.warning('请先登录以回复评论');
      return;
    }
    if (!replyText.trim() || !activeNote) return;

    try {
      await squareApi.createComment({
        note_id: activeNote.id,
        content: replyText.trim(),
        parent_id: parentComment.id,
        reply_to_user_id: replyTargetUser
      });
      setReplyText('');
      setActiveReplyId(null);
      toast.success('回复发表成功！');
      fetchNoteComments(activeNote.id);
    } catch (err) {
      console.error('Failed to post reply:', err);
      toast.error('发表回复失败，请重试');
    }
  };

  const handleDeleteComment = async (comment: CommentNode) => {
    if (!currentUserId || !activeNote) return;

    try {
      await squareApi.deleteComment(comment.id);
      toast.success('已成功删除评论');
      fetchNoteComments(activeNote.id);
    } catch (err) {
      console.error('Failed to delete comment:', err);
      toast.error('删除评论失败');
    }
  };

  const handleCommentLikeToggle = async (commentId: string) => {
    if (!currentUserId) {
      toast.warning('请先登录以进行点赞');
      return;
    }
    if (!activeNote) return;

    try {
      await squareApi.toggleCommentLike(commentId);
      fetchNoteComments(activeNote.id);
    } catch (err) {
      console.error('Failed to toggle comment like:', err);
      toast.error('点赞操作失败');
    }
  };

  // Aggregate tags and count their occurrences
  const topTags = useMemo(() => {
    const counts: Record<string, number> = {};
    notes.forEach(note => {
      if (note.tags) {
        note.tags.forEach(tag => {
          if (tag) {
            counts[tag] = (counts[tag] || 0) + 1;
          }
        });
      }
    });

    return Object.entries(counts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8); // Display top 8 tags
  }, [notes]);

  // Aggregate categories and count their occurrences
  const topCategories = useMemo(() => {
    const counts: Record<string, number> = {};
    notes.forEach(note => {
      const cat = note.category?.trim() || '实践分享';
      counts[cat] = (counts[cat] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  }, [notes]);

  // Handle like toggle
  const handleLikeToggle = async (noteId: string) => {
    if (!currentUserId) {
      toast.warning('请先登录以进行点赞');
      return;
    }

    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    const isAlreadyLiked = note.note_likes.some(like => like.user_id === currentUserId);

    // Optimistic Update
    const updatedLikes = isAlreadyLiked
      ? note.note_likes.filter(like => like.user_id !== currentUserId)
      : [...note.note_likes, { user_id: currentUserId }];

    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, note_likes: updatedLikes } : n));

    try {
      await squareApi.toggleLike(noteId);
    } catch (err) {
      console.error('Failed to toggle like:', err);
      toast.error('操作失败，请重试');
      // Rollback on error
      setNotes(prev => prev.map(n => n.id === noteId ? { ...n, note_likes: note.note_likes } : n));
    }
  };

  // Handle favorite toggle
  const handleFavoriteToggle = async (noteId: string) => {
    if (!currentUserId) {
      toast.warning('请先登录以收藏笔记');
      return;
    }

    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    const isAlreadyFavorited = note.favorites ? note.favorites.some(fav => fav.user_id === currentUserId) : false;

    // Optimistic Update
    const updatedFavorites = isAlreadyFavorited
      ? note.favorites.filter(fav => fav.user_id !== currentUserId)
      : [...(note.favorites || []), { user_id: currentUserId }];

    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, favorites: updatedFavorites } : n));

    try {
      if (isAlreadyFavorited) {
        await favoritesApi.remove(noteId);
        toast.success('已取消收藏');
      } else {
        await favoritesApi.add(noteId);
        toast.success('已添加至我的收藏！');
      }
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
      toast.error('操作失败，请重试');
      // Rollback on error
      setNotes(prev => prev.map(n => n.id === noteId ? { ...n, favorites: note.favorites || [] } : n));
    }
  };

  // Filter and sort notes
  const filteredAndSortedNotes = useMemo(() => {
    let result = [...notes];

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(note => 
        note.title.toLowerCase().includes(q) || 
        note.content.toLowerCase().includes(q)
      );
    }

    // Tag filter
    if (selectedTag) {
      result = result.filter(note => note.tags?.includes(selectedTag));
    }

    // Category filter
    if (selectedCategory) {
      result = result.filter(note => {
        const cat = note.category?.trim() || '实践分享';
        return cat === selectedCategory;
      });
    }

    // Sorting
    if (sortBy === 'latest') {
      result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortBy === 'likes') {
      result.sort((a, b) => b.note_likes.length - a.note_likes.length);
    }

    return result;
  }, [notes, searchQuery, selectedTag, selectedCategory, sortBy]);

  // Map text to a stable, distributed Neo-Brutalist badge color matching demo-styles.css classes
  const getBadgeColor = (text: string | null): string => {
    if (!text) return 'yellow';
    const cleanText = text.trim();
    if (!cleanText) return 'yellow';
    const colors = ['yellow', 'pink', 'blue', 'green', 'purple', 'orange'];
    let hash = 0;
    for (let i = 0; i < cleanText.length; i++) {
      hash = cleanText.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  return (
    <section id="note-square" className="content-section active">
      <div className="square-filter-bar">
        <div className="square-search" style={{ flexGrow: 1 }}>
          <Search size={18} className="square-search-icon" />
          <input 
            type="text" 
            className="neo-input" 
            placeholder="检索广场上的优质实践笔记..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button 
          className="neo-btn primary"
          onClick={() => { setSelectedTag(null); setSelectedCategory(null); setSearchQuery(''); }}
        >
          重置筛选
        </button>
      </div>

      {/* 分类筛选 */}
      {topCategories.length > 0 && (
        <div className="square-tags" style={{ marginBottom: '12px' }}>
          <span 
            className={`neo-badge tag-pill ${selectedCategory === null ? 'bg-slate-200' : ''}`}
            onClick={() => setSelectedCategory(null)}
            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            <Folder size={13} /> 全部分类
          </span>
          {topCategories.map(({ category, count }) => {
            const colorClass = getBadgeColor(category);
            const isActive = selectedCategory === category;
            return (
              <span 
                key={category} 
                className={`neo-badge ${colorClass} tag-pill ${isActive ? 'active' : ''}`}
                onClick={() => setSelectedCategory(isActive ? null : category)}
                style={{
                  borderWidth: isActive ? '3px' : '2px',
                  boxShadow: isActive ? '3px 3px 0px #000' : '2px 2px 0px #000',
                  fontWeight: isActive ? '800' : 'normal',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                {isActive ? <Check size={12} /> : <Folder size={12} />} {category} ({count})
              </span>
            );
          })}
        </div>
      )}

      {/* 标签筛选 */}
      {topTags.length > 0 && (
        <div className="square-tags" style={{ marginBottom: '20px' }}>
          <span 
            className={`neo-badge tag-pill ${selectedTag === null ? 'bg-slate-200' : ''}`}
            onClick={() => setSelectedTag(null)}
            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            <Tag size={13} /> 全部标签
          </span>
          {topTags.map(({ tag, count }) => {
            const colorClass = getBadgeColor(tag);
            const isActive = selectedTag === tag;
            return (
              <span 
                key={tag} 
                className={`neo-badge ${colorClass} tag-pill ${isActive ? 'active' : ''}`}
                onClick={() => setSelectedTag(isActive ? null : tag)}
                style={{
                  borderWidth: isActive ? '3px' : '2px',
                  boxShadow: isActive ? '3px 3px 0px #000' : '2px 2px 0px #000',
                  fontWeight: isActive ? '800' : 'normal',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                {isActive ? <Check size={12} /> : <Tag size={12} />} {tag} ({count})
              </span>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', margin: '0 0 20px 0' }}>
        <button 
          className={`neo-btn ${sortBy === 'latest' ? 'primary' : ''}`}
          style={{ padding: '6px 16px', fontSize: '13px' }}
          onClick={() => setSortBy('latest')}
        >
          最新发布
        </button>
        <button 
          className={`neo-btn ${sortBy === 'likes' ? 'primary' : ''}`}
          style={{ padding: '6px 16px', fontSize: '13px' }}
          onClick={() => setSortBy('likes')}
        >
          最多点赞
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px', fontWeight: 'bold' }}>
          正在为您搜罗广场上的好记...
        </div>
      ) : filteredAndSortedNotes.length === 0 ? (
        <div className="neo-card text-center" style={{ padding: '40px', fontWeight: 'bold', color: '#64748b' }}>
          目前没有任何公开笔记，快去主页分享第一篇吧！🚀
        </div>
      ) : (
        <div className="notes-masonry">
          {filteredAndSortedNotes.map((note) => {
            const isLiked = currentUserId ? note.note_likes.some(like => like.user_id === currentUserId) : false;
            const authorName = note.profiles?.username || '匿名';
            const categoryText = note.category || '实践分享';
            const badgeColorClass = getBadgeColor(categoryText);
            
            // Format time difference
            const timeStr = (() => {
              const diffMs = Date.now() - new Date(note.created_at).getTime();
              const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
              if (diffHrs < 1) return '刚刚';
              if (diffHrs < 24) return `${diffHrs}小时前`;
              const diffDays = Math.floor(diffHrs / 24);
              return `${diffDays}天前`;
            })();

            const contentText = stripMarkdown(note.content);

            return (
              <div 
                key={note.id} 
                className="neo-card note-card"
                style={{ cursor: 'pointer' }}
                onClick={() => openNoteModal(note.id)}
              >
                <div>
                  <div className="note-card-header">
                    <span 
                      className={`neo-badge ${badgeColorClass}`}
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCategory(selectedCategory === categoryText ? null : categoryText);
                      }}
                      title={`筛选分类: ${categoryText}`}
                    >
                      {categoryText}
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#666' }}>{timeStr}</span>
                  </div>
                  <h3 className="note-card-title">{note.title}</h3>
                  <p className="note-card-excerpt">
                    {contentText || '无具体正文内容'}
                  </p>
                  
                  {note.tags && note.tags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
                      {note.tags.map((tag) => {
                        const tagColorClass = getBadgeColor(tag);
                        return (
                          <span 
                            key={tag} 
                            className={`neo-badge ${tagColorClass}`}
                            style={{ fontSize: '10px', padding: '2px 6px', cursor: 'pointer' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTag(selectedTag === tag ? null : tag);
                            }}
                          >
                            #{tag}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="note-card-footer">
                  <div className="note-author" onClick={(e) => e.stopPropagation()}>
                    <UserAvatar username={authorName} avatarUrl={note.profiles?.avatar_url} size={24} />
                    {authorName}
                  </div>
                  <div className="note-interactions">
                    <button 
                      className={`interaction-btn ${isLiked ? 'liked' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLikeToggle(note.id);
                      }}
                      title={isLiked ? '取消点赞' : '点赞'}
                    >
                      <svg viewBox="0 0 24 24"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                      <span>{note.note_likes.length}</span>
                    </button>
                    <button 
                      className={`interaction-btn ${currentUserId && note.favorites && note.favorites.some(fav => fav.user_id === currentUserId) ? 'favorited' : ''}`} 
                      title={currentUserId && note.favorites && note.favorites.some(fav => fav.user_id === currentUserId) ? '取消收藏' : '加入收藏'}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFavoriteToggle(note.id);
                      }}
                    >
                      <svg viewBox="0 0 24 24"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z"/></svg>
                      <span>{note.favorites ? note.favorites.length : 0}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 沉浸式只读详情弹窗 */}
      {mounted && activeNote && typeof document !== 'undefined' && createPortal(
        <div 
          style={{ 
            position: 'fixed', 
            inset: 0, 
            backgroundColor: 'rgba(0,0,0,0.4)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            zIndex: 1000, 
            backdropFilter: 'blur(2px)' 
          }} 
          onClick={closeNoteModal}
        >
          <div 
            style={{ 
              background: 'var(--neo-white)', 
              border: '3px solid var(--border-color, #000)', 
              width: '95%', 
              maxWidth: '1000px', 
              maxHeight: '90vh', 
              display: 'flex', 
              flexDirection: 'column', 
              borderRadius: '12px', 
              boxShadow: '8px 8px 0px 0px var(--border-color, #000)', 
              overflow: 'hidden' 
            }} 
            onClick={e => e.stopPropagation()}
          >
            {/* 弹窗头部 */}
            <div style={{ padding: '20px 24px 0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexGrow: 1 }}>
                <div>
                  <span className={`neo-badge ${getBadgeColor(activeNote.category)}`} style={{ fontSize: '11px', textTransform: 'uppercase' }}>
                    {activeNote.category || '实践分享'}
                  </span>
                </div>
                <h2 className="neo-title" style={{ fontSize: '22px', margin: 0, fontWeight: '900', wordBreak: 'break-word', lineHeight: '1.3' }}>
                  {activeNote.title}
                </h2>
              </div>
              <button 
                className="neo-btn" 
                onClick={closeNoteModal}
                style={{ 
                  backgroundColor: 'var(--neo-pink)', 
                  padding: '6px 12px', 
                  fontSize: '14px', 
                  fontWeight: 'bold', 
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >
                ✕
              </button>
            </div>

            {/* 作者与标签栏 */}
            <div style={{ padding: '0 24px 16px 24px' }}>
              <div style={{ borderBottom: '2px dashed var(--border-color, #000)', margin: '16px 0 12px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#666', fontWeight: '600' }}>
                  <UserAvatar username={activeNote.profiles?.username} avatarUrl={activeNote.profiles?.avatar_url} size={24} />
                  <span style={{ color: '#000', fontWeight: '800' }}>{activeNote.profiles?.username || '匿名'}</span>
                  <span>•</span>
                  <span>发布于 {new Date(activeNote.created_at).toLocaleString('zh-CN')}</span>
                </div>
                
                {activeNote.tags && activeNote.tags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {activeNote.tags.map(tag => (
                      <span 
                        key={tag} 
                        className={`neo-badge ${getBadgeColor(tag)}`} 
                        style={{ fontSize: '9px', padding: '1px 5px' }}
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 主体双栏区域 (左侧导航 + 右侧正文评论) */}
            <div style={{ 
              flex: 1, 
              display: 'flex',
              overflow: 'hidden',
              borderTop: '2px solid var(--border-color, #000)', 
              borderBottom: '2px solid var(--border-color, #000)',
            }}>
              {/* 左侧导航栏 (Table of Contents) */}
              <div style={{
                width: '220px',
                flexShrink: 0,
                borderRight: '2px solid var(--border-color, #000)',
                backgroundColor: '#f8fafc',
                padding: '20px 16px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                <h4 style={{ fontSize: '13px', margin: '0 0 8px 0', fontWeight: '900', textTransform: 'uppercase', color: '#666', borderBottom: '1.5px solid #000', paddingBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <List size={15} style={{ color: '#000' }} /> 笔记大纲
                </h4>
                {headings.length === 0 ? (
                  <div style={{ fontSize: '12px', color: '#999', fontStyle: 'italic' }}>
                    本篇笔记无大纲标题
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {headings.map((h, i) => {
                      const indent = Math.max(0, (h.level - 1) * 12);
                      return (
                        <button
                          key={i}
                          onClick={() => handleHeadingClick(h.text)}
                          style={{
                            background: 'none',
                            border: 'none',
                            textAlign: 'left',
                            padding: '4px 6px',
                            fontSize: '12.5px',
                            fontWeight: 'bold',
                            color: '#1e293b',
                            cursor: 'pointer',
                            paddingLeft: `${indent + 6}px`,
                            borderRadius: '4px',
                            transition: 'all 0.15s ease',
                            borderLeft: h.level === 1 ? '3px solid var(--neo-blue, #2563eb)' : '2px solid transparent'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#e2e8f0';
                            e.currentTarget.style.color = '#000';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.color = '#1e293b';
                          }}
                        >
                          {h.text}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 右侧正文滚动与评论交流区 */}
              <div style={{ 
                flex: 1, 
                overflowY: 'auto', 
                backgroundColor: 'var(--bg-main)',
                display: 'flex',
                flexDirection: 'column'
              }}>
                {/* 笔记正文 */}
                <div id="note-preview-content-container" style={{ padding: '20px 24px', borderBottom: '2px dashed var(--border-color, #000)' }}>
                <NotePreviewEditor 
                  markdown={activeNote.content} 
                  ref={previewEditorRef}
                  onChange={() => {}} 
                  readOnly={true} 
                  mode="markdown"
                />
              </div>

              {/* 评论交流区 */}
              <div style={{ padding: '20px 24px', backgroundColor: 'var(--bg-sidebar)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 className="neo-title" style={{ fontSize: '15px', marginTop: 0, marginBottom: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MessageSquare size={16} /> 评论交流 ({comments.reduce((acc, c) => acc + 1 + c.replies.length, 0)})
                  </h3>
                  
                  {/* 评论排序切换 */}
                  <div style={{ display: 'flex', gap: '8px', fontSize: '12px', fontWeight: 'bold' }}>
                    <button
                      onClick={() => setCommentSortBy('hot')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: commentSortBy === 'hot' ? 'var(--neo-blue)' : '#94a3b8',
                        cursor: 'pointer',
                        padding: '2px 4px',
                        fontWeight: '800',
                        borderBottom: commentSortBy === 'hot' ? '2px solid var(--neo-blue)' : '2px solid transparent'
                      }}
                    >
                      最热
                    </button>
                    <span style={{ color: '#cbd5e1' }}>|</span>
                    <button
                      onClick={() => setCommentSortBy('latest')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: commentSortBy === 'latest' ? 'var(--neo-blue)' : '#94a3b8',
                        cursor: 'pointer',
                        padding: '2px 4px',
                        fontWeight: '800',
                        borderBottom: commentSortBy === 'latest' ? '2px solid var(--neo-blue)' : '2px solid transparent'
                      }}
                    >
                      最新
                    </button>
                  </div>
                </div>

                {/* 发表顶级评论输入框 */}
                <form onSubmit={handleSubmitComment} style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input 
                      type="text" 
                      value={newCommentText}
                      onChange={e => setNewCommentText(e.target.value)}
                      placeholder={currentUserId ? "写下你的实践心得..." : "请登录后参与评论讨论"}
                      disabled={!currentUserId}
                      className="neo-input"
                      style={{ flexGrow: 1, padding: '8px 12px', fontSize: '13px' }}
                    />
                    <button 
                      type="submit" 
                      className="neo-btn info font-bold"
                      style={{ padding: '8px 16px', fontSize: '13px', whiteSpace: 'nowrap' }}
                      disabled={!currentUserId || !newCommentText.trim()}
                    >
                      发表评论
                    </button>
                  </div>
                </form>

                {/* 评论列表 */}
                {loadingComments && comments.length === 0 ? (
                  <div style={{ padding: '20px 0', textAlign: 'center', fontSize: '13px', color: '#666', fontWeight: 'bold' }}>
                    加载评论中...
                  </div>
                ) : comments.length === 0 ? (
                  <div style={{ padding: '20px 0', textAlign: 'center', fontSize: '13px', color: '#999', fontStyle: 'italic' }}>
                    暂无评论，留下第一个脚印吧！
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {sortedComments.map((comment) => {
                      const isCommentLiked = currentUserId ? comment.comment_likes.some(like => like.user_id === currentUserId) : false;
                      const authorName = comment.profiles?.username || '匿名';
                      
                      return (
                        <div key={comment.id} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          
                          {/* 一级评论内容 */}
                          <div style={{ padding: '10px 14px', background: 'var(--bg-card)', borderRadius: '6px', border: '2px solid var(--border-color)', boxShadow: '2px 2px 0px var(--border-color)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'bold', flexWrap: 'wrap' }}>
                                <UserAvatar username={authorName} avatarUrl={comment.profiles?.avatar_url} size={20} />
                                <span style={{ color: 'var(--text-primary)', fontWeight: '800' }}>{authorName}</span>
                                
                                {comment.user_id === activeNote.user_id && (
                                  <span 
                                    className="neo-badge pink" 
                                    style={{ 
                                      fontSize: '8px', 
                                      padding: '1px 4px', 
                                      lineHeight: 1, 
                                      transform: 'scale(0.9)', 
                                      marginLeft: '-2px',
                                      backgroundColor: 'var(--neo-pink)',
                                      color: '#fff',
                                      borderWidth: '1px',
                                      boxShadow: '1px 1px 0px #000'
                                    }}
                                  >
                                    作者
                                  </span>
                                )}

                                {comment.is_pinned && (
                                  <span 
                                    style={{ 
                                      fontSize: '9px', 
                                      color: 'var(--neo-pink)', 
                                      display: 'inline-flex', 
                                      alignItems: 'center', 
                                      gap: '2px', 
                                      fontWeight: '800', 
                                      marginLeft: '4px',
                                      border: '1px solid var(--neo-pink)',
                                      borderRadius: '3px',
                                      padding: '1px 4px'
                                    }}
                                  >
                                    <Pin size={9} style={{ transform: 'rotate(45deg)' }} /> 置顶
                                  </span>
                                )}

                                <span>•</span>
                                <span>{new Date(comment.created_at).toLocaleString('zh-CN')}</span>
                              </div>
                            </div>

                            <p style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: '700', color: comment.is_deleted ? 'var(--text-muted)' : 'var(--text-primary)', fontStyle: comment.is_deleted ? 'italic' : 'normal' }}>
                              {comment.is_deleted ? '该评论已被作者删除' : comment.content}
                            </p>

                            {!comment.is_deleted && (
                              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', fontSize: '12px' }}>
                                {currentUserId === activeNote.user_id && comment.parent_id === null && (
                                  <button
                                    style={{ background: 'none', border: 'none', color: 'var(--neo-blue)', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', padding: 0 }}
                                    onClick={() => handleCommentPinToggle(comment.id, !!comment.is_pinned)}
                                  >
                                    <Pin size={12} style={{ transform: comment.is_pinned ? 'none' : 'rotate(45deg)' }} /> 
                                    {comment.is_pinned ? '取消置顶' : '置顶'}
                                  </button>
                                )}

                                <button 
                                  style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', padding: 0 }}
                                  onClick={() => {
                                    setActiveReplyId(comment.id);
                                    setReplyText('');
                                  }}
                                >
                                  <MessageSquare size={13} /> 回复
                                </button>
                                
                                {(currentUserId === comment.user_id || currentUserId === activeNote.user_id) && (
                                  <button 
                                    style={{ background: 'none', border: 'none', color: 'var(--neo-pink)', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', padding: 0 }}
                                    onClick={() => handleDeleteComment(comment)}
                                  >
                                    <Trash2 size={13} /> 删除
                                  </button>
                                )}

                                <button 
                                  className={`comment-like-btn ${isCommentLiked ? 'liked' : ''}`}
                                  onClick={() => handleCommentLikeToggle(comment.id)}
                                >
                                  <Heart />
                                  <span>{comment.comment_likes.length}</span>
                                </button>
                              </div>
                            )}
                          </div>

                           {/* 折叠/展开二级回复按钮 */}
                           {comment.replies && comment.replies.length > 0 && (
                             <button
                               onClick={() => toggleRepliesCollapse(comment.id)}
                               style={{
                                 background: 'none',
                                 border: 'none',
                                 color: 'var(--neo-blue)',
                                 cursor: 'pointer',
                                 fontWeight: 'bold',
                                 fontSize: '12px',
                                 padding: '2px 0 2px 32px',
                                 display: 'flex',
                                 alignItems: 'center',
                                 gap: '4px',
                                 alignSelf: 'flex-start'
                               }}
                             >
                               {collapsedCommentIds.has(comment.id) ? (
                                 <>
                                   <ChevronDown size={13} /> 展开回复 ({comment.replies.length}条)
                                 </>
                               ) : (
                                 <>
                                   <ChevronUp size={13} /> 收起回复
                                 </>
                               )}
                             </button>
                           )}

                           {/* 二级回复展示 */}
                           {comment.replies && comment.replies.length > 0 && !collapsedCommentIds.has(comment.id) && (
                             <div style={{ paddingLeft: '32px', display: 'flex', flexDirection: 'column', gap: '10px', borderLeft: '2px dashed var(--border-color, #000)', marginLeft: '10px' }}>
                              {comment.replies.map((reply) => {
                                const isReplyLiked = currentUserId ? reply.comment_likes.some(like => like.user_id === currentUserId) : false;
                                const replyAuthorName = reply.profiles?.username || '匿名';
                                const replyToName = reply.reply_to_profile?.username || '匿名';
                                
                                return (
                                  <div key={reply.id} style={{ padding: '8px 12px', background: 'var(--bg-disabled)', color: 'var(--text-primary)', borderRadius: '6px', border: '1.5px solid var(--border-color)', boxShadow: '1.5px 1.5px 0px var(--border-color)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'bold', flexWrap: 'wrap' }}>
                                        <UserAvatar username={replyAuthorName} avatarUrl={reply.profiles?.avatar_url} size={18} />
                                        <span style={{ color: 'var(--text-primary)', fontWeight: '800' }}>{replyAuthorName}</span>
                                        
                                        {reply.user_id === activeNote.user_id && (
                                          <span 
                                            className="neo-badge pink" 
                                            style={{ 
                                              fontSize: '8px', 
                                              padding: '1px 4px', 
                                              lineHeight: 1, 
                                              transform: 'scale(0.9)', 
                                              marginLeft: '-2px',
                                              backgroundColor: 'var(--neo-pink)',
                                              color: '#fff',
                                              borderWidth: '1px',
                                              boxShadow: '1px 1px 0px #000'
                                            }}
                                          >
                                            作者
                                          </span>
                                        )}

                                        <span>•</span>
                                        <span>{new Date(reply.created_at).toLocaleString('zh-CN')}</span>
                                      </div>
                                    </div>

                                    <p style={{ margin: '0 0 8px 0', fontSize: '12.5px', fontWeight: '600', color: reply.is_deleted ? 'var(--text-muted)' : 'var(--text-primary)', fontStyle: reply.is_deleted ? 'italic' : 'normal' }}>
                                      {!reply.is_deleted && reply.reply_to_user_id && (
                                        <span style={{ color: 'var(--neo-blue)', marginRight: '6px', fontWeight: '800' }}>
                                          @{replyToName}
                                        </span>
                                      )}
                                      {reply.is_deleted ? '该回复已被作者删除' : reply.content}
                                    </p>

                                    {!reply.is_deleted && (
                                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', fontSize: '11.5px' }}>
                                        <button 
                                          style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', padding: 0 }}
                                          onClick={() => {
                                            setActiveReplyId(reply.id);
                                            setReplyText('');
                                          }}
                                        >
                                          <MessageSquare size={12} /> 回复
                                        </button>
                                        
                                        {(currentUserId === reply.user_id || currentUserId === activeNote.user_id) && (
                                          <button 
                                            style={{ background: 'none', border: 'none', color: 'var(--neo-pink)', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', padding: 0 }}
                                            onClick={() => handleDeleteComment(reply)}
                                          >
                                            <Trash2 size={12} /> 删除
                                          </button>
                                        )}

                                        <button 
                                          className={`comment-like-btn ${isReplyLiked ? 'liked' : ''}`}
                                          onClick={() => handleCommentLikeToggle(reply.id)}
                                        >
                                          <Heart />
                                          <span>{reply.comment_likes.length}</span>
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* 针对当前评论/回复的展开回复输入框 */}
                          {activeReplyId && (activeReplyId === comment.id || comment.replies.some(r => r.id === activeReplyId)) && (
                            <div style={{ paddingLeft: '32px', marginTop: '4px' }}>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <input 
                                  type="text" 
                                  value={replyText}
                                  onChange={e => setReplyText(e.target.value)}
                                  placeholder={`回复 @${
                                    activeReplyId === comment.id 
                                      ? (comment.profiles?.username || '匿名') 
                                      : (comment.replies.find(r => r.id === activeReplyId)?.profiles?.username || '匿名')
                                  }...`}
                                  className="neo-input"
                                  style={{ flexGrow: 1, padding: '6px 10px', fontSize: '12px' }}
                                />
                                <button 
                                  className="neo-btn info font-bold"
                                  style={{ padding: '6px 12px', fontSize: '12px', whiteSpace: 'nowrap' }}
                                  onClick={() => {
                                    const targetUser = activeReplyId === comment.id 
                                      ? comment.user_id 
                                      : comment.replies.find(r => r.id === activeReplyId)!.user_id;
                                    handleInsertReply(comment, targetUser);
                                  }}
                                  disabled={!replyText.trim()}
                                >
                                  提交回复
                                </button>
                                <button 
                                  className="neo-btn"
                                  style={{ padding: '6px 12px', fontSize: '12px', background: 'var(--bg-btn-secondary)', color: 'var(--text-primary)' }}
                                  onClick={() => setActiveReplyId(null)}
                                >
                                  取消
                                </button>
                              </div>
                            </div>
                          )}

                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            </div>

            {/* 底部联动操控区 */}
            <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', background: '#f8fafc' }}>
              <button 
                className="neo-btn primary" 
                style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 'bold' }}
                onClick={() => handleCopyShareLink(activeNote.id)}
              >
                复制分享链接
              </button>

              <button 
                className="neo-btn" 
                style={{ 
                  padding: '8px 16px', 
                  fontSize: '13px', 
                  fontWeight: 'bold',
                  backgroundColor: currentUserId && activeNote.favorites && activeNote.favorites.some(fav => fav.user_id === currentUserId) ? 'var(--neo-yellow)' : '#fff'
                }}
                onClick={() => handleFavoriteToggle(activeNote.id)}
              >
                {currentUserId && activeNote.favorites && activeNote.favorites.some(fav => fav.user_id === currentUserId) ? '★ 已收藏' : '☆ 收藏'}
              </button>

              {currentUserId === activeNote.user_id ? (
                <button 
                  className="neo-btn info" 
                  style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 'bold' }}
                  onClick={() => {
                    closeNoteModal();
                    router.push(`/notes?noteId=${activeNote.id}`);
                  }}
                >
                  去工作台编辑
                </button>
              ) : (
                <button 
                  className="neo-btn success" 
                  style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 'bold' }}
                  onClick={() => handleCloneNote(activeNote)}
                >
                  一键导入到我的笔记
                </button>
              )}
              
              <button 
                className="neo-btn" 
                style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 'bold', background: '#e2e8f0' }}
                onClick={closeNoteModal}
              >
                关闭
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}
