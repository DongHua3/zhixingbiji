'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { foldersApi, notesApi } from '@/lib/api/client';
import JSZip from 'jszip';
import { toast } from 'sonner';
import PinyinMatch from 'pinyin-match';

import { useNoteStore } from '@/store/useNoteStore';

interface FileTreeProps {
  selectedNoteId?: string;
  onSelectNote: (id: string | undefined) => void;
}

export default function FileTree({ selectedNoteId, onSelectNote }: FileTreeProps) {
  const folders = useNoteStore(state => state.folders);
  const notes = useNoteStore(state => state.notes);
  const setFolders = useNoteStore(state => state.setFolders);
  const setNotes = useNoteStore(state => state.setNotes);
  const [loading, setLoading] = useState(() => folders.length === 0 && notes.length === 0);
  const [dropdownTargetId, setDropdownTargetId] = useState<string | null>(null);
  const [creatingTargetId, setCreatingTargetId] = useState<string | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('新建文件夹');
  
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [creatingNoteType, setCreatingNoteType] = useState<'regular' | 'markdown' | null>(null);
  const [newNoteTitle, setNewNoteTitle] = useState('无标题笔记');

  const [userId, setUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [dropdownMoreTargetId, setDropdownMoreTargetId] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const [renamingTargetId, setRenamingTargetId] = useState<string | null>(null);
  const [renamingType, setRenamingType] = useState<'folder' | 'note' | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [itemToDelete, setItemToDelete] = useState<{ type: 'folder' | 'note', id: string, name: string } | null>(null);
  
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const expandTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (expandTimeoutRef.current) clearTimeout(expandTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDropdownTargetId(null);
        setDropdownMoreTargetId(null);
        setItemToDelete(null);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const handleDragStart = (e: React.DragEvent, type: 'folder' | 'note', id: string) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type, id }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnterFolder = (folderId: string) => {
    setDragOverFolderId(folderId);
    if (expandTimeoutRef.current) clearTimeout(expandTimeoutRef.current);
    expandTimeoutRef.current = setTimeout(() => {
      const detailsEl = document.getElementById(`folder-details-${folderId}`);
      if (detailsEl && !detailsEl.hasAttribute('open')) {
        detailsEl.setAttribute('open', 'true');
      }
    }, 600);
  };

  const handleDragLeaveFolder = () => {
    setDragOverFolderId(null);
    if (expandTimeoutRef.current) clearTimeout(expandTimeoutRef.current);
  };

  const handleDrop = async (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolderId(null);
    if (expandTimeoutRef.current) clearTimeout(expandTimeoutRef.current);

    try {
      const rawData = e.dataTransfer.getData('application/json');
      if (!rawData) return;
      const { type, id } = JSON.parse(rawData);

      if (type === 'folder') {
        if (id === targetFolderId) return;
        // Verify folder is not dropped into its own children
        if (targetFolderId) {
          let curr: string | null = targetFolderId;
          while (curr) {
            const parentFolder = folders.find(f => f.id === curr);
            if (!parentFolder) break;
            if (parentFolder.parent_id === id) {
              toast.warning('不能将文件夹移入其子文件夹中');
              return;
            }
            curr = parentFolder.parent_id;
          }
        }

        const originalFolders = [...folders];
        setFolders(folders.map(f => f.id === id ? { ...f, parent_id: targetFolderId } : f));

        try {
          await foldersApi.update(id, { parent_id: targetFolderId });
          toast.success('文件夹移动成功');
        } catch (error) {
          console.error(error);
          toast.error('移动文件夹失败');
          setFolders(originalFolders);
        }
      } else if (type === 'note') {
        const note = notes.find(n => n.id === id);
        if (note && note.folder_id === targetFolderId) return;

        const originalNotes = [...notes];
        setNotes(notes.map(n => n.id === id ? { ...n, folder_id: targetFolderId } : n));

        try {
          await notesApi.update(id, { folder_id: targetFolderId });
          toast.success('笔记移动成功');
        } catch (error) {
          console.error(error);
          toast.error('移动笔记失败');
          setNotes(originalNotes);
        }
      }
    } catch (err) {
      console.error('Drop error:', err);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, type: 'folder' | 'note', id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDropdownPos({ top: e.clientY, left: e.clientX });
    setDropdownMoreTargetId(id);
    setDropdownTargetId(null);
  };
  
  // Sort states (removed selectable dropdown)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [foldersData, notesData] = await Promise.all([
          foldersApi.list(),
          notesApi.list()
        ]);
        if (foldersData) setFolders(foldersData);
        if (notesData) setNotes(notesData);
      } catch (err) {
        console.error('加载文件树失败:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [setFolders, setNotes]);

  const submitNewFolder = async (isBlur = false) => {
    const val = newFolderName.trim();
    const target = creatingTargetId;
    
    setIsCreatingFolder(false);
    
    if (!val || (isBlur && val === '新建文件夹')) {
      return;
    }

    try {
      const data = await foldersApi.create(val, target);
      if (data) {
        setFolders([...folders, data]);
        toast.success('文件夹创建成功');
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || '创建文件夹失败');
    }
  };

  const submitNewNote = async (isBlur = false) => {
    const val = newNoteTitle.trim();
    const type = creatingNoteType;
    const target = creatingTargetId;
    
    setIsCreatingNote(false);
    setCreatingNoteType(null);
    
    if (!val || !type || (isBlur && (val === '无标题笔记' || val === '无标题 Markdown'))) {
      return;
    }

    try {
      const data = await notesApi.create({
        title: val,
        folder_id: target,
        type: type,
        content: ''
      });
      if (data) {
        setNotes([data, ...notes]);
        onSelectNote(data.id);
        toast.success('笔记创建成功');
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || '创建笔记失败');
    }
  };

  const createNewItem = async (itemType: 'folder' | 'regular' | 'markdown', targetId: string | null = null) => {
    setDropdownTargetId(null);
    setCreatingTargetId(targetId);
    
    if (targetId) {
      document.getElementById(`folder-details-${targetId}`)?.setAttribute('open', 'true');
    }
    
    setTimeout(() => {
      if (itemType === 'folder') {
        setIsCreatingFolder(true);
        setNewFolderName('新建文件夹');
      } else {
        setIsCreatingNote(true);
        setCreatingNoteType(itemType);
        setNewNoteTitle(itemType === 'markdown' ? '无标题 Markdown' : '无标题笔记');
      }
    }, 10);
  };

  const requestDelete = (type: 'folder' | 'note', id: string, name: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setItemToDelete({ type, id, name });
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    const { type, id, name } = itemToDelete;
    
    // Save original state for potential rollback
    const originalFolders = [...folders];
    const originalNotes = [...notes];
    const originalSelectedNoteId = selectedNoteId;

    // Close the deletion confirmation modal immediately
    setItemToDelete(null);

    // Optimistically update the UI state immediately
    if (type === 'folder') {
      setFolders(folders.filter(f => f.id !== id));
      setNotes(notes.map(n => n.folder_id === id ? { ...n, folder_id: null } : n));
    } else {
      setNotes(notes.filter(n => n.id !== id));
      if (id === selectedNoteId) {
        onSelectNote(undefined);
      }
    }

    // Perform database deletion in background
    if (type === 'folder') {
      try {
        await foldersApi.delete(id);
        toast.success(`文件夹 "${name}" 已删除`);
      } catch (error) {
        console.error('Failed to delete folder:', error);
        toast.error(`删除文件夹 "${name}" 失败`);
        setFolders(originalFolders);
        setNotes(originalNotes);
      }
    } else {
      try {
        await notesApi.delete(id);
        toast.success(`笔记 "${name}" 已删除`);
      } catch (error) {
        console.error('Failed to delete note:', error);
        toast.error(`删除笔记 "${name}" 失败`);
        setNotes(originalNotes);
        if (originalSelectedNoteId === id) {
          onSelectNote(originalSelectedNoteId);
        }
      }
    }
  };

  const startRename = (type: 'folder' | 'note', id: string, currentName: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropdownMoreTargetId(null);
    setRenamingType(type);
    setRenamingTargetId(id);
    setRenameValue(currentName);
  };

  const submitRename = async () => {
    const val = renameValue.trim();
    const targetType = renamingType;
    const targetId = renamingTargetId;

    setRenamingTargetId(null);
    setRenamingType(null);
    setRenameValue('');

    if (!val || !targetId) return;

    if (targetType === 'folder') {
      try {
        await foldersApi.update(targetId, { name: val });
        setFolders(folders.map(f => f.id === targetId ? { ...f, name: val } : f));
      } catch {
        toast.error('重命名文件夹失败');
      }
    } else {
      try {
        await notesApi.update(targetId, { title: val });
        setNotes(notes.map(n => n.id === targetId ? { ...n, title: val } : n));
      } catch {
        toast.error('重命名笔记失败');
      }
    }
  };

  const togglePin = async (type: 'folder' | 'note', id: string, currentState: boolean) => {
    setDropdownMoreTargetId(null);
    try {
      if (type === 'folder') {
        await foldersApi.update(id, { is_pinned: !currentState });
        setFolders(folders.map(f => f.id === id ? { ...f, is_pinned: !currentState } : f));
      } else {
        await notesApi.update(id, { is_pinned: !currentState });
        setNotes(notes.map(n => n.id === id ? { ...n, is_pinned: !currentState } : n));
      }
    } catch {
      toast.error('置顶状态更新失败');
    }
  };

  const toggleStar = async (type: 'folder' | 'note', id: string, currentState: boolean) => {
    setDropdownMoreTargetId(null);
    try {
      if (type === 'folder') {
        await foldersApi.update(id, { is_starred: !currentState });
        setFolders(folders.map(f => f.id === id ? { ...f, is_starred: !currentState } : f));
      } else {
        await notesApi.update(id, { is_starred: !currentState });
        setNotes(notes.map(n => n.id === id ? { ...n, is_starred: !currentState } : n));
      }
    } catch {
      toast.error('标星状态更新失败');
    }
  };

  const downloadNote = async (id: string, title: string) => {
    setDropdownMoreTargetId(null);
    try {
      const data = await notesApi.get(id);
      if (!data) {
        toast.error('下载失败');
        return;
      }
      const blob = new Blob([data.content || ''], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('下载失败');
    }
  };

  const downloadFolder = async (folderId: string, folderName: string) => {
    setDropdownMoreTargetId(null);
    try {
      const folderNotes = await notesApi.list(folderId);
      if (!folderNotes || folderNotes.length === 0) {
        toast.warning('文件夹是空的，无需下载');
        return;
      }
      
      const typedFolderNotes = folderNotes as { id: string; title: string; content?: string }[];

    if (typedFolderNotes.length === 0) {
      toast.warning('文件夹是空的，无需下载');
      return;
    }
    
    try {
      const zip = new JSZip();
      
      typedFolderNotes.forEach((note, index) => {
        // Handle potentially invalid filename characters in Windows/Mac
        const safeTitle = note.title ? note.title.replace(/[\\/:*?"<>|]/g, '_') : `无标题笔记_${index + 1}`;
        
        // Prevent duplicate filenames by appending a unique identifier if necessary
        // In a simple approach, we can just let JSZip overwrite or we can append the index to make it robust
        const fileName = note.title ? `${safeTitle}.md` : `${safeTitle}.md`;
        
        // JSZip handles overwriting by default if names collide. 
        // To be safer with same names:
        const existingFile = zip.file(fileName);
        const finalName = existingFile ? `${safeTitle}_${note.id.substring(0,4)}.md` : fileName;
        
        zip.file(finalName, note.content || '');
      });

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${folderName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      toast.error('打包压缩包失败');
    }
  };

  const query = searchQuery.trim();

  const filteredNotes = useMemo(() => {
    return notes.filter(n => {
      if (!query) return true;
      if (!n.title) return false;
      return !!PinyinMatch.match(n.title, query);
    });
  }, [notes, query]);

  const filteredFolders = useMemo(() => {
    return folders.filter(f => {
      if (!query) return true;
      if (f.name && !!PinyinMatch.match(f.name, query)) return true;
      return filteredNotes.some(n => n.folder_id === f.id);
    });
  }, [folders, query, filteredNotes]);

  const getFolderNotes = (folderId: string) => {
    return filteredNotes.filter(n => n.folder_id === folderId).sort((a, b) => {
      if (!!a.is_pinned !== !!b.is_pinned) return a.is_pinned ? -1 : 1;
      return (a.title || '').localeCompare(b.title || '', 'zh-CN');
    });
  };

  const rootFolders = filteredFolders.filter(f => !f.parent_id).sort((a, b) => {
    if (!!a.is_pinned !== !!b.is_pinned) return a.is_pinned ? -1 : 1;
    return (a.name || '').localeCompare(b.name || '', 'zh-CN');
  });

  const rootNotes = filteredNotes.filter(n => !n.folder_id).sort((a, b) => {
    if (!!a.is_pinned !== !!b.is_pinned) return a.is_pinned ? -1 : 1;
    return (a.title || '').localeCompare(b.title || '', 'zh-CN');
  });

  if (loading) {
    return <div className="notes-sidebar" style={{ padding: '20px' }}>加载中…</div>;
  }

  return (
    <div className="notes-sidebar" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <style>{`
        .tree-container {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding-bottom: 20px;
        }
        .search-container {
          padding: 8px 12px;
        }
        .search-input {
          width: 100%;
          padding: 8px 12px;
          background-color: #f1f5f9;
          border: 1px solid transparent;
          border-radius: 8px;
          font-size: 13px;
          outline: none;
          transition: background-color 0.2s, border-color 0.2s, box-shadow 0.2s;
          color: #333;
        }
        .search-input::placeholder {
          color: #94a3b8;
        }
        .search-input:focus {
          background-color: #fff;
          border-color: #cbd5e1;
          box-shadow: 0 0 0 2px rgba(203,213,225,0.3);
        }
      `}</style>
      <div className="notes-sidebar-header">
        <h3 className="neo-title" style={{ fontSize: '15px', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>全部笔记</h3>
        <div style={{ display: 'flex', gap: '4px', color: '#555', alignItems: 'center' }}>
          {/* 1. +号新建按钮 */}
          <div style={{ position: 'relative' }}>
            <button 
              type="button"
              className="icon-btn" 
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setDropdownPos({ top: rect.bottom + 8, left: rect.left });
                setDropdownTargetId(dropdownTargetId === 'root' ? null : 'root');
              }}
              title="新建"
              aria-label="新建文件夹或笔记"
              style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.5" fill="none"><path d="M12 5v14M5 12h14"/></svg>
            </button>
            {dropdownTargetId === 'root' && typeof document !== 'undefined' && createPortal(
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setDropdownTargetId(null)} />
                <div className="new-dropdown" style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, margin: 0 }} role="menu" aria-label="新建选项">
                  <button type="button" role="menuitem" className="new-dropdown-item" onClick={() => createNewItem('folder', null)} style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
                    <span>文件夹</span>
                  </button>
                  <button type="button" role="menuitem" className="new-dropdown-item" onClick={() => createNewItem('regular', null)} style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
                    <span>普通笔记</span>
                  </button>
                  <button type="button" role="menuitem" className="new-dropdown-item" onClick={() => createNewItem('markdown', null)} style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
                    <span>Markdown笔记</span>
                  </button>
                </div>
              </>,
              document.body
            )}
          </div>
          
          <button 
            type="button"
            className="icon-btn"
            onClick={() => { document.querySelectorAll('.tree-folder').forEach(el => el.removeAttribute('open')); }}
            title="收起全部文件"
            aria-label="收起全部文件"
            style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.5" fill="none"><polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/></svg>
          </button>

          <div style={{ position: 'relative' }}>
            <button 
              type="button"
              className="icon-btn" 
              onClick={(e) => { 
                const rect = e.currentTarget.getBoundingClientRect();
                setDropdownPos({ top: rect.bottom + 8, left: rect.left });
                setDropdownTargetId(dropdownTargetId === 'root-more' ? null : 'root-more'); 
              }} 
              title="更多操作"
              aria-label="更多操作"
              style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none">
                <circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/><circle cx="5" cy="12" r="1.5"/>
              </svg>
            </button>
            {dropdownTargetId === 'root-more' && typeof document !== 'undefined' && createPortal(
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setDropdownTargetId(null)} />
                <div className="new-dropdown" style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left - 80, margin: 0, minWidth: '120px' }} role="menu" aria-label="更多操作选项">
                  <button type="button" role="menuitem" className="new-dropdown-item" onClick={() => { setDropdownTargetId(null); document.querySelectorAll('.tree-folder').forEach(el => el.setAttribute('open', 'true')); }} style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
                    <span>展开所有文件夹</span>
                  </button>
                  <button type="button" role="menuitem" className="new-dropdown-item" onClick={() => { setDropdownTargetId(null); document.querySelectorAll('.tree-folder').forEach(el => el.removeAttribute('open')); }} style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
                    <span>收起所有文件夹</span>
                  </button>
                </div>
              </>,
              document.body
            )}
          </div>
        </div>
      </div>

      <div className="search-container">
        <input 
          type="text" 
          placeholder="搜索笔记…" 
          aria-label="搜索笔记"
          className="search-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div 
        className="folder-tree tree-container"
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, null)}
      >
        {isCreatingFolder && !creatingTargetId && (
          <div className="tree-folder">
            <div className="tree-folder-title" style={{ display: 'flex', alignItems: 'center', paddingRight: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, gap: '4px' }}>
                <svg className="tree-arrow" viewBox="0 0 24 24" style={{ flexShrink: 0, opacity: 0 }}><path d="M9 18l6-6-6-6"/></svg>
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="#555" strokeWidth="2" fill="none" style={{ flexShrink: 0 }}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitNewFolder()}
                  onBlur={() => submitNewFolder(true)}
                  autoFocus
                  onFocus={(e) => e.target.select()}
                  className="inline-folder-input"
                  style={{ marginLeft: '4px' }}
                />
              </div>
            </div>
          </div>
        )}

        {isCreatingNote && !creatingTargetId && (
          <div className="tree-file" style={{ marginLeft: '12px' }}>
            {creatingNoteType === 'markdown' ? (
              <span className="icon-m" style={{ flexShrink: 0, background: '#9b59b6', color: '#fff', borderRadius: '4px', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>M</span>
            ) : (
              <span className="icon-m" style={{ flexShrink: 0, background: '#f39c12', color: '#fff', borderRadius: '4px', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>T</span>
            )} 
            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input
                type="text"
                value={newNoteTitle}
                onChange={(e) => setNewNoteTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitNewNote()}
                onBlur={() => submitNewNote(true)}
                autoFocus
                onFocus={(e) => e.target.select()}
                className="inline-folder-input"
                style={{ width: '120px' }}
              />
            </div>
          </div>
        )}

        {/* Folders */}
        {(() => {
          const renderFolder = (folder: import('@/store/useNoteStore').Folder) => {
            const subFolders = filteredFolders.filter(f => f.parent_id === folder.id).sort((a, b) => {
              if (!!a.is_pinned !== !!b.is_pinned) return a.is_pinned ? -1 : 1;
              return (a.name || '').localeCompare(b.name || '', 'zh-CN');
            });
            const isDragOver = dragOverFolderId === folder.id;
            const isContextMenuActive = dropdownMoreTargetId === folder.id;
            return (
          <details id={`folder-details-${folder.id}`} key={folder.id} className="tree-folder" open={query ? true : undefined}>
            <summary 
              className={`tree-folder-title ${isDragOver ? 'drag-over-highlight' : ''} ${isContextMenuActive ? 'context-menu-highlight' : ''}`}
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                paddingRight: '4px',
                border: isDragOver ? '2.5px dashed var(--neo-blue, #2563EB)' : undefined,
                backgroundColor: isContextMenuActive ? 'rgba(37, 99, 235, 0.08)' : (isDragOver ? 'rgba(37, 99, 235, 0.04)' : undefined)
              }}
              draggable={true}
              onDragStart={(e) => handleDragStart(e, 'folder', folder.id)}
              onDragOver={handleDragOver}
              onDragEnter={() => handleDragEnterFolder(folder.id)}
              onDragLeave={handleDragLeaveFolder}
              onDrop={(e) => handleDrop(e, folder.id)}
              onContextMenu={(e) => handleContextMenu(e, 'folder', folder.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, gap: '4px' }}>
                <svg aria-hidden="true" className="tree-arrow" viewBox="0 0 24 24" style={{ flexShrink: 0 }}><path d="M9 18l6-6-6-6"/></svg>
                <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" stroke="#555" strokeWidth="2" fill="none" style={{ flexShrink: 0 }}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                {renamingTargetId === folder.id && renamingType === 'folder' ? (
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submitRename()}
                    onBlur={submitRename}
                    autoFocus
                    onFocus={(e) => e.target.select()}
                    className="inline-folder-input"
                    aria-label="重命名文件夹"
                    style={{ marginLeft: '4px', width: '100px' }}
                    onClick={(e) => e.preventDefault()}
                  />
                ) : (
                  <>
                    <span className="tree-item-label" style={{ marginLeft: '2px', flex: '0 1 auto' }} title={folder.name}>{folder.name}</span>
                    {folder.is_pinned && <svg aria-hidden="true" viewBox="0 0 24 24" width="12" height="12" stroke="#4a89fb" strokeWidth="2.5" fill="none" style={{ flexShrink: 0 }}><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76Z"/></svg>}
                    {folder.is_starred && <svg aria-hidden="true" viewBox="0 0 24 24" width="12" height="12" stroke="#F5A623" strokeWidth="2" fill="#F5A623" style={{ flexShrink: 0 }}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>}
                  </>
                )}
              </div>
              <div className={`tree-item-actions ${(dropdownTargetId === folder.id || dropdownMoreTargetId === folder.id) ? 'active' : ''}`}>
                <button 
                  type="button"
                  onClick={(e) => { e.stopPropagation(); requestDelete('folder', folder.id, folder.name, e); }}
                  title="删除"
                  aria-label="删除文件夹"
                  style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" style={{ color: '#999' }}><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
                <div style={{ position: 'relative' }}>
                  <button 
                    type="button"
                    onClick={(e) => { 
                      e.preventDefault(); 
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      setDropdownPos({ top: rect.bottom + 8, left: rect.left });
                      setDropdownTargetId(dropdownTargetId === folder.id ? null : folder.id); 
                    }} 
                    title="新建"
                    aria-label="在文件夹中新建"
                    style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" style={{ color: '#999' }}><path d="M12 5v14M5 12h14"/></svg>
                  </button>
                </div>
                <div style={{ position: 'relative' }}>
                  <button 
                    type="button"
                    onClick={(e) => { 
                      e.preventDefault(); 
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      setDropdownPos({ top: rect.bottom + 8, left: rect.left });
                      setDropdownMoreTargetId(dropdownMoreTargetId === folder.id ? null : folder.id); 
                    }} 
                    title="更多"
                    aria-label="更多文件夹操作"
                    style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" style={{ color: '#999' }}><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
                  </button>
                </div>
              </div>
              {dropdownTargetId === folder.id && typeof document !== 'undefined' && createPortal(
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDropdownTargetId(null); }} />
                  <div className="new-dropdown" style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, margin: 0, minWidth: '120px', zIndex: 100 }} role="menu" aria-label="文件夹新建选项">
                    <button type="button" role="menuitem" className="new-dropdown-item" onClick={(e) => { e.preventDefault(); e.stopPropagation(); createNewItem('folder', folder.id); }} style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
                      <span>子文件夹</span>
                    </button>
                    <button type="button" role="menuitem" className="new-dropdown-item" onClick={(e) => { e.preventDefault(); e.stopPropagation(); createNewItem('regular', folder.id); }} style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
                      <span>普通笔记</span>
                    </button>
                    <button type="button" role="menuitem" className="new-dropdown-item" onClick={(e) => { e.preventDefault(); e.stopPropagation(); createNewItem('markdown', folder.id); }} style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
                      <span>Markdown笔记</span>
                    </button>
                  </div>
                </>,
                document.body
              )}
              {dropdownMoreTargetId === folder.id && typeof document !== 'undefined' && createPortal(
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDropdownMoreTargetId(null); }} />
                  <div className="new-dropdown" style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, margin: 0, minWidth: '100px', zIndex: 100 }} role="menu" aria-label="文件夹操作选项">
                    <button type="button" role="menuitem" className="new-dropdown-item" onClick={(e) => { startRename('folder', folder.id, folder.name, e); e.stopPropagation(); }} style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}><span>重命名</span></button>
                    <button type="button" role="menuitem" className="new-dropdown-item" onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePin('folder', folder.id, !!folder.is_pinned); }} style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}><span>{folder.is_pinned ? '取消置顶' : '置顶'}</span></button>
                    <button type="button" role="menuitem" className="new-dropdown-item" onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleStar('folder', folder.id, !!folder.is_starred); }} style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}><span>{folder.is_starred ? '取消标星' : '标星'}</span></button>
                    <button type="button" role="menuitem" className="new-dropdown-item" onClick={(e) => { e.preventDefault(); e.stopPropagation(); downloadFolder(folder.id, folder.name); }} style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}><span>下载</span></button>
                    <button type="button" role="menuitem" className="new-dropdown-item" style={{ borderTop: '1px dashed var(--border-color, #000)', color: 'var(--neo-pink, #FF4B4B)', width: '100%', borderLeft: 'none', borderRight: 'none', borderBottom: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDropdownMoreTargetId(null); requestDelete('folder', folder.id, folder.name, e); }}><span>删除</span></button>
                  </div>
                </>,
                document.body
              )}
            </summary>
            <div className="tree-folder-content">
              {isCreatingFolder && creatingTargetId === folder.id && (
                <div className="tree-folder">
                  <div className="tree-folder-title" style={{ display: 'flex', alignItems: 'center', paddingRight: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, gap: '4px' }}>
                      <svg aria-hidden="true" className="tree-arrow" viewBox="0 0 24 24" style={{ flexShrink: 0, opacity: 0 }}><path d="M9 18l6-6-6-6"/></svg>
                      <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" stroke="#555" strokeWidth="2" fill="none" style={{ flexShrink: 0 }}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                      <input
                        type="text"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && submitNewFolder()}
                        onBlur={() => submitNewFolder(true)}
                        autoFocus
                        onFocus={(e) => e.target.select()}
                        className="inline-folder-input"
                        aria-label="新建文件夹名称"
                        style={{ marginLeft: '4px' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {isCreatingNote && creatingTargetId === folder.id && (
                <div className="tree-file">
                  {creatingNoteType === 'markdown' ? (
                    <span className="icon-m" aria-hidden="true" style={{ flexShrink: 0, background: '#9b59b6', color: '#fff', borderRadius: '4px', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>M</span>
                  ) : (
                    <span className="icon-m" aria-hidden="true" style={{ flexShrink: 0, background: '#f39c12', color: '#fff', borderRadius: '4px', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>T</span>
                  )} 
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="text"
                      value={newNoteTitle}
                      onChange={(e) => setNewNoteTitle(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && submitNewNote()}
                      onBlur={() => submitNewNote(true)}
                      autoFocus
                      onFocus={(e) => e.target.select()}
                      className="inline-folder-input"
                      aria-label="新建笔记名称"
                      style={{ width: '120px' }}
                    />
                  </div>
                </div>
              )}
              {subFolders.map(subFolder => renderFolder(subFolder))}
              {getFolderNotes(folder.id).map(note => {
                const isNoteContextMenuActive = dropdownMoreTargetId === note.id;
                return (
                <div 
                  key={note.id}
                  className={`tree-file ${selectedNoteId === note.id ? 'active' : ''} ${isNoteContextMenuActive ? 'context-menu-highlight' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`笔记: ${note.title}`}
                  onClick={() => onSelectNote(note.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectNote(note.id);
                    }
                  }}
                  style={{
                    backgroundColor: isNoteContextMenuActive ? 'rgba(37, 99, 235, 0.08)' : undefined,
                    cursor: 'pointer'
                  }}
                  draggable={true}
                  onDragStart={(e) => handleDragStart(e, 'note', note.id)}
                  onContextMenu={(e) => handleContextMenu(e, 'note', note.id)}
                >
                  {renamingTargetId === note.id && renamingType === 'note' ? (
                    <input
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && submitRename()}
                      onBlur={submitRename}
                      autoFocus
                      onFocus={(e) => e.target.select()}
                      className="inline-folder-input"
                      aria-label="重命名笔记"
                      style={{ width: '120px' }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <>
                      {note.type === 'markdown' ? (
                        <span className="icon-m" aria-hidden="true" style={{ flexShrink: 0, background: '#9b59b6', color: '#fff', borderRadius: '4px', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>M</span>
                      ) : (
                        <span className="icon-m" aria-hidden="true" style={{ flexShrink: 0, background: '#f39c12', color: '#fff', borderRadius: '4px', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>T</span>
                      )} 
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span className="tree-item-label" style={{ flex: '0 1 auto' }} title={note.title}>{note.title}</span>
                        {note.is_public && (
                          <span 
                            style={{ 
                              flexShrink: 0, 
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '3px',
                              fontSize: '9px', 
                              background: 'var(--neo-green, #10B981)', 
                              color: '#000000', 
                              padding: '2px 5px', 
                              borderRadius: '4px', 
                              fontWeight: '800', 
                              border: '1.5px solid #000000',
                              boxShadow: '1px 1px 0px #000000',
                              lineHeight: 1
                            }} 
                            title="已公开发布到笔记广场"
                          >
                            <svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" strokeWidth="3" fill="none" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>
                            公开
                          </span>
                        )}
                        {note.is_pinned && <svg aria-hidden="true" viewBox="0 0 24 24" width="12" height="12" stroke="#4a89fb" strokeWidth="2.5" fill="none" style={{ flexShrink: 0 }}><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76Z"/></svg>}
                        {note.is_starred && <svg aria-hidden="true" viewBox="0 0 24 24" width="12" height="12" stroke="#F5A623" strokeWidth="2" fill="#F5A623" style={{ flexShrink: 0 }}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>}
                      </div>
                      <div className={`tree-item-actions ${dropdownMoreTargetId === note.id ? 'active' : ''}`}>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); requestDelete('note', note.id, note.title, e); }}
                          title="删除"
                          aria-label="删除笔记"
                          style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                        >
                          <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" style={{ color: '#999' }}><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                        <div style={{ position: 'relative' }}>
                          <button
                            type="button"
                            onClick={(e) => { 
                              e.preventDefault(); 
                              e.stopPropagation(); 
                              const rect = e.currentTarget.getBoundingClientRect();
                              setDropdownPos({ top: rect.bottom + 8, left: rect.left });
                              setDropdownMoreTargetId(dropdownMoreTargetId === note.id ? null : note.id); 
                            }}
                            title="更多"
                            aria-label="更多笔记操作"
                            style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                          >
                            <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" style={{ color: '#999' }}><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
                          </button>
                        </div>
                      </div>
                      {dropdownMoreTargetId === note.id && typeof document !== 'undefined' && createPortal(
                        <>
                          <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={(e) => { e.stopPropagation(); setDropdownMoreTargetId(null); }} />
                          <div className="new-dropdown" style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, margin: 0, minWidth: '100px', zIndex: 100 }}>
                            <div className="new-dropdown-item" onClick={(e) => startRename('note', note.id, note.title, e)}><span>重命名</span></div>
                            <div className="new-dropdown-item" onClick={(e) => { e.stopPropagation(); togglePin('note', note.id, !!note.is_pinned); }}><span>{note.is_pinned ? '取消置顶' : '置顶'}</span></div>
                            <div className="new-dropdown-item" onClick={(e) => { e.stopPropagation(); toggleStar('note', note.id, !!note.is_starred); }}><span>{note.is_starred ? '取消标星' : '标星'}</span></div>
                            <div className="new-dropdown-item" onClick={(e) => { e.stopPropagation(); downloadNote(note.id, note.title); }}><span>下载</span></div>
                            <div className="new-dropdown-item" style={{ borderTop: '1px dashed var(--border-color, #000)', color: 'var(--neo-pink, #FF4B4B)' }} onClick={(e) => { e.stopPropagation(); setDropdownMoreTargetId(null); requestDelete('note', note.id, note.title, e); }}><span>删除</span></div>
                          </div>
                        </>,
                        document.body
                      )}
                    </>
                  )}
                </div>
              );
              })}
              {subFolders.length === 0 && getFolderNotes(folder.id).length === 0 && !isCreatingFolder && !isCreatingNote && (
                <div style={{ fontSize: '11px', color: '#999', padding: '4px 12px' }}>空文件夹</div>
              )}
            </div>
          </details>
            );
          };
          return rootFolders.map(folder => renderFolder(folder));
        })()}

        {/* Uncategorized notes */}
        {rootNotes.map(note => {
          const isNoteContextMenuActive = dropdownMoreTargetId === note.id;
          return (
          <div 
            key={note.id}
            className={`tree-file ${selectedNoteId === note.id ? 'active' : ''} ${isNoteContextMenuActive ? 'context-menu-highlight' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={`笔记: ${note.title}`}
            onClick={() => onSelectNote(note.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectNote(note.id);
              }
            }}
            style={{ marginLeft: '12px', backgroundColor: isNoteContextMenuActive ? 'rgba(37, 99, 235, 0.08)' : undefined, cursor: 'pointer' }}
            draggable={true}
            onDragStart={(e) => handleDragStart(e, 'note', note.id)}
            onContextMenu={(e) => handleContextMenu(e, 'note', note.id)}
          >
            {renamingTargetId === note.id && renamingType === 'note' ? (
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitRename()}
                onBlur={submitRename}
                autoFocus
                onFocus={(e) => e.target.select()}
                className="inline-folder-input"
                aria-label="重命名笔记"
                style={{ width: '120px' }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                {note.type === 'markdown' ? (
                  <span className="icon-m" aria-hidden="true" style={{ flexShrink: 0, background: '#9b59b6', color: '#fff', borderRadius: '4px', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>M</span>
                ) : (
                  <span className="icon-m" aria-hidden="true" style={{ flexShrink: 0, background: '#f39c12', color: '#fff', borderRadius: '4px', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>T</span>
                )} 
                <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span className="tree-item-label" style={{ flex: '0 1 auto' }} title={note.title}>{note.title}</span>
                  {note.is_public && (
                    <span 
                      style={{ 
                        flexShrink: 0, 
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '3px',
                        fontSize: '9px', 
                        background: 'var(--neo-green, #10B981)', 
                        color: '#000000', 
                        padding: '2px 5px', 
                        borderRadius: '4px', 
                        fontWeight: '800', 
                        border: '1.5px solid #000000',
                        boxShadow: '1px 1px 0px #000000',
                        lineHeight: 1
                      }} 
                      title="已公开发布到笔记广场"
                    >
                      <svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" strokeWidth="3" fill="none" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>
                      公开
                    </span>
                  )}
                  {note.is_pinned && <svg aria-hidden="true" viewBox="0 0 24 24" width="12" height="12" stroke="#4a89fb" strokeWidth="2.5" fill="none" style={{ flexShrink: 0 }}><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76Z"/></svg>}
                  {note.is_starred && <svg aria-hidden="true" viewBox="0 0 24 24" width="12" height="12" stroke="#F5A623" strokeWidth="2" fill="#F5A623" style={{ flexShrink: 0 }}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>}
                </div>
                <div className={`tree-item-actions ${dropdownMoreTargetId === note.id ? 'active' : ''}`}>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); requestDelete('note', note.id, note.title, e); }}
                    title="删除"
                    aria-label="删除笔记"
                    style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" style={{ color: '#999' }}><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                  <div style={{ position: 'relative' }}>
                    <button
                      type="button"
                      onClick={(e) => { 
                        e.preventDefault(); 
                        e.stopPropagation(); 
                        const rect = e.currentTarget.getBoundingClientRect();
                        setDropdownPos({ top: rect.bottom + 8, left: rect.left });
                        setDropdownMoreTargetId(dropdownMoreTargetId === note.id ? null : note.id); 
                      }}
                      title="更多"
                      aria-label="更多笔记操作"
                      style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" style={{ color: '#999' }}><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
                    </button>
                  </div>
                </div>
                {dropdownMoreTargetId === note.id && typeof document !== 'undefined' && createPortal(
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={(e) => { e.stopPropagation(); setDropdownMoreTargetId(null); }} />
                    <div className="new-dropdown" style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, margin: 0, minWidth: '100px', zIndex: 100 }} role="menu" aria-label="笔记操作选项">
                      <button type="button" role="menuitem" className="new-dropdown-item" onClick={(e) => startRename('note', note.id, note.title, e)} style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}><span>重命名</span></button>
                      <button type="button" role="menuitem" className="new-dropdown-item" onClick={(e) => { e.stopPropagation(); togglePin('note', note.id, !!note.is_pinned); }} style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}><span>{note.is_pinned ? '取消置顶' : '置顶'}</span></button>
                      <button type="button" role="menuitem" className="new-dropdown-item" onClick={(e) => { e.stopPropagation(); toggleStar('note', note.id, !!note.is_starred); }} style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}><span>{note.is_starred ? '取消标星' : '标星'}</span></button>
                      <button type="button" role="menuitem" className="new-dropdown-item" onClick={(e) => { e.stopPropagation(); downloadNote(note.id, note.title); }} style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}><span>下载</span></button>
                      <button type="button" role="menuitem" className="new-dropdown-item" style={{ borderTop: '1px dashed var(--border-color, #000)', color: 'var(--neo-pink, #FF4B4B)', width: '100%', borderLeft: 'none', borderRight: 'none', borderBottom: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setDropdownMoreTargetId(null); requestDelete('note', note.id, note.title, e); }}><span>删除</span></button>
                    </div>
                  </>,
                  document.body
                )}
              </>
            )}
          </div>
          );
        })}
      </div>

      {itemToDelete && typeof document !== 'undefined' && createPortal(
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(2px)' }} onClick={() => setItemToDelete(null)}>
          <div style={{ background: 'var(--neo-white)', border: '3px solid var(--border-color)', width: '320px', padding: '24px', borderRadius: '12px', boxShadow: '6px 6px 0px 0px var(--border-color)', transition: 'none', transform: 'none' }} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title">
            <h3 id="delete-confirm-title" className="neo-title" style={{ fontSize: '18px', marginTop: 0, marginBottom: '12px' }}>确认删除</h3>
            <p style={{ fontSize: '14px', color: '#555', lineHeight: 1.5, margin: 0 }}>
              确定要永久删除{itemToDelete.type === 'folder' ? '文件夹' : '笔记'} <strong>{itemToDelete.name}</strong> 吗？
              {itemToDelete.type === 'folder' && <><br/><span style={{ color: 'var(--neo-red, #e25555)', fontSize: '12px', fontWeight: 'bold', display: 'inline-block', marginTop: '8px' }}>⚠️ 注意：其中包含的所有内容也会被一并删除，且无法恢复！</span></>}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
              <button autoFocus className="neo-btn" style={{ background: '#f5f5f5', border: '1px solid #ddd', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 500 }} onClick={() => setItemToDelete(null)}>
                取消
              </button>
              <button className="neo-btn" style={{ background: 'var(--neo-red, #e25555)', color: 'white', border: '1.5px solid #000', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }} onClick={confirmDelete}>
                确认删除
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
