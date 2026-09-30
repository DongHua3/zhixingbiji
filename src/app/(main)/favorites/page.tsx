'use client';

import React, { useEffect, useState, useMemo, Suspense, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { favoritesApi, squareApi, notesApi, authApi } from '@/lib/api/client';
import { toast } from 'sonner';
import { Search, Heart, Tag, MessageSquare, Check, Trash2, Pin, ChevronDown, ChevronUp, Edit3, X, Eye, List, Folder } from 'lucide-react';

import UserAvatar from '@/components/ui/UserAvatar';

const NotePreviewEditor = dynamic(() => import('@/components/notes/InitializedMDXEditor'), {
  ssr: false,
  loading: () => <div style={{ padding: '20px', color: '#666', border: '2px dashed #000', borderRadius: '8px' }}>加载内容预览引擎中…</div>
});

interface Profile {
  username: string | null;
  avatar_url?: string | null;
}

interface NoteLike {
  user_id: string;
}

interface FavoriteLike {
  user_id: string;
}

interface FavNote {
  id: string;
  user_id: string;
  title: string;
  content: string;
  tags: string[] | null;
  category: string | null;
  created_at: string;
  profiles: Profile | null;
  note_likes: NoteLike[];
  favorites: FavoriteLike[];
}

interface FavoriteItem {
  id: string;
  insights: string;
  tags: string[];
  created_at: string;
  note: FavNote | null;
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

function stripMarkdown(md: string): string {
  if (!md) return '';
  return md
    .replace(/#+\s+/g, '')
    .replace(/\*\*|__/g, '')
    .replace(/\*|_/g, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/!\[[^\]]*\]\([^\)]+\)/g, '')
    .replace(/[-*+]\s+/g, '')
    .replace(/^\s*>\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function MyFavorites() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: '60px', fontWeight: 'bold' }}>正在加载您的收藏夹…</div>}>
      <MyFavoritesContent />
    </Suspense>
  );
}

