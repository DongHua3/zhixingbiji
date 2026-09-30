'use client';

import React, { createContext, use, useEffect, useState, useCallback, useRef, useMemo, useDeferredValue } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
import { notesApi } from '@/lib/api/client';
import type { MDXEditorMethods } from '@mdxeditor/editor';
import MarkdownSourceEditor from './MarkdownSourceEditor';
import { useNoteStore } from '@/store/useNoteStore';
import { Sparkles } from 'lucide-react';
import AICopilotPanel from './AICopilotPanel';

const Editor = dynamic(() => import('./InitializedMDXEditor'), {
  ssr: false,
  loading: () => <div style={{ padding: '20px', color: '#666' }}>加载顶级编辑器引擎中…</div>
});

interface NoteEditorProps {
  noteId?: string;
}

// ==========================================
// 1. 类型定义 (Type Interfaces)
// ==========================================

export interface NoteEditorState {
  noteId?: string;
  title: string;
  markdown: string;
  loadingContent: boolean;
  viewMode: 'single' | 'split' | 'preview';
  noteType: 'regular' | 'markdown';
  leftWidth: number;
  savingStatus: 'idle' | 'saving' | 'saved' | 'error';
  showAICopilot: boolean;
  isPublic: boolean;
  tags: string[];
  showPublishModal: boolean;
  tagsInput: string;
  category: string;
}

export interface NoteEditorActions {
  onTitleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSourceChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onContentChange: (newMarkdown: string) => void;
  handleInsertAIContent: (text: string, mode: 'append' | 'replace') => void;
  handleExport: () => void;
  handlePublishSave: () => void;
  handleUnpublish: () => void;
  setViewMode: (mode: 'single' | 'split' | 'preview') => void;
  setLeftWidth: React.Dispatch<React.SetStateAction<number>>;
  setShowAICopilot: (show: boolean) => void;
  setShowPublishModal: (show: boolean) => void;
  setTagsInput: (input: string) => void;
  setCategory: (cat: string) => void;
  startDrag: (e: React.MouseEvent) => void;
  handleSourceScroll: (e: React.UIEvent<HTMLTextAreaElement>) => void;
  handlePublishModalKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  registerEditor: (node: MDXEditorMethods | null) => void;
  registerTextarea: (node: HTMLTextAreaElement | null) => void;
  registerContainer: (node: HTMLDivElement | null) => void;
  registerPreviewContainer: (node: HTMLDivElement | null) => void;
}

// ==========================================
// 2. 双 Context 创建 (Context Split 提升性能)
// ==========================================

const NoteEditorStateContext = createContext<NoteEditorState | null>(null);
const NoteEditorActionsContext = createContext<NoteEditorActions | null>(null);

// ==========================================
// 3. Provider 实现
// ==========================================

