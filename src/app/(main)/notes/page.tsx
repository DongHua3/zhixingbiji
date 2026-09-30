'use client';

import React, { useState, useEffect } from 'react';
import FileTree from '@/components/notes/FileTree';
import NoteEditor from '@/components/notes/NoteEditor';
import ActionItemsPanel from '@/components/notes/ActionItemsPanel';

export default function NotesPage() {
  const [selectedNoteId, setSelectedNoteId] = useState<string | undefined>();
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [isDragging, setIsDragging] = useState(false);
  const [rightPaneWidth, setRightPaneWidth] = useState(260);
  const [isDraggingRight, setIsDraggingRight] = useState(false);

  // Handle resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setSidebarWidth(prev => {
          let w = prev + e.movementX;
          if (w < 150) w = 150;
          if (w > 600) w = 600;
          return w;
        });
      } else if (isDraggingRight) {
        setRightPaneWidth(prev => {
          let w = prev - e.movementX;
          if (w < 240) w = 240; // 突破下限，允许用户缩得更窄
          if (w > 800) w = 800; 
          return w;
        });
      }
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
      setIsDraggingRight(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    if (isDragging || isDraggingRight) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isDraggingRight]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const idFromUrl = params.get('noteId');
    if (idFromUrl) {
      setTimeout(() => setSelectedNoteId(idFromUrl), 0);
    }
  }, []);

  return (
    <section id="my-notes" className="content-section active">
      <div className="notes-workspace" style={{ gridTemplateColumns: `${sidebarWidth}px 1fr` }}>
        {/* Left Column: Folders */}
        <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
          <FileTree selectedNoteId={selectedNoteId} onSelectNote={setSelectedNoteId} />
          {/* Resizer overlay */}
          <div 
            onMouseDown={() => setIsDragging(true)}
            style={{
              position: 'absolute',
              top: 0,
              right: -4,
              width: '8px',
              height: '100%',
              cursor: 'col-resize',
              zIndex: 50,
              backgroundColor: 'transparent',
            }}
          />
        </div>

        {/* Right Column: Editor + Action Items */}
        <div className="editor-pane" style={{ gridTemplateColumns: `1fr ${rightPaneWidth}px` }}>
          <NoteEditor noteId={selectedNoteId} />
          
          {/* Action Items Column with Resizer */}
          <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
            <div 
              onMouseDown={() => setIsDraggingRight(true)}
              style={{
                position: 'absolute',
                top: 0,
                left: -4,
                width: '8px',
                height: '100%',
                cursor: 'col-resize',
                zIndex: 50,
                backgroundColor: 'transparent',
              }}
            />
            <ActionItemsPanel noteId={selectedNoteId} />
          </div>
        </div>
      </div>
    </section>
  );
}
