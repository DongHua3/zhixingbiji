
import { getCachedAuthUser } from '@/lib/supabase/queries';
import { logout } from '@/app/login/actions';
import NavLinks from './NavLinks';
import UserAvatar from '@/components/ui/UserAvatar';

export default async function Sidebar() {
  // 获取当前登录用户 (从缓存)
  const {
    data: { user },
  } = await getCachedAuthUser();

  let username = '实干先锋';
  let roleText = '知行实践者 Lv.1';
  let notesCount = 0;
  let avatarUrl: string | null = null;

  if (user) {
    username = user.username || user.email?.split('@')[0] || '实干先锋';
    avatarUrl = user.avatar_url || null;
    notesCount = user.notes_count || 0;
    const level = Math.min(10, Math.floor(notesCount / 5) + 1);
    roleText = `知行实践者 Lv.${level}`;
  }



  return (
    <aside className="sidebar">
      <div>
        <div className="sidebar-header">
          <div className="logo-icon" aria-hidden="true">知</div>
          <span className="brand-logo">知行笔记</span>
        </div>
        <NavLinks />
      </div>
      
      <div className="sidebar-footer">
        <div className="user-profile" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <UserAvatar username={username} avatarUrl={avatarUrl} size={40} />
            <div className="user-info">
               <span className="user-name">{username}</span>
               <span className="user-role">{roleText}</span>
            </div>
          </div>
          <form action={logout}>
            <button type="submit" title="退出登录" aria-label="退出登录" className="cursor-pointer bg-transparent border-none p-2 hover:bg-gray-100 rounded flex items-center justify-center transition-colors">
              <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" stroke="#000" strokeWidth="2.5" fill="none"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