export function NoteEditorProvider({ noteId, children }: { noteId?: string; children: React.ReactNode }) {
  const [title, setTitle] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [loadingContent, setLoadingContent] = useState(false);
  const [viewMode, setViewMode] = useState<'single' | 'split' | 'preview'>('single');
  const [noteType, setNoteType] = useState<'regular' | 'markdown'>('regular');
  const [leftWidth, setLeftWidth] = useState<number>(50);
  const [savingStatus, setSavingStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showAICopilot, setShowAICopilot] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [tagsInput, setTagsInput] = useState('');
  const [category, setCategory] = useState('');

  const updateNoteMeta = useNoteStore(state => state.updateNoteMeta);
  const setNoteContent = useNoteStore(state => state.setNoteContent);

  // 内部声明的 Refs 容器
  const editorRef = useRef<MDXEditorMethods | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);

  const isDragging = useRef(false);
  const isScrollingRef = useRef(false);
  const isDirtyRef = useRef(false);

  // 注册 Callback Refs 解决 eslint-refs render 期间读取 ref 误判
  const registerEditor = useCallback((node: MDXEditorMethods | null) => {
    editorRef.current = node;
  }, []);
  const registerTextarea = useCallback((node: HTMLTextAreaElement | null) => {
    textareaRef.current = node;
  }, []);
  const registerContainer = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
  }, []);
  const registerPreviewContainer = useCallback((node: HTMLDivElement | null) => {
    previewContainerRef.current = node;
  }, []);

  // 1. 初始化拉取与同步
  useEffect(() => {
    if (!noteId) return;

    // 重置编辑状态标记
    isDirtyRef.current = false;

    // 检查本地 Zustand 状态库中是否已有此笔记的缓存正文
    // 使用 getState() 避免将整个 noteContents 作为依赖项，从而防止输入/保存时触发 Effect 重新拉取
    const cached = useNoteStore.getState().noteContents[noteId];
    const meta = useNoteStore.getState().notes.find(n => n.id === noteId);

    if (cached) {
      // 瞬间从缓存加载，不展示白屏等待遮罩
      setTitle(meta?.title || '无标题笔记');
      setMarkdown(cached.content);
      setNoteType(cached.type);
      if (editorRef.current) {
        editorRef.current.setMarkdown(cached.content);
      }
      setIsPublic(cached.is_public);
      setTags(cached.tags);
      setTagsInput(cached.tags.join(', '));
      setCategory(cached.category);
      setLoadingContent(false);
    } else {
      // 无缓存时，才展示加载遮罩，并先从元数据中快速渲染标题
      if (meta) {
        setTitle(meta.title || '无标题笔记');
        const type = meta.type || 'regular';
        setNoteType(type);
        if (type === 'regular') {
          setViewMode('single');
        }
      } else {
        setTitle('无标题笔记');
        setMarkdown('');
      }
      setLoadingContent(true);
    }

    const fetchContent = async () => {
      // 只有在无缓存的情况下才展示加载遮罩，否则进行静默背景拉取
      if (!cached) {
        setLoadingContent(true);
      }
      
      try {
        const data = await notesApi.get(noteId);
        if (data) {
          const fetchedTags = Array.isArray(data.tags) ? data.tags : [];
          const fetchedContent = data.content || '';
          const noteContentObj = {
            content: fetchedContent,
            is_public: data.is_public || false,
            tags: fetchedTags,
            category: data.category || '',
            type: (data.type as 'regular' | 'markdown') || 'regular'
          };

          // 在全局 Zustand 状态库中缓存正文内容
          setNoteContent(noteId, noteContentObj);

          // 如果在后台网络请求返回前，用户已经开始编辑了，为了防止覆盖用户最新的修改，不同步更新编辑器内部的 local State
          if (!isDirtyRef.current) {
            setTitle(data.title || '无标题笔记');
            setMarkdown(fetchedContent);
            setNoteType(data.type || 'regular');
            if (editorRef.current) {
              editorRef.current.setMarkdown(fetchedContent);
            }
            setIsPublic(data.is_public || false);
            setTags(fetchedTags);
            setTagsInput(fetchedTags.join(', '));
            setCategory(data.category || '');
          }
        }
      } catch (err) {
        console.error('获取笔记详情失败:', err);
      } finally {
        setLoadingContent(false);
      }
    };

    fetchContent();
  }, [noteId, setNoteContent]);

  // 2. 按键绑定监听 (Modal Escape)
  useEffect(() => {
    if (!showPublishModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowPublishModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showPublishModal]);

  // 3. Debounced Content Saves (支持传入显式 targetId，防抖函数实例不因 noteId 改变而重建)
  const handleSaveContent = useMemo(
    () => debounce(async (targetId: string, content: string) => {
      if (!targetId) return;
      setSavingStatus('saving');
      try {
        await notesApi.update(targetId, { content });
        setSavingStatus('saved');
        setTimeout(() => setSavingStatus('idle'), 2000);
      } catch {
        setSavingStatus('error');
      }
    }, 1000),
    []
  );

  // 4. Debounced Title Saves
  const handleSaveTitle = useMemo(
    () => debounce(async (targetId: string, newTitle: string) => {
      if (!targetId) return;
      setSavingStatus('saving');
      try {
        await notesApi.update(targetId, { title: newTitle });
        setSavingStatus('saved');
        setTimeout(() => setSavingStatus('idle'), 2000);
      } catch {
        setSavingStatus('error');
      }
    }, 1000),
    []
  );

  // 5. 切换笔记或组件卸载时，立即将缓冲区排队修改强制落盘，杜绝丢字丢修改
  useEffect(() => {
    return () => {
      handleSaveContent.flush();
      handleSaveTitle.flush();
    };
  }, [noteId, handleSaveContent, handleSaveTitle]);

  // Actions 与 Event Handler 稳定引用包装
  const onTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
    if (noteId) {
      updateNoteMeta(noteId, { title: e.target.value });
      setSavingStatus('saving');
      handleSaveTitle(noteId, e.target.value);
    }
  }, [noteId, updateNoteMeta, handleSaveTitle]);

  const onContentChange = useCallback((newMarkdown: string) => {
    isDirtyRef.current = true;
    setMarkdown(newMarkdown);
    setSavingStatus('saving');
    
    // 立即乐观更新 Zustand 缓存，确保其他组件（如预览、切换返回）能瞬间读到最新内容
    if (noteId) {
      const currentCache = useNoteStore.getState().noteContents[noteId];
      setNoteContent(noteId, {
        content: newMarkdown,
        is_public: currentCache ? currentCache.is_public : isPublic,
        tags: currentCache ? currentCache.tags : tags,
        category: currentCache ? currentCache.category : category,
        type: currentCache ? currentCache.type : noteType
      });
      handleSaveContent(noteId, newMarkdown);
    }
  }, [noteId, isPublic, tags, category, noteType, setNoteContent, handleSaveContent]);

  const onSourceChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    isDirtyRef.current = true;
    const newMarkdown = e.target.value;
    setMarkdown(newMarkdown);
    setSavingStatus('saving');
    if (editorRef.current && viewMode === 'split') {
      editorRef.current.setMarkdown(newMarkdown);
    }
    
    // 立即乐观更新 Zustand 缓存
    if (noteId) {
      const currentCache = useNoteStore.getState().noteContents[noteId];
      setNoteContent(noteId, {
        content: newMarkdown,
        is_public: currentCache ? currentCache.is_public : isPublic,
        tags: currentCache ? currentCache.tags : tags,
        category: currentCache ? currentCache.category : category,
        type: currentCache ? currentCache.type : noteType
      });
      handleSaveContent(noteId, newMarkdown);
    }
  }, [noteId, viewMode, isPublic, tags, category, noteType, setNoteContent, handleSaveContent]);

  const handleInsertAIContent = useCallback((text: string, mode: 'append' | 'replace') => {
    isDirtyRef.current = true;
    if (mode === 'append') {
      const newContent = markdown + (markdown.endsWith('\n') ? '\n' : '\n\n') + text;
      setMarkdown(newContent);
      if (editorRef.current) {
        editorRef.current.setMarkdown(newContent);
      }
      
      if (noteId) {
        const currentCache = useNoteStore.getState().noteContents[noteId];
        setNoteContent(noteId, {
          content: newContent,
          is_public: currentCache ? currentCache.is_public : isPublic,
          tags: currentCache ? currentCache.tags : tags,
          category: currentCache ? currentCache.category : category,
          type: currentCache ? currentCache.type : noteType
        });
        handleSaveContent(noteId, newContent);
      }
      toast.success('已将 AI 生成内容追加到文章末尾');
    } else {
      const textarea = textareaRef.current;
      if (viewMode !== 'single' && textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const val = textarea.value;
        const newVal = val.substring(0, start) + text + val.substring(end);
        setMarkdown(newVal);
        if (editorRef.current) {
          editorRef.current.setMarkdown(newVal);
        }
        
        if (noteId) {
          const currentCache = useNoteStore.getState().noteContents[noteId];
          setNoteContent(noteId, {
            content: newVal,
            is_public: currentCache ? currentCache.is_public : isPublic,
            tags: currentCache ? currentCache.tags : tags,
            category: currentCache ? currentCache.category : category,
            type: currentCache ? currentCache.type : noteType
          });
          handleSaveContent(noteId, newVal);
        }

        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(start + text.length, start + text.length);
        }, 0);
        toast.success('已用 AI 生成内容替换选中文本');
        return;
      }
      
      if (editorRef.current) {
        editorRef.current.insertMarkdown(text);
        const currentMd = editorRef.current.getMarkdown();
        setMarkdown(currentMd);
        
        if (noteId) {
          const currentCache = useNoteStore.getState().noteContents[noteId];
          setNoteContent(noteId, {
            content: currentMd,
            is_public: currentCache ? currentCache.is_public : isPublic,
            tags: currentCache ? currentCache.tags : tags,
            category: currentCache ? currentCache.category : category,
            type: currentCache ? currentCache.type : noteType
          });
          handleSaveContent(noteId, currentMd);
        }
        toast.success('已将 AI 内容插入到当前光标位置');
      } else {
        const newContent = markdown + (markdown.endsWith('\n') ? '\n' : '\n\n') + text;
        setMarkdown(newContent);
        
        if (noteId) {
          const currentCache = useNoteStore.getState().noteContents[noteId];
          setNoteContent(noteId, {
            content: newContent,
            is_public: currentCache ? currentCache.is_public : isPublic,
            tags: currentCache ? currentCache.tags : tags,
            category: currentCache ? currentCache.category : category,
            type: currentCache ? currentCache.type : noteType
          });
          handleSaveContent(noteId, newContent);
        }
        toast.success('已追加 AI 内容');
      }
    }
  }, [markdown, viewMode, noteId, isPublic, tags, category, noteType, setNoteContent, handleSaveContent]);

  const handleExport = useCallback(() => {
    if (!markdown) {
      toast.warning('无内容可导出');
      return;
    }
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || '无标题笔记'}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('已成功导出为 Markdown 文件');
  }, [markdown, title]);

  const handlePublishSave = useCallback(async () => {
    if (!noteId) return;
    const parsedTags = tagsInput
      .split(/[，,]/)
      .map(t => t.trim())
      .filter(t => t !== '');
      
    setSavingStatus('saving');
    try {
      await notesApi.update(noteId, {
        is_public: true,
        tags: parsedTags,
        category: category.trim() || ''
      });

      setSavingStatus('saved');
      setTags(parsedTags);
      setIsPublic(true);
      updateNoteMeta(noteId, { is_public: true });

      // 同步更新 Zustand 缓存中的发布状态
      const currentCache = useNoteStore.getState().noteContents[noteId];
      setNoteContent(noteId, {
        content: currentCache ? currentCache.content : markdown,
        is_public: true,
        tags: parsedTags,
        category: category.trim(),
        type: currentCache ? currentCache.type : noteType
      });

      toast.success('成功公开发布到笔记广场！');
      setShowPublishModal(false);
      setTimeout(() => setSavingStatus('idle'), 2000);
    } catch {
      setSavingStatus('error');
      toast.error('发布失败');
    }
  }, [noteId, tagsInput, category, updateNoteMeta, markdown, noteType, setNoteContent]);

  const handleUnpublish = useCallback(async () => {
    if (!noteId) return;
    setSavingStatus('saving');
    try {
      await notesApi.update(noteId, { is_public: false });
      setSavingStatus('saved');
      setIsPublic(false);
      updateNoteMeta(noteId, { is_public: false });

      // 同步更新 Zustand 缓存中的发布状态
      const currentCache = useNoteStore.getState().noteContents[noteId];
      setNoteContent(noteId, {
        content: currentCache ? currentCache.content : markdown,
        is_public: false,
        tags: currentCache ? currentCache.tags : tags,
        category: currentCache ? currentCache.category : category,
        type: currentCache ? currentCache.type : noteType
      });

      toast.success('已设为私密笔记');
      setShowPublishModal(false);
      setTimeout(() => setSavingStatus('idle'), 2000);
    } catch {
      setSavingStatus('error');
      toast.error('设为私密失败');
    }
  }, [noteId, updateNoteMeta, markdown, tags, category, noteType, setNoteContent]);

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    
    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      let newLeftWidth = ((moveEvent.clientX - containerRect.left) / containerRect.width) * 100;
      if (newLeftWidth < 10) newLeftWidth = 10;
      if (newLeftWidth > 90) newLeftWidth = 90;
      setLeftWidth(newLeftWidth);
    };
    
    const onMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  const handleSourceScroll = useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
    if (viewMode !== 'split' || isScrollingRef.current) return;
    const sourceEl = e.currentTarget;
    const previewEl = previewContainerRef.current?.querySelector('.mdxeditor-root-contenteditable')?.parentElement;
    if (previewEl) {
      isScrollingRef.current = true;
      const percentage = sourceEl.scrollTop / (sourceEl.scrollHeight - sourceEl.clientHeight);
      previewEl.scrollTop = percentage * (previewEl.scrollHeight - previewEl.clientHeight);
      setTimeout(() => { isScrollingRef.current = false; }, 50);
    }
  }, [viewMode]);

  const handlePublishModalKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      setShowPublishModal(false);
      return;
    }
    if (e.key === 'Tab') {
      const modal = e.currentTarget;
      const focusableElements = modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements.length === 0) return;
      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;
      
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement.focus();
          e.preventDefault();
        }
      }
    }
  }, []);

  const stateValue = useMemo<NoteEditorState>(() => ({
    noteId,
    title,
    markdown,
    loadingContent,
    viewMode,
    noteType,
    leftWidth,
    savingStatus,
    showAICopilot,
    isPublic,
    tags,
    showPublishModal,
    tagsInput,
    category
  }), [noteId, title, markdown, loadingContent, viewMode, noteType, leftWidth, savingStatus, showAICopilot, isPublic, tags, showPublishModal, tagsInput, category]);

  const actionsValue = useMemo<NoteEditorActions>(() => ({
    onTitleChange,
    onSourceChange,
    onContentChange,
    handleInsertAIContent,
    handleExport,
    handlePublishSave,
    handleUnpublish,
    setViewMode,
    setLeftWidth,
    setShowAICopilot,
    setShowPublishModal,
    setTagsInput,
    setCategory,
    startDrag,
    handleSourceScroll,
    handlePublishModalKeyDown,
    registerEditor,
    registerTextarea,
    registerContainer,
    registerPreviewContainer
  }), [
    onTitleChange,
    onSourceChange,
    onContentChange,
    handleInsertAIContent,
    handleExport,
    handlePublishSave,
    handleUnpublish,
    startDrag,
    handleSourceScroll,
    handlePublishModalKeyDown,
    registerEditor,
    registerTextarea,
    registerContainer,
    registerPreviewContainer
  ]);

  return (
    <NoteEditorStateContext.Provider value={stateValue}>
      <NoteEditorActionsContext.Provider value={actionsValue}>
        {children}
      </NoteEditorActionsContext.Provider>
    </NoteEditorStateContext.Provider>
  );
}

