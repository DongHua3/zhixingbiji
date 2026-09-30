import Link from 'next/link';
import { getCachedAuthUser } from '@/lib/supabase/queries';
import UserAvatar from '@/components/ui/UserAvatar';

export default async function Home() {
  const { data: { user } } = await getCachedAuthUser();

  let username = '';
  let avatarUrl: string | null = null;
  if (user) {
    username = user.username || user.email?.split('@')[0] || 'U';
    avatarUrl = user.avatar_url || null;
  }

  return (
    <div className="landing-body w-full min-h-screen overflow-y-auto bg-bg-main">
      {/* Navigation */}
      <nav className="landing-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="logo-icon" style={{ width: '36px', height: '36px', fontSize: '20px', boxShadow: '2px 2px 0px #000' }}>知</div>
          <span className="brand-logo" style={{ fontSize: '20px' }}>知行笔记</span>
        </div>
        <ul className="landing-nav-links">
          <li><a href="#features">产品特性</a></li>
          <li><a href="#workflow">核心工作流</a></li>
          <li><a href="#pricing">获取方案</a></li>
        </ul>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {user ? (
            <>
              <Link href="/dashboard" className="neo-btn primary" style={{ padding: '8px 16px', fontSize: '13px' }}>进入仪表盘</Link>
              <UserAvatar username={username} avatarUrl={avatarUrl} size={40} />
            </>
          ) : (
            <>
              <Link href="/login" className="neo-btn primary" style={{ padding: '8px 16px', fontSize: '13px' }}>登录</Link>
              <Link href="/login?tab=register" className="neo-btn info" style={{ padding: '8px 16px', fontSize: '13px' }}>免费注册</Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <div className="hero-badge-container">
            <span className="neo-badge orange" style={{ fontSize: '13px', transform: 'rotate(-2deg)' }}>🚀 新一代知识实践工作台</span>
          </div>
          <h1 className="hero-title">
            知行合一，学以致知；<br/>
            <span style={{ backgroundColor: 'var(--neo-blue)', color: '#ffffff', padding: '0 8px', border: '3px solid #000', display: 'inline-block', transform: 'rotate(-1deg)', marginTop: '8px' }}>知行合一，学以致用。</span>
          </h1>
          <p className="hero-subtitle">
            告别传统笔记“记完就吃灰”的仓鼠式囤积。知行笔记提供一键文档 Markdown 转换资产，并独创以<b>“行动清单”</b>为导向的反馈闭环，把知识真正转化为你的肌肉记忆。
          </p>
          <div className="hero-actions">
            <Link href="/login?tab=register" className="neo-btn primary" style={{ padding: '16px 36px', fontSize: '18px' }}>
              立即开始使用
            </Link>
            <a href="#features" className="neo-btn" style={{ padding: '16px 28px', fontSize: '16px' }}>
              产品特性
            </a>
          </div>
        </div>
        
        <div className="hero-image-container">
          <div className="hero-illustration">
            <div className="illustration-badge">
              <span className="neo-badge pink" style={{ padding: '8px 14px', fontSize: '14px', fontWeight: 800 }}>78.5% 实践转化</span>
            </div>
            <h3 className="neo-title" style={{ marginBottom: '12px', borderBottom: '2px solid #000', paddingBottom: '8px' }}>🎯 我的学习与行动</h3>
            <p style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '16px', color: '#555' }}>《费曼学习法核心原理与闭环》</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '15px' }}>
              <div className="action-item-checkbox completed" style={{ boxShadow: '2px 2px 0 #000', pointerEvents: 'none' }}>
                <div className="checkbox-custom"></div>
                <div className="action-text" style={{ fontSize: '12px' }}>写一篇知行合一的实践心得</div>
              </div>
              <div className="action-item-checkbox" style={{ boxShadow: '2px 2px 0 #000', pointerEvents: 'none' }}>
                <div className="checkbox-custom"></div>
                <div className="action-text" style={{ fontSize: '12px' }}>使用 MarkItDown 将本周的 PDF 解析成 Markdown</div>
              </div>
              <div className="action-item-checkbox" style={{ boxShadow: '2px 2px 0 #000', pointerEvents: 'none' }}>
                <div className="checkbox-custom"></div>
                <div className="action-text" style={{ fontSize: '12px' }}>在笔记广场分享第一篇优质笔记</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section" id="features">
        <div className="section-header">
          <span className="neo-badge yellow" style={{ marginBottom: '16px' }}>FEATURES</span>
          <h2>核心三大护航功能，助你破局“知易行难”</h2>
          <p>从知识提取，到美观创作，再到行动追溯，我们打造了闭环的知识转化机器。</p>
        </div>
        
        <div className="landing-features-grid">
          {/* Feature 1 */}
          <div className="landing-feature-card" style={{ backgroundColor: 'var(--card-purple-bg)' }}>
            <div className="feature-icon-wrapper" style={{ backgroundColor: 'var(--neo-white)' }}>⚡</div>
            <h3 className="feature-card-title">MarkItDown 一键转换</h3>
            <p className="feature-card-desc">
              基于强大的微软开源 MarkItDown 解析引擎，支持将 Word (docx)、PDF、PowerPoint (pptx) 甚至图片一键转换成精细、带公式渲染的 Markdown 格式笔记。
            </p>
          </div>
          
          {/* Feature 2 */}
          <div className="landing-feature-card" style={{ backgroundColor: 'var(--card-pink-bg)' }}>
            <div className="feature-icon-wrapper" style={{ backgroundColor: 'var(--neo-white)' }}>📝</div>
            <h3 className="feature-card-title">沉浸式 Markdown 编辑器</h3>
            <p className="feature-card-desc">
              提供极致干净的写作环境，支持即时预览、智能目录、数学公式、快捷键排版，并拥有精美的卡片式新粗野风格皮肤，让知识沉淀不仅有效，更是视觉享受。
            </p>
          </div>
          
          {/* Feature 3 */}
          <div className="landing-feature-card" style={{ backgroundColor: 'var(--card-green-bg)' }}>
            <div className="feature-icon-wrapper" style={{ backgroundColor: 'var(--neo-white)' }}>🎯</div>
            <h3 className="feature-card-title">独创行动清单 (Action Items)</h3>
            <p className="feature-card-desc">
              把你的笔记与下一步的可操作性待办进行物理绑定！编辑器侧边直观地展示行动卡片，每次打勾都会触发撒花激励，且行动率会百分百汇总至您的个人仪表盘。
            </p>
          </div>
        </div>
      </section>

      {/* Workflow Section */}
      <section className="workflow-section" id="workflow">
        <div className="section-header">
          <span className="neo-badge orange" style={{ marginBottom: '16px', color: '#fff' }}>WORKFLOW</span>
          <h2>知行笔记推荐的标准工作法</h2>
          <p>简单 3 步，让你的每一次阅读和记录都实实在在地落地发芽。</p>
        </div>

        {/* Step 1 */}
        <div className="workflow-row">
          <div className="workflow-content">
            <div className="workflow-step-num">01</div>
            <h3 className="neo-title" style={{ fontSize: '28px', marginBottom: '16px' }}>解析沉淀，学以致知</h3>
            <p style={{ fontWeight: 600, color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: '15px' }}>
              上传你的参考报告、教授课件或是技术 PDF 文档，利用内置的引擎迅速转化为结构化、无冗余代码的 Markdown 资产，一键保存至个人云端文件夹。
            </p>
          </div>
          <div className="workflow-preview">
            <div className="neo-card" style={{ background: 'white', transform: 'rotate(-1.5deg)' }}>
              <span className="neo-badge purple" style={{ marginBottom: '10px' }}>智能解析中</span>
              <div style={{ fontFamily: 'Consolas, Monaco, ui-monospace, monospace', fontSize: '13px', fontWeight: 600, borderLeft: '3px solid var(--neo-purple)', paddingLeft: '10px', color: '#111' }}>
                $ pdf2md --input thesis.pdf<br/>
                [Info] Detecting headers... Done.<br/>
                [Info] Converting mathematics latex... Done.<br/>
                [Success] Saved to folder: &quot;群论与代数&quot;
              </div>
            </div>
          </div>
        </div>

        {/* Step 2 */}
        <div className="workflow-row">
          <div className="workflow-content">
            <div className="workflow-step-num">02</div>
            <h3 className="neo-title" style={{ fontSize: '28px', marginBottom: '16px' }}>绑定行动，学以致用</h3>
            <p style={{ fontWeight: 600, color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: '15px' }}>
              拒绝写完就遗忘！为每篇笔记设置“实践行动”。将知识拆解为当下能做的小步骤，直接在编辑器侧边卡片记录，由知行笔记提醒并追踪你的打勾进度。
            </p>
          </div>
          <div className="workflow-preview">
            <div className="neo-card" style={{ background: 'var(--card-yellow-bg)', transform: 'rotate(1deg)' }}>
              <h4 className="neo-title" style={{ marginBottom: '10px' }}>📌 行动待办 (P0级优先)</h4>
              <p style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '10px' }}>☐ 对照公式手工演算习题 3-5 (今天内完成)</p>
              <p style={{ fontSize: '12px', fontWeight: 'bold' }}>☐ 搜集 2 个反例验证该定理</p>
            </div>
          </div>
        </div>

        {/* Step 3 */}
        <div className="workflow-row">
          <div className="workflow-content">
            <div className="workflow-step-num">03</div>
            <h3 className="neo-title" style={{ fontSize: '28px', marginBottom: '16px' }}>数据反馈，见证蜕变</h3>
            <p style={{ fontWeight: 600, color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: '15px' }}>
              仪表盘会以极具张力和视觉张力的图表展示你近期的学习深度 and 行动转化率，用数据证明你的成长。每一个被兑现的行动，都会化为个人成就徽章，让成长清晰可见！
            </p>
          </div>
          <div className="workflow-preview">
            <div className="neo-card" style={{ background: 'var(--card-green-bg)', textAlign: 'center', transform: 'rotate(-1deg)' }}>
              <div style={{ fontSize: '36px', fontWeight: 800 }}>78.5%</div>
              <p style={{ fontSize: '13px', fontWeight: 'bold', marginTop: '5px' }}>本周实践转换率 (实干先锋勋章)</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section" id="pricing">
        <div className="cta-container">
          <h2 className="cta-title">告别纸上谈兵，开启实干之旅</h2>
          <p className="cta-desc">
            加入数万名通过“知行合一”法则提升自我的终身学习者和高效职场人士。立刻建立你的第一份行动清单。
          </p>
          <div>
            <Link href="/login?tab=register" className="neo-btn primary" style={{ padding: '20px 48px', fontSize: '20px', boxShadow: '6px 6px 0px #000' }}>
              免费注册并体验控制台 ⚡
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-top">
          <div className="footer-brand">
            <h3>知行笔记</h3>
            <p>知行合一，学以致知；知行合一，学以致用。</p>
          </div>
          <div className="footer-links">
            <div className="footer-links-col">
              <h4>产品</h4>
              <ul>
                <li><a href="#features">功能介绍</a></li>
                <li><a href="#workflow">工作流程</a></li>
                <li><Link href="/dashboard">进入控制台</Link></li>
              </ul>
            </div>
            <div className="footer-links-col">
              <h4>社区</h4>
              <ul>
                <li><Link href="/square">笔记广场</Link></li>
                <li><a href="#">实干讨论区</a></li>
                <li><a href="#">开源生态</a></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2026 知行笔记开发团队. All rights reserved.</p>
        </div>
      </footer>

    </div>
  );
}
