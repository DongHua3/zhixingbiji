from datetime import datetime, timedelta
from fastapi import APIRouter, Depends
from api.db import get_db
from api.security import get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["仪表盘统计"])

@router.get("/stats")
async def get_dashboard_stats(user: dict = Depends(get_current_user)):
    """获取仪表盘核心汇总数据（一次性返回，避免前端瀑布流）"""
    seven_days_ago = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d %H:%M:%S')

    with get_db() as conn:
        cursor = conn.cursor()
        
        # 1. 知识沉淀池总数
        cursor.execute("SELECT COUNT(*) as cnt FROM notes WHERE user_id = ?", (user["id"],))
        total_notes = cursor.fetchone()["cnt"]

        # 2. 本周新增笔记数
        cursor.execute("SELECT COUNT(*) as cnt FROM notes WHERE user_id = ? AND created_at >= ?", (user["id"], seven_days_ago))
        weekly_notes = cursor.fetchone()["cnt"]

        # 3. 行动清单统计
        cursor.execute("SELECT is_completed FROM action_items WHERE user_id = ?", (user["id"],))
        actions = cursor.fetchall()
        total_actions = len(actions)
        completed_actions = sum(1 for a in actions if a["is_completed"])

        # 4. 待办催办提醒 (未完成)
        cursor.execute(
            """
            SELECT a.id, a.content, a.note_id, a.due_date, a.priority, n.title as note_title
            FROM action_items a
            LEFT JOIN notes n ON a.note_id = n.id
            WHERE a.user_id = ? AND a.is_completed = 0
            ORDER BY a.created_at DESC
            LIMIT 10
            """,
            (user["id"],)
        )
        pending_actions = [
            {
                "id": r["id"],
                "content": r["content"],
                "note_id": r["note_id"],
                "due_date": r["due_date"],
                "priority": r["priority"],
                "notes": {"title": r["note_title"] or "关联笔记"}
            }
            for r in cursor.fetchall()
        ]

        # 5. 最近编辑笔记 (前 3 篇)
        cursor.execute(
            """
            SELECT id, title, updated_at
            FROM notes WHERE user_id = ?
            ORDER BY updated_at DESC
            LIMIT 3
            """,
            (user["id"],)
        )
        recent_notes = []
        for r in cursor.fetchall():
            cursor.execute("SELECT id, is_completed FROM action_items WHERE note_id = ?", (r["id"],))
            note_actions = cursor.fetchall()
            recent_notes.append({
                "id": r["id"],
                "title": r["title"],
                "updated_at": r["updated_at"],
                "action_items": note_actions
            })

    return {
        "total_notes": total_notes,
        "weekly_notes": weekly_notes,
        "total_actions": total_actions,
        "completed_actions": completed_actions,
        "pending_actions": pending_actions,
        "recent_notes": recent_notes
    }
