-- 知行笔记 (ZhiXing Notes) 一键初始化数据库完整 SQL 脚本
-- 包含了全部业务数据表、外键依赖、触发器、索引、公开存储桶以及高并发原子限流函数。
-- 请将以下 SQL 复制到 Supabase 的 SQL Editor 中执行。

-- ==========================================
-- 1. 用户信息表 (profiles) & 自动同步触发器
-- ==========================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL PRIMARY KEY,
    username TEXT,
    avatar_url TEXT,
    bio TEXT DEFAULT '',
    preferences JSONB DEFAULT '{
      "theme": "system",
      "font_family": "sans",
      "editor_autosave_interval": 3000,
      "default_sidebar_open": true
    }'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 启用行级安全 (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 创建策略：用户只读所有人资料，但只能修改自己的
CREATE POLICY "Anyone can view profiles"
ON public.profiles FOR SELECT
USING (true);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = id);

-- 自动在新建 auth.users 时插入 profile 行的触发器
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, avatar_url)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ==========================================
-- 2. 文件夹表 (folders)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.folders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    parent_id UUID REFERENCES public.folders(id) ON DELETE CASCADE,
    is_pinned BOOLEAN DEFAULT FALSE,
    is_starred BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 启用行级安全 (RLS)
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

-- 创建策略：用户只能对自己的文件夹进行 CRUD
CREATE POLICY "Users can manage their own folders"
ON public.folders FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);


-- ==========================================
-- 3. 笔记表 (notes)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.notes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL,
    title TEXT NOT NULL DEFAULT '无标题笔记',
    content TEXT DEFAULT '',
    is_public BOOLEAN DEFAULT FALSE,
    is_pinned BOOLEAN DEFAULT FALSE,
    is_starred BOOLEAN DEFAULT FALSE,
    type VARCHAR(20) DEFAULT 'regular',
    category TEXT,
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 启用行级安全 (RLS)
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- 创建策略：用户只能管理自己的笔记，所有人可以查看公开的笔记
CREATE POLICY "Users can manage their own notes"
ON public.notes FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Anyone can view public notes"
ON public.notes FOR SELECT
USING (is_public = TRUE);


-- ==========================================
-- 4. 行动清单表 (action_items)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.action_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    note_id UUID REFERENCES public.notes(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    is_completed BOOLEAN DEFAULT FALSE,
    due_date DATE,
    priority TEXT DEFAULT 'P1',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- 启用行级安全 (RLS)
ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;

-- 创建策略：用户只能管理自己的行动清单
CREATE POLICY "Users can manage their own action items"
ON public.action_items FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);


-- ==========================================
-- 5. 触发器：自动更新 updated_at
-- ==========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为笔记表添加触发器
DROP TRIGGER IF EXISTS update_notes_updated_at ON public.notes;
CREATE TRIGGER update_notes_updated_at
    BEFORE UPDATE ON public.notes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ==========================================
-- 6. 评论与回复表 (note_comments)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.note_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    note_id UUID REFERENCES public.notes(id) ON DELETE CASCADE NOT NULL,
    parent_id UUID REFERENCES public.note_comments(id) ON DELETE CASCADE,
    reply_to_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_deleted BOOLEAN DEFAULT FALSE,
    is_pinned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 启用行级安全 (RLS)
ALTER TABLE public.note_comments ENABLE ROW LEVEL SECURITY;

-- 创建策略
CREATE POLICY "Anyone can view comments of public notes"
ON public.note_comments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.notes 
    WHERE notes.id = note_comments.note_id AND notes.is_public = TRUE
  )
);

CREATE POLICY "Authenticated users can post comments"
ON public.note_comments FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Comment authors can update or delete their own comments"
ON public.note_comments FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Note owners can delete comments on their notes"
ON public.note_comments FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.notes
    WHERE notes.id = note_comments.note_id AND notes.user_id = auth.uid()
  )
);

CREATE POLICY "Note owners can update pin status on their notes"
ON public.note_comments FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.notes
    WHERE notes.id = note_comments.note_id AND notes.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.notes
    WHERE notes.id = note_comments.note_id AND notes.user_id = auth.uid()
  )
);


-- ==========================================
-- 7. 评论点赞表 (comment_likes)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.comment_likes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    comment_id UUID REFERENCES public.note_comments(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, comment_id)
);

-- 启用行级安全 (RLS)
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view comment likes"
ON public.comment_likes FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can manage their own comment likes"
ON public.comment_likes FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 创建索引以加速查询
CREATE INDEX IF NOT EXISTS idx_comments_note_id ON public.note_comments(note_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON public.note_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comment_likes_comment_id ON public.comment_likes(comment_id);


-- ==========================================
-- 7.5. 笔记点赞表 (note_likes)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.note_likes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    note_id UUID REFERENCES public.notes(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, note_id)
);

-- 启用行级安全 (RLS)
ALTER TABLE public.note_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view note likes"
ON public.note_likes FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can manage their own note likes"
ON public.note_likes FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_note_likes_note_id ON public.note_likes(note_id);


-- ==========================================
-- 8. 收藏与感悟表 (favorites)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.favorites (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    note_id UUID REFERENCES public.notes(id) ON DELETE CASCADE NOT NULL,
    insights TEXT DEFAULT '',
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, note_id)
);

