'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { authApi } from '@/lib/api/client';
import { toast } from 'sonner';
import { 
  Sparkles, 
  X, 
  Send, 
  Copy, 
  CornerDownLeft, 
  RefreshCw, 
  FileText, 
  ListTodo, 
  Smile,
  Plus,
  History,
  Trash2,
  MessageSquare
} from 'lucide-react';

interface AICopilotPanelProps {
  noteId: string;
  currentContent: string;
  onInsert: (text: string, mode: 'append' | 'replace') => void;
  onClose: () => void;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
}

// -------------------------------------------------------------
// 高性能细粒度子组件 (防止流式输出时引发整体历史列表和过去卡片的重复重绘)
// -------------------------------------------------------------

interface MessageItemProps {
  msg: Message;
  index: number;
  isLast: boolean;
  isLoading: boolean;
  onCopy: (text: string) => void;
  onInsertAppend: (text: string) => void;
  onInsertReplace: (text: string) => void;
}

const MessageItem = React.memo(({
  msg,
  index,
  isLast,
  isLoading,
  onCopy,
  onInsertAppend,
  onInsertReplace
}: MessageItemProps) => {
  const isUser = msg.role === 'user';
  
  const containerStyle: React.CSSProperties = {
    alignSelf: isUser ? 'flex-end' : 'flex-start',
    maxWidth: '90%',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: isUser ? '#fff' : 'var(--bg-card)',
    borderWidth: '2px',
    boxShadow: '3px 3px 0px #000',
    padding: '12px',
    borderRadius: '10px',
    fontSize: '13px',
    lineHeight: '1.6',
    color: 'var(--text-primary)',
    wordBreak: 'break-word',
    whiteSpace: 'pre-wrap'
  };

  const actionStyle: React.CSSProperties = {
    display: 'flex',
    gap: '8px',
    paddingLeft: '4px'
  };

  const btnStyle = {
    fontSize: '11px',
    border: '1.5px solid #000',
    borderRadius: '4px',
    padding: '2px 6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    fontWeight: 'bold' as const
  };

  const copyBtnStyle = { ...btnStyle, backgroundColor: '#fff' };
  const appendBtnStyle = { ...btnStyle, backgroundColor: 'var(--neo-yellow)' };
  const replaceBtnStyle = { ...btnStyle, backgroundColor: 'var(--neo-blue)', color: '#fff' };

  return (
    <div style={containerStyle}>
      <div 
        className="neo-card"
        aria-live={!isUser && !msg.content ? "polite" : undefined}
        style={cardStyle}
      >
        {msg.content || (isLoading && isLast ? 'AI 正在思考中…' : '')}
      </div>

      {/* 消息动作按钮 - 只有非用户消息且有内容时显示 */}
      {!isUser && msg.content ? (
        <div style={actionStyle}>
          <button 
            onClick={() => onCopy(msg.content)}
            style={copyBtnStyle}
            title="复制到剪贴板"
          >
            <Copy size={10} aria-hidden="true" /> 复制
          </button>
          <button 
            onClick={() => onInsertAppend(msg.content)}
            style={appendBtnStyle}
            title="将内容追加到笔记末尾"
          >
            <CornerDownLeft size={10} aria-hidden="true" /> 追加
          </button>
          <button 
            onClick={() => onInsertReplace(msg.content)}
            style={replaceBtnStyle}
            title="替换选中内容或光标位置"
          >
            <CornerDownLeft size={10} aria-hidden="true" /> 替换/插入
          </button>
        </div>
      ) : null}
    </div>
  );
});

MessageItem.displayName = 'MessageItem';


interface SessionItemProps {
  session: ChatSession;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

const SessionItem = React.memo(({
  session,
  isActive,
  onSelect,
  onDelete
}: SessionItemProps) => {
  const [hovered, setHovered] = useState(false);
  
  const itemStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    margin: '4px 8px',
    borderRadius: '6px',
    cursor: 'pointer',
    border: isActive ? '2px solid #000' : (hovered ? '2px solid #000' : '1.5px solid #ddd'),
    backgroundColor: isActive ? 'var(--neo-yellow)' : (hovered ? '#f9f9f9' : '#fff'),
    boxShadow: isActive ? '2px 2px 0px #000' : (hovered ? '1.5px 1.5px 0px #000' : 'none'),
    transform: hovered ? 'translate(-1px, -1px)' : 'none',
    transition: 'all 0.1s ease-in-out'
  };

  const titleWrapperStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: 1,
    minWidth: 0
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '12px',
    fontWeight: isActive ? '800' : 'normal',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    color: '#000'
  };