// ==========================================
// 4. 复合子组件 (Compound Components)
// ==========================================

export function NoteEditorHeader() {
  const state = use(NoteEditorStateContext);
  const actions = use(NoteEditorActionsContext);
  if (!state || !actions) return null;

  const { title, savingStatus, noteType, viewMode, showAICopilot, isPublic } = state;
  const { onTitleChange, setViewMode, setShowAICopilot, handleExport, setTagsInput, setShowPublishModal } = actions;

  return (
    <div className="editor-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexGrow: 1 }}>
        <input 
          type="text" 
          className="editor-title-input" 
          value={title}
          onChange={onTitleChange}
          placeholder="无标题笔记"
          aria-label="笔记标题"
        />
      </div>
      <div className="editor-actions" style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ fontSize: '13px', color: '#999', marginRight: '16px', fontWeight: 600, userSelect: 'none', display: 'flex', alignItems: 'center', paddingTop: '2px' }} aria-live="polite">
          {savingStatus === 'saving' && '保存中…'}
          {savingStatus === 'saved' && '已保存'}
          {savingStatus === 'error' && <span style={{ color: 'var(--color-neo-pink)' }}>保存失败</span>}
        </div>
        
        {noteType === 'markdown' && (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginRight: '8px' }}>
            <button 
              type="button"
              className="neo-btn" 
              style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: viewMode === 'single' ? 'var(--color-neo-blue)' : 'transparent', color: viewMode === 'single' ? '#fff' : 'currentColor' }} 
              title="富文本视图 (可视编辑)"
              aria-label="富文本视图 (可视编辑)"
              aria-pressed={viewMode === 'single'}
              onClick={() => setViewMode('single')}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.5" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>
            </button>
            <button 
              type="button"
              className="neo-btn" 
              style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: viewMode === 'split' ? 'var(--color-neo-blue)' : 'transparent', color: viewMode === 'split' ? '#fff' : 'currentColor' }} 
              title="双栏源码对照"
              aria-label="双栏源码对照"
              aria-pressed={viewMode === 'split'}
              onClick={() => setViewMode('split')}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.5" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
            </button>
            <button 
              type="button"
              className="neo-btn" 
              style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: viewMode === 'preview' ? 'var(--color-neo-blue)' : 'transparent', color: viewMode === 'preview' ? '#fff' : 'currentColor' }} 
              title="纯源码视图 (极客模式)"
              aria-label="纯源码视图 (极客模式)"
              aria-pressed={viewMode === 'preview'}
              onClick={() => setViewMode('preview')}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.5" fill="none"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
            </button>
          </div>
        )}
        <button 
          className="neo-btn" 
          style={{ 
            backgroundColor: showAICopilot ? 'var(--color-neo-blue)' : 'var(--color-neo-yellow)', 
            color: showAICopilot ? '#fff' : 'currentColor',
            padding: '6px 12px', 
            fontSize: '13px',
            marginRight: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }} 
          onClick={() => setShowAICopilot(!showAICopilot)}
        >
          <Sparkles size={14} /> AI 助手
        </button>
        <button className="neo-btn" style={{ backgroundColor: 'var(--color-neo-green)', padding: '6px 12px', fontSize: '13px' }} onClick={handleExport}>导出</button>
        <button 
          className="neo-btn" 
          style={{ backgroundColor: 'var(--color-neo-yellow)', padding: '6px 12px', fontSize: '13px' }}
          onClick={() => {
            setTagsInput(state.tags.join(', '));
            setShowPublishModal(true);
          }}
        >
          {isPublic ? '已发布' : '发布'}
        </button>
      </div>
    </div>
  );
}