function MyFavoritesContent() {
  const previewEditorRef = React.useRef<import('@mdxeditor/editor').MDXEditorMethods | null>(null);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Editing states for Insight
  const [editingInsightId, setEditingInsightId] = useState<string | null>(null);
  const [tempInsightText, setTempInsightText] = useState('');

  // Editing states for Custom Tags
  const [editingTagsId, setEditingTagsId] = useState<string | null>(null);
  const [tempTags, setTempTags] = useState<string[]>([]);
  const [newTagText, setNewTagText] = useState('');

  // Modal details display states
  const [mounted, setMounted] = useState(false);
  const [previewNote, setPreviewNote] = useState<FavNote | null>(null);

  // Comments inside modal details
  const [comments, setComments] = useState<CommentNode[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
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

  const fetchFavorites = async () => {
    try {
      const favs = await favoritesApi.list();
      const items: FavoriteItem[] = (favs || []).map((f: any) => ({
        id: f.note_id,
        insights: f.insights || '',
        tags: f.tags || [],
        created_at: f.created_at,
        note: f.note ? {
          id: f.note.id,
          user_id: '',
          title: f.note.title,
          content: f.note.content || '',
          tags: f.note.tags || [],
          category: f.note.category || null,
          created_at: f.note.created_at,
          profiles: f.note.author,
          note_likes: f.note.is_liked ? [{ user_id: currentUserId || '' }] : [],
          favorites: [{ user_id: currentUserId || '' }]
        } : null
      }));
      setFavorites(items);
    } catch (err) {
      console.error('Failed to fetch favorites:', err);
      toast.error('加载收藏夹失败');
    }
  };

  useEffect(() => {
    async function initFavorites() {
      try {
        const me = await authApi.getMe();
        if (me) {
          setCurrentUserId(me.id);
          await fetchFavorites();
        } else {
          router.push('/login');
        }
      } catch (err) {
        console.error('Failed to init favorites:', err);
        router.push('/login');
      } finally {
        setLoading(false);
      }
    }
    initFavorites();
  }, [router]);

  // Load preview note when URL parameter noteId changes
  useEffect(() => {
    if (!noteIdParam) {
      setTimeout(() => setPreviewNote(null), 0);
      return;
    }
    const foundFav = favorites.find(f => f.note?.id === noteIdParam);
    if (foundFav && foundFav.note) {
      setTimeout(() => setPreviewNote(foundFav.note), 0);
      return;
    }

    async function fetchSingleNote() {
      try {
        const data = await notesApi.get(noteIdParam!);
        if (data) {
          setTimeout(() => {
            setPreviewNote({
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
          }, 0);
        }
      } catch (err) {
        console.error('Failed to fetch individual public note details:', err);
      }
    }
    fetchSingleNote();
  }, [noteIdParam, favorites]);

  const activeNote = previewNote;

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
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      if (commentSortBy === 'hot') {
        const likesA = a.comment_likes?.length || 0;
        const likesB = b.comment_likes?.length || 0;
        if (likesB !== likesA) return likesB - likesA;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
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

  const openNoteModal = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('noteId', id);
    router.push(`/favorites?${params.toString()}`, { scroll: false });
  };

  const closeNoteModal = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('noteId');
    const query = params.toString();
    router.push(query ? `/favorites?${query}` : '/favorites', { scroll: false });
  };

  const handleCopyShareLink = (noteId: string) => {
    const shareUrl = `${window.location.origin}/square?noteId=${noteId}`;
    navigator.clipboard.writeText(shareUrl)
      .then(() => toast.success('分享链接已成功复制到剪贴板！'))
      .catch(err => {
        console.error('Failed to copy link:', err);
        toast.error('复制链接失败，请手动复制');
      });
  };

  const handleCloneNote = async (note: FavNote) => {
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
    if (!currentUserId) return;
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
    if (!currentUserId) return;
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
    if (!currentUserId || !activeNote) return;

    try {
      await squareApi.toggleCommentLike(commentId);
      fetchNoteComments(activeNote.id);
    } catch (err) {
      console.error('Failed to toggle comment like:', err);
      toast.error('点赞操作失败');
    }
  };

  // Toggle favorite (cancellation)
  const handleRemoveFavorite = async (favId: string) => {
    if (!currentUserId) return;
    const toastId = toast.loading('正在移除收藏...');
    try {
      await favoritesApi.remove(favId);
      toast.success('已成功取消收藏', { id: toastId });
      setFavorites(prev => prev.filter(f => f.id !== favId));
    } catch (err) {
      console.error('Failed to remove favorite:', err);
      toast.error('取消收藏失败', { id: toastId });
    }
  };

  // Favorite toggle inside modal details
  const handleFavoriteToggleInModal = async (noteId: string) => {
    if (!currentUserId || !activeNote) return;
    const foundFav = favorites.find(f => f.note?.id === noteId);

    if (foundFav) {
      const toastId = toast.loading('正在移除收藏...');
      try {
        await favoritesApi.remove(noteId);
        toast.success('已成功取消收藏', { id: toastId });
        setFavorites(prev => prev.filter(f => f.id !== noteId));
        setPreviewNote(prev => prev ? {
          ...prev,
          favorites: prev.favorites.filter(f => f.user_id !== currentUserId)
        } : null);
      } catch (err) {
        console.error('Failed to remove favorite in modal:', err);
        toast.error('操作失败', { id: toastId });
      }
    } else {
      const toastId = toast.loading('正在添加收藏...');
      try {
        await favoritesApi.add(noteId);
        toast.success('已成功加入您的收藏夹！', { id: toastId });
        await fetchFavorites();
        setPreviewNote(prev => prev ? {
          ...prev,
          favorites: [...prev.favorites, { user_id: currentUserId }]
        } : null);
      } catch (err) {
        console.error('Failed to add favorite in modal:', err);
        toast.error('操作失败', { id: toastId });
      }
    }
  };

  // Save personal insights
  const handleSaveInsight = async (favId: string) => {
    const toastId = toast.loading('正在保存感悟...');
    try {
      await favoritesApi.update(favId, { insights: tempInsightText.trim() });
      toast.success('感悟保存成功！', { id: toastId });
      setFavorites(prev => prev.map(f => f.id === favId ? { ...f, insights: tempInsightText.trim() } : f));
      setEditingInsightId(null);
    } catch (err) {
      console.error('Failed to save insights:', err);
      toast.error('保存失败，请稍后重试', { id: toastId });
    }
  };

  // Save custom tags
  const handleSaveTags = async (favId: string, updatedTagsList: string[]) => {
    try {
      await favoritesApi.update(favId, { tags: updatedTagsList });
      setFavorites(prev => prev.map(f => f.id === favId ? { ...f, tags: updatedTagsList } : f));
    } catch (err) {
      console.error('Failed to save tags:', err);
      toast.error('更新标签失败');
    }
  };

  const handleAddTag = (favId: string) => {
    const cleanTag = newTagText.trim();
    if (!cleanTag) return;
    if (tempTags.includes(cleanTag)) {
      toast.warning('标签已存在');
      return;
    }
    const nextTags = [...tempTags, cleanTag];
    setTempTags(nextTags);
    setNewTagText('');
    handleSaveTags(favId, nextTags);
  };

  const handleRemoveTag = (favId: string, indexToRemove: number) => {
    const nextTags = tempTags.filter((_, i) => i !== indexToRemove);
    setTempTags(nextTags);
    handleSaveTags(favId, nextTags);
  };

  // Aggregate all custom tags from favorites to display a tag filter
  const allCustomTags = useMemo(() => {
    const tagsSet = new Set<string>();
    favorites.forEach(f => {
      f.tags.forEach(t => {
        if (t) tagsSet.add(t.trim());
      });
    });
    return Array.from(tagsSet);
  }, [favorites]);

  // Filter notes
  const filteredFavorites = useMemo(() => {
    let result = [...favorites];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(f => 
        (f.note?.title || '').toLowerCase().includes(q) ||
        (f.note?.content || '').toLowerCase().includes(q) ||
        f.insights.toLowerCase().includes(q)
      );
    }

    if (selectedTag) {
      result = result.filter(f => f.tags.includes(selectedTag));
    }

    return result;
  }, [favorites, searchQuery, selectedTag]);

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
    <section id="my-favorites" className="content-section active">
      {/* Banner Header */}
      <div className="neo-card no-hover" style={{ backgroundColor: 'var(--neo-orange)', padding: '30px', marginBottom: '30px', color: '#fff' }}>
        <h1 className="neo-title" style={{ fontSize: '28px', marginBottom: '8px', fontWeight: '900', color: '#fff' }}>我的收藏与内化 ⭐</h1>
        <p style={{ fontWeight: 600, fontSize: '15px', color: '#fff' }}>知识不能仅仅停留在收藏夹。在这里，为他人的优秀笔记添加你的个人感悟与专属标签，将外部知识内化为个人体系。</p>
      </div>

      <div className="square-filter-bar">
        <div className="square-search" style={{ flexGrow: 1 }}>
          <Search size={18} className="square-search-icon" />
          <input 
            type="text" 
            className="neo-input" 
            placeholder="在我的收藏中全局检索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button 
          className="neo-btn primary"
          onClick={() => { setSelectedTag(null); setSearchQuery(''); }}
        >
          重置筛选
        </button>
      </div>

      {/* 收藏标签过滤 */}
      {allCustomTags.length > 0 && (
        <div className="square-tags" style={{ marginBottom: '20px' }}>
          <span 
            className={`neo-badge tag-pill ${selectedTag === null ? 'bg-slate-200' : ''}`}
            onClick={() => setSelectedTag(null)}
            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            <Tag size={13} /> 全部收藏
          </span>
          {allCustomTags.map(tag => {
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
                {isActive ? <Check size={12} /> : <Tag size={12} />} {tag}
              </span>
            );
          })}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px', fontWeight: 'bold' }}>
          正在加载您的收藏夹...
        </div>
      ) : filteredFavorites.length === 0 ? (
        <div className="neo-card text-center" style={{ padding: '40px', fontWeight: 'bold', color: '#64748b' }}>
          {searchQuery || selectedTag ? '没有找到符合筛选的收藏项' : '您还没有收藏任何笔记，快去笔记广场逛逛吧！⭐'}
        </div>
      ) : (
        <div className="notes-masonry">
          {filteredFavorites.map((fav) => {
            const note = fav.note;
            
            // Handle invalid/deleted notes
            if (!note) {
              return (
                <div key={fav.id} className="neo-card note-card" style={{ background: '#fef2f2', borderColor: '#f87171' }}>
                  <div style={{ flexGrow: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span className="neo-badge" style={{ backgroundColor: '#fee2e2', color: '#ef4444', borderColor: '#ef4444' }}>失效提醒</span>
                    </div>
                    <h3 className="note-card-title" style={{ color: '#ef4444' }}>此笔记已被原作者删除或转为私密</h3>
                    <p className="note-card-excerpt" style={{ color: '#7f1d1d' }}>
                      您依然可以查看并管理在收藏该笔记时留下的感悟备注：
                    </p>
                    
                    <div className="insight-section" style={{ borderColor: '#ef4444' }}>
                      💡 {fav.insights || '无感悟备注'}
                    </div>
                  </div>
                  <div className="note-card-footer" style={{ borderTop: '2px dashed #f87171' }}>
                    <span style={{ fontSize: '11px', color: '#991b1b', fontWeight: 'bold' }}>
                      收藏于: {new Date(fav.created_at).toLocaleDateString()}
                    </span>
                    <button 
                      className="interaction-btn" 
                      onClick={() => handleRemoveFavorite(fav.id)}
                      style={{ color: '#ef4444' }}
                    >
                      <Trash2 size={14} /> 移除
                    </button>
                  </div>
                </div>
              );
            }

            const authorName = note.profiles?.username || '匿名';
            const categoryText = note.category || '实践分享';
            const badgeColorClass = getBadgeColor(categoryText);
            const contentExcerpt = stripMarkdown(note.content);

            const isLiked = currentUserId ? note.note_likes.some(like => like.user_id === currentUserId) : false;
            const isFavorited = currentUserId ? note.favorites.some(f => f.user_id === currentUserId) : false;

            const isEditingInsight = editingInsightId === fav.id;
            const isEditingTags = editingTagsId === fav.id;

            return (
              <div 
                key={fav.id} 
                className="neo-card note-card"
                style={{ display: 'flex', flexDirection: 'column', minHeight: '340px' }}
              >
                <div>
                  <div className="note-card-header">
                    <span className={`neo-badge ${badgeColorClass}`}>{categoryText}</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#666' }}>
                      作者: {authorName}
                    </span>
                  </div>
                  <h3 className="note-card-title" style={{ cursor: 'pointer' }} onClick={() => openNoteModal(note.id)}>
                    {note.title}
                  </h3>
                  <p className="note-card-excerpt" style={{ cursor: 'pointer' }} onClick={() => openNoteModal(note.id)}>
                    {contentExcerpt || '无具体正文内容'}
                  </p>

                  {/* 💡 我的实践感悟区块 */}
                  <div className="insight-section" style={{ minHeight: '60px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontWeight: '800', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        💡 我的感悟
                      </span>
                      {!isEditingInsight && (
                        <button 
                          style={{ background: 'none', border: 'none', color: 'var(--neo-blue)', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '11px' }}
                          onClick={() => {
                            setEditingInsightId(fav.id);
                            setTempInsightText(fav.insights);
                          }}
                        >
                          <Edit3 size={11} /> 修改
                        </button>
                      )}
                    </div>

                    {isEditingInsight ? (
                      <div>
                        <textarea
                          className="insight-textarea"
                          value={tempInsightText}
                          onChange={(e) => setTempInsightText(e.target.value)}
                          placeholder="写下你的实践想法、感悟、如何在生活工作中落地..."
                          autoFocus
                        />
                        <div style={{ display: 'flex', gap: '8px', marginTop: '6px', justifyContent: 'flex-end' }}>
                          <button 
                            className="neo-btn success" 
                            style={{ padding: '4px 10px', fontSize: '11px' }}
                            onClick={() => handleSaveInsight(fav.id)}
                          >
                            保存
                          </button>
                          <button 
                            className="neo-btn" 
                            style={{ padding: '4px 10px', fontSize: '11px', background: '#f5f5f5' }}
                            onClick={() => setEditingInsightId(null)}
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p style={{ margin: 0, fontStyle: fav.insights ? 'normal' : 'italic', color: fav.insights ? '#333' : '#888', whiteSpace: 'pre-wrap' }}>
                        {fav.insights || '记完笔记后，你有什么想付诸行动的吗？写下你的感悟。'}
                      </p>
                    )}
                  </div>

                  {/* 🏷️ 自定义标签区块 */}
                  <div style={{ marginTop: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', fontWeight: '800', color: '#555' }}>
                        🏷️ 自定义标签
                      </span>
                      {!isEditingTags && (
                        <button
                          style={{ background: 'none', border: 'none', color: 'var(--neo-blue)', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' }}
                          onClick={() => {
                            setEditingTagsId(fav.id);
                            setTempTags(fav.tags);
                          }}
                        >
                          管理
                        </button>
                      )}
                    </div>

                    {isEditingTags ? (
                      <div style={{ marginTop: '6px' }}>
                        <div className="fav-tags-list">
                          {tempTags.map((t, idx) => (
                            <span key={idx} className="neo-badge yellow" style={{ fontSize: '10px', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              #{t} 
                              <X 
                                size={10} 
                                style={{ cursor: 'pointer' }} 
                                onClick={() => handleRemoveTag(fav.id, idx)}
                              />
                            </span>
                          ))}
                        </div>
                        <div className="fav-tag-input-container">
                          <input 
                            type="text" 
                            className="fav-tag-input"
                            placeholder="输入新标签"
                            value={newTagText}
                            onChange={(e) => setNewTagText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddTag(fav.id);
                              }
                            }}
                          />
                          <button 
                            className="neo-btn success"
                            style={{ padding: '3px 8px', fontSize: '10px' }}
                            onClick={() => handleAddTag(fav.id)}
                          >
                            添加
                          </button>
                          <button 
                            className="neo-btn"
                            style={{ padding: '3px 8px', fontSize: '10px', background: '#f5f5f5' }}
                            onClick={() => setEditingTagsId(null)}
                          >
                            完成
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="fav-tags-list">
                        {fav.tags.length === 0 ? (
                          <span style={{ fontSize: '11px', color: '#999', fontStyle: 'italic' }}>无自定义标签</span>
                        ) : (
                          fav.tags.map((t, idx) => {
                            const cClass = getBadgeColor(t);
                            return (
                              <span key={idx} className={`neo-badge ${cClass}`} style={{ fontSize: '9px', padding: '2px 5px' }}>
                                #{t}
                              </span>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="note-card-footer" style={{ marginTop: '20px' }}>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <span style={{ fontSize: '11px', color: '#666', fontWeight: 'bold' }}>
                      ★ 已被 {note.favorites ? note.favorites.length : 0} 人收藏
                    </span>
                  </div>
                  <div className="note-interactions">
                    <button 
                      className="interaction-btn" 
                      onClick={() => openNoteModal(note.id)}
                      title="阅读正文"
                    >
                      <Eye size={15} />
                      <span style={{ fontSize: '11px' }}>正文</span>
                    </button>
                    <button 
                      className="interaction-btn" 
                      onClick={() => handleRemoveFavorite(fav.id)}
                      title="取消收藏"
                      style={{ color: 'var(--neo-pink)' }}
                    >
                      <Trash2 size={15} />
                      <span style={{ fontSize: '11px' }}>移除</span>
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

            {/* 主体双栏区域 */}
            <div style={{ 
              flex: 1, 
              display: 'flex',
              overflow: 'hidden',
              borderTop: '2px solid var(--border-color, #000)', 
              borderBottom: '2px solid var(--border-color, #000)',
            }}>
              {/* 左侧大纲导航栏 */}
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

              {/* 右侧正文及评论交流 */}
              <div style={{ 
                flex: 1, 
                overflowY: 'auto', 
                backgroundColor: 'var(--bg-main)',
                display: 'flex',
                flexDirection: 'column'
              }}>
                <div id="note-preview-content-container" style={{ padding: '20px 24px', borderBottom: '2px dashed var(--border-color, #000)' }}>
                  <NotePreviewEditor 
                    markdown={activeNote.content} 
                    ref={previewEditorRef}
                    onChange={() => {}} 
                    readOnly={true} 
                    mode="markdown"
                  />
                </div>

                <div style={{ padding: '20px 24px', backgroundColor: 'var(--bg-sidebar)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 className="neo-title" style={{ fontSize: '15px', marginTop: 0, marginBottom: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <MessageSquare size={16} /> 评论交流 ({comments.reduce((acc, c) => acc + 1 + c.replies.length, 0)})
                    </h3>
                    
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

                  <form onSubmit={handleSubmitComment} style={{ marginBottom: '24px' }}>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <input 
                        type="text" 
                        value={newCommentText}
                        onChange={e => setNewCommentText(e.target.value)}
                        placeholder="写下你的实践心得..."
                        className="neo-input"
                        style={{ flexGrow: 1, padding: '8px 12px', fontSize: '13px' }}
                      />
                      <button 
                        type="submit" 
                        className="neo-btn info font-bold"
                        style={{ padding: '8px 16px', fontSize: '13px', whiteSpace: 'nowrap' }}
                        disabled={!newCommentText.trim()}
                      >
                        发表评论
                      </button>
                    </div>
                  </form>

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
                onClick={() => handleFavoriteToggleInModal(activeNote.id)}
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
