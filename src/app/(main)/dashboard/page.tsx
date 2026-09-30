import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getCachedAuthUser } from '@/lib/supabase/queries';
import { dashboardApi } from '@/lib/api/client';

export const revalidate = 0; // 禁用页面缓存，确保数据实时

export default async function Dashboard() {
  // 1. 获取当前登录用户
  const {
    data: { user },
  } = await getCachedAuthUser();

  if (!user) {
    redirect('/login');
  }

  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value || '';

  // 2. 服务端聚合获取所有统计与待办列表
  let stats: any = {
    total_notes: 0,
    weekly_notes: 0,
    total_actions: 0,
    completed_actions: 0,
    pending_actions: [],
    recent_notes: []
  };

  try {
    stats = await dashboardApi.getStats({ Authorization: `Bearer ${token}` });
  } catch (err) {
    console.error('获取仪表盘统计失败:', err);
  }

  const username = user.username || user.email?.split('@')[0] || '实干先锋';

  // 3. 计算欢迎问候语与名言
  const serverHour = new Date().getHours();
  let timeGreeting = '早上好';
  if (serverHour >= 12 && serverHour < 18) {
    timeGreeting = '下午好';
  } else if (serverHour >= 18 || serverHour < 5) {
    timeGreeting = '晚上好';
  }

  const quotes = [
    { text: '“知行合一，学以致知；知行合一，学以致用。”', author: '今天也是充满行动力的一天！' },
    { text: '“知之真切笃实处即是行，行之明觉精察处即是知。”', author: '实践是检验真理的唯一标准！' },
    { text: '“纸上得来终觉浅，绝知此事要躬行。”', author: '行动起来，将知识付诸实践！' },
    { text: '“学而不思则罔，思而不学则殆。”', author: '思考与行动并重！' }
  ];
  const quoteIndex = new Date().getDate() % quotes.length;
  const quote = quotes[quoteIndex];

  // 4. 数据统计解析
  // A. 知识沉淀池
  const totalNotes = stats.total_notes || 0;
  const weeklyNotes = stats.weekly_notes || 0;
  const beatPercentage = Math.min(99, Math.max(10, totalNotes * 8 + 12));

  // B. 行动转化率
  const totalActions = stats.total_actions || 0;
  const completedActions = stats.completed_actions || 0;
  const conversionRate =
    totalActions > 0
      ? ((completedActions / totalActions) * 100).toFixed(1)
      : '0.0';

  let conversionText = '开始行动吧！';
  const conversionRateNum = parseFloat(conversionRate);
  if (totalActions > 0) {
    if (conversionRateNum >= 80) {
      conversionText = '行动派！太棒了！';
    } else if (conversionRateNum >= 50) {
      conversionText = '在知行合一的路上，加油！';
    } else {
      conversionText = '继续行动起来吧！';
    }
  }

  // 5. 下部列表区块数据解析
  // A. 行动催办提醒
  const pendingActionsData = stats.pending_actions || [];

  const now = new Date();
  const formattedPendingActions = (pendingActionsData || []).map((action) => {
    const noteTitle = (action.notes as { title?: string })?.title || '无标题笔记';
    let type = 'upcoming';
    let badgeText = '待处理';
    let badgeClass = 'blue';
    let borderStyle = '4px solid var(--neo-blue)';
    let diffDays = 0;
    
    let statusText = '无截止时间';
    let statusColor = 'var(--text-secondary)';

    if (action.due_date) {
      const dueDate = new Date(action.due_date);

      const d1 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const d2 = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
      const diffTime = d2.getTime() - d1.getTime();
      diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        type = 'overdue';
        badgeText = '超期预警';
        badgeClass = 'red';
        borderStyle = '4px solid #FF3B30';
        statusText = `逾期 ${Math.abs(diffDays)} 天`;
        statusColor = '#FF3B30';
      } else if (diffDays === 0) {
        type = 'today';
        badgeText = '复习记忆预警';
        badgeClass = 'yellow';
        borderStyle = '4px solid var(--neo-yellow)';
        statusText = '今天到期';
        statusColor = 'var(--text-secondary)';
      } else {
        type = 'upcoming';
        badgeText = '即将到期';
        badgeClass = 'green';
        borderStyle = '4px solid var(--neo-green)';
        statusText = `剩余 ${diffDays} 天`;
        statusColor = 'var(--text-secondary)';
      }
    }

    return {
      ...action,
      noteTitle,
      type,
      badgeText,
      badgeClass,
      borderStyle,
      statusText,
      statusColor,
      diffDays,
    };
  });

  formattedPendingActions.sort((a, b) => {
    const order = { overdue: 1, today: 2, upcoming: 3, none: 4 };
    const orderA = order[a.type as keyof typeof order] || 4;
    const orderB = order[b.type as keyof typeof order] || 4;
    if (orderA !== orderB) return orderA - orderB;
    return a.diffDays - b.diffDays;
  });

  const pendingActionsToShow = formattedPendingActions.slice(0, 5);

  // B. 最近编辑
  const recentNotesData = stats.recent_notes || [];

  const formattedRecentNotes = (recentNotesData || []).map((note) => {
    const actionItemsList = (note.action_items as { is_completed: boolean }[]) || [];
    const total = actionItemsList.length;
    const completed = actionItemsList.filter((a) => a.is_completed).length;

    let actionSummary = '无行动项';
    if (total > 0) {
      if (completed === total) {
        actionSummary = '已完结';
      } else {
        actionSummary = `${total} 个行动项`;
      }
    }

    const updatedAt = new Date(note.updated_at);
    let timeStr = '';
    const d1 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const d2 = new Date(updatedAt.getFullYear(), updatedAt.getMonth(), updatedAt.getDate());
    const diffDays = Math.floor((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));

    const pad = (n: number) => n.toString().padStart(2, '0');
    const timeFormatted = `${pad(updatedAt.getHours())}:${pad(updatedAt.getMinutes())}`;

    if (diffDays === 0) {
      timeStr = `今天 ${timeFormatted}`;
    } else if (diffDays === 1) {
      timeStr = `昨天 ${timeFormatted}`;
    } else if (diffDays === 2) {
      timeStr = `前天 ${timeFormatted}`;
    } else {
      timeStr = `${updatedAt.getFullYear()}-${pad(updatedAt.getMonth() + 1)}-${pad(updatedAt.getDate())} ${timeFormatted}`;
    }

    return {
      ...note,
      actionSummary,
      timeStr,
    };
  });

  return (
    <section id="dashboard" className="content-section active">
      <div className="welcome-row">
        <div className="welcome-text">
          <h1>欢迎回来，{username}！</h1>
          <p>{quote.text} —— {quote.author}</p>
        </div>
        <div className="welcome-action" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Link href="/" className="neo-btn" style={{ backgroundColor: 'var(--bg-btn-secondary)', color: 'var(--text-primary)', padding: '12px' }} title="返回首页">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </Link>
          <Link href="/notes" className="neo-btn primary" id="btn-quick-new">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.5" fill="none">
              <path d="M5 12h14M12 5v14" />
            </svg>
            新建笔记
          </Link>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Card 1: 知识沉淀池 */}
        <div className="neo-card stats-card" style={{ backgroundColor: 'var(--neo-blue)', color: '#fff' }}>
          <div className="stats-title" style={{ color: '#fff' }}>
            <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 12 12 17 22 12" />
              <polyline points="2 17 12 22 22 17" />
            </svg>
            知识沉淀池
          </div>
          <div className="stats-value">{totalNotes} 篇</div>
          <div className="stats-footer" style={{ color: '#fff' }}>
            本周新增 +{weeklyNotes} 篇 • 击败 {beatPercentage}% 用户
          </div>
        </div>

        {/* Card 2: 行动转化率 */}
        <div className="neo-card stats-card" style={{ backgroundColor: 'var(--neo-green)' }}>
          <div className="stats-title">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2.5" fill="none">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <path d="m22 4-10 10.01-3-3" />
            </svg>
            行动转化率
          </div>
          <div className="stats-value">{conversionRate}%</div>
          <div className="stats-footer">
            已完成 {completedActions}/{totalActions} 项行动 • {conversionText}
          </div>
        </div>

        {/* Card 3: 快捷入口 */}
        <div className="neo-card stats-card" style={{ backgroundColor: 'var(--neo-yellow)' }}>
          <div className="stats-title" style={{ marginBottom: '12px', color: '#000' }}>
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2.5" fill="none">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
            快捷入口
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Link href="/convert" className="neo-btn danger" style={{ width: '100%', padding: '8px' }}>
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.5" fill="none">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
              一键转换 Word/PDF
            </Link>
            <Link href="/square" className="neo-btn info" style={{ width: '100%', padding: '8px' }}>
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="#fff" strokeWidth="2.5" fill="none">
                <circle cx="12" cy="12" r="10" />
                <path d="m16.2 7.8-2 5.7-5.7 2 2-5.7Z" />
              </svg>
              探索笔记广场
            </Link>
          </div>
        </div>
      </div>

      <div className="dashboard-bottom-grid">
        {/* Left: 行动催办提醒 */}
        <div className="neo-card no-hover">
          <h2 className="neo-title" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#FF3B30' }}>
              <circle cx="12" cy="13" r="8"/>
              <path d="M12 9v4l2 2"/>
              <path d="M5 3 2 6"/>
              <path d="m22 6-3-3"/>
              <path d="M6.38 18.7 4 21"/>
              <path d="M17.64 18.67 20 21"/>
            </svg>
            行动催办提醒
          </h2>
          <div className="recent-notes-list">
            {pendingActionsToShow.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>
                暂无待办行动项，快去写篇笔记规划一下吧！
              </div>
            ) : (
              pendingActionsToShow.map((action) => (
                <div
                  key={action.id}
                  className="recent-note-item"
                  style={{ borderLeft: action.borderStyle }}
                >
                  <div className="recent-note-meta" style={{ minWidth: 0, flex: 1 }}>
                    <span className={`neo-badge ${action.badgeClass}`} style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{action.badgeText}</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0, flex: 1 }}>
                      <strong style={{ display: 'block', wordBreak: 'break-all' }}>{action.content}</strong>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', wordBreak: 'break-all' }}>来源笔记: 《{action.noteTitle}》</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                    <span style={{ fontSize: '12px', color: action.statusColor, fontWeight: 800, whiteSpace: 'nowrap' }}>{action.statusText}</span>
                    <Link
                      href={`/notes?noteId=${action.note_id}`}
                      className={`neo-btn ${action.type === 'overdue' ? 'red' : action.type === 'today' ? 'primary' : ''}`}
                      style={{ padding: '6px 12px', fontSize: '12px', whiteSpace: 'nowrap' }}
                    >
                      去处理
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: 最近编辑 */}
        <div className="neo-card">
          <h2 className="neo-title" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--neo-blue)' }}>
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
              <path d="M12 7v5l4 2"/>
            </svg>
            最近编辑
          </h2>
          <div className="recent-notes-list">
            {formattedRecentNotes.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>
                还没有笔记，点击上方“新建笔记”开始知行之旅吧！
              </div>
            ) : (
              formattedRecentNotes.map((note) => (
                <Link
                  key={note.id}
                  href={`/notes?noteId=${note.id}`}
                  className="recent-note-item"
                  style={{
                    padding: '12px',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: '8px',
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 700 }}>{note.title}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {note.timeStr} • {note.actionSummary}
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
