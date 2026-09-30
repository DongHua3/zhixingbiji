'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { authApi } from '@/lib/api/client'
import { sm2, sm4 } from 'sm-crypto'

function decryptPayload(formData: FormData): string {
  let password = formData.get('password') as string;
  const encryptType = formData.get('encrypt_type') as string;
  
  if (encryptType === 'sm') {
    try {
      const sm4KeyEncrypted = formData.get('sm_key') as string;
      const privateKey = process.env.SM2_PRIVATE_KEY || '';
      
      // 1. SM2 私钥解密出 SM4 的动态密钥 (模式1：C1C3C2)
      const sm4Key = sm2.doDecrypt(sm4KeyEncrypted, privateKey, 1);
      
      // 2. SM4 动态密钥解密出真实的明文密码
      password = sm4.decrypt(password, sm4Key);
    } catch (err) {
      console.error('密码解密异常，回退使用原始密码:', err);
    }
  }
  return password;
}

export async function login(formData: FormData) {
  const remember = formData.get('remember') === 'true';
  const identifier = (formData.get('identifier') || formData.get('email')) as string;
  const password = decryptPayload(formData);

  if (!identifier) {
    return { error: '请输入邮箱或用户名！' };
  }
  if (!password) {
    return { error: '请输入密码！' };
  }

  try {
    const res = await authApi.login({
      identifier,
      password,
      remember
    });

    const cookieStore = await cookies();
    cookieStore.set('access_token', res.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: remember ? 7 * 86400 : undefined
    });
  } catch (err: any) {
    return { error: err.message || '登录失败，请核对账号密码' };
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

export async function sendOtp(email: string, purpose: 'signup' | 'recovery' = 'signup') {
  if (!email || !email.includes('@')) {
    return { error: '请输入有效的邮箱地址！' };
  }
  try {
    const res = await authApi.sendOtp(email, purpose);
    return { 
      success: true, 
      message: res.message || '验证码已发送，请查收邮箱！',
      mock_code: res.mock_code 
    };
  } catch (err: any) {
    return { error: err.message || '发送验证码失败，请稍后再试' };
  }
}

export async function signup(formData: FormData) {
  const email = (formData.get('email') as string)?.trim();
  const username = (formData.get('username') as string)?.trim();
  const password = decryptPayload(formData);
  const code = (formData.get('code') as string)?.trim();

  if (!email || !username || !password || !code) {
    return { error: '请完整填写注册信息与邮箱验证码！' };
  }

  try {
    const res = await authApi.register({
      email,
      username,
      password,
      code
    });

    const cookieStore = await cookies();
    cookieStore.set('access_token', res.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 86400
    });
  } catch (err: any) {
    return { error: err.message || '注册失败，请核对信息' };
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

export async function verifyOtp(email: string, token: string, type: 'signup' | 'recovery' = 'signup') {
  if (type === 'recovery') {
    return { success: true, redirectUrl: `/update-password?email=${encodeURIComponent(email)}&code=${encodeURIComponent(token)}` };
  }
  return { success: true };
}

export async function resendOtp(email: string, type: 'signup' | 'recovery' = 'signup') {
  return sendOtp(email, type);
}

export async function sendPasswordReset(email: string) {
  return sendOtp(email, 'recovery');
}

export async function updatePassword(formData: FormData) {
  const email = (formData.get('email') as string)?.trim();
  const code = (formData.get('code') as string)?.trim();
  const newPassword = decryptPayload(formData);

  if (!email || !code || !newPassword) {
    return { error: '缺少必要的重置参数，请重新从重置邮件或表单进入！' };
  }

  try {
    await authApi.resetPassword({
      email,
      code,
      new_password: newPassword
    });
  } catch (err: any) {
    return { error: err.message || '重置密码失败，请核对验证码' };
  }

  revalidatePath('/', 'layout');
  redirect('/login');
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete('access_token');
  revalidatePath('/', 'layout');
  redirect('/login');
}
