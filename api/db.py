import sqlite3
import json
from contextlib import contextmanager
from datetime import datetime
from api.config import DB_PATH

def dict_factory(cursor, row):
    d = {}
    for idx, col in enumerate(cursor.description):
        d[col[0]] = row[idx]
    return d

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=20.0)
    conn.row_factory = dict_factory
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;") # 提升并发读写吞吐
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def init_db():
    with get_db() as conn:
        cursor = conn.cursor()
        
        # 1. 用户核心表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                is_active INTEGER DEFAULT 1,
                is_confirmed INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now', 'localtime')),
                updated_at TEXT DEFAULT (datetime('now', 'localtime'))
            )
        """)
        
        # 2. 邮箱验证码表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS email_verifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                code TEXT NOT NULL,
                purpose TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                used INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now', 'localtime'))
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_email_verif ON email_verifications(email, purpose, used);")

        # 3. 用户资料表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS profiles (
                user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                bio TEXT DEFAULT '',
                avatar_url TEXT DEFAULT '',
                preferences TEXT DEFAULT '{}',
                updated_at TEXT DEFAULT (datetime('now', 'localtime'))
            )
        """)

        # 4. 私有 AI 配置表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_ai_configs (
                user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                api_key TEXT DEFAULT '',
                base_url TEXT DEFAULT '',
                model TEXT DEFAULT '',
                updated_at TEXT DEFAULT (datetime('now', 'localtime'))
            )
        """)

        # 5. 文件夹表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS folders (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                is_pinned INTEGER DEFAULT 0,
                is_starred INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now', 'localtime'))
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_folders_user ON folders(user_id);")

        # 6. 笔记表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
                title TEXT DEFAULT '无标题笔记',
                content TEXT DEFAULT '',
                is_public INTEGER DEFAULT 0,
                is_pinned INTEGER DEFAULT 0,
                is_starred INTEGER DEFAULT 0,
                type TEXT DEFAULT 'regular',
                category TEXT DEFAULT '',
                tags TEXT DEFAULT '[]',
                created_at TEXT DEFAULT (datetime('now', 'localtime')),
                updated_at TEXT DEFAULT (datetime('now', 'localtime'))
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_notes_public ON notes(is_public);")

        # 7. 行动清单表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS action_items (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                is_completed INTEGER DEFAULT 0,
                priority TEXT DEFAULT 'P1',
                due_date TEXT,
                completed_at TEXT,
                created_at TEXT DEFAULT (datetime('now', 'localtime'))
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_actions_user ON action_items(user_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_actions_note ON action_items(note_id);")

        # 8. 评论表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS note_comments (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
                parent_id TEXT REFERENCES note_comments(id) ON DELETE CASCADE,
                reply_to_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
                content TEXT NOT NULL,
                is_pinned INTEGER DEFAULT 0,
                is_deleted INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now', 'localtime'))
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_comments_note ON note_comments(note_id);")

        # 9. 评论点赞与笔记点赞表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS comment_likes (
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                comment_id TEXT NOT NULL REFERENCES note_comments(id) ON DELETE CASCADE,
                created_at TEXT DEFAULT (datetime('now', 'localtime')),
                PRIMARY KEY (user_id, comment_id)
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS note_likes (
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
                created_at TEXT DEFAULT (datetime('now', 'localtime')),
                PRIMARY KEY (user_id, note_id)
            )
        """)

        # 10. 收藏与感悟表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS favorites (
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
                insights TEXT DEFAULT '',
                tags TEXT DEFAULT '[]',
                created_at TEXT DEFAULT (datetime('now', 'localtime')),
                PRIMARY KEY (user_id, note_id)
            )
        """)

        # 11. 每日 AI 调用频次限流表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_daily_usage (
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                usage_date TEXT NOT NULL,
                count INTEGER DEFAULT 0,
                PRIMARY KEY (user_id, usage_date)
            )
        """)
