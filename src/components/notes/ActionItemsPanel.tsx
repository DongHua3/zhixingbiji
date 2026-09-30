'use client';

import React, { useEffect, useState } from 'react';
import { actionsApi } from '@/lib/api/client';
import { toast } from 'sonner';

interface ActionItemsPanelProps {
  noteId?: string;
}

interface ActionItem {
  id: string;
  content: string;
  is_completed: boolean;
  due_date: string | null;
  priority: string;
}

export default function ActionItemsPanel({ noteId }: ActionItemsPanelProps) {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [priority, setPriority] = useState('P1');
  const [isPriorityOpen, setIsPriorityOpen] = useState(false);
  const [dueDate, setDueDate] = useState('');

  useEffect(() => {
    if (!noteId) return;

    const fetchItems = async () => {
      try {
        const data = await actionsApi.list(noteId);
        if (data) setItems(data);
      } catch (err) {
        console.error('获取行动清单失败:', err);
      }
    };

    fetchItems();
  }, [noteId]);

  const submitNewItem = async () => {
    if (inputValue.trim() === '') return;
    if (!noteId) return;

    const tempId = 'temp-' + Date.now();
    const currentInput = inputValue.trim();
    
    const tempItem: ActionItem = {
      id: tempId,
      content: currentInput,
      is_completed: false,
      priority: priority,
      due_date: dueDate || null
    };

    setItems([...items, tempItem]);
    setInputValue('');

    try {
      const data = await actionsApi.create({
        note_id: noteId,
        content: currentInput,
        priority: priority,
        due_date: dueDate || null
      });
      if (data) {
        setItems(prev => prev.map(i => i.id === tempId ? data : i));
      }
    } catch {
      toast.error('添加行动项失败');
      setItems(items.filter(i => i.id !== tempId));
      setInputValue(currentInput);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      submitNewItem();
    }
  };

  const toggleComplete = async (item: ActionItem) => {
    if (item.id.startsWith('temp-')) return;
    const newStatus = !item.is_completed;
    
    // Optimistic UI update
    setItems(items.map(i => i.id === item.id ? { ...i, is_completed: newStatus } : i));
    
    try {
      await actionsApi.update(item.id, { is_completed: newStatus });
    } catch {
      toast.error('状态更新失败');
      // Revert on error
      setItems(items.map(i => i.id === item.id ? { ...i, is_completed: !newStatus } : i));
    }
  };

  const deleteItem = async (id: string) => {
    if (id.startsWith('temp-')) return;
    
    const previousItems = [...items];
    setItems(items.filter(i => i.id !== id));
    
    try {
      await actionsApi.delete(id);
      toast.success('已删除');
    } catch {
      toast.error('删除失败');
      setItems(previousItems);
    }
  };
  };

  // Confetti functions hoisted to module level below to ensure render function purity

  if (!noteId) {
    return (
      <div className="action-items-pane">
        <div className="action-header">
          <h3>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2.5" fill="none"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m22 4-10 10.01-3-3"/></svg>
            行动清单 (Action Items)
          </h3>
        </div>
        <div className="action-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
          请先选择一篇笔记
        </div>
      </div>
    );
  }

  return (
    <div className="action-items-pane">
      <div className="action-header">
        <h3>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2.5" fill="none"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m22 4-10 10.01-3-3"/></svg>
          行动清单 (Action Items)
        </h3>
      </div>
      <div className="action-body">
        {items.map(item => (
          <div 
            key={item.id} 
            className={`action-item-checkbox ${item.is_completed ? 'completed' : ''}`}
            role="checkbox"
            aria-checked={item.is_completed}
            tabIndex={0}
            onClick={(e) => {
              if (!item.is_completed) {
                createConfettiFromRect(e.currentTarget.getBoundingClientRect());
              }
              toggleComplete(item);
            }}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                if (!item.is_completed) {
                  createConfettiFromRect(rect);
                }
                toggleComplete(item);
              }
            }}
          >
            <div className={`checkbox-custom`}></div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div className="action-text">
                {item.content}
              </div>
              <div className="action-meta">
                优先级: {item.priority} 
                {item.is_completed ? ' • 已完成' : (item.due_date && ` • 截止时间: ${item.due_date.split('T')[0]}`)}
              </div>
            </div>
            {item.is_completed && (
              <button 
                type="button"
                className="cursor-pointer bg-transparent border-none p-1 rounded hover:bg-gray-200 flex items-center justify-center transition-colors"
                style={{ color: '#999' }}
                onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
                title="删除"
                aria-label="删除待办事项"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              </button>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <div style={{ fontSize: '13px', color: '#888', padding: '10px 0' }}>暂无行动清单，按回车添加</div>
        )}
      </div>
      <div className="add-action-box">
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <input 
            type="text" 
            className="neo-input" 
            placeholder="+ 添加新行动项…" 
            aria-label="添加新行动项"
            style={{ padding: '10px', flexGrow: 1 }}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button 
            type="button"
            className="neo-btn" 
            style={{ padding: '0 15px', display: 'flex', alignItems: 'center', justifyItems: 'center' }}
            onClick={submitNewItem}
            title="添加"
            aria-label="添加行动项"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2.5" fill="none"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <div style={{ position: 'relative' }}>
            <button 
              type="button"
              onClick={() => setIsPriorityOpen(!isPriorityOpen)}
              className="neo-input"
              style={{ padding: '6px 10px', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', userSelect: 'none', background: '#fff', whiteSpace: 'nowrap', flexShrink: 0, border: '3px solid var(--border-color, #000)' }}
              aria-haspopup="listbox"
              aria-expanded={isPriorityOpen}
              aria-label="选择优先级"
            >
              {priority === 'P0' ? 'P0 (紧急)' : priority === 'P1' ? 'P1 (高)' : 'P2 (中)'}
              <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            {isPriorityOpen && (
              <div 
                role="listbox"
                aria-label="优先级选项"
                style={{ 
                  position: 'absolute', bottom: '100%', left: 0, marginBottom: '4px', 
                  background: '#fff', border: '3px solid var(--border-color)', 
                  boxShadow: '4px 4px 0 var(--border-color)', zIndex: 100, width: '130px',
                  display: 'flex', flexDirection: 'column'
                }}
              >
                {[{v: 'P0', l: 'P0 (紧急)'}, {v: 'P1', l: 'P1 (高)'}, {v: 'P2', l: 'P2 (中)'}].map(p => (
                  <button 
                    key={p.v}
                    role="option"
                    aria-selected={priority === p.v}
                    type="button"
                    onClick={() => { setPriority(p.v); setIsPriorityOpen(false); }}
                    style={{
                      padding: '8px 10px',
                      fontSize: '13px',
                      cursor: 'pointer',
                      border: 'none',
                      borderBottom: p.v !== 'P2' ? '2px solid var(--border-color)' : 'none',
                      backgroundColor: priority === p.v ? 'var(--neo-yellow)' : '#fff',
                      fontWeight: priority === p.v ? 'bold' : 'normal',
                      textAlign: 'left',
                      width: '100%'
                    }}
                    onMouseEnter={(e) => {
                      if (priority !== p.v) e.currentTarget.style.backgroundColor = '#f5f5f5';
                    }}
                    onMouseLeave={(e) => {
                      if (priority !== p.v) e.currentTarget.style.backgroundColor = '#fff';
                    }}
                  >
                    {p.l}
                  </button>
                ))}
              </div>
            )}
          </div>
          <input 
            type="date" 
            className="neo-input" 
            aria-label="截止时间"
            style={{ padding: '6px', fontSize: '13px', flexGrow: 1, cursor: 'pointer', outline: 'none' }}
            min={new Date().toISOString().split('T')[0]}
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

const createConfettiFromRect = (rect: DOMRect) => {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  
  const colors = ['var(--neo-yellow)', 'var(--neo-pink)', 'var(--neo-blue)', 'var(--neo-green)'];
  
  for (let i = 0; i < 15; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti';
    confetti.style.left = centerX + 'px';
    confetti.style.top = centerY + 'px';
    confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    
    const tx = (Math.random() - 0.5) * 200;
    const ty = (Math.random() - 0.5) * 200;
    confetti.style.setProperty('--x', tx + 'px');
    confetti.style.setProperty('--y', ty + 'px');
    
    document.body.appendChild(confetti);
    
    setTimeout(() => {
      confetti.remove();
    }, 800);
  }
};
