'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { updatePassword } from '@/app/login/actions'
import { sm2, sm4 } from 'sm-crypto'

const generateRandomHexKey = () => {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const encryptPayload = (password: string) => {
  const publicKey = process.env.NEXT_PUBLIC_SM2_PUBLIC_KEY || '';
  if (!publicKey) return null;
  const sm4Key = generateRandomHexKey();
  const encryptedPassword = sm4.encrypt(password, sm4Key);
  const encryptedSm4Key = sm2.doEncrypt(sm4Key, publicKey, 1);
  return { encryptedPassword, encryptedSm4Key };
}

export default function UpdatePasswordPage() {
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')
    const formData = new FormData(e.currentTarget)
    
    // 从 URL 提取 email 和 code
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('email')) formData.set('email', params.get('email')!)
      if (params.get('code')) formData.set('code', params.get('code')!)
    }

    const pass = formData.get('password') as string
    const confirm = formData.get('confirm-password') as string
    if (pass !== confirm) {
      setErrorMsg('两次输入的密码不一致！')
      setLoading(false)
      return
    }

    const encResult = encryptPayload(pass)
    if (encResult) {
      formData.set('password', encResult.encryptedPassword)
      formData.append('sm_key', encResult.encryptedSm4Key)
      formData.append('encrypt_type', 'sm')
    }

    const res = await updatePassword(formData)
    if (res?.error) {
      setErrorMsg(res.error)
      setLoading(false)
    } else {
      toast.success('密码修改成功，欢迎回来！')
    }
  }

  return (
    <div className="auth-page w-full min-h-screen" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div className="form-panel active" style={{ maxWidth: '500px', width: '100%', padding: '40px', backgroundColor: 'var(--neo-white)', border: '4px solid #000', boxShadow: '8px 8px 0 #000', borderRadius: '12px' }}>
        <h2 style={{ fontSize: '28px', fontWeight: 900, marginBottom: '16px' }}>设置新密码</h2>
        <p style={{ marginBottom: '24px', color: '#666', lineHeight: 1.6, fontWeight: 500 }}>
          您的身份已验证。请设置一个安全的新密码。
        </p>

        {errorMsg && (
          <div className="auth-message error" style={{ display: 'block', marginBottom: '20px' }}>{errorMsg}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="new-password">新密码</label>
            <div className="input-wrapper">
              <svg className="input-icon" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <input type="password" name="password" id="new-password" minLength={6} className="neo-input auth-input" placeholder="输入新密码 (至少6位)" required />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="confirm-password">确认新密码</label>
            <div className="input-wrapper">
              <svg className="input-icon" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <input type="password" name="confirm-password" id="confirm-password" minLength={6} className="neo-input auth-input" placeholder="再次输入新密码" required />
            </div>
          </div>
          <button disabled={loading} type="submit" className="neo-btn info auth-submit-btn" style={{ height: '54px', fontSize: '18px', backgroundColor: 'var(--neo-yellow)' }}>
            {loading ? '提 交 中...' : '保 存 并 登 录'}
          </button>
        </form>
      </div>
    </div>
  )
}
