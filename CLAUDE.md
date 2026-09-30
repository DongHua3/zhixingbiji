# CLAUDE.md

本文件为开发知行笔记 (ZhiXing Notes) 时的技术与工程规范指引。

## 项目概述

知行笔记 — 带有 AI 功能的新一代知识实践工作台。Next.js 16 (App Router) 前端 + Python FastAPI 自建统一全栈后端。
核心定位为“知行合一”：将知识沉淀与行动清单（Action Items）紧密闭环。

## 常用命令

```bash
npm run dev          # 同时启动 Next.js 前端 + FastAPI 后端 (开发环境端口 3000 & 8000)
npm run build        # Next.js 生产构建
npm run py:dev       # 仅启动 Python FastAPI 后端 (Uvicorn，端口 8000)
npm run lint         # ESLint 代码检查
```

## 架构

### 1. 统一后端 (Python FastAPI - `api/`)
彻底脱离 Supabase 依赖，自建独立后端全面接管所有业务：
- **用户认证与安全** (`api/security.py`, `api/routers/auth.py`)：
  - 基于标准 HS256 JWT (Cookie & Header 双轨凭证)
  - 密码使用 `PBKDF2-HMAC-SHA256` 随机加盐哈希（100,000 次安全迭代）
  - 支持国密 SM2/SM4 解密
- **SMTP 邮箱验证码系统** (`api/email_service.py`)：
  - 支持 QQ邮箱、163网易邮箱、企业邮箱、Gmail 发送带品牌样式的 HTML 验证码邮件
  - 内置 60 秒防刷限制与 10 分钟自动过期控制
  - 开发环境下自动启动模拟发信模式，控制台直显验证码
- **数据库持久化** (`api/db.py`)：
  - SQLite 单文件原生持久化 (`zhixing_data.db`)，启用 WAL 模式并发读写与外键保护
  - 包含 `users`, `email_verifications`, `profiles`, `user_ai_configs`, `folders`, `notes`, `action_items`, `note_comments`, `comment_likes`, `note_likes`, `favorites`, `user_daily_usage` 全部业务表
- **文件与对象存储** (`api/routers/storage.py`)：
  - 本地磁盘分片存储，静态挂载至 `/uploads/*`
- **文档解析与 AI 代理** (`api/index.py`)：
  - 微软 MarkItDown 文档提取与图片压缩
  - SSE 流式大模型对话代理，内置每日 200 次免费额度原子自增限流

### 2. 前端架构 (Next.js 16 App Router - `src/`)
- **统一 API 客户端** (`src/lib/api/client.ts`)：
  - 封装轻量 Fetch 客户端，自动携带 JWT 令牌
  - 包含 `authApi`, `foldersApi`, `notesApi`, `actionsApi`, `squareApi`, `favoritesApi`, `storageApi`, `dashboardApi`
- **中间件鉴权** (`src/proxy.ts`)：
  - Next.js 16 路由代理，微秒级校验本地 JWT Cookie，保护后台核心路由
- **路由结构**：
  - `/` — 落地页
  - `/login` — 登录与邮箱验证码注册面板
  - `/update-password` — 验证码重置密码页
  - `(main)/` 路由组 — 需认证页面：`dashboard`, `notes`, `favorites`, `square`, `convert`, `ai-settings`, `profile`, `settings`

### 3. 样式与设计系统
- Tailwind CSS 4
- Neo-Brutalism 设计系统，定义在 `src/app/globals.css` — 粗边框、硬阴影、明亮对比点缀

## 环境变量配置 (`.env.local`)

```env
# 邮件发信配置 (可选；未配置时自动进入本地控制台模拟模式)
SMTP_SERVER=smtp.qq.com
SMTP_PORT=465
SMTP_USER=your_email@qq.com
SMTP_PASS=your_smtp_authorization_code
SMTP_USE_SSL=true

# JWT 鉴权私钥 (建议在生产环境更换为随机字符串)
JWT_SECRET=your-random-jwt-secret-string

# AI 系统通道配置 (可选，提供默认 200 次共享模型服务)
SYSTEM_OPENAI_API_KEY=
SYSTEM_OPENAI_BASE_URL=
SYSTEM_OPENAI_MODEL=mimo-v2.5

# 国密解密私钥
SM2_PRIVATE_KEY=
```