export function NoteEditorWorkspace({ children }: { children: React.ReactNode }) {
  const state = use(NoteEditorStateContext);
  const actions = use(NoteEditorActionsContext);
  if (!state || !actions) return null;

  const { loadingContent } = state;
  const { registerContainer } = actions;

  return (
    <div ref={registerContainer} className="editor-body" style={{ display: 'flex', flexDirection: 'row', flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
      {loadingContent && (
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(255, 255, 255, 0.4)',
          backdropFilter: 'blur(1px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          pointerEvents: 'none'
        }}>
          <div style={{ fontSize: '13px', color: '#666', background: 'white', padding: '8px 16px', borderRadius: '8px', border: '2px solid #000', boxShadow: '3px 3px 0 #000', fontWeight: 'bold' }}>
            正在加载笔记内容…
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

export function NoteEditorWorkspaceResizer() {
  const state = use(NoteEditorStateContext);
  const actions = use(NoteEditorActionsContext);
  if (!state || !actions) return null;

  const { viewMode, leftWidth } = state;
  const { startDrag, setLeftWidth } = actions;

  if (viewMode !== 'split') return null;

  return (
    <div 
      role="separator"
      tabIndex={0}
      aria-valuenow={Math.round(leftWidth)}
      aria-valuemin={10}
      aria-valuemax={90}
      aria-label="双栏分割线"
      aria-orientation="vertical"
      onMouseDown={startDrag}
      onMouseEnter={(e) => e.currentTarget.style.background = '#cbd5e1'}
      onMouseLeave={(e) => e.currentTarget.style.background = '#e2e8f0'}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setLeftWidth(prev => Math.max(10, prev - 2));
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          setLeftWidth(prev => Math.min(90, prev + 2));
        }
      }}
      onFocus={(e) => {
        e.currentTarget.style.background = 'var(--color-neo-blue)';
        e.currentTarget.style.boxShadow = '0 0 0 2px rgba(59, 130, 246, 0.5)';
      }}
      onBlur={(e) => {
        e.currentTarget.style.background = '#e2e8f0';
        e.currentTarget.style.boxShadow = 'none';
      }}
      style={{ 
        width: '6px', 
        background: '#e2e8f0', 
        cursor: 'col-resize', 
        zIndex: 10,
        flexShrink: 0,
        transition: 'background 0.2s ease, box-shadow 0.2s ease',
        outline: 'none'
      }} 
    />
  );
}

export function NoteEditorSourceArea() {
  const state = use(NoteEditorStateContext);
  const actions = use(NoteEditorActionsContext);
  if (!state || !actions) return null;

  const { viewMode, leftWidth, markdown } = state;
  const { onSourceChange, handleSourceScroll, registerTextarea } = actions;

  if (viewMode !== 'split' && viewMode !== 'preview') return null;

  return (
    <div style={{ 
      width: viewMode === 'split' ? `${leftWidth}%` : 'auto',
      flex: viewMode === 'split' ? '0 0 auto' : 1,
      flexShrink: viewMode === 'split' ? 0 : 1,
      display: 'flex',
      flexDirection: 'column',
      minWidth: 0,
      minHeight: 0
    }}>
      <MarkdownSourceEditor
        value={markdown}
        onChange={onSourceChange}
        onScroll={handleSourceScroll}
        ref={registerTextarea}
      />
    </div>
  );
}

export function NoteEditorRichArea() {
  const state = use(NoteEditorStateContext);
  const actions = use(NoteEditorActionsContext);

  // React 19 useDeferredValue 必须置于组件最顶部无条件运行
  const markdownValue = state ? state.markdown : '';
  const deferredMarkdown = useDeferredValue(markdownValue);

  if (!state || !actions) return null;

  const { viewMode, noteType } = state;
  const { onContentChange, registerEditor, registerPreviewContainer } = actions;

  const resolvedMarkdown = viewMode === 'split' ? deferredMarkdown : markdownValue;

  if (viewMode !== 'single' && viewMode !== 'split') return null;

  return (
    <div ref={registerPreviewContainer} style={{ 
      flex: 1,
      display: 'flex', 
      flexDirection: 'column', 
      minWidth: 0, 
      minHeight: 0 
    }}>
      <Editor 
        key={noteType} 
        markdown={resolvedMarkdown} 
        ref={registerEditor}
        onChange={onContentChange}
        mode={noteType}
        readOnly={false}
      />
    </div>
  );
}

export function NoteEditorAICopilot() {
  const state = use(NoteEditorStateContext);
  const actions = use(NoteEditorActionsContext);
  if (!state || !actions) return null;

  const { showAICopilot, noteId, markdown } = state;
  const { handleInsertAIContent, setShowAICopilot } = actions;

  if (!showAICopilot || !noteId) return null;

  return (
    <AICopilotPanel 
      key={noteId}
      noteId={noteId}
      currentContent={markdown}
      onInsert={handleInsertAIContent}
      onClose={() => setShowAICopilot(false)}
    />
  );
}

export function NoteEditorPublishModal() {
  const state = use(NoteEditorStateContext);
  const actions = use(NoteEditorActionsContext);
  if (!state || !actions) return null;

  const { showPublishModal, isPublic, category, tagsInput } = state;
  const { setShowPublishModal, handlePublishModalKeyDown, setCategory, setTagsInput, handleUnpublish, handlePublishSave } = actions;

  if (!showPublishModal || typeof document === 'undefined') return null;

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(2px)' }} onClick={() => setShowPublishModal(false)}>
      <div 
        style={{ background: 'var(--neo-white)', border: '3px solid var(--border-color, #000)', width: '360px', padding: '24px', borderRadius: '12px', boxShadow: '6px 6px 0px 0px var(--border-color, #000)', transition: 'none', transform: 'none' }} 
        onClick={e => e.stopPropagation()}
        onKeyDown={handlePublishModalKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-modal-title"
      >
        <h3 id="publish-modal-title" className="neo-title" style={{ fontSize: '18px', marginTop: 0, marginBottom: '16px' }}>发布设置</h3>
        
        <div style={{ marginBottom: '16px' }}>
          <label htmlFor="publish-category" style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>分类 (如: 学习方法, 效率实践, 设计前沿, 产品思考):</label>
          <input
            id="publish-category"
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="例如: 学习方法"
            className="neo-input"
            style={{ padding: '8px 12px', fontSize: '13px', width: '100%' }}
            autoFocus
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="publish-tags" style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>标签 (用逗号隔开):</label>
          <input
            id="publish-tags"
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="例如: 费曼学习法, 效率工具, Obsidian"
            className="neo-input"
            style={{ padding: '8px 12px', fontSize: '13px', width: '100%' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button className="neo-btn" style={{ background: '#f5f5f5', border: '1px solid #ddd', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }} onClick={() => setShowPublishModal(false)}>
            取消
          </button>
          {isPublic ? (
            <>
              <button className="neo-btn danger" style={{ padding: '6px 12px', fontSize: '13px' }} onClick={handleUnpublish}>
                设为私密
              </button>
              <button className="neo-btn info font-bold" style={{ padding: '6px 16px', fontSize: '13px' }} onClick={handlePublishSave}>
                更新发布
              </button>
            </>
          ) : (
            <button className="neo-btn info font-bold" style={{ padding: '6px 16px', fontSize: '13px' }} onClick={handlePublishSave}>
              确认发布
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ==========================================
// 5. 组装与默认导出
// ==========================================

const NoteEditor = {
  Provider: NoteEditorProvider,
  Header: NoteEditorHeader,
  Workspace: NoteEditorWorkspace,
  WorkspaceResizer: NoteEditorWorkspaceResizer,
  SourceArea: NoteEditorSourceArea,
  RichArea: NoteEditorRichArea,
  AICopilot: NoteEditorAICopilot,
  PublishModal: NoteEditorPublishModal
};

export default function NoteEditorContainer({ noteId }: NoteEditorProps) {
  if (!noteId) {
    return (
      <div className="editor-main">
        <div className="editor-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexGrow: 1, minWidth: 0 }}>
            <div className="editor-title-input" style={{ color: '#aaa', userSelect: 'none', fontSize: '18px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>未选择笔记</div>
          </div>
        </div>
        <div className="editor-body" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
          请在左侧选择一篇笔记或新建笔记
        </div>
      </div>
    );
  }

  return (
    <NoteEditor.Provider noteId={noteId}>
      <NoteEditorFrame />
    </NoteEditor.Provider>
  );
}

function NoteEditorFrame() {
  return (
    <div className="editor-main">
      <NoteEditor.Header />
      <NoteEditor.Workspace>
        <NoteEditor.SourceArea />
        <NoteEditor.WorkspaceResizer />
        <NoteEditor.RichArea />
        <NoteEditor.AICopilot />
      </NoteEditor.Workspace>
      <NoteEditor.PublishModal />
    </div>
  );
}

// Robust debounce helper with real flush and cancel
function debounce<Args extends unknown[], R>(func: (...args: Args) => R, wait: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: Args | undefined;

  const debounced = (...args: Args) => {
    lastArgs = args;
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      if (lastArgs) {
        func(...lastArgs);
        lastArgs = undefined;
        timeout = undefined;
      }
    }, wait);
  };

  debounced.flush = () => {
    if (timeout && lastArgs) {
      clearTimeout(timeout);
      timeout = undefined;
      func(...lastArgs);
      lastArgs = undefined;
    }
  };

  debounced.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = undefined;
      lastArgs = undefined;
    }
  };

  return debounced;
}
