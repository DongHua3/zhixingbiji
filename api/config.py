import os
from typing import Optional

# 根目录与配置目录
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_LOCAL_PATH = os.path.join(BASE_DIR, ".env.local")

# 自动从 .env.local 加载环境变量
if os.path.exists(ENV_LOCAL_PATH):
    with open(ENV_LOCAL_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, val = line.split("=", 1)
                os.environ[key.strip()] = val.strip().strip("'\"")

# JWT 鉴权配置
JWT_SECRET = os.environ.get("JWT_SECRET", "zhixing-notes-super-secret-jwt-key-2026-safe")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = 7

# 数据库与上传目录
DB_PATH = os.path.join(BASE_DIR, "zhixing_data.db")
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
NOTE_IMAGES_DIR = os.path.join(UPLOAD_DIR, "note_images")
CONVERTS_DIR = os.path.join(UPLOAD_DIR, "converts")

os.makedirs(NOTE_IMAGES_DIR, exist_ok=True)
os.makedirs(CONVERTS_DIR, exist_ok=True)

# 邮件 SMTP 配置 (支持 QQ邮箱、163邮箱、企业邮箱、Gmail等)
SMTP_SERVER: Optional[str] = os.environ.get("SMTP_SERVER", "")
SMTP_PORT: int = int(os.environ.get("SMTP_PORT", 465))
SMTP_USER: Optional[str] = os.environ.get("SMTP_USER", "")
SMTP_PASS: Optional[str] = os.environ.get("SMTP_PASS", "") # 邮箱授权码
SMTP_USE_SSL: bool = os.environ.get("SMTP_USE_SSL", "true").lower() in ("true", "1", "yes")

# AI 系统通道配置
SYSTEM_OPENAI_API_KEY = os.environ.get("SYSTEM_OPENAI_API_KEY")
SYSTEM_OPENAI_BASE_URL = os.environ.get("SYSTEM_OPENAI_BASE_URL")
SYSTEM_OPENAI_MODEL = os.environ.get("SYSTEM_OPENAI_MODEL", "mimo-v2.5")
DAILY_FREE_AI_LIMIT = int(os.environ.get("DAILY_FREE_AI_LIMIT", 200))
