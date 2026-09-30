'use client'

import { useState, useEffect } from 'react'
import { login, signup, verifyOtp, resendOtp, sendPasswordReset } from './actions'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { sm2, sm4 } from 'sm-crypto'

// 生成随机 16 字节的 Hex 字符串 (32个16进制字符)
const generateRandomHexKey = () => {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 封装多重加密逻辑
const encryptPayload = (password: string) => {
  const publicKey = process.env.NEXT_PUBLIC_SM2_PUBLIC_KEY || '';
  if (!publicKey) return null;
  
  const sm4Key = generateRandomHexKey();
  // SM4 默认采用 ECB 模式，这里直接加密
  const encryptedPassword = sm4.encrypt(password, sm4Key);
  // SM2 公钥加密 SM4 密钥 (模式1：C1C3C2)
  const encryptedSm4Key = sm2.doEncrypt(sm4Key, publicKey, 1);
  
  return { encryptedPassword, encryptedSm4Key };
}

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [captcha, setCaptcha] = useState(() => {
    const num1 = Math.floor(Math.random() * 10) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    return { q: `${num1} + ${num2} = ?`, a: num1 + num2 };
  })
  const [captchaInput, setCaptchaInput] = useState('')
  
  // OTP Verification States
  const [verifyEmail, setVerifyEmail] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [otpCode, setOtpCode] = useState('')
  const [otpType, setOtpType] = useState<'signup' | 'recovery'>('signup')
  const [isForgotPassword, setIsForgotPassword] = useState(false)
  const router = useRouter()
  const [lastSentEmail, setLastSentEmail] = useState('')
  
  // Registration Form Cache
  const [regForm, setRegForm] = useState({ username: '', email: '', password: '', confirmPassword: '' })

  // 记住账号与密码受控状态
  const [loginIdentifier, setLoginIdentifier] = useState('')
  const [rememberMe, setRememberMe] = useState(false)

  const generateCaptcha = () => {
    const num1 = Math.floor(Math.random() * 10) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    setCaptcha({ q: `${num1} + ${num2} = ?`, a: num1 + num2 });
    setCaptchaInput('');
  }

  useEffect(() => {
    // 检查 URL 参数，如果是从“注册”按钮跳过来的，直接切换到注册面板
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('tab') === 'register') {
        setTimeout(() => setIsLogin(false), 0)
      }

      // 组件加载时，读取本地保存的账号标识
      const savedIdentifier = localStorage.getItem('login_remember_identifier')
      if (savedIdentifier) {
        setLoginIdentifier(savedIdentifier)
        setRememberMe(true)
      }
    }
  }, [])

  useEffect(() => {
    let timer: NodeJS.Timeout
    if (countdown > 0) {
      timer = setInterval(() => setCountdown(c => c - 1), 1000)
    }
    return () => clearInterval(timer)
  }, [countdown])

  const handleLoginSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (parseInt(captchaInput) !== captcha.a) {
      setErrorMsg('验证码计算错误！请重新计算')
      generateCaptcha()
      return
    }

    setLoading(true)
    setErrorMsg('')
    const formData = new FormData(e.currentTarget)
    
    // 附加记住我状态
    formData.set('remember', rememberMe ? 'true' : 'false')

    // 本地持久化记住账号逻辑 (仅在登录时决定是否记住)
    if (rememberMe) {
      localStorage.setItem('login_remember_identifier', loginIdentifier)
    } else {
      localStorage.removeItem('login_remember_identifier')
    }
    
    // 国密多重加密
    const password = formData.get('password') as string
    const encResult = encryptPayload(password)
    if (encResult) {
      formData.set('password', encResult.encryptedPassword)
      formData.append('sm_key', encResult.encryptedSm4Key)
      formData.append('encrypt_type', 'sm')
    }

    const res = await login(formData)
    if (res?.error) {
      setErrorMsg(res.error)
      setLoading(false)
      generateCaptcha()
    }
  }

  const handleRegisterSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')
    const formData = new FormData(e.currentTarget)
    const email = (formData.get('email') as string)?.trim()
    const username = (formData.get('username') as string)?.trim()
    const pass = formData.get('password') as string
    const confirm = formData.get('confirm-password') as string

    if (!email || !username || !pass) {
      setErrorMsg('请完整填写注册信息！')
      setLoading(false)
      return
    }

    if (pass !== confirm) {
      setErrorMsg('两次输入的密码不一致！')
      setLoading(false)
      return
    }

    // 缓存注册表单
    setRegForm({ username, email, password: pass, confirmPassword: confirm })

    // 触发发送邮箱验证码
    const { sendOtp } = await import('./actions')
    const res = await sendOtp(email, 'signup')
    if (res?.error) {
      setErrorMsg(res.error)
      setLoading(false)
    } else {
      setVerifyEmail(email)
      setLastSentEmail(email)
      setOtpType('signup')
      setCountdown(60)
      setLoading(false)
      const mockTip = res.mock_code ? ` (开发模式验证码: ${res.mock_code})` : ''
      toast.success((res.message || '验证码已发送至您的邮箱，请查收！') + mockTip, { id: 'auth-toast' })
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

    if (otpType === 'signup') {
      // 携带已缓存的注册表单与验证码提交真实注册
      const formData = new FormData()
      formData.set('email', regForm.email || verifyEmail)
      formData.set('username', regForm.username)
      formData.set('code', otpCode.trim())

      // 国密多重加密
      const encResult = encryptPayload(regForm.password)
      if (encResult) {
        formData.set('password', encResult.encryptedPassword)
        formData.append('sm_key', encResult.encryptedSm4Key)
        formData.append('encrypt_type', 'sm')
      } else {
        formData.set('password', regForm.password)
      }

      const res = await signup(formData)
      if (res?.error) {
        setErrorMsg(res.error)
        setLoading(false)
      }
    } else {
      const res = await verifyOtp(verifyEmail, otpCode.trim(), 'recovery')
      if (res?.error) {
        setErrorMsg(res.error)
        setLoading(false)
      } else if (res?.success && res.redirectUrl) {
        router.push(res.redirectUrl)
      }
    }
  }

  const handleResendOtp = async () => {
    if (countdown > 0) return
    setLoading(true)
    setErrorMsg('')
    const res = await resendOtp(verifyEmail, otpType)
    if (res?.error) {
      setErrorMsg(res.error)
      setLoading(false)
    } else {
      setCountdown(60)
      setLoading(false)
      toast.success('验证邮件已重新发送，请查收！', { id: 'auth-toast' })
    }
  }

  const handleForgotPasswordSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')
    const formData = new FormData(e.currentTarget)
    const email = formData.get('email') as string
    const res = await sendPasswordReset(email)
    if (res?.error) {
      setErrorMsg(res.error)
      setLoading(false)
    } else {
      setVerifyEmail(email)
      setOtpType('recovery')
      setCountdown(60)
      setLoading(false)
      toast.success('恢复验证码已发送至邮箱', { id: 'auth-toast' })
    }
  }

  return (
    <div className="auth-page w-full min-h-screen">
      <div className="auth-container">
        {/* Left Side Brand */}
        <div className="auth-brand-pane">
          <div className="brand-header">
            <div className="brand-logo-large">知</div>
            <div className="brand-title-text">知行笔记</div>
          </div>

          <div className="brand-quote-box">
            <p className="brand-quote">“ 纸上得来终觉浅，绝知此事要躬行。 ”</p>
            <span className="brand-quote-author">—— [宋] 陆游 《冬夜读书示子聿》</span>
          </div>

          <div className="brand-footer-features">
            <div className="feature-badge-row">
              <div className="feature-dot" style={{ backgroundColor: 'var(--neo-yellow)' }}></div>
              <span>以教促学，学以致知</span>
            </div>
            <div className="feature-badge-row">
              <div className="feature-dot" style={{ backgroundColor: 'var(--neo-pink)' }}></div>
              <span>行动清单，学以致用</span>
            </div>
            <div className="feature-badge-row">
              <div className="feature-dot" style={{ backgroundColor: 'var(--neo-green)' }}></div>
              <span>Microsoft MarkItDown 一键文档导入</span>
            </div>
          </div>
        </div>

        {/* Right Side Tabbed Forms */}
        <div className="auth-form-pane relative">
          
          {verifyEmail ? (
            <div className="verify-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center' }}>
               <h2 style={{ fontSize: '24px', fontWeight: 900, marginBottom: '16px' }}>验证您的邮箱</h2>
               <p style={{ marginBottom: '24px', color: '#666', lineHeight: 1.6, fontWeight: 500 }}>
                 我们已向 <strong>{verifyEmail}</strong> 发送了一封带有验证码的邮件。请输入您的验证码：
               </p>

               {errorMsg && (
                 <div className="auth-message error" style={{ display: 'block', marginBottom: '20px' }}>{errorMsg}</div>
               )}

               <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                   <label htmlFor="otp-input" style={{ fontSize: '14px', fontWeight: 'bold' }}>邮箱验证码</label>
                   <div className="input-wrapper">
                     <input 
                       id="otp-input"
                       type="text" 
                       className="neo-input" 
                       placeholder="输入验证码" 
                       value={otpCode}
                       onChange={e => setOtpCode(e.target.value)}
                       required 
                       autoComplete="off"
                       style={{ 
                         fontSize: '32px', 
                         letterSpacing: '8px', 
                         textAlign: 'center', 
                         fontWeight: 900,
                         padding: '20px'
                       }} 
                     />
                   </div>
                 </div>
                 
                 <button disabled={loading || !otpCode} type="submit" className="neo-btn info" style={{ backgroundColor: 'var(--neo-yellow)', height: '54px', fontSize: '18px', width: '100%' }}>
                   {loading ? '验证中…' : '完 成 验 证'}
                 </button>
               </form>

               <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px', fontSize: '14px', fontWeight: 700 }}>
                 <button 
                   type="button" 
                   onClick={() => { setVerifyEmail(''); setOtpCode(''); setErrorMsg(''); setOtpType('signup'); setIsForgotPassword(false); }}
                   style={{ background: 'none', border: 'none', color: 'var(--neo-blue)', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                 >
                   邮箱填错了? 退回修改
                 </button>
                 <button 
                   type="button" 
                   onClick={handleResendOtp}
                   disabled={countdown > 0 || loading}
                   style={{ background: 'none', border: 'none', color: countdown > 0 ? '#999' : '#000', cursor: countdown > 0 ? 'not-allowed' : 'pointer', textDecoration: 'underline', padding: 0 }}
                 >
                   {countdown > 0 ? `${countdown}秒后重新发送` : '重新发送验证码'}
                 </button>
               </div>
            </div>
          ) : isForgotPassword ? (
            <div className="form-panel active" key="forgot-panel">
              <h2 style={{ fontSize: '24px', fontWeight: 900, marginBottom: '16px' }}>找回密码</h2>
              <p style={{ marginBottom: '24px', color: '#666', lineHeight: 1.6, fontWeight: 500 }}>
                请输入您注册时使用的邮箱地址，我们将发送一封包含验证码的邮件。
              </p>

              {errorMsg && (
                <div className="auth-message error" style={{ display: 'block', marginBottom: '20px' }}>{errorMsg}</div>
              )}

              <form onSubmit={handleForgotPasswordSubmit}>
                <div className="form-group">
                  <label htmlFor="forgot-email">电子邮箱</label>
                  <div className="input-wrapper">
                    <svg className="input-icon" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" fill="none"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    <input type="email" name="email" id="forgot-email" className="neo-input auth-input" placeholder="输入邮箱地址…" required />
                  </div>
                </div>
                <button disabled={loading} type="submit" className="neo-btn info auth-submit-btn" style={{ marginBottom: '16px' }}>{loading ? '发送中…' : '发 送 验 证 码'}</button>
                <button type="button" onClick={() => setIsForgotPassword(false)} className="neo-btn" style={{ width: '100%', padding: '16px', background: 'var(--neo-white)' }}>返回登录</button>
              </form>
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="auth-tabs">
                <button className={`auth-tab ${isLogin ? 'active' : ''}`} onClick={() => { setIsLogin(true); setErrorMsg('') }}>账号登录</button>
                <button className={`auth-tab ${!isLogin ? 'active' : ''}`} onClick={() => { setIsLogin(false); setErrorMsg('') }}>快捷注册</button>
              </div>

          {/* Success/Error Messages */}
          {errorMsg && (
            <div className="auth-message error" style={{ display: 'block' }}>{errorMsg}</div>
          )}

          {/* Login Panel */}
          {isLogin ? (
            <div className="form-panel active" key="login-panel">
              <form onSubmit={handleLoginSubmit}>
                <div className="form-group">
                  <label htmlFor="login-identifier">用户名或邮箱</label>
                  <div className="input-wrapper">
                    <svg className="input-icon" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" fill="none"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    <input 
                      type="text" 
                      name="identifier" 
                      id="login-identifier" 
                      className="neo-input auth-input" 
                      placeholder="输入用户名或邮箱地址…" 
                      required 
                      value={loginIdentifier}
                      onChange={e => setLoginIdentifier(e.target.value)}
                      autoComplete="username"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="login-password">账户密码</label>
                  <div className="input-wrapper">
                    <svg className="input-icon" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    <input 
                      type="password" 
                      name="password" 
                      id="login-password" 
                      className="neo-input auth-input" 
                      placeholder="输入密码…" 
                      required 
                      autoComplete="current-password"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="login-captcha">验证码</label>
                  <div className="captcha-container" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <input id="login-captcha" type="text" value={captchaInput} onChange={e => setCaptchaInput(e.target.value)} className="neo-input" placeholder="?" style={{ width: '70px', textAlign: 'center', fontSize: '16px', padding: '10px', borderWidth: '3px', boxShadow: '3px 3px 0 var(--border-color)' }} required autoComplete="off" />
                    <div className="neo-card no-hover" style={{ flexGrow: 1, margin: 0, padding: '10px', textAlign: 'center', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 800, fontSize: '18px', backgroundColor: 'var(--neo-white)', borderWidth: '3px', boxShadow: '3px 3px 0 var(--border-color)', userSelect: 'none' }}>{captcha.q}</div>
                    <button type="button" aria-label="重新生成验证码" className="neo-btn" style={{ padding: '10px', boxShadow: '2px 2px 0 var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '44px', width: '44px' }} onClick={generateCaptcha}>
                      <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.5" fill="none"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                    </button>
                  </div>
                </div>

                <div className="form-options">
                  <label className="remember-me">
                    <input 
                      type="checkbox" 
                      id="login-remember" 
                      name="remember"
                      checked={rememberMe}
                      onChange={e => setRememberMe(e.target.checked)}
                    />
                    <span>记住我</span>
                  </label>
                  <button type="button" className="forgot-link" onClick={() => { setIsForgotPassword(true); setErrorMsg('') }} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer', color: 'var(--neo-blue)', textDecoration: 'underline' }}>忘记密码?</button>
                </div>

                <button disabled={loading} type="submit" className="neo-btn info auth-submit-btn">{loading ? '登录中…' : '登  录'}</button>
              </form>
            </div>
          ) : (
            <div className="form-panel active" key="reg-panel">
              <form onSubmit={handleRegisterSubmit}>
                <div className="form-group">
                  <label htmlFor="reg-username">用户昵称</label>
                  <div className="input-wrapper">
                    <svg className="input-icon" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" fill="none"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    <input type="text" name="username" id="reg-username" className="neo-input auth-input" placeholder="设定你的昵称…" required 
                           value={regForm.username} onChange={e => setRegForm({...regForm, username: e.target.value})} />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="reg-email">电子邮箱</label>
                  <div className="input-wrapper">
                    <svg className="input-icon" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" fill="none"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    <input type="email" name="email" id="reg-email" className="neo-input auth-input" placeholder="输入常用邮箱…" required 
                           value={regForm.email} onChange={e => setRegForm({...regForm, email: e.target.value})} />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="reg-password">账户密码</label>
                  <div className="input-wrapper">
                    <svg className="input-icon" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    <input type="password" name="password" id="reg-password" className="neo-input auth-input" placeholder="设定账户密码(至少6位)…" required minLength={6} 
                           value={regForm.password} onChange={e => setRegForm({...regForm, password: e.target.value})} />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="reg-confirm-password">确认密码</label>
                  <div className="input-wrapper">
                    <svg className="input-icon" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    <input type="password" name="confirm-password" id="reg-confirm-password" className="neo-input auth-input" placeholder="再次输入密码…" required minLength={6} 
                           value={regForm.confirmPassword} onChange={e => setRegForm({...regForm, confirmPassword: e.target.value})} />
                  </div>
                </div>

                <button disabled={loading} type="submit" className="neo-btn info auth-submit-btn" style={{ backgroundColor: 'var(--neo-blue)', color: '#fff', borderColor: 'var(--border-color)' }}>
                  {loading ? '注册中…' : '立即注册'}
                </button>
              </form>
            </div>
          )}
            </>
          )}

          {/* Bottom link */}
          <div className="social-auth-divider">或者</div>
          <Link href="/" className="back-home-link">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.5" fill="none"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            返回产品首页
          </Link>
        </div>
      </div>
    </div>
  )
}
