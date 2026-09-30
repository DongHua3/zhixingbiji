# 📖 知行笔记 (ZhiXing Notes)

<p align="center">
  <strong>新一代“知行合一”智能知识实践工作台</strong><br>
  将零散知识转化为肌肉记忆，打通「文档摄入 ➔ 结构沉淀 ➔ 行动闭环 ➔ 社区共鸣」全链路。
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16.2.9-black?style=flat-square&logo=next.js" alt="Next.js">
  <img src="https://img.shields.io/badge/React-19.2.4-61DAFB?style=flat-square&logo=react" alt="React">
  <img src="https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat-square&logo=fastapi" alt="FastAPI">
  <img src="https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python" alt="Python">
  <img src="https://img.shields.io/badge/TailwindCSS-v4-38B2AC?style=flat-square&logo=tailwind-css" alt="Tailwind">
  <img src="https://img.shields.io/badge/Database-SQLite%20(WAL)-003B57?style=flat-square&logo=sqlite" alt="SQLite">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License">
</p>

> *“知之真切笃实处即是行，行之明觉精察处即是知。” —— 王阳明*

---

## 💡 为什么选择知行笔记？

传统笔记工具往往沦为**“只囤不看、记完吃灰”**的资料仓库。知行笔记打破仓鼠式信息囤积，以**“行动闭环”**为第一核心设计理念：

1. **零外部云服务依赖**：完全自建全栈单体后端，数据本地原生持久化，私有化部署开箱即用。
2. **文档秒变结构化笔记**：微软 MarkItDown 内核 + 智能断行修复算法，支持 PDF、Word、PPT、Excel、ZIP 一键导入。
3. **行动待办深度闭环**：自动嗅探笔记中的行动任务（`- [ ]`），统一汇聚至「行动清单」看板，追踪实践转化率。
4. **原生自由邮箱验证码体系**：基于标准 SMTP，自由配置 QQ 邮箱、163 邮箱、企业邮或 Gmail 进行验证码注册与密码找回。
5. **新粗野主义 (Neo-Brutalism) 美学**：黑粗描边、硬质几何投影与高饱和明亮撞色，带来极高辨识度的交互质感。

---

## ✨ 核心特性

### 1. 🤖 AI 双轨制文档转换引擎
- **⚡ 快速标准转换**：基于本地离线管道毫秒级提取纯文本并排版，零 Token 消耗，适合常规文字文档。
- **👁️ AI 智能多模态转换**：集成大语言模型与 OCR 视觉识别，攻克扫描版 PDF、复杂表格与长截图信息提取。
- **📦 ZIP 压缩包还原**：自动解析并递归重建压缩包内的文件夹目录树，多文件批量导入无需逐个上传。

### 2. 📝 双模笔记编辑器 (WYSIWYG & Markdown)
- **所见即所得 (MDX)**：所见即所得富文本交互，支持表格、任务列表、代码高亮、多级标题与本地图片直接粘贴插入。
- **纯粹源码模式**：为极客打造的双栏实时对照预览，极速响应，支持行号联动滚动。
- **防丢落盘保护**：优化的平滑防抖算法，在切换笔记或关闭标签页的微秒间强制触发立即落盘，杜绝丢字丢修改。

### 3. 🎯 行动清单 (Action Items) 实践看板
- 在编辑笔记时随时输入待办语法 `- [ ] 待办内容`，系统自动同步提取至个人看板。
- 提供 **P1（紧急重磅）➔ P4（日常随笔）** 优先级标签与截止日期催办提醒。
- 动态统计「行动转化率」，让知识真正转化为实践成果。

### 4. 🌐 社区广场与知识共鸣 (Square & Favorites)
- **公开分享**：一键将自己的优质笔记公开发布至笔记广场。
- **互动闭环**：多级树状评论、作者置顶留言、点赞与一键克隆为个人笔记。
- **感悟收藏 (Insights)**：收藏他人的灵感结晶，并可沉淀自己专属的实践心得与检索标签。

### 5. 🛡️ 账号安全与邮件认证系统
- **标准 SMTP 邮箱验证**：内置 60 秒防刷拦截与 10 分钟单次有效过期机制，支持自由定制 HTML 邮件模板。
- **密码安全哈希**：采用 `PBKDF2-HMAC-SHA256` 随机加盐哈希（100,000 次安全迭代），安全级别等同于 bcrypt 且跨平台零编译依赖。
- **国密加固传输**：支持前端 SM2/SM4 动态混淆解密传输，全方位防范传输层中间人窃听。

---

## 🏛️ 系统架构

```
┌──────────────────────────────────────────────────────────────┐
│                  Next.js 16 前端 (App Router)                │
│  - 纯净 Neo-Brutalism 界面组件 (React 19)                    │
│  - 统一 API 客户端 (src/lib/api/client.ts)                   │
│  - 毫秒级本地 JWT 鉴权路由中间件 (src/proxy.ts)              │
└──────────────────────────────┬───────────────────────────────┘
                               │ 反向代理转发 (/api/* & /uploads/*)
┌──────────────────────────────▼───────────────────────────────┐
│               统一自建后端 (Python FastAPI 异步服务)          │
│                                                              │
│  ┌─────────────────┐ ┌──────────────────┐ ┌────────────────┐ │
│  │   Auth 鉴权中心  │ │   业务 CRUD API  │ │   本地存储服务  │ │
│  │ (JWT/SMTP 验证码)│ │ (笔记/清单/广场) │ │ (uploads/*)  │ │
│  └─────────────────┘ └──────────────────┘ └────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐  │
│  │             文档转换 (MarkItDown) & AI 伴写代理          │  │
│  │           (内置本地每日 200 次免费额度原子自增限流)     │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬───────────────────────────────┘
                               │ SQLite 原生持久化 (WAL 模式)
┌──────────────────────────────▼───────────────────────────────┐
│  数据库: ./zhixing_data.db                                    │
│  文件库: ./uploads/{note_images, converts}/                  │
└──────────────────────────────────────────────────────────────┘
```

