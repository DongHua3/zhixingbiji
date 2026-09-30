'use client';

import React, { useRef } from 'react';
import { Bold, Italic, Underline, List, ListOrdered, CheckSquare, Table, Image as ImageIcon, Link, Code, Minus, Undo, Redo } from 'lucide-react';

interface MarkdownSourceEditorProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onScroll?: (e: React.UIEvent<HTMLTextAreaElement>) => void;
  ref?: React.Ref<HTMLTextAreaElement | null>;
}

export default function MarkdownSourceEditor({ value, onChange, onScroll, ref: externalRef }: MarkdownSourceEditorProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const ref = (externalRef as React.RefObject<HTMLTextAreaElement | null>) || internalRef;
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  // Sync scroll for line numbers
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = e.currentTarget.scrollTop;
    }
    if (onScroll) onScroll(e);
  };

  const lineCount = value.split('\n').length;
  const lines = Array.from({ length: Math.max(1, lineCount) }, (_, i) => i + 1);

  const insertSyntax = (prefix: string, suffix: string, defaultText: string) => {
    const el = ref.current;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = el.value;
    const selectedText = text.substring(start, end) || defaultText;

    const newText = text.substring(0, start) + prefix + selectedText + suffix + text.substring(end);
    
    // Create synthetic event
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(el, newText);
      const event = new Event('input', { bubbles: true });
      el.dispatchEvent(event);
    }

    // Reset cursor position
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length + selectedText.length);
    }, 0);
  };

  const handleUndo = () => {
    document.execCommand('undo');
  };

  const handleRedo = () => {
    document.execCommand('redo');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#fff', borderRight: '1px solid #e2e8f0' }}>
      <style>{`
        .md-tool-btn {
          background: transparent;
          border: none;
          border-radius: 4px;
          min-width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: #475569;
          transition: all 0.15s ease;
          outline: none;
        }
        .md-tool-btn:hover {
          background-color: #e2e8f0;
          color: #0f172a;
        }
        .md-tool-divider {
          width: 1px;
          height: 16px;
          background-color: #e2e8f0;
          margin: 0 4px;
        }
        .md-tool-select {
          appearance: none;
          background-color: transparent;
          border: none;
          border-radius: 4px;
          padding: 4px 24px 4px 8px;
          font-size: 13px;
          color: #475569;
          cursor: pointer;
          background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 6px center;
          height: 28px;
          outline: none;
          transition: all 0.15s ease;
        }
        .md-tool-select:hover {
          background-color: #e2e8f0;
          color: #0f172a;
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#fff', flexWrap: 'wrap' }}>
        <button className="md-tool-btn" onClick={handleUndo} title="撤销"><Undo size={16} /></button>
        <button className="md-tool-btn" onClick={handleRedo} title="重做"><Redo size={16} /></button>
        
        <div className="md-tool-divider" />

        <select 
          className="md-tool-select"
          onChange={(e) => {
            const val = e.target.value;
            if (val === 'h1') insertSyntax('# ', '', '标题 1');
            if (val === 'h2') insertSyntax('## ', '', '标题 2');
            if (val === 'h3') insertSyntax('### ', '', '标题 3');
            if (val === 'h4') insertSyntax('#### ', '', '标题 4');
            if (val === 'h5') insertSyntax('##### ', '', '标题 5');
            if (val === 'h6') insertSyntax('###### ', '', '标题 6');
            if (val === 'quote') insertSyntax('> ', '', '引用');
            e.target.value = 'p';
          }}
        >
          <option value="p">正文</option>
          <option value="h1">标题 1</option>
          <option value="h2">标题 2</option>
          <option value="h3">标题 3</option>
          <option value="h4">标题 4</option>
          <option value="h5">标题 5</option>
          <option value="h6">标题 6</option>
          <option value="quote">引用</option>
        </select>

        <div className="md-tool-divider" />

        <button className="md-tool-btn" onClick={() => insertSyntax('**', '**', '加粗')} title="加粗"><Bold size={16} /></button>
        <button className="md-tool-btn" onClick={() => insertSyntax('*', '*', '斜体')} title="斜体"><Italic size={16} /></button>
        <button className="md-tool-btn" onClick={() => insertSyntax('<u>', '</u>', '下划线')} title="下划线"><Underline size={16} /></button>
        
        <div className="md-tool-divider" />
        
        <button className="md-tool-btn" onClick={() => insertSyntax('- ', '', '列表项')} title="无序列表"><List size={16} /></button>
        <button className="md-tool-btn" onClick={() => insertSyntax('1. ', '', '列表项')} title="有序列表"><ListOrdered size={16} /></button>
        <button className="md-tool-btn" onClick={() => insertSyntax('- [ ] ', '', '任务')} title="任务列表"><CheckSquare size={16} /></button>

        <div className="md-tool-divider" />

        <button className="md-tool-btn" onClick={() => insertSyntax('\n| 表头 1 | 表头 2 |\n| -------- | -------- |\n| 文本 | 文本 |\n', '', '')} title="表格"><Table size={16} /></button>
        <button className="md-tool-btn" onClick={() => insertSyntax('![图片描述](', 'https://)', '')} title="图片"><ImageIcon size={16} /></button>
        <button className="md-tool-btn" onClick={() => insertSyntax('[', '](https://)', '链接文本')} title="链接"><Link size={16} /></button>
        
        <div className="md-tool-divider" />
        
        <button className="md-tool-btn" onClick={() => insertSyntax('\n```js\n', '\n```\n', 'console.log("hello")')} title="代码块"><Code size={16} /></button>
        <button className="md-tool-btn" onClick={() => insertSyntax('\n---\n', '', '')} title="分割线"><Minus size={16} /></button>
      </div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative', backgroundColor: '#fff' }}>
        <div 
          ref={lineNumbersRef}
          style={{ 
            width: '48px', 
            borderRight: '1px solid #f1f5f9', 
            backgroundColor: '#f8fafc',
            paddingTop: '24px',
            paddingBottom: '24px',
            textAlign: 'right',
            paddingRight: '12px',
            color: '#94a3b8',
            fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace",
            fontSize: '14px',
            lineHeight: 1.7,
            overflow: 'hidden',
            userSelect: 'none'
          }}
        >
          {lines.map(line => <div key={line}>{line}</div>)}
        </div>
        <textarea
          ref={ref}
          value={value}
          onChange={onChange}
          onScroll={handleScroll}
          spellCheck={false}
          placeholder="在此输入 Markdown 源码..."
          style={{
            flex: 1,
            padding: '24px',
            border: 'none',
            resize: 'none',
            outline: 'none',
            fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace",
            fontSize: '14px',
            lineHeight: 1.7,
            backgroundColor: '#fff',
            color: '#334155',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word'
          }}
        />
      </div>
    </div>
  );
}
