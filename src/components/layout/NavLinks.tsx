'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <ul className="sidebar-menu">
      <li>
        <Link href="/dashboard" className={`menu-item ${pathname === '/dashboard' ? 'active' : ''}`} aria-current={pathname === '/dashboard' ? 'page' : undefined}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2.5" fill="none"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
          仪表盘
        </Link>
      </li>
      <li>
        <Link href="/square" className={`menu-item ${pathname === '/square' ? 'active' : ''}`} aria-current={pathname === '/square' ? 'page' : undefined}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2.5" fill="none"><circle cx="12" cy="12" r="10"/><path d="m16.2 7.8-2 5.7-5.7 2 2-5.7Z"/></svg>
          笔记广场
        </Link>
      </li>
      <li>
        <Link href="/notes" className={`menu-item ${pathname === '/notes' ? 'active' : ''}`} aria-current={pathname === '/notes' ? 'page' : undefined}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2.5" fill="none"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          我的笔记
        </Link>
      </li>
      <li>
        <Link href="/favorites" className={`menu-item ${pathname === '/favorites' ? 'active' : ''}`} aria-current={pathname === '/favorites' ? 'page' : undefined}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2.5" fill="none"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
          我的收藏
        </Link>
      </li>
      <li>
        <Link href="/convert" className={`menu-item ${pathname === '/convert' ? 'active' : ''}`} aria-current={pathname === '/convert' ? 'page' : undefined}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2.5" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
          一键转换
        </Link>
      </li>
      <li>
        <Link href="/ai-settings" className={`menu-item ${pathname === '/ai-settings' ? 'active' : ''}`} aria-current={pathname === '/ai-settings' ? 'page' : undefined}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2.5" fill="none"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
          AI 设置
        </Link>
      </li>
      <li>
        <Link href="/profile" className={`menu-item ${pathname === '/profile' ? 'active' : ''}`} aria-current={pathname === '/profile' ? 'page' : undefined}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2.5" fill="none"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          个人资料
        </Link>
      </li>
      <li>
        <Link href="/settings" className={`menu-item ${pathname === '/settings' ? 'active' : ''}`} aria-current={pathname === '/settings' ? 'page' : undefined}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2.5" fill="none"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          系统设置
        </Link>
      </li>
    </ul>
  );
}
