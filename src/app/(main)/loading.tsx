'use client';

import React from 'react';

export default function Loading() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      minHeight: '400px',
      width: '100%',
      backgroundColor: 'var(--bg-main, #EFF6FF)',
      padding: '24px'
    }}>
      <div 
        style={{
          backgroundColor: 'var(--bg-card, #FFFFFF)',
          border: '3px solid var(--border-color, #000000)',
          borderRadius: '12px',
          boxShadow: '6px 6px 0px 0px var(--border-color, #000000)',
          padding: '32px 48px',
          textAlign: 'center',
          maxWidth: '400px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px'
        }}
      >
        {/* Modern Neo-Brutalism Loading Indicator */}
        <div style={{ position: 'relative', width: '50px', height: '50px' }}>
          <div style={{
            boxSizing: 'border-box',
            display: 'block',
            position: 'absolute',
            width: '40px',
            height: '40px',
            margin: '5px',
            border: '5px solid var(--border-color, #000000)',
            borderRadius: '50%',
            animation: 'neo-spin 1s cubic-bezier(0.5, 0, 0.5, 1) infinite',
            borderTopColor: 'transparent',
            borderBottomColor: 'var(--color-neo-yellow, #FFD700)',
            borderLeftColor: 'var(--color-neo-blue, #2563EB)',
            borderRightColor: 'var(--color-neo-pink, #FF4B4B)'
          }} />
        </div>
        
        <div>
          <h3 className="neo-title" style={{ fontSize: '18px', margin: '0 0 8px 0', color: 'var(--text-primary, #000)' }}>
            知行实践中...
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted, #555)', margin: 0, fontWeight: 600 }}>
            正在努力为您打包加载数据模块
          </p>
        </div>

        {/* Inline CSS Keyframes for spin */}
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes neo-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}} />
      </div>
    </div>
  );
}
