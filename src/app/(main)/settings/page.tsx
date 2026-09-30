'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { authApi, foldersApi, notesApi, actionsApi, favoritesApi, storageApi } from '@/lib/api/client';
import { toast } from 'sonner';
import JSZip from 'jszip';
import { 
  Settings, 
  Palette, 
  Database, 
  Keyboard, 
  Trash2, 
  Download, 
  RefreshCw, 
  Cloud, 
  Sliders, 
  Info,
  Check
} from 'lucide-react';

interface Preferences {
  theme: string;
  font_family: string;
  editor_autosave_interval: number; // 0 = off, 1000 = 1s, 3000 = 3s
  default_sidebar_open: boolean;
  openai_api_key?: string;
  openai_base_url?: string;
  openai_model?: string;
}

export default function SettingsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  // Preferences state
  const [preferences, setPreferences] = useState<Preferences>({
    theme: 'system',
    font_family: 'sans',
    editor_autosave_interval: 3000,
    default_sidebar_open: true,
    openai_api_key: '',
    openai_base_url: '',
    openai_model: ''
  });

  // Storage Stats state
  const [storageFilesCount, setStorageFilesCount] = useState(0);
  const [storageTotalSize, setStorageTotalSize] = useState(0);
  const [loadingStorage, setLoadingStorage] = useState(false);

  const fetchStorageStats = useCallback(async () => {
    setLoadingStorage(true);
    try {
      const stats = await storageApi.getStats();
      if (stats) {
        setStorageFilesCount(stats.count);
        setStorageTotalSize(stats.total_size);
      }
    } catch (err) {
      console.warn('获取存储统计失败:', err);
    } finally {
      setLoadingStorage(false);
    }
  }, []);

  const applyPrefsToDOM = useCallback((theme: string, fontFamily: string) => {
    if (typeof window === 'undefined') return;
    const appContainer = document.querySelector('.app-container') as HTMLElement;
    if (!appContainer) return;

    // Apply Theme
    if (theme === 'dark') {
      appContainer.classList.add('dark');
    } else if (theme === 'light') {
      appContainer.classList.remove('dark');
    } else {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      appContainer.classList.toggle('dark', isDark);
    }

    // Apply Font
    if (fontFamily === 'heading') {
      appContainer.style.fontFamily = "var(--font-heading), 'Space Grotesk', sans-serif";
    } else if (fontFamily === 'mono') {
      appContainer.style.fontFamily = "monospace, 'JetBrains Mono', Courier New";
    } else {
      appContainer.style.fontFamily = "var(--font-sans), 'Plus Jakarta Sans', sans-serif";
    }
  }, []);

  useEffect(() => {
    async function loadSettings() {
      try {
        const me = await authApi.getMe();
        if (!me) {
          toast.error('请先登录！');
          router.push('/login');
          return;
        }
        setUserId(me.id);

        const prefs = (me.preferences as Partial<Preferences>) || {};
        const finalPrefs = {
          theme: prefs.theme || 'system',
          font_family: prefs.font_family || 'sans',
          editor_autosave_interval: prefs.editor_autosave_interval !== undefined ? prefs.editor_autosave_interval : 3000,
          default_sidebar_open: prefs.default_sidebar_open !== undefined ? prefs.default_sidebar_open : true,
          openai_api_key: '',
          openai_base_url: '',
          openai_model: ''
        };
        setPreferences(finalPrefs);
        applyPrefsToDOM(finalPrefs.theme, finalPrefs.font_family);

        // Fetch storage statistics
        fetchStorageStats();
      } catch (err) {
        console.error(err);
        toast.error('加载系统设置出错。');
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, [router, fetchStorageStats, applyPrefsToDOM]);

  const handleSavePreferences = async (updatedPrefs: Preferences) => {
    setSaving(true);
    setPreferences(updatedPrefs);
    applyPrefsToDOM(updatedPrefs.theme, updatedPrefs.font_family);

    try {
      await authApi.updateProfile({
        preferences: updatedPrefs
      });
      toast.success('偏好设置已自动保存！');
    } catch (err: any) {
      toast.error(`设置保存失败: ${err.message || '网络错误'}`);
    } finally {
      setSaving(false);
    }
  };

  // ZIP export logic
  const handleExportData = async () => {
    if (exporting) return;
    setExporting(true);
    const toastId = toast.loading('正在打包您的全部笔记…');

    try {
      // 1. Fetch folders
      const folders = await foldersApi.list();

      // 2. Fetch notes
      const notes = await notesApi.list();

      if (!notes || notes.length === 0) {
        toast.error('您目前没有任何笔记可供导出。', { id: toastId });
        setExporting(false);
        return;
      }

      // Initialize JSZip
      const zip = new JSZip();

      const typedFolders = (folders || []) as { id: string; name: string; parent_id: string | null }[];
      const typedNotes = (notes || []) as {
        id: string;
        title: string;
        content: string | null;
        folder_id: string | null;
        created_at: string;
        category: string | null;
      }[];

      // Helper to build folder path structures in ZIP
      const folderMap = new Map<string, JSZip>(); // folderId -> JSZip Folder object
      const folderDataMap = new Map(typedFolders.map(f => [f.id, f]));

      const getZipFolder = (folderId: string): JSZip => {
        if (folderMap.has(folderId)) {
          return folderMap.get(folderId) as JSZip;
        }

        const folder = folderDataMap.get(folderId);
        if (!folder) return zip; // fallback to root

        if (folder.parent_id) {
          // Recursively get parent folder
          const parentZipFolder = getZipFolder(folder.parent_id);
          const currentZipFolder = parentZipFolder.folder(folder.name) as JSZip;
          folderMap.set(folderId, currentZipFolder);
          return currentZipFolder;
        } else {
          // Top-level folder
          const currentZipFolder = zip.folder(folder.name) as JSZip;
          folderMap.set(folderId, currentZipFolder);
          return currentZipFolder;
        }
      };

      // 3. Populate zip with notes as .md files
      typedNotes.forEach(note => {
        const dateStr = note.created_at ? new Date(note.created_at).toLocaleString('zh-CN') : '未知时间';
        
        // Formulate Markdown header metadata (front-matter)
        const fileContent = `---
title: ${note.title}
category: ${note.category || '未分类'}
created_at: ${dateStr}
---

# ${note.title}

${note.content || ''}
`;

        const safeTitle = note.title.replace(/[\/\\?%*:|"<>]/g, '-'); // sanitize filename
        const fileName = `${safeTitle}.md`;

        if (note.folder_id) {
          const zipFolder = getZipFolder(note.folder_id);
          zipFolder.file(fileName, fileContent);
        } else {
          // Root level
          zip.file(fileName, fileContent);
        }
      });

      // 4. Generate and download zip
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `知行笔记备份_${new Date().toISOString().split('T')[0]}.zip`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success('打包备份下载成功！数据已妥善解压本地。', { id: toastId });
    } catch (err) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : '网络繁忙';
      toast.error(`备份导出失败: ${errMsg}`, { id: toastId });
    } finally {
      setExporting(false);
    }
  };

  // Danger Zone: reset everything
  const handleResetData = async () => {
    if (!userId) return;
    
    const doubleConfirmText = `确定清空数据`;
    const userConfirm = prompt(
      `🚨 极度危险警告：\n此操作将永久清空您所有的文件夹、笔记和行动待办，数据一旦删除将永远无法恢复！\n\n如果确认要清空，请在下方输入【${doubleConfirmText}】以执行：`
    );

    if (userConfirm !== doubleConfirmText) {
      toast.error('输入验证不匹配，重置操作已被中止。');
      return;
    }

    const toastId = toast.loading('正在清空您的全部笔记与文件夹…');
    try {
      const [folders, notes] = await Promise.all([
        foldersApi.list(),
        notesApi.list()
      ]);

      for (const n of (notes || [])) {
        try { await notesApi.delete(n.id); } catch {}
      }
      for (const f of (folders || [])) {
        try { await foldersApi.delete(f.id); } catch {}
      }

      toast.success('您的数据已被清空重置。', { id: toastId });
      router.push('/dashboard');
    } catch (err: any) {
      console.error(err);
      toast.error(`数据重置失败: ${err.message || '服务端异常'}`, { id: toastId });
    }

      toast.success('您的数据已被彻底粉碎重置。', { id: toastId });
      router.push('/dashboard');
    } catch (err) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : '服务端异常';
      toast.error(`数据重置失败: ${errMsg}`, { id: toastId });
    }
  };

  const getFontFamilyValue = (f: string) => {
    if (f === 'heading') return 'var(--font-heading), system-ui';
    if (f === 'mono') return 'monospace, Courier New';
    return 'var(--font-sans), sans-serif';
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <div className="neo-card" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="animate-spin" style={{ width: '20px', height: '20px', border: '3px solid #000', borderTopColor: 'transparent', borderRadius: '50%' }} />
          <span style={{ fontWeight: 'bold' }}>正在努力加载系统设置…</span>
        </div>
      </div>
    );
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 KB';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <section id="system-settings" className="content-section active" style={{ padding: '24px', overflowY: 'auto', height: '100%' }}>
      {/* 顶部 Neo Title */}
      <div 
        className="neo-card" 
        style={{ 
          background: 'var(--neo-yellow)', 
          color: 'black', 
          borderColor: '#000000',
          padding: '24px', 
          borderRadius: '12px', 
          marginBottom: '24px',
          boxShadow: '6px 6px 0px 0px #000'
        }}
      >
        <h2 className="neo-title" style={{ fontSize: '24px', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Settings size={24} /> 系统偏好设置 (System Settings)
        </h2>
        <p style={{ fontSize: '13px', marginTop: '6px', opacity: 0.9, fontWeight: 600 }}>
          在这里定制您的“知行”体验：调节主题外观、编辑器预置字体，或者以极简打包模式一键下载/重置您的个人数据。
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px' }}>
        
        {/* Left Column: UI Preferences */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Appearance Card */}
          <div className="neo-card" style={{ backgroundColor: 'var(--bg-card)', borderRadius: '12px', boxShadow: '6px 6px 0px 0px #000', marginBottom: 0 }}>
            <h3 className="neo-title" style={{ fontSize: '16px', borderBottom: '3.5px dashed #000', paddingBottom: '10px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Palette size={18} /> 主题与个性视觉
            </h3>

            {/* Theme Select */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>界面显示主题</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                {['system', 'light', 'dark'].map((t) => (
                  <button 
                    key={t}
                    type="button"
                    onClick={() => handleSavePreferences({ ...preferences, theme: t })}
                    className="neo-btn"
                    aria-pressed={preferences.theme === t}
                    style={{ 
                      flex: 1, 
                      padding: '8px 12px',
                      fontSize: '12px',
                      backgroundColor: preferences.theme === t ? 'var(--neo-yellow)' : 'var(--bg-btn-secondary)',
                      color: preferences.theme === t ? '#000000' : 'var(--text-primary)',
                      boxShadow: preferences.theme === t ? '3px 3px 0 #000' : '1px 1px 0 #000',
                      transform: preferences.theme === t ? 'translate(1px, 1px)' : 'none'
                    }}
                  >
                    {t === 'system' ? '跟随系统' : t === 'light' ? '知行亮白' : '硬核暗黑'}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Family Select */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>编辑器偏好字体</label>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                {[
                  { key: 'sans', name: '默认现代 (Sans)' },
                  { key: 'heading', name: '几何科技 (Grotesk)' },
                  { key: 'mono', name: '程序员等宽 (Mono)' }
                ].map((f) => (
                  <button 
                    key={f.key}
                    type="button"
                    onClick={() => handleSavePreferences({ ...preferences, font_family: f.key })}
                    className="neo-btn"
                    aria-pressed={preferences.font_family === f.key}
                    style={{ 
                      flex: 1, 
                      padding: '8px 6px',
                      fontSize: '11px',
                      backgroundColor: preferences.font_family === f.key ? 'var(--neo-yellow)' : 'var(--bg-btn-secondary)',
                      color: preferences.font_family === f.key ? '#000000' : 'var(--text-primary)',
                      boxShadow: preferences.font_family === f.key ? '3px 3px 0 #000' : '1px 1px 0 #000',
                      transform: preferences.font_family === f.key ? 'translate(1px, 1px)' : 'none'
                    }}
                  >
                    {f.name}
                  </button>
                ))}
              </div>

              {/* Font Live Preview Box */}
              <div style={{ border: '2px solid var(--border-color)', background: 'var(--bg-preview)', color: 'var(--text-primary)', padding: '12px', borderRadius: '8px', boxShadow: 'inset 2px 2px 0 var(--bg-disabled)' }}>
                <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>实时字体效果预览：</span>
                <p style={{ 
                  margin: 0, 
                  fontSize: '13px', 
                  fontWeight: 'bold', 
                  fontFamily: getFontFamilyValue(preferences.font_family),
                  lineHeight: '1.5',
                  wordBreak: 'break-all'
                }}>
                  知行合一，止于至善。The quick brown fox jumps over the lazy dog.
                </p>
              </div>
            </div>

            {/* Auto-save Preferences */}
            <div>
              <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>编辑器自动保存时间</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                {[
                  { val: 1000, label: '1 秒极速保存' },
                  { val: 3000, label: '3 秒均衡保存' },
                  { val: 0, label: '不自动保存 (手动)' }
                ].map((item) => (
                  <button 
                    key={item.val}
                    type="button"
                    onClick={() => handleSavePreferences({ ...preferences, editor_autosave_interval: item.val })}
                    className="neo-btn"
                    aria-pressed={preferences.editor_autosave_interval === item.val}
                    style={{ 
                      flex: 1, 
                      padding: '8px 6px',
                      fontSize: '11px',
                      backgroundColor: preferences.editor_autosave_interval === item.val ? 'var(--neo-yellow)' : 'var(--bg-btn-secondary)',
                      color: preferences.editor_autosave_interval === item.val ? '#000000' : 'var(--text-primary)',
                      boxShadow: preferences.editor_autosave_interval === item.val ? '3px 3px 0 #000' : '1px 1px 0 #000',
                      transform: preferences.editor_autosave_interval === item.val ? 'translate(1px, 1px)' : 'none'
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

          </div>



          {/* Shortcut Guide Card */}
          <div className="neo-card" style={{ backgroundColor: 'var(--bg-card)', borderRadius: '12px', boxShadow: '6px 6px 0px 0px #000', marginBottom: 0 }}>
            <h3 className="neo-title" style={{ fontSize: '16px', borderBottom: '3.5px dashed #000', paddingBottom: '10px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Keyboard size={18} /> 效率键盘快捷键指南
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '12px', fontWeight: 'bold' }}>
              {[
                { keys: ['Ctrl', 'S'], desc: '手动保存正在编辑的笔记' },
                { keys: ['Ctrl', '\\'], desc: '显示/隐藏编辑器右侧待办面板' },
                { keys: ['Ctrl', 'N'], desc: '在当前文件夹极速创建新笔记' },
                { keys: ['Ctrl', 'Shift', 'F'], desc: '聚焦并弹出全局笔记树搜索框' }
              ].map((hk, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--bg-disabled)', paddingBottom: '8px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{hk.desc}</span>
                  <div style={{ display: 'flex', gap: '3px' }}>
                    {hk.keys.map((k, j) => (
                      <kbd 
                        key={j}
                        style={{ 
                          border: '2px solid var(--border-color)', 
                          background: 'var(--bg-btn-secondary)', 
                          color: 'var(--text-primary)',
                          padding: '1px 5px', 
                          borderRadius: '4px', 
                          fontSize: '10px', 
                          boxShadow: '1px 1px 0 var(--border-color)' 
                        }}
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right Column: Data Management & Sync */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Storage & Cloud status */}
          <div className="neo-card" style={{ backgroundColor: 'var(--bg-card)', borderRadius: '12px', boxShadow: '6px 6px 0px 0px #000', marginBottom: 0 }}>
            <h3 className="neo-title" style={{ fontSize: '16px', borderBottom: '3.5px dashed #000', paddingBottom: '10px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Cloud size={18} /> Supabase 存储与备份云端
            </h3>

            <div 
              style={{ 
                border: '2px dashed var(--neo-blue)', 
                background: 'rgba(37, 99, 235, 0.04)', 
                borderRadius: '8px', 
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)' }}>转换桶使用限额 (Converts Bucket)</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--neo-blue)', marginTop: '4px' }}>
                  {loadingStorage ? '统计计算中…' : `${formatBytes(storageTotalSize)}`}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, marginTop: '2px' }}>
                  累计存储了 {storageFilesCount} 个原文件副本
                </div>
              </div>
              
              <button 
                type="button" 
                onClick={() => userId && fetchStorageStats(userId)}
                className="neo-btn"
                aria-label="刷新统计"
                style={{ padding: '8px', background: 'var(--bg-btn-secondary)', color: 'var(--text-primary)' }}
                title="刷新统计"
              >
                <RefreshCw size={14} className={loadingStorage ? 'animate-spin' : ''} />
              </button>
            </div>
            
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginTop: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Info size={12} />
              <span>此处临时存储您一键转换上传的文件副本。超出限额时，请在下方点击清空。</span>
            </div>
          </div>

          {/* Backup & Export / Destruct */}
          <div className="neo-card" style={{ backgroundColor: 'var(--bg-card)', borderRadius: '12px', boxShadow: '6px 6px 0px 0px #000', marginBottom: 0 }}>
            <h3 className="neo-title" style={{ fontSize: '16px', borderBottom: '3.5px dashed #000', paddingBottom: '10px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Database size={18} /> 数据安全出口与销毁
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* JSZip Backup Button */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '6px' }}>一键备份导出</div>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, margin: '0 0 10px 0' }}>
                  将所有文件夹层级下的笔记内容导出为标准的 Markdown 打包 ZIP 压缩包，完全保障您对个人数据的所有权。
                </p>
                
                <button 
                  type="button"
                  onClick={handleExportData}
                  disabled={exporting}
                  className="neo-btn neo-btn-primary"
                  style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
                >
                  <Download size={16} /> {exporting ? '正在打包中…' : '立即下载全部笔记 (ZIP)'}
                </button>
              </div>
            </div>

            {/* Danger Zone */}
            <div style={{ marginTop: '24px', borderTop: '3px solid #F3F4F6', paddingTop: '20px' }}>
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--neo-pink)', display: 'block', marginBottom: '6px' }}>危险数据销毁区</div>
              
              <button 
                type="button"
                onClick={handleResetData}
                className="neo-btn"
                style={{ 
                  width: '100%', 
                  justifyContent: 'center', 
                  color: 'white', 
                  backgroundColor: 'var(--neo-pink)',
                  boxShadow: '3px 3px 0px #000',
                  padding: '12px'
                }}
              >
                <Trash2 size={16} /> 永久销毁账户数据
              </button>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