  const deleteBtnStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#666',
    transition: 'color 0.1s'
  };

  return (
    <div 
      onClick={() => onSelect(session.id)}
      style={itemStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={titleWrapperStyle}>
        <MessageSquare size={13} style={{ color: isActive ? '#000' : '#888' }} />
        <span style={titleStyle}>{session.title}</span>
      </div>
      <button 
        onClick={(e) => {
          e.stopPropagation();
          onDelete(session.id);
        }}
        style={deleteBtnStyle}
        title="删除会话"
        aria-label="删除会话"
      >
        <Trash2 size={13} aria-hidden="true" />
      </button>
    </div>
  );
});

SessionItem.displayName = 'SessionItem';

// -------------------------------------------------------------
// 主面板组件
// -------------------------------------------------------------

function AICopilotPanel({ 
  noteId,
  currentContent, 
  onInsert, 
  onClose 
}: AICopilotPanelProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [showHistoryPanel, setShowHistoryPanel] = useState<boolean>(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [userAIConfig, setUserAIConfig] = useState({ key: '', base: '', model: '' });
  const [isFocused, setIsFocused] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const historyPanelRef = useRef<HTMLDivElement>(null);

  // Vercel performance optimization: 避免因为输入框打字导致大文章频繁重绘
  const contentRef = useRef(currentContent);
  useEffect(() => {
    contentRef.current = currentContent;
  }, [currentContent]);

  // 从 LocalStorage 加载会话历史，以 noteId 隔离
  useEffect(() => {
    const localKey = `zxn_chat_sessions_${noteId}`;
    let loadedSessions: ChatSession[] = [];
    try {
      const stored = localStorage.getItem(localKey);
      if (stored) {
        loadedSessions = JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to parse chat sessions from localStorage:', e);
    }

    if (loadedSessions.length === 0) {
      const defaultSession: ChatSession = {
        id: `session_${Date.now()}`,
        title: '新会话',
        messages: [
          { 
            role: 'assistant', 
            content: '你好！我是你的知行 AI 写作助手。我可以帮你总结文章、润色语句、提取行动清单。请问有什么我可以帮你的？' 
          }
        ],
        updatedAt: Date.now()
      };
      loadedSessions = [defaultSession];
      localStorage.setItem(localKey, JSON.stringify(loadedSessions));
    }

    loadedSessions.sort((a, b) => b.updatedAt - a.updatedAt);
    setSessions(loadedSessions);
    setCurrentSessionId(loadedSessions[0].id);
  }, [noteId]);

  // 得到当前活动会话与消息队列
  const currentSession = sessions.find(s => s.id === currentSessionId);
  const messages = currentSession ? currentSession.messages : [];

  // 通过 Ref 维持最新的消息，防止发送消息回调因每次 chunk 修改而重建
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // 点击外部关闭历史面板
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (showHistoryPanel && historyPanelRef.current && !historyPanelRef.current.contains(event.target as Node)) {
        const target = event.target as HTMLElement;
        if (!target.closest('.history-toggle-btn')) {
          setShowHistoryPanel(false);
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showHistoryPanel]);

  // 加载用户 AI 自定义配置
  useEffect(() => {
    async function loadAIConfig() {
      try {
        const cfg = await authApi.getAIConfig();
        if (cfg) {
          setUserAIConfig({
            key: cfg.api_key || '',
            base: cfg.base_url || '',
            model: cfg.model || ''
          });
        }
      } catch (err) {
        console.error('加载 AI 配置失败:', err);
      }
    }
    loadAIConfig();
  }, [noteId]);

  // 消息更新或加载状态变更时，平滑滚动至底部
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // 稳定动作回调函数 (useCallback + Primitives/Stable Refs)
  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('已复制到剪贴板');
  }, []);

  const handleInsertAppend = useCallback((text: string) => {
    onInsert(text, 'append');
  }, [onInsert]);

  const handleInsertReplace = useCallback((text: string) => {
    onInsert(text, 'replace');
  }, [onInsert]);

  // 更新当前会话内容与持久化的通用逻辑
  const updateCurrentSessionMessages = useCallback((newMessagesOrUpdater: Message[] | ((prev: Message[]) => Message[])) => {
    setSessions(prevSessions => {
      const updated = prevSessions.map(session => {
        if (session.id === currentSessionId) {
          let updatedMessages: Message[];
          if (typeof newMessagesOrUpdater === 'function') {
            updatedMessages = newMessagesOrUpdater(session.messages);
          } else {
            updatedMessages = newMessagesOrUpdater;
          }
          
          // 若标题为“新会话”，根据用户发送的第一句话自动提炼生成标题
          let newTitle = session.title;
          if (session.title === '新会话' || !session.title) {
            const firstUserMessage = updatedMessages.find(m => m.role === 'user');
            if (firstUserMessage) {
              newTitle = firstUserMessage.content.trim().substring(0, 15);
              if (firstUserMessage.content.trim().length > 15) {
                newTitle += '...';
              }
            }
          }

          return {
            ...session,
            title: newTitle || '新会话',
            messages: updatedMessages,
            updatedAt: Date.now()
          };
        }
        return session;
      });
      
      const localKey = `zxn_chat_sessions_${noteId}`;
      localStorage.setItem(localKey, JSON.stringify(updated));
      return updated;
    });
  }, [currentSessionId, noteId]);

  // 发送消息
  const handleSendMessage = useCallback(async (customPrompt?: string, targetContext?: string) => {
    const promptText = customPrompt || input;
    if (!promptText.trim() && !targetContext) return;

    let finalPrompt = promptText;
    if (targetContext) {
      finalPrompt = `${promptText}\n\n[上下文内容]:\n${targetContext}`;
    }

    const latestMessages = messagesRef.current;
    const newMessages: Message[] = [
      ...latestMessages,
      { role: 'user', content: promptText },
      { role: 'assistant', content: '' } // 立即添加空串触发前端“思考中”提示
    ];
    
    updateCurrentSessionMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const apiMessages = [
        ...latestMessages,
        { role: 'user', content: finalPrompt }
      ];

      const response = await fetch('/api/chat', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-User-AI-Key': userAIConfig.key || '',
          'X-User-AI-Base': userAIConfig.base || '',
          'X-User-AI-Model': userAIConfig.model || ''
        },
        body: JSON.stringify({
          messages: apiMessages.map(m => ({ role: m.role, content: m.content })),
          model: userAIConfig.model || 'mimo-v2.5',
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || 'AI 服务响应失败');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder('utf-8');
      
      if (!reader) {
        throw new Error('无法读取流式响应');
      }

      let assistantText = '';
      let lastUpdateTime = 0;
      let updateTimeout: NodeJS.Timeout | null = null;

      // 80ms 页面更新渲染节流优化，大幅削减流式重绘损耗
      const updateUI = (text: string, force = false) => {
        const now = Date.now();
        if (force || now - lastUpdateTime > 80) {
          if (updateTimeout) {
            clearTimeout(updateTimeout);
            updateTimeout = null;
          }
          updateCurrentSessionMessages(prev => {
            const list = [...prev];
            if (list.length > 0) {
              list[list.length - 1] = { 
                role: 'assistant', 
                content: text 
              };
            }
            return list;
          });
          lastUpdateTime = now;
        } else if (!updateTimeout) {
          updateTimeout = setTimeout(() => {
            updateUI(text, true);
          }, 80);
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            updateUI(assistantText, true);
            break;
          }
          
          const chunk = decoder.decode(value, { stream: true });
          assistantText += chunk;
          updateUI(assistantText);
        }
      } finally {
        if (updateTimeout) {
          clearTimeout(updateTimeout);
        }
      }

    } catch (err) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : '网络繁忙，请重试';
      toast.error(`AI 助手连接失败: ${errMsg}`);
      updateCurrentSessionMessages(prev => {
        const list = [...prev];
        if (list.length > 0 && list[list.length - 1].role === 'assistant') {
          list[list.length - 1] = { 
            role: 'assistant', 
            content: '抱歉，我的思考被网络打断了。请检查设置中的 AI 配置，或稍后重试。' 
          };
        }
        return list;
      });
    } finally {
      setIsLoading(false);
    }
  }, [input, updateCurrentSessionMessages, userAIConfig]);

  // 新建会话
  const handleNewSession = useCallback(() => {
    const newSession: ChatSession = {
      id: `session_${Date.now()}`,
      title: '新会话',
      messages: [
        { 
          role: 'assistant', 
          content: '你好！我是你的知行 AI 写作助手。我可以帮你总结文章、润色语句、提取行动清单。请问有什么我可以帮你的？' 
        }
      ],
      updatedAt: Date.now()
    };
    
    setSessions(prev => {
      const updated = [newSession, ...prev];
      const localKey = `zxn_chat_sessions_${noteId}`;
      localStorage.setItem(localKey, JSON.stringify(updated));
      return updated;
    });
    
    setCurrentSessionId(newSession.id);
    setShowHistoryPanel(false);
    toast.success('已新建会话');
  }, [noteId]);

  // 切换会话
  const handleSelectSession = useCallback((id: string) => {
    setCurrentSessionId(id);
    setShowHistoryPanel(false);
  }, []);

  // 删除会话
  const handleDeleteSession = useCallback((id: string) => {
    setSessions(prev => {
      const updated = prev.filter(s => s.id !== id);
      const localKey = `zxn_chat_sessions_${noteId}`;
      
      if (updated.length === 0) {
        const defaultSession: ChatSession = {
          id: `session_${Date.now()}`,
          title: '新会话',
          messages: [
            { 
              role: 'assistant', 
              content: '你好！我是你的知行 AI 写作助手。我可以帮你总结文章、润色语句、提取行动清单。请问有什么我可以帮你的？' 
            }
          ],
          updatedAt: Date.now()
        };
        updated.push(defaultSession);
      }
      
      localStorage.setItem(localKey, JSON.stringify(updated));
      
      if (id === currentSessionId) {
        setCurrentSessionId(updated[0].id);
      }
      
      return updated;
    });
    toast.success('会话已删除');
  }, [currentSessionId, noteId]);

  const handleToggleHistory = useCallback(() => {
    setShowHistoryPanel(prev => !prev);
  }, []);

  // 快速分析动作
  const handleQuickAction = useCallback((actionType: 'summarize' | 'polish' | 'todos') => {
    const latestContent = contentRef.current;
    if (!latestContent.trim()) {
      toast.warning('当前笔记内容为空，无法使用 AI 工具');
      return;
    }

    const selection = window.getSelection()?.toString().trim();
    const contextText = selection || latestContent;

    let prompt = '';
    if (actionType === 'summarize') {
      prompt = '请分析并为以下文章生成简明扼要的摘要总结，以 Markdown 格式返回。';
    } else if (actionType === 'polish') {
      prompt = selection 
        ? '请对以下选中的文本进行语法润色、语句流畅化和专业学术/公文语境改写，保留原意，以 Markdown 格式返回修改后的文本。'
        : '请对以下整篇文章进行全文语法与句式润色，以 Markdown 格式返回修改后的全文。';
    } else if (actionType === 'todos') {
      prompt = '请深挖并从以下内容中提取具体的、可执行的“行动清单(Action Items)”。必须格式化为 `- [ ] 待办内容` 格式。';
    }

    handleSendMessage(prompt, contextText);
  }, [handleSendMessage]);

  return (
    <div 
      className="neo-card"
      style={{
        width: '360px',
        height: '100%',
        backgroundColor: 'var(--bg-card)',
        borderLeft: '3px solid #000',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 0,
        boxShadow: 'none',
        flexShrink: 0,
        position: 'relative'
      }}
    >
      {/* 标题栏 Header */}
      <div 
        style={{
          padding: '16px',
          borderBottom: '3px solid #000',
          backgroundColor: 'var(--neo-yellow)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <span style={{ fontWeight: '800', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Sparkles size={16} aria-hidden="true" /> AI 写作协同
        </span>

        {/* 顶部功能按钮群 - 新建、历史、关闭 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button 
            onClick={handleNewSession}
            title="新建会话"
            aria-label="新建会话"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#000'
            }}
          >
            <Plus size={18} strokeWidth={2.5} aria-hidden="true" />
          </button>
          
          <button 
            onClick={handleToggleHistory}
            title="历史会话"
            aria-label="历史会话"
            className="history-toggle-btn"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#000'
            }}
          >
            <History size={18} strokeWidth={2.5} aria-hidden="true" />
          </button>
          
          <button 
            onClick={onClose}
            aria-label="关闭 AI 写作助手"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#000'
            }}
          >
            <X size={18} strokeWidth={2.5} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* 历史会话下拉绝对定位卡片浮层 */}
      {showHistoryPanel ? (
        <div 
          ref={historyPanelRef}
          className="neo-card"
          style={{
            position: 'absolute',
            top: '55px',
            left: '12px',
            right: '12px',
            maxHeight: '320px',
            backgroundColor: '#fff',
            border: '2.5px solid #000',
            boxShadow: '4px 4px 0px #000',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          <div 
            style={{ 
              padding: '10px 12px', 
              borderBottom: '2.5px solid #000', 
              fontWeight: 'bold', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              backgroundColor: 'var(--bg-main)',
              fontSize: '13px'
            }}
          >
            <span style={{ fontWeight: '800', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <History size={14} /> 历史会话管理
            </span>
            <button 
              onClick={() => setShowHistoryPanel(false)}
              className="neo-btn"
              style={{ padding: '2px 8px', fontSize: '11px', backgroundColor: '#fff' }}
            >
              收起
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0', backgroundColor: '#fcfcfc' }}>
            {sessions.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 'bold' }}>
                暂无历史会话
              </div>
            ) : (
              sessions.map(session => (
                <SessionItem 
                  key={session.id}
                  session={session}
                  isActive={session.id === currentSessionId}
                  onSelect={handleSelectSession}
                  onDelete={handleDeleteSession}
                />
              ))
            )}
          </div>
        </div>
      ) : null}

      {/* 快捷工具栏 */}
      <div 
        style={{
          padding: '12px',
          borderBottom: '2.5px dashed #000',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px',
          backgroundColor: 'var(--bg-main)'
        }}
      >
        <button 
          onClick={() => handleQuickAction('summarize')}
          className="neo-btn"
          style={{ 
            padding: '6px', 
            fontSize: '11px', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            gap: '4px',
            backgroundColor: '#fff'
          }}
          title="生成文章摘要"
        >
          <FileText size={14} aria-hidden="true" />
          摘要总结
        </button>
        <button 
          onClick={() => handleQuickAction('polish')}
          className="neo-btn"
          style={{ 
            padding: '6px', 
            fontSize: '11px', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            gap: '4px',
            backgroundColor: '#fff'
          }}
          title="润色选中文本或全文"
        >
          <Smile size={14} aria-hidden="true" />
          智能润色
        </button>
        <button 
          onClick={() => handleQuickAction('todos')}
          className="neo-btn"
          style={{ 
            padding: '6px', 
            fontSize: '11px', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            gap: '4px',
            backgroundColor: '#fff'
          }}
          title="提取文本中包含的代办事项"
        >
          <ListTodo size={14} aria-hidden="true" />
          提取待办
        </button>
      </div>

      {/* 消息列表 - 遍历使用 Memoized MessageItem，提升组件重绘效率 */}
      <div 
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          backgroundColor: 'var(--bg-sidebar)'
        }}
      >
        {messages.map((msg, index) => (
          <MessageItem 
            key={`${currentSessionId}_msg_${index}`}
            msg={msg}
            index={index}
            isLast={index === messages.length - 1}
            isLoading={isLoading}
            onCopy={handleCopy}
            onInsertAppend={handleInsertAppend}
            onInsertReplace={handleInsertReplace}
          />
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* 输入框区域 */}
      <div 
        style={{
          padding: '12px',
          borderTop: '3px solid #000',
          backgroundColor: '#fff',
          display: 'flex',
          gap: '8px',
          alignItems: 'flex-end'
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={isLoading}
          aria-label="输入发送给 AI 的消息"
          placeholder="问点什么，或者让我帮你修改…"
          style={{
            flex: 1,
            height: '60px',
            border: '2px solid #000',
            borderRadius: '6px',
            padding: '8px',
            fontSize: '12px',
            outline: 'none',
            resize: 'none',
            fontFamily: 'inherit',
            boxShadow: isFocused ? '0 0 0 2.5px var(--neo-blue)' : 'none',
            transition: 'box-shadow 0.1s ease-in-out'
          }}
        />
        <button 
          onClick={() => handleSendMessage()}
          disabled={isLoading || !input.trim()}
          aria-label={isLoading ? "AI 正在思考中…" : "发送消息"}
          className="neo-btn"
          style={{
            padding: '10px',
            height: '60px',
            width: '45px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isLoading || !input.trim() ? '#eee' : 'var(--neo-blue)',
            color: isLoading || !input.trim() ? '#999' : '#fff',
            cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer'
          }}
        >
          {isLoading ? (
            <RefreshCw size={16} className="animate-spin" aria-hidden="true" />
          ) : (
            <Send size={16} aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}

export default React.memo(AICopilotPanel, (prevProps, nextProps) => {
  // Vercel performance optimization: 忽略 currentContent 改变引起的 unmount 传参重绘
  return prevProps.noteId === nextProps.noteId &&
         prevProps.onInsert === nextProps.onInsert;
});
