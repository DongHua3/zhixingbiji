import { cache } from 'react';
import { cookies } from 'next/headers';

export const getCachedAuthUser = cache(async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value;
  if (!token) return { data: { user: null } };

  try {
    const backendBase = process.env.BACKEND_URL || 'http://127.0.0.1:8000';
    const res = await fetch(`${backendBase}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    if (!res.ok) return { data: { user: null } };
    const user = await res.json();
    return { data: { user } };
  } catch {
    return { data: { user: null } };
  }
});

export const getCachedUserProfile = cache(async (userId: string) => {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value;
  if (!token) return { data: null };

  try {
    const backendBase = process.env.BACKEND_URL || 'http://127.0.0.1:8000';
    const res = await fetch(`${backendBase}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    if (!res.ok) return { data: null };
    const me = await res.json();
    return {
      data: {
        username: me.username,
        avatar_url: me.avatar_url,
        preferences: me.preferences
      }
    };
  } catch {
    return { data: null };
  }
});