---

## 🚀 极速上手与本地运行

项目已做到**零外部第三方云服务依赖**，本地两步即可完成全栈启动。

### 1. 准备环境
- **Node.js** >= 18.18.0 (推荐 v20 或 v22)
- **Python** >= 3.10

### 2. 获取代码与安装依赖
```bash
# 克隆仓库
git clone https://github.com/DongHua3/zhixingbiji.git
cd zhixingbiji

# 安装前端依赖
npm install

# 安装 Python 后端依赖
pip install -r requirements.txt
```

### 3. 配置环境变量 (可选)
复制或新建 `.env.local` 文件：
```bash
cp .env.example .env.local  # 或直接创建 .env.local
```

`.env.local` 核心参数说明：
```env
# ==========================================
# 1. 邮件验证码配置 (可选)
# 若留空，系统将自动进入「本地模拟模式」：控制台直接打印 6 位验证码，免配置畅爽测试
# ==========================================
SMTP_SERVER=smtp.qq.com
SMTP_PORT=465
SMTP_USER=your_email@qq.com
SMTP_PASS=your_smtp_authorization_code   # 邮箱后台生成的 16 位授权码
SMTP_USE_SSL=true

# ==========================================
# 2. JWT 鉴权私钥
# ==========================================
JWT_SECRET=zhixing-notes-secret-key-2026-safe-replace-it

# ==========================================
# 3. 系统 AI 通道配置 (可选)
# 为未配置个人 Key 的普通用户提供每日 200 次免费共享大模型通道
# ==========================================
SYSTEM_OPENAI_API_KEY=
SYSTEM_OPENAI_BASE_URL=
SYSTEM_OPENAI_MODEL=mimo-v2.5

# ==========================================
# 4. 国密解密私钥 (用于前端传输解密)
# ==========================================
SM2_PRIVATE_KEY=
```

### 4. 一键启动全栈开发服务
```bash
npm run dev
```
启动成功后：
- 🌐 前端工作台界面：`http://localhost:3000`
- ⚙️ 后端 API 接口与 Swagger 交互文档：`http://localhost:8000/api/py/docs`

---

## 📂 项目目录结构

```
zhixingbiji/
├── api/                        # 统一 FastAPI 自建后端
│   ├── config.py               # 环境变量、常量与目录配置
│   ├── db.py                   # SQLite 连接池、表初始化与事务
│   ├── security.py             # 密码散列 (PBKDF2) 与 JWT 鉴权
│   ├── email_service.py        # SMTP 邮件发信与定制 HTML 模板
│   ├── index.py                # 后端主服务入口与 AI / MarkItDown 代理
│   └── routers/                # 业务分模块 RESTful 路由
│       ├── auth.py             # 验证码发送、注册、登录、重置密码、个人信息
│       ├── notes.py            # 笔记增删改查、星标置顶、防抖落盘
│       ├── folders.py          # 文件夹无限层级树形管理、防死循环移动
│       ├── action_items.py     # 行动清单增删改查、状态切换
│       ├── square.py           # 社区广场公开聚合、点赞、树状评论
│       ├── favorites.py        # 个人收藏列表与感悟沉淀
│       ├── storage.py          # 本地文件上传与静态图片服务
│       └── dashboard.py        # 仪表盘数据单次聚合统计
├── uploads/                    # 本地文件存储目录 (图片与文档备份)
├── public/                     # 前端公共静态资源
├── src/                        # Next.js 16 前端工程源码
│   ├── app/                    # App Router 路由体系
│   │   ├── (main)/             # 后台认证页面组 (Dashboard, Notes, Square 等)
│   │   ├── login/              # 登录与邮箱验证码注册面板
│   │   ├── update-password/    # 密码找回重置页
│   │   └── page.tsx            # 官方产品落地页
│   ├── components/             # React 组件库
│   │   ├── layout/             # 导航栏、侧边栏、用户头像
│   │   └── notes/              # 笔记树、MDX 编辑器、源码编辑器、AI 伴写面板
│   ├── lib/                    # 工具函数与统一 API 客户端
│   │   └── api/client.ts       # 全局 Fetch 封装与模块化 API 调用
│   ├── proxy.ts                # Next.js 16 路由代理中间件 (本地 JWT 验签)
│   └── store/                  # Zustand 状态管理
├── package.json                # 前端依赖配置
└── requirements.txt            # Python 后端依赖配置
```

---

## 📜 常用命令速查

| 命令 | 描述 |
| :--- | :--- |
| `npm run dev` | 同时启动前端 Next.js (端口 3000) 与后端 FastAPI (端口 8000) |
| `npm run py:dev` | 单独启动 Python FastAPI 业务后端 (Uvicorn 模式) |
| `npm run build` | 构建 Next.js 生产环境静态优化包 |
| `npm run lint` | 执行前端 ESLint 代码规范静态检查 |

---

## 🤝 贡献与反馈

欢迎提交 Issue 或 Pull Request 共同改进知行笔记！
1. Fork 本仓库并新建分支：`git checkout -b feat/your-feature`
2. 提交您的修改：`git commit -m "feat: 添加某某特性"`
3. 推送分支至远程：`git push origin feat/your-feature`
4. 创建 Pull Request 即可。

---

## 📄 开源许可证

本项目采用 [MIT License](LICENSE) 开源许可证。
