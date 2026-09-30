'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { authApi, storageApi, actionsApi } from '@/lib/api/client';
import { toast } from 'sonner';
import { User, Award, BookOpen, CheckSquare, Mail, Edit3, Save, Lock, X, Camera } from 'lucide-react';
import { createPortal } from 'react-dom';

interface Badge {
  id: string;
  symbol: string;
  name: string;
  description: string;
  isUnlocked: boolean;
}

export default function ProfilePage() {
  const router = useRouter();

  // Email Modal states
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [verifyPassword, setVerifyPassword] = useState('');
  const [changingEmail, setChangingEmail] = useState(false);

  // Password Modal states
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [resetMode, setResetMode] = useState<'password' | 'otp'>('password');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);

  // Loading state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // User details
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('实干先锋');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [hoveringAvatar, setHoveringAvatar] = useState(false);

  // Stats
  const [notesCount, setNotesCount] = useState(0);
  const [completedActions, setCompletedActions] = useState(0);
  const [totalActions, setTotalActions] = useState(0);

  // Level & Role details (derived during render)
  const level = Math.min(10, Math.floor(notesCount / 5) + 1);

  const roleText = useMemo(() => {
    if (level >= 9) return '旷世奇才';
    if (level >= 6) return '知行合一';
    if (level >= 3) return '笃行不怠';
    return '初学乍练';
  }, [level]);

  // Badges (derived during render)
  const badges = useMemo<Badge[]>(() => {
    return [
      {
        id: 'first_note',
        symbol: '🌱',
        name: '初秀新芽',
        description: '成功创建 1 篇个人笔记',
        isUnlocked: notesCount >= 1
      },
      {
        id: 'note_expert',
        symbol: '📚',
        name: '笔记狂人',
        description: '累计创建 10 篇个人笔记',
        isUnlocked: notesCount >= 10
      },
      {
        id: 'action_pioneer',
        symbol: '⚡',
        name: '执行先锋',
        description: '累计勾选完成 3 个行动项',
        isUnlocked: completedActions >= 3
      },
      {
        id: 'master',
        symbol: '🏆',
        name: '知行大家',
        description: '完成 10 个行动项且笔记满 15 篇',
        isUnlocked: completedActions >= 10 && notesCount >= 15
      }
    ];
  }, [notesCount, completedActions]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowEmailModal(false);
        setShowPasswordModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleEmailModalKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      setShowEmailModal(false);
      return;
    }
    if (e.key === 'Tab') {
      const modal = e.currentTarget;
      const focusableElements = modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements.length === 0) return;
      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;
      
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement.focus();
          e.preventDefault();
        }
      }
    }
  };

  const handlePasswordModalKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      setShowPasswordModal(false);
      return;
    }
    if (e.key === 'Tab') {
      const modal = e.currentTarget;
      const focusableElements = modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements.length === 0) return;
      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;
      
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement.focus();
          e.preventDefault();
        }
      }
    }
  };

  useEffect(() => {
    async function loadProfile() {
      try {
        const [me, actions] = await Promise.all([
          authApi.getMe(),
          actionsApi.list()
        ]);

        if (!me) {
          toast.error('请先登录！');
          router.push('/login');
          return;
        }

        setUserId(me.id);
        setEmail(me.email || '');
        setUsername(me.username || '实干先锋');
        setBio(me.bio || '');
        setAvatarUrl(me.avatar_url || null);
        setNotesCount(me.notes_count || 0);

        if (actions) {
          setTotalActions(actions.length);
          setCompletedActions(actions.filter((a: any) => a.is_completed).length);
        }
      } catch (err) {
        console.error('Failed to load profile details:', err);
        router.push('/login');
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [router]);



  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !verifyPassword || !userId) return;
    setChangingEmail(true);
    const toastId = toast.loading('正在修改邮箱…');
    try {
      await authApi.changeEmail(newEmail.trim(), verifyPassword);
      toast.success('邮箱修改成功！', { id: toastId });
      setEmail(newEmail.trim());
      setShowEmailModal(false);
      setNewEmail('');
      setVerifyPassword('');
    } catch (err: any) {
      console.error(err);
      toast.error(`邮箱修改失败: ${err.message || '网络繁忙，请重试'}`, { id: toastId });
    } finally {
      setChangingEmail(false);
      setShowEmailModal(false);
    }
  };

  const handleSendOtp = async () => {
    if (otpSending) return;
    setOtpSending(true);
    const toastId = toast.loading('正在发送验证码…');
    try {
      const res = await authApi.sendOtp(email, 'recovery');
      const mockTip = res.mock_code ? ` (开发模式验证码: ${res.mock_code})` : '';
      toast.success((res.message || '重置验证码已发送至您的邮箱！') + mockTip, { id: toastId });
      setOtpSent(true);
    } catch (err: any) {
      toast.error(`发送验证码失败: ${err.message || '网络繁忙'}`, { id: toastId });
    } finally {
      setOtpSending(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('两次输入的新密码不一致！');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('新密码长度不能少于 6 位！');
      return;
    }

    setResettingPassword(true);
    const toastId = toast.loading('正在重置密码…');
    try {
      await authApi.resetPassword({
        email,
        code: otpCode.trim(),
        new_password: newPassword
      });

      toast.success('密码重置成功！', { id: toastId });
      setShowPasswordModal(false);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setOtpCode('');
      setOtpSent(false);
    } catch (err: any) {
      toast.error(`密码重置失败: ${err.message || '网络繁忙'}`, { id: toastId });
    } finally {
      setResettingPassword(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    setSaving(true);
    try {
      await authApi.updateProfile({
        username: username,
        bio: bio,
        avatar_url: avatarUrl || ''
      });

      toast.success('资料修改成功！');
      router.refresh();
    } catch (err: any) {
      console.error(err);
      toast.error(`保存失败: ${err.message || '网络繁忙，请重试'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    if (!file.type.startsWith('image/')) {
      toast.error('请选择有效的图片文件！');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('头像文件大小不能超过 2MB！');
      return;
    }

    setUploadingAvatar(true);
    const toastId = toast.loading('正在上传头像…');
    try {
      const res = await storageApi.upload(file, 'note_images');
      await authApi.updateProfile({ avatar_url: res.url });
      setAvatarUrl(res.url);
      toast.success('头像上传成功！', { id: toastId });
      router.refresh();
    } catch (err: any) {
      console.error(err);
      toast.error(`头像上传失败: ${err.message || '网络繁忙，请重试'}`, { id: toastId });
    } finally {
      setUploadingAvatar(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <div className="neo-card" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="animate-spin" style={{ width: '20px', height: '20px', border: '3px solid #000', borderTopColor: 'transparent', borderRadius: '50%' }} />
          <span style={{ fontWeight: 'bold' }}>正在努力加载个人资料…</span>
        </div>
      </div>
    );
  }

  const avatarChar = username.charAt(0).toUpperCase();
  const conversionRate = totalActions > 0 ? Math.round((completedActions / totalActions) * 100) : 0;

  return (
    <section id="user-profile" className="content-section active" style={{ padding: '24px', overflowY: 'auto', height: '100%' }}>
      {/* 顶部 Neo-Brutalism Profile Banner */}
      <div 
        className="neo-card" 
        style={{ 
          background: 'var(--neo-pink)', 
          color: 'black', 
          borderColor: '#000000',
          padding: '32px 24px', 
          borderRadius: '12px', 
          marginBottom: '24px',
          boxShadow: '6px 6px 0px 0px #000',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '24px'
        }}
      >
        {/* Giant Avatar Wrapper */}
        <div style={{ position: 'relative' }}>
          <button 
            type="button"
            aria-label="更换头像"
            style={{ 
              width: '96px', 
              height: '96px', 
              borderRadius: '50%', 
              background: 'var(--neo-blue)', 
              color: '#fff',
              border: '4px solid #000', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              fontSize: '36px',
              fontWeight: 'bold',
              boxShadow: '4px 4px 0px #000',
              overflow: 'hidden',
              cursor: uploadingAvatar ? 'not-allowed' : 'pointer',
              position: 'relative',
              padding: 0
            }}
            onClick={() => !uploadingAvatar && document.getElementById('avatar-file-input')?.click()}
            onMouseEnter={() => setHoveringAvatar(true)}
            onMouseLeave={() => setHoveringAvatar(false)}
            title="点击更换头像"
          >
            {avatarUrl ? (
              <Image src={avatarUrl} alt="头像" width={120} height={120} unoptimized style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              avatarChar
            )}
            
            {/* Hover Camera Icon overlay */}
            <div 
              className="avatar-overlay"
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,0.6)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: '11px',
                opacity: hoveringAvatar ? 1 : 0,
                transition: 'opacity 0.25s ease',
                gap: '4px'
              }}
            >
              <Camera size={18} style={{ color: '#fff' }} />
              <span style={{ fontWeight: 'bold', color: '#fff' }}>更换头像</span>
            </div>
          </button>
          
          <input 
            type="file" 
            id="avatar-file-input" 
            accept="image/*" 
            style={{ display: 'none' }} 
            onChange={handleAvatarUpload} 
            disabled={uploadingAvatar}
          />
        </div>
        
        {/* Title Details */}
        <div style={{ flexGrow: 1 }}>
          <h2 className="neo-title" style={{ fontSize: '28px', color: '#000', margin: 0 }}>
            {username}
          </h2>
          <p style={{ margin: '6px 0 0 0', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ background: '#000', color: '#fff', padding: '2px 10px', borderRadius: '6px', fontSize: '12px' }}>
              LV.{level}
            </span>
            <span style={{ textDecoration: 'underline', textDecorationThickness: '2px' }}>
              知行首领 / {roleText}
            </span>
          </p>
          {bio && (
            <p style={{ margin: '12px 0 0 0', fontSize: '13px', fontStyle: 'italic', color: '#333', maxWidth: '600px', fontWeight: 500 }}>
              “ {bio} ”
            </p>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px', marginBottom: '24px' }}>
        
        {/* Left Column: Form Info */}
        <div 
          className="neo-card" 
          style={{ 
            backgroundColor: 'var(--bg-card)', 
            borderRadius: '12px',
            boxShadow: '6px 6px 0px 0px #000'
          }}
        >
          <h3 className="neo-title" style={{ fontSize: '18px', borderBottom: '3px dashed #000', paddingBottom: '12px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <User size={20} /> 编辑基本资料
          </h3>
          
          <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Input Email (Readonly but changeable via button) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Mail size={12} /> 账号绑定邮箱 (可使用下方“修改邮箱”进行修改)
              </label>
              <input 
                type="text" 
                value={email} 
                disabled 
                style={{ 
                  padding: '10px 12px', 
                  border: '2.5px solid #000', 
                  borderRadius: '8px', 
                  backgroundColor: 'var(--bg-disabled)', 
                  color: 'var(--text-muted)',
                  cursor: 'not-allowed',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  boxShadow: 'inset 2px 2px 0px var(--border-color)'
                }}
              />
            </div>
            
            {/* Input Username */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label htmlFor="username-input" style={{ fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Edit3 size={12} /> 用户名
              </label>
              <input 
                id="username-input"
                name="username"
                autoComplete="username"
                type="text" 
                value={username} 
                onChange={(e) => setUsername(e.target.value)} 
                required
                maxLength={25}
                style={{ 
                  padding: '10px 12px', 
                  border: '2.5px solid #000', 
                  borderRadius: '8px', 
                  fontSize: '14px',
                  fontWeight: 'bold',
                  outline: 'none',
                  backgroundColor: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                  boxShadow: 'inset 2px 2px 0px var(--bg-disabled)'
                }}
              />
            </div>

            {/* Input Bio */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label htmlFor="bio-input" style={{ fontSize: '12px', fontWeight: 'bold' }}>
                📝 个人简介
              </label>
              <textarea 
                id="bio-input"
                name="bio"
                value={bio} 
                onChange={(e) => setBio(e.target.value)} 
                placeholder="写下一句代表您实干态度的话吧…"
                maxLength={150}
                style={{ 
                  padding: '12px', 
                  border: '2.5px solid #000', 
                  borderRadius: '8px', 
                  fontSize: '13px',
                  fontWeight: 'bold',
                  outline: 'none',
                  backgroundColor: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                  resize: 'vertical',
                  height: '80px',
                  boxShadow: 'inset 2px 2px 0px var(--bg-disabled)'
                }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '10px', alignItems: 'center' }}>
              <button 
                type="submit" 
                className="neo-btn neo-btn-primary" 
                disabled={saving}
                style={{ flex: '1 1 100%', padding: '12px' }}
              >
                <Save size={16} /> {saving ? '正在保存…' : '保存资料修改'}
              </button>
              
              <button 
                type="button" 
                className="neo-btn" 
                onClick={() => setShowEmailModal(true)}
                style={{ flex: '1 1 calc(50% - 6px)', padding: '12px', background: 'var(--bg-btn-secondary)', color: 'var(--text-primary)' }}
                title="修改邮箱"
              >
                <Mail size={16} /> 修改邮箱
              </button>

              <button 
                type="button" 
                className="neo-btn" 
                onClick={() => setShowPasswordModal(true)}
                style={{ flex: '1 1 calc(50% - 6px)', padding: '12px', background: 'var(--bg-btn-secondary)', color: 'var(--text-primary)' }}
                title="重置密码"
              >
                <Lock size={16} /> 重置密码
              </button>
            </div>
            
          </form>
        </div>

        {/* Right Column: Stats & Badge Wall */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Stats Summary */}
          <div 
            className="neo-card" 
            style={{ 
              backgroundColor: 'var(--bg-card)', 
              borderRadius: '12px',
              boxShadow: '6px 6px 0px 0px #000',
              marginBottom: 0
            }}
          >
            <h3 className="neo-title" style={{ fontSize: '18px', borderBottom: '3px dashed #000', paddingBottom: '12px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ⚡ 知行数据看板
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* Note Count */}
              <div style={{ border: '2.5px solid #000', background: 'var(--neo-yellow)', padding: '16px', borderRadius: '8px', boxShadow: '3px 3px 0 #000' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 'bold' }}>
                  <BookOpen size={14} /> 知识沉淀池
                </div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', marginTop: '8px' }}>
                  {notesCount} <span style={{ fontSize: '13px', fontWeight: 800 }}>篇笔记</span>
                </div>
              </div>
              
              {/* Action Item Completion */}
              <div style={{ border: '2.5px solid #000', background: 'var(--neo-blue)', color: 'white', padding: '16px', borderRadius: '8px', boxShadow: '3px 3px 0 #000' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 'bold' }}>
                  <CheckSquare size={14} /> 行动转化率
                </div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', marginTop: '8px' }}>
                  {conversionRate}%
                </div>
                <div style={{ fontSize: '11px', opacity: 0.9, marginTop: '2px', fontWeight: 'bold' }}>
                  已完成 {completedActions} / {totalActions} 项
                </div>
              </div>
            </div>
          </div>

          {/* Badge Wall Container */}
          <div 
            className="neo-card" 
            style={{ 
              backgroundColor: 'var(--bg-card)', 
              borderRadius: '12px',
              boxShadow: '6px 6px 0px 0px #000',
              flexGrow: 1,
              marginBottom: 0
            }}
          >
            <h3 className="neo-title" style={{ fontSize: '18px', borderBottom: '3px dashed #000', paddingBottom: '12px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Award size={20} /> 成就勋章墙
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {badges.map(badge => (
                <div 
                  key={badge.id} 
                  className="neo-card-sub"
                  style={{ 
                    border: '2.5px solid #000', 
                    borderRadius: '8px', 
                    padding: '12px', 
                    backgroundColor: badge.isUnlocked ? 'var(--bg-badge-unlocked)' : 'var(--bg-badge-locked)', 
                    color: 'var(--text-primary)',
                    opacity: badge.isUnlocked ? 1 : 0.6,
                    boxShadow: badge.isUnlocked ? '3px 3px 0px #000' : 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ fontSize: '32px', filter: badge.isUnlocked ? 'none' : 'grayscale(100%)', marginBottom: '6px' }}>
                    {badge.symbol}
                  </div>
                  <div style={{ fontWeight: 'bold', fontSize: '13px', textDecoration: badge.isUnlocked ? 'none' : 'line-through' }}>
                    {badge.name}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', fontWeight: 600 }}>
                    {badge.description}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

      {/* 1. 修改绑定邮箱弹窗 */}
      {showEmailModal && typeof document !== 'undefined' && createPortal(
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(2px)' }} onClick={() => setShowEmailModal(false)}>
          <div 
            style={{ background: 'var(--neo-white)', border: '3px solid #000', width: '380px', padding: '24px', borderRadius: '12px', boxShadow: '6px 6px 0px 0px #000' }} 
            onClick={e => e.stopPropagation()}
            onKeyDown={handleEmailModalKeyDown}
            role="dialog"
            aria-modal="true"
            aria-labelledby="email-modal-title"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '3.5px dashed #000', paddingBottom: '12px' }}>
              <h3 id="email-modal-title" className="neo-title" style={{ fontSize: '18px', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}><Mail size={20} /> 修改绑定邮箱</h3>
              <button type="button" aria-label="关闭" className="neo-btn" style={{ padding: '4px 8px', fontSize: '12px', background: 'var(--neo-pink)' }} onClick={() => setShowEmailModal(false)}><X size={14} /></button>
            </div>
            
            <form onSubmit={handleChangeEmail} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label htmlFor="email-new-email" style={{ fontSize: '12px', fontWeight: 'bold' }}>新邮箱地址</label>
                <input 
                  id="email-new-email"
                  type="email" 
                  className="neo-input" 
                  value={newEmail} 
                  onChange={e => setNewEmail(e.target.value)} 
                  placeholder="example@email.com" 
                  required 
                  autoFocus
                />
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label htmlFor="email-verify-password" style={{ fontSize: '12px', fontWeight: 'bold' }}>当前密码验证</label>
                <input 
                  id="email-verify-password"
                  type="password" 
                  className="neo-input" 
                  value={verifyPassword} 
                  onChange={e => setVerifyPassword(e.target.value)} 
                  placeholder="请输入当前密码以验证身份" 
                  required 
                />
              </div>
              
              <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                <button type="submit" className="neo-btn neo-btn-primary" style={{ flexGrow: 1, padding: '10px' }} disabled={changingEmail}>
                  {changingEmail ? '正在修改…' : '确认修改'}
                </button>
                <button type="button" className="neo-btn" style={{ padding: '10px', background: 'var(--bg-btn-secondary)', color: 'var(--text-primary)' }} onClick={() => setShowEmailModal(false)}>
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* 2. 重置密码弹窗 */}
      {showPasswordModal && typeof document !== 'undefined' && createPortal(
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(2px)' }} onClick={() => setShowPasswordModal(false)}>
          <div 
            style={{ background: 'var(--neo-white)', border: '3px solid #000', width: '400px', padding: '24px', borderRadius: '12px', boxShadow: '6px 6px 0px 0px #000' }} 
            onClick={e => e.stopPropagation()}
            onKeyDown={handlePasswordModalKeyDown}
            role="dialog"
            aria-modal="true"
            aria-labelledby="password-modal-title"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '3.5px dashed #000', paddingBottom: '12px' }}>
              <h3 id="password-modal-title" className="neo-title" style={{ fontSize: '18px', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}><Lock size={20} /> 重置账户密码</h3>
              <button type="button" aria-label="关闭" className="neo-btn" style={{ padding: '4px 8px', fontSize: '12px', background: 'var(--neo-pink)' }} onClick={() => setShowPasswordModal(false)}><X size={14} /></button>
            </div>

            {/* Modes switch */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button 
                type="button" 
                className="neo-btn" 
                onClick={() => setResetMode('password')}
                autoFocus
                style={{ 
                  flex: 1, 
                  padding: '6px 12px', 
                  fontSize: '11px',
                  backgroundColor: resetMode === 'password' ? 'var(--neo-yellow)' : 'var(--bg-btn-secondary)',
                  color: resetMode === 'password' ? '#000000' : 'var(--text-primary)',
                  boxShadow: resetMode === 'password' ? '2px 2px 0 #000' : 'none'
                }}
              >
                原密码验证
              </button>
              <button 
                type="button" 
                className="neo-btn" 
                onClick={() => setResetMode('otp')}
                style={{ 
                  flex: 1, 
                  padding: '6px 12px', 
                  fontSize: '11px',
                  backgroundColor: resetMode === 'otp' ? 'var(--neo-yellow)' : 'var(--bg-btn-secondary)',
                  color: resetMode === 'otp' ? '#000000' : 'var(--text-primary)',
                  boxShadow: resetMode === 'otp' ? '2px 2px 0 #000' : 'none'
                }}
              >
                邮箱验证码
              </button>
            </div>
            
            <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {resetMode === 'password' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label htmlFor="pass-old-password" style={{ fontSize: '12px', fontWeight: 'bold' }}>原密码</label>
                  <input 
                    id="pass-old-password"
                    type="password" 
                    className="neo-input" 
                    value={oldPassword} 
                    onChange={e => setOldPassword(e.target.value)} 
                    placeholder="请输入原始密码" 
                    required 
                  />
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label htmlFor="pass-otp-code" style={{ fontSize: '12px', fontWeight: 'bold' }}>邮箱验证码</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input 
                      id="pass-otp-code"
                      type="text" 
                      className="neo-input" 
                      value={otpCode} 
                      onChange={e => setOtpCode(e.target.value)} 
                      placeholder="请输入收到的 6 位验证码" 
                      style={{ flexGrow: 1 }}
                      required={resetMode === 'otp'}
                    />
                    <button 
                      type="button" 
                      className="neo-btn"
                      onClick={handleSendOtp} 
                      disabled={otpSending}
                      style={{ fontSize: '11px', whiteSpace: 'nowrap', padding: '10px' }}
                    >
                      {otpSending ? '发送中…' : otpSent ? '重新发送' : '获取验证码'}
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label htmlFor="pass-new-password" style={{ fontSize: '12px', fontWeight: 'bold' }}>新密码</label>
                <input 
                  id="pass-new-password"
                  type="password" 
                  className="neo-input" 
                  value={newPassword} 
                  onChange={e => setNewPassword(e.target.value)} 
                  placeholder="最少 6 位新密码" 
                  required 
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label htmlFor="pass-confirm-password" style={{ fontSize: '12px', fontWeight: 'bold' }}>确认新密码</label>
                <input 
                  id="pass-confirm-password"
                  type="password" 
                  className="neo-input" 
                  value={confirmPassword} 
                  onChange={e => setConfirmPassword(e.target.value)} 
                  placeholder="再次输入新密码" 
                  required 
                />
              </div>
              
              <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                <button type="submit" className="neo-btn neo-btn-primary" style={{ flexGrow: 1, padding: '10px' }} disabled={resettingPassword}>
                  {resettingPassword ? '正在重置…' : '确认重置'}
                </button>
                <button type="button" className="neo-btn" style={{ padding: '10px', background: 'var(--bg-btn-secondary)', color: 'var(--text-primary)' }} onClick={() => setShowPasswordModal(false)}>
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}
