import uuid
from typing import Optional, List
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from api.db import get_db
from api.security import get_current_user

router = APIRouter(prefix="/api/action-items", tags=["行动清单"])

class CreateActionItemRequest(BaseModel):
    note_id: str
    content: str
    priority: Optional[str] = "P1"
    due_date: Optional[str] = None

class UpdateActionItemRequest(BaseModel):
    content: Optional[str] = None
    is_completed: Optional[bool] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None

@router.get("")
async def list_action_items(note_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    """获取行动清单列表"""
    with get_db() as conn:
        cursor = conn.cursor()
        if note_id:
            cursor.execute(
                """
                SELECT id, note_id, content, is_completed, priority, due_date, completed_at, created_at
                FROM action_items WHERE user_id = ? AND note_id = ? ORDER BY created_at ASC
                """,
                (user["id"], note_id)
            )
        else:
            cursor.execute(
                """
                SELECT a.id, a.note_id, a.content, a.is_completed, a.priority, a.due_date, a.completed_at, a.created_at,
                       n.title as note_title
                FROM action_items a
                LEFT JOIN notes n ON a.note_id = n.id
                WHERE a.user_id = ? ORDER BY a.is_completed ASC, a.created_at DESC
                """,
                (user["id"],)
            )
        rows = cursor.fetchall()

    return [
        {
            "id": r["id"],
            "note_id": r["note_id"],
            "content": r["content"],
            "is_completed": bool(r["is_completed"]),
            "priority": r["priority"],
            "due_date": r["due_date"],
            "completed_at": r["completed_at"],
            "created_at": r["created_at"],
            "note_title": r.get("note_title", "")
        }
        for r in rows
    ]

@router.post("")
async def create_action_item(req: CreateActionItemRequest, user: dict = Depends(get_current_user)):
    """添加新的行动清单"""
    item_id = str(uuid.uuid4())
    content = req.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="内容不能为空")

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO action_items (id, user_id, note_id, content, is_completed, priority, due_date)
            VALUES (?, ?, ?, ?, 0, ?, ?)
            """,
            (item_id, user["id"], req.note_id, content, req.priority or "P1", req.due_date)
        )

    return {
        "id": item_id,
        "note_id": req.note_id,
        "content": content,
        "is_completed": False,
        "priority": req.priority or "P1",
        "due_date": req.due_date,
        "created_at": datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    }

@router.put("/{item_id}")
async def update_action_item(item_id: str, req: UpdateActionItemRequest, user: dict = Depends(get_current_user)):
    """切换行动项状态、修改内容或截止时间"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM action_items WHERE id = ? AND user_id = ?", (item_id, user["id"]))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="行动项不存在")

        updates = []
        params = []
        if req.content is not None:
            updates.append("content = ?")
            params.append(req.content.strip())
        if req.is_completed is not None:
            updates.append("is_completed = ?")
            params.append(1 if req.is_completed else 0)
            updates.append("completed_at = ?")
            params.append(datetime.now().strftime('%Y-%m-%d %H:%M:%S') if req.is_completed else None)
        if req.priority is not None:
            updates.append("priority = ?")
            params.append(req.priority)
        if req.due_date is not None:
            updates.append("due_date = ?")
            params.append(req.due_date)

        if updates:
            params.extend([item_id, user["id"]])
            cursor.execute(f"UPDATE action_items SET {', '.join(updates)} WHERE id = ? AND user_id = ?", tuple(params))

    return {"success": True}

@router.delete("/{item_id}")
async def delete_action_item(item_id: str, user: dict = Depends(get_current_user)):
    """删除行动清单"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM action_items WHERE id = ? AND user_id = ?", (item_id, user["id"]))
    return {"success": True}