-- 启用行级安全 (RLS)
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own favorites"
ON public.favorites FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON public.favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_note_id ON public.favorites(note_id);


-- ==========================================
-- 9. 存储桶自动创建 & 安全策略（包括图片和转换）
-- ==========================================

-- 9.1 创建 converts 存储桶 (静态转换结果)
INSERT INTO storage.buckets (id, name, public)
VALUES ('converts', 'converts', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Allow authenticated users to upload converts"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'converts');

CREATE POLICY "Allow authenticated users to select converts"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'converts');

-- 9.2 创建 note_images 存储桶 (笔记里的插图，必须公开读取才能渲染)
INSERT INTO storage.buckets (id, name, public)
VALUES ('note_images', 'note_images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Allow authenticated users to upload note_images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'note_images');

CREATE POLICY "Allow anyone to select note_images"
ON storage.objects FOR SELECT
USING (bucket_id = 'note_images');


-- ==========================================
-- 10. 用户每日 AI 频次限流表 (user_daily_usage) & 原子自增函数
-- ==========================================
CREATE TABLE IF NOT EXISTS public.user_daily_usage (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, usage_date)
);

-- 启用行级安全 (RLS)
ALTER TABLE public.user_daily_usage ENABLE ROW LEVEL SECURITY;

-- 创建安全策略：普通用户只读自己的限流计数，禁止前端直接修改，防止限流被绕过
CREATE POLICY "Users can view own daily usage" 
ON public.user_daily_usage FOR SELECT 
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_daily_usage_date ON public.user_daily_usage(usage_date);

-- 创建原子级限流自增函数 (RPC)，防止并发竞态漏洞，由后端代理调用
CREATE OR REPLACE FUNCTION public.increment_user_daily_usage(
  p_user_id UUID,
  p_limit INT
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_count INT;
BEGIN
  INSERT INTO public.user_daily_usage (user_id, usage_date, count)
  VALUES (p_user_id, v_today, 0)
  ON CONFLICT (user_id, usage_date) DO NOTHING;

  UPDATE public.user_daily_usage
  SET count = count + 1
  WHERE user_id = p_user_id AND usage_date = v_today AND count < p_limit
  RETURNING count INTO v_count;

  IF FOUND THEN
    RETURN v_count;
  ELSE
    RETURN -1;
  END IF;
END;
$$;


-- ==========================================
-- 11. 支持用户名和邮箱登录的 RPC 函数
-- ==========================================
CREATE OR REPLACE FUNCTION public.get_email_by_username(p_username TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_email TEXT;
BEGIN
  SELECT u.email INTO v_email
  FROM auth.users u
  JOIN public.profiles p ON u.id = p.id
  WHERE p.username = p_username
  LIMIT 1;
  
  RETURN v_email;
END;
$$;

-- 收紧 get_email_by_username 权限，防止匿名恶意枚举用户真实邮箱
REVOKE EXECUTE ON FUNCTION public.get_email_by_username(TEXT) FROM public;
REVOKE EXECUTE ON FUNCTION public.get_email_by_username(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_email_by_username(TEXT) TO authenticated, service_role;


-- ==========================================
-- 12. 检查用户激活与注册状态的 RPC 函数
-- ==========================================
CREATE OR REPLACE FUNCTION public.check_user_status(p_email TEXT)
RETURNS TABLE(exists_in_auth BOOLEAN, is_confirmed BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    TRUE AS exists_in_auth,
    (u.confirmed_at IS NOT NULL) AS is_confirmed
  FROM auth.users u
  WHERE lower(u.email) = lower(p_email)
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_user_status(TEXT) TO anon, authenticated, service_role;


-- ==========================================
-- 13. 用户私有 AI 配置表 (user_ai_configs) & 安全隔离
-- ==========================================
CREATE TABLE IF NOT EXISTS public.user_ai_configs (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    api_key TEXT DEFAULT '',
    base_url TEXT DEFAULT '',
    model TEXT DEFAULT '',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 启用行级安全 (RLS)，完全隔离敏感 API Key，禁止任何跨用户及匿名读取
ALTER TABLE public.user_ai_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own ai configs"
ON public.user_ai_configs FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 数据平滑迁移：将现有 profiles.preferences 中的 AI 密钥迁移至独立私密表中
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'preferences'
  ) THEN
    INSERT INTO public.user_ai_configs (user_id, api_key, base_url, model)
    SELECT 
        id,
        COALESCE(preferences->>'openai_api_key', ''),
        COALESCE(preferences->>'openai_base_url', ''),
        COALESCE(preferences->>'openai_model', '')
    FROM public.profiles
    WHERE preferences ? 'openai_api_key'
    ON CONFLICT (user_id) DO UPDATE SET
        api_key = EXCLUDED.api_key,
        base_url = EXCLUDED.base_url,
        model = EXCLUDED.model;

    -- 清理 profiles 中公开的敏感配置
    UPDATE public.profiles
    SET preferences = preferences - 'openai_api_key' - 'openai_base_url' - 'openai_model';
  END IF;
END $$;


