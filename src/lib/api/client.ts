/**
 * 知行笔记自建后端统一 API 客户端
 * 无依赖、轻量、支持浏览器与服务端双模式，自动携带 JWT 鉴权
 */

function getBrowserToken(): string | null {
  if (typeof window === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )access_token=([^;]+)'));
  if (match) return match[2];
  return localStorage.getItem('access_token');
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  
  // 注入 JWT Token
  if (!headers.has('Authorization')) {
    const token = getBrowserToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  // 默认 JSON 格式 (除非是 FormData)
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // 服务端调用补全绝对地址，浏览器调用使用相对地址
  let url = endpoint;
  if (typeof window === 'undefined' && !url.startsWith('http')) {
    const backendBase = process.env.BACKEND_URL || 'http://127.0.0.1:8000';
    url = `${backendBase}${endpoint}`;
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: options.credentials || 'include',
  });

  if (!res.ok) {
    let errMessage = `请求失败: ${res.status}`;
    try {
      const errData = await res.json();
      errMessage = errData.detail || errData.error || errMessage;
    } catch {
      const text = await res.text();
      if (text) errMessage = text;
    }
    throw new Error(errMessage);
  }

  // 处理可能为空的响应
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

// -------------------------------------------------------------
// 模块化业务 API 定义
// -------------------------------------------------------------

export const authApi = {
  sendOtp: (email: string, purpose: 'signup' | 'recovery' = 'signup') =>
    apiRequest('/api/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ email, purpose }),
    }),

  register: async (payload: { email: string; username: string; password: string; code: string }) => {
    const res = await apiRequest<{ success: boolean; token: string; user: any }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res?.token && typeof window !== 'undefined') {
      localStorage.setItem('access_token', res.token);
    }
    return res;
  },

  login: async (payload: { identifier: string; password: string; remember?: boolean }) => {
    const res = await apiRequest<{ success: boolean; token: string; user: any }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res?.token && typeof window !== 'undefined') {
      localStorage.setItem('access_token', res.token);
    }
    return res;
  },

  resetPassword: (payload: { email: string; code: string; new_password: string }) =>
    apiRequest('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  changeEmail: (new_email: string, password: string) =>
    apiRequest('/api/auth/email', {
      method: 'PUT',
      body: JSON.stringify({ new_email, password }),
    }),

  getMe: () => apiRequest<any>('/api/auth/me'),

  updateProfile: (payload: { username?: string; bio?: string; avatar_url?: string; preferences?: any }) =>
    apiRequest('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  getAIConfig: () => apiRequest<{ api_key: string; base_url: string; model: string }>('/api/auth/ai-config'),

  updateAIConfig: (payload: { api_key?: string; base_url?: string; model?: string }) =>
    apiRequest('/api/auth/ai-config', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  logout: async () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
    }
    return apiRequest('/api/auth/logout', {
      method: 'POST',
    });
  },
};

export const foldersApi = {
  list: () => apiRequest<any[]>('/api/folders'),
  create: (name: string, parent_id?: string | null) =>
    apiRequest<any>('/api/folders', {
      method: 'POST',
      body: JSON.stringify({ name, parent_id: parent_id || null }),
    }),
  update: (id: string, updates: { name?: string; parent_id?: string | null; is_pinned?: boolean; is_starred?: boolean }) =>
    apiRequest(`/api/folders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),
  delete: (id: string) =>
    apiRequest(`/api/folders/${id}`, {
      method: 'DELETE',
    }),
};

export const notesApi = {
  list: (folderId?: string) =>
    apiRequest<any[]>(folderId ? `/api/notes?folder_id=${encodeURIComponent(folderId)}` : '/api/notes'),
  get: (id: string) => apiRequest<any>(`/api/notes/${id}`),
  create: (payload: { title?: string; folder_id?: string | null; content?: string; type?: string; category?: string; tags?: string[]; is_public?: boolean }) =>
    apiRequest<any>('/api/notes', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  update: (id: string, updates: Record<string, any>) =>
    apiRequest(`/api/notes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),
  delete: (id: string) =>
    apiRequest(`/api/notes/${id}`, {
      method: 'DELETE',
    }),
};

export const actionsApi = {
  list: (noteId?: string) =>
    apiRequest<any[]>(noteId ? `/api/action-items?note_id=${encodeURIComponent(noteId)}` : '/api/action-items'),
  create: (payload: { note_id: string; content: string; priority?: string; due_date?: string | null }) =>
    apiRequest<any>('/api/action-items', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  update: (id: string, updates: { content?: string; is_completed?: boolean; priority?: string; due_date?: string | null }) =>
    apiRequest(`/api/action-items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),
  delete: (id: string) =>
    apiRequest(`/api/action-items/${id}`, {
      method: 'DELETE',
    }),
};

export const squareApi = {
  listNotes: (params?: { category?: string; tag?: string; search?: string }) => {
    const q = new URLSearchParams();
    if (params?.category) q.set('category', params.category);
    if (params?.tag) q.set('tag', params.tag);
    if (params?.search) q.set('search', params.search);
    const qs = q.toString();
    return apiRequest<any[]>(qs ? `/api/square/notes?${qs}` : '/api/square/notes');
  },
  toggleLike: (noteId: string) =>
    apiRequest<{ is_liked: boolean; likes_count: number }>(`/api/square/notes/${noteId}/like`, {
      method: 'POST',
    }),
  getComments: (noteId: string) =>
    apiRequest<any[]>(`/api/square/notes/${noteId}/comments`),
  createComment: (payload: { note_id: string; content: string; parent_id?: string | null; reply_to_user_id?: string | null }) =>
    apiRequest<{ id: string; success: boolean }>('/api/square/comments', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteComment: (commentId: string) =>
    apiRequest(`/api/square/comments/${commentId}`, {
      method: 'DELETE',
    }),
  togglePinComment: (commentId: string, is_pinned: boolean) =>
    apiRequest(`/api/square/comments/${commentId}/pin`, {
      method: 'PUT',
      body: JSON.stringify({ is_pinned }),
    }),
  toggleCommentLike: (commentId: string) =>
    apiRequest<{ is_liked: boolean; likes_count: number }>(`/api/square/comments/${commentId}/like`, {
      method: 'POST',
    }),
};

export const favoritesApi = {
  list: (tag?: string) =>
    apiRequest<any[]>(tag ? `/api/favorites?tag=${encodeURIComponent(tag)}` : '/api/favorites'),
  add: (noteId: string, payload?: { insights?: string; tags?: string[] }) =>
    apiRequest(`/api/favorites/${noteId}`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  update: (noteId: string, payload: { insights?: string; tags?: string[] }) =>
    apiRequest(`/api/favorites/${noteId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  remove: (noteId: string) =>
    apiRequest(`/api/favorites/${noteId}`, {
      method: 'DELETE',
    }),
};

export const storageApi = {
  upload: async (file: File, bucket: 'note_images' | 'converts' = 'note_images') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('bucket', bucket);
    return apiRequest<{ success: boolean; url: string; filename: string }>('/api/storage/upload', {
      method: 'POST',
      body: formData,
    });
  },
  getStats: () => apiRequest<{ count: number; total_size: number }>('/api/storage/stats'),
  clearConverts: () => apiRequest('/api/storage/clear-converts', { method: 'POST' }),
};

export const dashboardApi = {
  getStats: (headers?: Record<string, string>) =>
    apiRequest<any>('/api/dashboard/stats', { headers }),
};
