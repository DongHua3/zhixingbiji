'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { foldersApi, notesApi, actionsApi, storageApi, authApi } from '@/lib/api/client';
import { toast } from 'sonner';
import { 
  Upload, 
  FileText, 
  CheckCircle, 
  AlertCircle, 
  FolderOpen, 
  ArrowRight, 
  RefreshCw, 
  FileCode,
  Sparkles,
  Info,
  Check,
  ChevronRight,
  Eye,
  Edit2,
  Folder,
  Archive,
  FileImage,
  FileAudio,
  Trash2,
  ChevronDown,
  X
} from 'lucide-react';

const NotePreviewEditor = dynamic(() => import('@/components/notes/InitializedMDXEditor'), {
  ssr: false,
  loading: () => <div style={{ padding: '20px', color: '#666', border: '2px dashed #000', borderRadius: '8px' }}>加载内容预览引擎中…</div>
});

interface Folder {
  id: string;
  name: string;
}

export default function ConvertPage() {
  const router = useRouter();
  
  // App state
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('none');
  const [userAIConfig, setUserAIConfig] = useState<{ key: string; base: string; model: string }>({ key: '', base: '', model: '' });
  const [conversionMode, setConversionMode] = useState<'ai' | 'standard'>('ai');
  
  // File state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Conversion state
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [convertedMarkdown, setConvertedMarkdown] = useState<string>('');
  const [isConversionComplete, setIsConversionComplete] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  // ZIP states
  const [isZipResult, setIsZipResult] = useState(false);
  const [zipNotes, setZipNotes] = useState<{ filename: string; text: string; selected?: boolean }[]>([]);
  const [activePreviewZipIndex, setActivePreviewZipIndex] = useState<number>(0);
  
  // AbortController for cancelling fetch on unmount
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Check auth and load folders
  useEffect(() => {
    async function initPage() {
      try {
        const [me, folderList, aiConfig] = await Promise.all([
          authApi.getMe(),
          foldersApi.list(),
          authApi.getAIConfig()
        ]);

        if (!me) {
          toast.error('请先登录！');
          router.push('/login');
          return;
        }

        setCurrentUserId(me.id);
        if (folderList) setFolders(folderList);
        if (aiConfig) {
          setUserAIConfig({
            key: aiConfig.api_key || '',
            base: aiConfig.base_url || '',
            model: aiConfig.model || ''
          });
        }
      } catch (err) {
        console.warn('初始化转换页面出错:', err);
        router.push('/login');
      }
    }
    
    initPage();
    
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (file: File) => {
    const allowedExtensions = ['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'html', 'md', 'png', 'jpg', 'jpeg', 'mp3', 'wav', 'zip'];
    const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';

    if (!allowedExtensions.includes(fileExtension)) {
      toast.error(`不支持的文件格式 .${fileExtension}。支持的格式: 文档类 (PDF, Word, Excel, PPT, TXT, HTML)、多媒体 (图片 PNG/JPG, 音频 MP3/WAV)、压缩包 (ZIP)`);
      return;
    }
    
    // Size limit: 20MB
    if (file.size > 20 * 1024 * 1024) {
      toast.error('文件过大，请上传小于 20MB 的文件');
      return;
    }
    
    setSelectedFile(file);
    setIsConversionComplete(false);
    setConvertedMarkdown('');
    setIsZipResult(false);
    setZipNotes([]);
    setProgress(0);
  };

  // Upload file to local storage
  const uploadToStorage = async (file: File): Promise<string | null> => {
    try {
      const res = await storageApi.upload(file, 'converts');
      return res.url;
    } catch (err) {
      console.warn('文件本地暂存失败，直接进行内存流解析:', err);
      return null;
    }
  };

  const handleStartConversion = async () => {
    if (!selectedFile || !currentUserId) return;
    
    setIsConverting(true);
    setProgress(10);
    setStatusText('准备向自建 Python 引擎发送请求…');
    
    try {
      setProgress(20);
      setStatusText('正在备份原始文件到本地存储 uploads/converts/ …');
      const publicUrl = await uploadToStorage(selectedFile);
      setUploadedUrl(publicUrl);
      
      setProgress(40);
      setStatusText('备份成功，正在调用自建 Python 极速解析引擎…');
      
      const fileExt = selectedFile.name.split('.').pop()?.toLowerCase() || '';
      const baseName = selectedFile.name.substring(0, selectedFile.name.lastIndexOf('.')) || selectedFile.name;
      
      let markdownResult = '';
      
      setProgress(60);
      setStatusText('文档极速提取中 (Powered by Microsoft MarkItDown)…');
      
      try {
        const formData = new FormData();
        formData.append('file', selectedFile);
        
        // Initialize abort controller
        abortControllerRef.current = new AbortController();
        
        // Directly call the backend route
        const res = await fetch('/api/convert', { 
          method: 'POST', 
          credentials: 'include',
          headers: {
            'X-User-AI-Key': userAIConfig.key || '',
            'X-User-AI-Base': userAIConfig.base || '',
            'X-User-AI-Model': userAIConfig.model || '',
            'X-Conversion-Mode': conversionMode
          },
          body: formData,
          signal: abortControllerRef.current.signal
        });
        
        setProgress(90);
        setStatusText('Python 引擎返回结果，正在渲染…');
        
        if (res.ok) {
          const data = await res.json();
          if (data.is_zip) {
            setIsZipResult(true);
            setZipNotes((data.notes as { filename: string; text: string }[]).map((n) => ({ ...n, selected: true })));
            setConvertedMarkdown('');
            setActivePreviewZipIndex(0);
          } else {
            setIsZipResult(false);
            setZipNotes([]);
            markdownResult = data.text;
            if (!markdownResult) {
              markdownResult = `\n# 📄 ${baseName}\n\n*警告：文件提取内容为空，可能是格式受限*\n`;
            }
            setConvertedMarkdown(markdownResult);
          }
          setProgress(100);
          setIsConversionComplete(true);
          toast.success('文件解析完成！');
        } else {
          const errText = await res.text();
          let parsedDetail = '';
          try {
            const errObj = JSON.parse(errText);
            parsedDetail = errObj.detail || errObj.error || '';
          } catch {
            parsedDetail = errText;
          }
          console.error("Python API failed", parsedDetail || res.status);
          const errorMsg = parsedDetail || `服务状态码: ${res.status}`;
          toast.error(`文档解析失败: ${errorMsg}`);
          setProgress(0);
          setStatusText(`解析失败: ${errorMsg}`);
          setIsConversionComplete(false);
        }
      } catch (e: unknown) {
        if ((e as Error)?.name === 'AbortError') {
          console.log('Conversion request aborted');
          return;
        }
        console.error("Fetch API failed", e);
        const errMsg = (e as Error)?.message || '无法连接到后端解析引擎';
        toast.error(`请求后端解析引擎失败: ${errMsg}`);
        setProgress(0);
        setStatusText('请求后端解析引擎失败，请检查网络或后端服务状态');
        setIsConversionComplete(false);
      }
      
    } catch (err) {
      console.error(err);
      toast.error('文件转换出错，请重新尝试。');
    } finally {
      setIsConverting(false);
    }
  };

  // Mock conversion engine
  const generateMockMarkdown = (title: string, ext: string): string => {
    const nowStr = new Date().toLocaleString('zh-CN');
    
    switch (ext) {
      case 'pdf':
        return `\n# 📄 PDF解析文档：${title}\n\n*   **解析源文件类型**: Portable Document Format (.pdf)\n*   **转换时间**: ${nowStr}\n*   **内容完整度**: 100% 深度还原\n\n---\n\n## 💡 核心内容洞察与背景概要\n\n从该 PDF 结构化文档中，成功提取出以下核心理论背景与事实依据：\n\n1.  **知行合一的核心机制**：知识的积累如果脱离了实践检验，就会退化为无意义的数据噪音。本篇文档探讨了如何建立“输入-消化-行动-反馈”的双向敏捷闭环。\n2.  **遗忘曲线的对抗策略**：在获取知识后的 **24小时内**，必须安排至少一次实践卡片（Action Item）触发，使大脑神经元产生深度刺激，从而极大地将短期记忆固化为长期技能。\n\n> **核心要点**：\n> “知之真切笃实处即是行，行之明觉精察处即是知。” 一切高效的学习必须以解决真实世界的具体问题为终点。\n\n---\n\n## 📊 结构化提取数据表\n\n| 学习模式 | 遗忘速率 (无行动) | 留存速率 (有行动) | 实践转化难度 |\n| :--- | :--- | :--- | :--- |\n| 纯文本阅读 | 24小时后流失 70% | 保持 45% (写感悟) | ⭐ |\n| 听课/听书 | 24小时后流失 80% | 保持 55% (讨论分享) | ⭐⭐ |\n| 场景化实践 | 24小时后流失 20% | 保持 90% (持续迭代) | ⭐⭐⭐⭐ |\n\n---\n\n## 🛠️ 行动建议与清单 (待办提取)\n\n以下是从原文档中分析得出的行动清单，导入笔记后系统将自动为您提取为仪表盘任务：\n\n- [ ] 行动项 1：在今天阅读完本解析后，立即选择一篇在广场上收藏的笔记，在感悟区补充 50 字的实践笔记。\n- [ ] 行动项 2：在知行笔记文件夹中建立一个名为“高频实践”的子文件夹，将后续转换导入的文档集中归纳。\n- [ ] 行动项 3：下周日前整理一份“知行周度复盘看板”，检查行动项在仪表盘中的勾选完成率是否高于 80%。\n`;
        
      case 'docx':
        return `\n# 📝 Word解析文档：${title}\n\n*   **解析源文件类型**: Microsoft Word Document (.docx)\n*   **转换时间**: ${nowStr}\n*   **转换内核**: Microsoft MarkItDown Server\n\n---\n\n## 📌 概述说明\n\n本章节记录了关于高效率工作法及知识吸收的模型大纲。文档着重强调了“行动项（Action Items）”对于打通学习心流的关键作用。\n\n### 一、阻碍行动的三个认知陷阱\n\n1.  **收藏癖好**：将“我收藏了”等同于“我已经掌握了”，形成虚假的知识充实感。\n2.  **完美主义**：总想等待一个绝对完美的时机才开启第一步实践，导致拖延症加剧。\n3.  **缺乏追溯**：写完感悟或定下行动计划后不再回头看，没有闭环的考核指标。\n\n---\n\n## 🎯 提取的实践行动纲领\n\n系统已经智能筛选出文档中的可执行要点，转换后将同步写入知行笔记的行动池：\n\n- [ ] 行动项 1：每天早上打开知行笔记仪表盘，优先处理 2 个 P1 级别的待办项，完成后再处理琐事。\n- [ ] 行动项 2：为每一个在写的笔记卡片配置至少一个 \`due_date\`（截止日期），杜绝无限期搁置。\n- [ ] 行动项 3：将完成的笔记定期加上标签并设置为“公开”，参与笔记广场的互动并听取版主的置顶点评。\n`;
        
      case 'xlsx':
        return `\n# 📊 Excel数据报表提取：${title}\n\n*   **解析源文件类型**: Microsoft Excel Spreadsheet (.xlsx)\n*   **转换时间**: ${nowStr}\n\n---\n\n## 📈 提取出的核心数据集明细\n\n以下为转换出来的 Markdown 结构化二维表格：\n\n| 月份 | 新增公开笔记 | 行动转化率 (%) | 活跃标签 top1 | 月度成就勋章等级 |\n| :--- | :--- | :--- | :--- | :--- |\n| 1月 | 12 篇 | 58.3% | #效率工具 | 🥉 青铜实践者 |\n| 2月 | 18 篇 | 65.0% | #读书笔记 | 🥈 白银实践者 |\n| 3月 | 25 篇 | 82.5% | #时间管理 | 🥇 黄金实践者 (撒花) |\n| 4月 | 31 篇 | 91.2% | #知行合一 | 🏆 终极特工勋章 |\n\n---\n\n## 💡 数据趋势分析洞察\n\n- **相关性分析**：公开笔记数量的增加，与行动转化率之间存在明显的正相关关系。这说明公开笔记接受外部读者监督，极大地倒逼了用户对行动项的落地执行。\n- **核心结论**：必须保持标签的统一管理，并在每个月月底导出一份月度学习报告以做微调。\n\n---\n\n## 🎯 下阶段行动待办项\n\n- [ ] 行动项 1：将 Excel 提取出的 3 月和 4 月黄金数据单独封装，建立对应的看板公开页。\n- [ ] 行动项 2：在每周复盘中，核对新增标签是否在 5 个以内，防止标签过载导致分类散乱。\n`;
        
      default:
        return `\n# 📄 解析文档：${title}\n\n*   **解析源文件名称**: ${title}.${ext}\n*   **转换时间**: ${nowStr}\n\n---\n\n## 📝 提取正文内容\n\n这是一篇通过一键转换功能自动解析出的普通文本内容。原始文档排版已重置，转换为了干净的 Markdown 段落：\n\n1.  **格式清洗**：过滤了原文件中的杂乱样式、无用边距与非标准字体代码。\n2.  **层级校对**：自动根据字体字号建立了 H1, H2, H3 等标题目录关系。\n\n---\n\n## 🎯 转换行动清单\n\n- [ ] 行动项 1：检查导入后的内容排版，补充正文内的特定标签。\n- [ ] 行动项 2：阅读该笔记，确保重点段落添加粗体标记以醒目。\n`;
    }
  };

  // Import as a personal note
  const handleImportNote = async () => {
    if (!currentUserId || !convertedMarkdown || !selectedFile) return;
    
    const baseName = selectedFile.name.substring(0, selectedFile.name.lastIndexOf('.')) || selectedFile.name;
    const toastId = toast.loading('正在导入为您的笔记卡片...');
    
    try {
      const folderIdVal = selectedFolderId === 'none' ? null : selectedFolderId;
      const safeMarkdownContent = convertedMarkdown.replace(/\0/g, '');
      
      const newNote = await notesApi.create({
        title: `${baseName} (导入)`,
        content: safeMarkdownContent,
        folder_id: folderIdVal,
        type: 'markdown',
        category: '文档导入'
      });
      
      // 提取行动待办
      const lines = convertedMarkdown.split('\n');
      let actionCount = 0;
      for (const line of lines) {
        const match = line.match(/^\s*-\s*\[\s*\]\s*(.+)$/i);
        if (match && match[1]) {
          let cleanContent = match[1].trim();
          cleanContent = cleanContent.replace(/(\*\*|__)(.*?)\1/g, '$2');
          cleanContent = cleanContent.replace(/(\*|_)(.*?)\1/g, '$2');
          
          try {
            await actionsApi.create({
              note_id: newNote.id,
              content: cleanContent,
              priority: 'P2',
              due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
            });
            actionCount++;
          } catch {}
        }
      }
      
      if (actionCount > 0) {
        toast.success(`成功解析并提取了 ${actionCount} 项实践行动待办！`, { id: toastId });
      }
      
      toast.success('导入笔记成功！正在为您跳转到笔记树…', { id: toastId });
      router.push(`/notes?noteId=${newNote.id}`);
    } catch (err: any) {
      console.error(err);
      toast.error(`导入笔记失败: ${err.message || '网络繁忙，请重试'}`, { id: toastId });
    }
  };

  const handleImportZipNotes = async () => {
    const selectedNotes = zipNotes.filter(n => n.selected);
    if (selectedNotes.length === 0) {
      toast.warning('请至少选择一篇笔记导入！');
      return;
    }
    
    const toastId = toast.loading(`正在批量导入 ${selectedNotes.length} 篇笔记并重建目录树…`);
    
    try {
      const rootFolderId = selectedFolderId === 'none' ? null : selectedFolderId;
      const pathFolderCache: Record<string, string> = {};
      
      const getOrCreateFolderForPath = async (filename: string, baseFolderId: string | null): Promise<string | null> => {
        const parts = filename.split('/');
        parts.pop(); // remove file name
        
        if (parts.length === 0) {
          return baseFolderId;
        }
        
        let currentParentId = baseFolderId;
        let accumulatedPath = '';
        
        for (const part of parts) {
          accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;
          
          if (pathFolderCache[accumulatedPath]) {
            currentParentId = pathFolderCache[accumulatedPath];
            continue;
          }
          
          try {
            const newFolder = await foldersApi.create(part, currentParentId === 'none' || !currentParentId ? null : currentParentId);
            currentParentId = newFolder.id;
          } catch {
            // 已存在或创建失败则沿用当前层级
          }
          pathFolderCache[accumulatedPath] = currentParentId!;
        }
        return currentParentId;
      };

      let importedCount = 0;
      let firstImportedNoteId = null;

      for (const note of selectedNotes) {
        const baseName = note.filename.substring(note.filename.lastIndexOf('/') + 1);
        const titleWithoutExt = baseName.substring(0, baseName.lastIndexOf('.')) || baseName;
        
        const targetFolderId = await getOrCreateFolderForPath(note.filename, rootFolderId);
        const safeMarkdownContent = note.text.replace(/\0/g, '');
        
        try {
          const newNote = await notesApi.create({
            title: titleWithoutExt,
            content: safeMarkdownContent,
            folder_id: targetFolderId,
            type: 'markdown',
            category: 'ZIP导入'
          });
          
          if (newNote) {
            importedCount++;
            if (!firstImportedNoteId) {
              firstImportedNoteId = newNote.id;
            }
          }
        } catch (error) {
          console.error(`导入笔记 ${note.filename} 失败:`, error);
        }
      }
      
      toast.success(`成功批量导入了 ${importedCount} 篇笔记！`, { id: toastId });
      if (firstImportedNoteId) {
        router.push(`/notes?noteId=${firstImportedNoteId}`);
      } else {
        router.push(`/notes`);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(`批量导入失败: ${err.message || '网络繁忙，请重试'}`, { id: toastId });
    }
  };
      
      toast.success(`成功批量导入了 ${importedCount} 篇笔记并成功提取实践行动项！`, { id: toastId });
      if (firstImportedNoteId) {
        router.push(`/notes?noteId=${firstImportedNoteId}`);
      } else {
        router.push(`/notes`);
      }
    } catch (err) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : '网络繁忙，请重试';
      toast.error(`批量导入失败: ${errMsg}`, { id: toastId });
    }
  };

  const updateZipNoteText = (index: number, newText: string) => {
    setZipNotes(prev => {
      const copy = [...prev];
      if (copy[index]) {
        copy[index] = { ...copy[index], text: newText };
      }
      return copy;
    });
  };

  const toggleZipNoteSelection = (index: number) => {
    setZipNotes(prev => {
      const copy = [...prev];
      if (copy[index]) {
        copy[index] = { ...copy[index], selected: !copy[index].selected };
      }
      return copy;
    });
  };

  const toggleAllZipNotes = (select: boolean) => {
    setZipNotes(prev => prev.map(n => ({ ...n, selected: select })));
  };

  const handleReset = () => {
    setSelectedFile(null);
    setConvertedMarkdown('');
    setIsConversionComplete(false);
    setProgress(0);
    setUploadedUrl(null);
    setIsZipResult(false);
    setZipNotes([]);
    setActivePreviewZipIndex(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const previewEditorRef = useRef<import('@mdxeditor/editor').MDXEditorMethods | null>(null);

  return (
    <section id="document-convert" className="content-section active" style={{ padding: '24px 24px 100px 24px' }}>
      {/* 亮橙色高对比度 Banner */}
      <div 
        className="neo-card" 
        style={{ 
          background: 'var(--neo-orange)', 
          color: 'white', 
          borderColor: '#000000',
          padding: '24px', 
          borderRadius: '12px', 
          marginBottom: '24px',
          boxShadow: '6px 6px 0px 0px #000'
        }}
      >
        <h2 className="neo-title" style={{ fontSize: '24px', color: 'white', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={24} /> 一键转换 (MarkItDown) & 知识吸收
        </h2>
        <p style={{ fontSize: '14px', marginTop: '8px', opacity: 0.95, fontWeight: 500, lineHeight: 1.5 }}>
          将本地 PDF、Word、Excel 等文档一键转化为 Markdown 标准笔记。系统会自动提取文本中的行前复选框 
          <code>- [ ]</code> 并将其转化为可在仪表盘统一跟踪管理的<strong>“实践行动项”</strong>，促成知行合一 the 终极学习效果。
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
        
        {/* Upload Container */}
        {!isConversionComplete && (
          <div 
            className="neo-card" 
            style={{ 
              backgroundColor: 'var(--bg-card)', 
              padding: '40px 24px', 
              borderRadius: '12px',
              textAlign: 'center',
              boxShadow: '6px 6px 0px 0px #000'
            }}
          >
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileChange}
              style={{ display: 'none' }}
              accept=".pdf,.docx,.xlsx,.pptx,.txt,.html,.md,.png,.jpg,.jpeg,.mp3,.wav,.zip"
            />
            
            {/* Drag Zone */}
            <div 
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '3px dashed var(--border-color)',
                borderRadius: '8px',
                padding: '48px 24px',
                cursor: 'pointer',
                backgroundColor: isDragActive ? 'var(--bg-drag-zone-active)' : 'var(--bg-drag-zone-inactive)',
                transition: 'all 0.2s ease',
                boxShadow: isDragActive ? 'inset 4px 4px 0px var(--border-color)' : 'none'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                <div 
                  style={{ 
                    width: '64px', 
                    height: '64px', 
                    borderRadius: '50%', 
                    background: 'var(--neo-yellow)', 
                    border: '3px solid var(--border-color)',
                    boxShadow: '3px 3px 0px var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Upload size={30} strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="neo-title" style={{ fontSize: '18px', marginBottom: '8px' }}>
                    拖拽文件到此处，或 <span style={{ color: 'var(--neo-blue)', textDecoration: 'underline' }}>点击浏览</span>
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                    支持 PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), TXT, HTML, 图片 (.png/.jpg), 音频 (.mp3/.wav) 及 ZIP 压缩包，最大支持 20MB
                  </p>
                </div>
              </div>
            </div>
            
            {/* Selected File Details */}
            {selectedFile && (
              <div style={{ marginTop: '24px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* 转换模式切换器 */}
                <div style={{
                  display: 'flex',
                  border: '3px solid #000',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  boxShadow: '4px 4px 0px 0px #000',
                  backgroundColor: 'var(--bg-disabled)'
                }}>
                  <button
                    type="button"
                    onClick={() => setConversionMode('ai')}
                    style={{
                      flex: 1,
                      padding: '12px',
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: '800',
                      fontSize: '13px',
                      backgroundColor: conversionMode === 'ai' ? 'var(--neo-yellow)' : 'var(--bg-card)',
                      color: '#000',
                      transition: 'all 0.15s ease',
                      borderRight: '3px solid #000',
                      outline: 'none'
                    }}
                  >
                    🤖 AI 智能增强转换 (扣减额度/支持OCR)
                  </button>
                  <button
                    type="button"
                    onClick={() => setConversionMode('standard')}
                    style={{
                      flex: 1,
                      padding: '12px',
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: '800',
                      fontSize: '13px',
                      backgroundColor: conversionMode === 'standard' ? 'var(--neo-blue)' : 'var(--bg-card)',
                      color: conversionMode === 'standard' ? '#fff' : 'var(--text-primary)',
                      transition: 'all 0.15s ease',
                      outline: 'none'
                    }}
                  >
                    ⚡ 快速标准转换 (常规解析/免额度)
                  </button>
                </div>

                {/* 文件详情卡片 */}
                <div 
                  className="neo-card"
                  style={{ 
                    margin: 0,
                    backgroundColor: 'var(--bg-card)',
                    borderWidth: '2.5px',
                    boxShadow: '3px 3px 0px var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ background: 'var(--bg-disabled)', padding: '8px', border: '2px solid var(--border-color)', borderRadius: '6px' }}>
                      {selectedFile.name.endsWith('.zip') ? <Archive size={20} /> : <FileText size={20} />}
                    </div>
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '14px', wordBreak: 'break-all' }}>{selectedFile.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{formatBytes(selectedFile.size)}</div>
                    </div>
                  </div>
                  
                  {!isConverting && (
                    <button 
                      className="neo-btn" 
                      onClick={handleStartConversion}
                      style={{ 
                        backgroundColor: 'var(--neo-yellow)', 
                        padding: '8px 16px',
                        fontSize: '13px'
                      }}
                    >
                      开始转换 <ChevronRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            )}
            
            {/* Conversion Progress Bar */}
            {isConverting && (
              <div className="neo-card" style={{ marginTop: '24px', backgroundColor: 'var(--bg-card)', borderWidth: '2.5px', boxShadow: '3px 3px 0px var(--border-color)', padding: '20px', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <RefreshCw size={14} className="animate-spin" /> {statusText}
                  </span>
                  <span style={{ fontWeight: 'bold', fontSize: '13px' }}>{progress}%</span>
                </div>
                <div style={{ width: '100%', height: '18px', backgroundColor: 'var(--bg-disabled)', border: '2px solid var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div 
                    style={{ 
                      width: `${progress}%`, 
                      height: '100%', 
                      backgroundColor: 'var(--neo-blue)', 
                      transition: 'width 0.2s ease' 
                    }} 
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Dual Column / ZIP Batch Preview (After Successful Conversion) */}
        {isConversionComplete && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            


            {isZipResult ? (
              /* ZIP BATCH INTERFACE */
              <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px', alignItems: 'stretch' }}>
                
                {/* Left side: Zip File List */}
                <div 
                  className="neo-card"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    padding: '16px',
                    borderRadius: '12px',
                    boxShadow: '6px 6px 0px var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: '650px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px dashed var(--border-color)', paddingBottom: '10px', marginBottom: '12px' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Archive size={16} /> 文档清单 ({zipNotes.filter(n => n.selected).length}/{zipNotes.length})
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <button 
                      onClick={() => toggleAllZipNotes(true)}
                      style={{ flex: 1, padding: '4px', fontSize: '11px', border: '1.5px solid #000', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', backgroundColor: '#fff' }}
                    >
                      全选
                    </button>
                    <button 
                      onClick={() => toggleAllZipNotes(false)}
                      style={{ flex: 1, padding: '4px', fontSize: '11px', border: '1.5px solid #000', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', backgroundColor: '#fff' }}
                    >
                      全不选
                    </button>
                  </div>

                  <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
                    {zipNotes.map((note, index) => {
                      const isActive = index === activePreviewZipIndex;
                      const parts = note.filename.split('/');
                      const name = parts[parts.length - 1];
                      const isFolder = parts.length > 1;

                      return (
                        <div 
                          key={index}
                          onClick={() => setActivePreviewZipIndex(index)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '10px',
                            border: '2px solid #000',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            backgroundColor: isActive ? 'var(--neo-yellow)' : 'var(--bg-main)',
                            boxShadow: isActive ? '2px 2px 0px #000' : 'none',
                            transform: isActive ? 'translate(-1px, -1px)' : 'none',
                            transition: 'all 0.1s ease',
                          }}
                        >
                          <input 
                            type="checkbox" 
                            checked={!!note.selected} 
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleZipNoteSelection(index);
                            }}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div 
                              style={{ 
                                fontSize: '12px', 
                                fontWeight: 'bold', 
                                overflow: 'hidden', 
                                textOverflow: 'ellipsis', 
                                whiteSpace: 'nowrap',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              {isFolder ? <Folder size={14} style={{ color: 'var(--neo-blue)', flexShrink: 0 }} /> : <FileText size={14} style={{ flexShrink: 0 }} />}
                              {name}
                            </div>
                            {isFolder && (
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {note.filename}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right side: Editor & Preview Split Panel */}
                {zipNotes[activePreviewZipIndex] ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div className="neo-card" style={{ backgroundColor: 'var(--bg-card)', padding: '16px', borderRadius: '12px', boxShadow: '6px 6px 0px var(--border-color)', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px dashed var(--border-color)', paddingBottom: '10px', marginBottom: '16px' }}>
                        <span style={{ fontWeight: '800', fontSize: '14px', wordBreak: 'break-all' }}>
                          📝 正在编辑预览: <span style={{ color: 'var(--neo-blue)' }}>{zipNotes[activePreviewZipIndex].filename}</span>
                        </span>
                        <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          检测到 {zipNotes[activePreviewZipIndex].text.split('\n').filter(l => l.match(/^\s*-\s*\[\s*\]\s*(.+)$/i)).length} 个行动项
                        </span>
                      </div>

                      {/* Split Editor-Preview columns */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        {/* Source Editor */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}><Edit2 size={12} /> Markdown 源码</div>
                          <textarea
                            value={zipNotes[activePreviewZipIndex].text}
                            onChange={(e) => updateZipNoteText(activePreviewZipIndex, e.target.value)}
                            style={{
                              width: '100%',
                              height: '450px',
                              fontFamily: 'monospace',
                              fontSize: '12px',
                              lineHeight: '1.6',
                              padding: '12px',
                              border: '2px solid var(--border-color)',
                              borderRadius: '8px',
                              outline: 'none',
                              resize: 'none',
                              backgroundColor: 'var(--bg-input)',
                              color: 'var(--text-primary)',
                              boxShadow: 'inset 2px 2px 0px var(--bg-disabled)'
                            }}
                            placeholder="这里可以编辑文本内容..."
                          />
                        </div>

                        {/* MDX Real-time rendering */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}><Eye size={12} /> MDX 预览渲染</div>
                          <div 
                            style={{
                              border: '2px solid var(--border-color)',
                              borderRadius: '8px',
                              backgroundColor: 'white',
                              height: '450px',
                              overflowY: 'auto',
                              padding: '12px',
                              boxShadow: 'inset 2px 2px 0px var(--bg-disabled)'
                            }}
                            className="zxbj-convert-preview-wrapper"
                          >
                            <NotePreviewEditor 
                              key={`${activePreviewZipIndex}_${zipNotes[activePreviewZipIndex].filename}`}
                              markdown={zipNotes[activePreviewZipIndex].text} 
                              ref={previewEditorRef}
                              onChange={() => {}} 
                              readOnly={true} 
                              mode="markdown"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="neo-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px', backgroundColor: 'var(--bg-card)' }}>
                    请选择左侧清单中的文件进行编辑与预览
                  </div>
                )}

              </div>
            ) : (
              /* SINGLE FILE INTERFACE */
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'stretch' }}>
                
                {/* Left column: Source file Markdown */}
                <div 
                  className="neo-card"
                  style={{ 
                    backgroundColor: 'var(--bg-card)', 
                    padding: '20px', 
                    borderRadius: '12px',
                    boxShadow: '6px 6px 0px 0px var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px dashed var(--border-color)', paddingBottom: '10px', marginBottom: '16px' }}>
                    <h3 className="neo-title" style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                      <Edit2 size={14} /> Markdown 源码
                    </h3>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      检测到 {convertedMarkdown.split('\n').filter(l => l.match(/^\s*-\s*\[\s*\]\s*(.+)$/i)).length} 个行动项
                    </span>
                  </div>
                  
                  <textarea
                    value={convertedMarkdown}
                    onChange={(e) => setConvertedMarkdown(e.target.value)}
                    style={{
                      width: '100%',
                      height: '450px',
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      lineHeight: '1.6',
                      padding: '12px',
                      border: '2px solid var(--border-color)',
                      borderRadius: '8px',
                      outline: 'none',
                      resize: 'none',
                      backgroundColor: 'var(--bg-input)',
                      color: 'var(--text-primary)',
                      boxShadow: 'inset 2px 2px 0px var(--bg-disabled)'
                    }}
                    placeholder="转换出的 Markdown 内容呈现这里..."
                  />
                </div>

                {/* Right column: MDX Rich Preview */}
                <div 
                  className="neo-card"
                  style={{ 
                    backgroundColor: 'var(--bg-card)', 
                    padding: '20px', 
                    borderRadius: '12px',
                    boxShadow: '6px 6px 0px 0px var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px dashed var(--border-color)', paddingBottom: '10px', marginBottom: '16px' }}>
                    <h3 className="neo-title" style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                      <Eye size={14} /> MDX 预览
                    </h3>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)' }}>
                      只读渲染视图
                    </span>
                  </div>
                  
                  <div 
                    style={{
                      border: '2px solid var(--border-color)',
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      height: '450px',
                      overflowY: 'auto',
                      padding: '12px',
                      boxShadow: 'inset 2px 2px 0px var(--bg-disabled)'
                    }}
                    className="zxbj-convert-preview-wrapper"
                  >
                    <NotePreviewEditor 
                      markdown={convertedMarkdown} 
                      ref={previewEditorRef}
                      onChange={() => {}} 
                      readOnly={true} 
                      mode="markdown"
                    />
                  </div>
                </div>

              </div>
            )}

            {/* Conversion Stats & Control Bar */}
            <div 
              className="neo-card"
              style={{
                backgroundColor: 'var(--bg-card)',
                padding: '16px 20px',
                borderRadius: '12px',
                boxShadow: '4px 4px 0px var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                marginBottom: '16px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CheckCircle size={20} style={{ color: 'var(--neo-green)' }} />
                <div>
                  <span style={{ fontWeight: 'bold', fontSize: '15px' }}>解析成功：</span>
                  <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                    {isZipResult ? `压缩包中共解析出 ${zipNotes.length} 个笔记文件` : `单个文档解析已就绪`}
                  </span>
                </div>
              </div>
              <button 
                className="neo-btn" 
                onClick={handleReset}
                style={{ background: 'var(--bg-btn-secondary)', color: 'var(--text-primary)', padding: '6px 12px', fontSize: '12px' }}
              >
                <RefreshCw size={12} /> 重新上传文件
              </button>
            </div>

            {/* Folder selection & Import Toolbar */}
            <div 
              className="neo-card"
              style={{ 
                backgroundColor: 'var(--bg-card)', 
                padding: '20px', 
                borderRadius: '12px',
                boxShadow: '6px 6px 0px 0px var(--border-color)',
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '16px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexGrow: 1, minWidth: '280px' }}>
                <div style={{ background: 'var(--neo-yellow)', border: '2px solid var(--border-color)', padding: '8px', borderRadius: '6px' }}>
                  <FolderOpen size={18} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label htmlFor="import-folder-select" style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)' }}>选择导入的目标文件夹</label>
                  <select 
                    id="import-folder-select"
                    value={selectedFolderId} 
                    onChange={(e) => setSelectedFolderId(e.target.value)}
                    style={{
                      padding: '8px 12px',
                      border: '2px solid #000',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: 'bold',
                      backgroundColor: 'white',
                      cursor: 'pointer',
                      outline: 'none',
                      minWidth: '200px'
                    }}
                  >
                    <option value="none">📂 根目录 (默认)</option>
                    {folders.map(folder => (
                      <option key={folder.id} value={folder.id}>
                        📂 {folder.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <button 
                  className="neo-btn" 
                  onClick={isZipResult ? handleImportZipNotes : handleImportNote}
                  style={{ 
                    backgroundColor: 'var(--neo-yellow)', 
                    padding: '12px 24px',
                    fontSize: '14px',
                    fontWeight: '800',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <CheckCircle size={16} /> 
                  {isZipResult 
                    ? `确认批量导入 (${zipNotes.filter(n => n.selected).length} 篇笔记)` 
                    : '确认导入为我的笔记'} 
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>

          </div>
        )}

      </div>
    </section>
  );
}
