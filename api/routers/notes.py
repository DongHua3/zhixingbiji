import uuid
import json
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from api.db import get_db
from api.security import get_current_user

router = APIRouter(prefix="/api/notes", tags=["笔记管理"])

class CreateNoteRequest(BaseModel):
    title: Optional[str] = "无标题笔记"
    folder_id: Optional[str] = None
    content: Optional[str] = ""
    type: Optional[str] = "regular" # regular / markdown
    tags: Optional[List[str]] = []
    category: Optional[str] = ""
    is_public: Optional[bool] = False

class UpdateNoteRequest(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    folder_id: Optional[str] = None
    is_public: Optional[bool] = None
    is_pinned: Optional[bool] = None
    is_starred: Optional[bool] = None
    type: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None

@router.get("")
async def list_notes(folder_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    """获取当前用户的笔记列表"""
    with get_db() as conn:
        cursor = conn.cursor()
        if folder_id:
            cursor.execute(
                """
                SELECT id, title, folder_id, is_public, is_pinned, is_starred, type, category, tags, created_at, updated_at
                FROM notes WHERE user_id = ? AND folder_id = ? ORDER BY is_pinned DESC, updated_at DESC
                """,
                (user["id"], folder_id)
            )
        else:
            cursor.execute(
                """
                SELECT id, title, folder_id, is_public, is_pinned, is_starred, type, category, tags, created_at, updated_at
                FROM notes WHERE user_id = ? ORDER BY is_pinned DESC, updated_at DESC
                """,
                (user["id"],)
            )
        rows = cursor.fetchall()

    result = []
    for r in rows:
        tags = []
        try:
            tags = json.loads(r["tags"] or "[]")
        except Exception:
            pass
        result.append({
            "id": r["id"],
            "title": r["title"],
            "folder_id": r["folder_id"],
            "is_public": bool(r["is_public"]),
            "is_pinned": bool(r["is_pinned"]),
            "is_starred": bool(r["is_starred"]),
            "type": r["type"],
            "category": r["category"],
            "tags": tags,
            "created_at": r["created_at"],
            "updated_at": r["updated_at"]
        })
    return result

@router.post("")
async def create_note(req: CreateNoteRequest, user: dict = Depends(get_current_user)):
    """新建笔记"""
    note_id = str(uuid.uuid4())
    title = req.title.strip() if req.title else "无标题笔记"
    tags_str = json.dumps(req.tags or [])
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO notes (id, user_id, folder_id, title, content, type, category, tags, is_public)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                note_id, 
                user["id"], 
                req.folder_id if req.folder_id != "none" else None, 
                title, 
                req.content or "", 
                req.type or "regular", 
                req.category or "", 
                tags_str,
                1 if req.is_public else 0
            )
        )
        
    return {
        "id": note_id,
        "title": title,
        "folder_id": req.folder_id,
        "type": req.type,
        "is_public": req.is_public,
        "tags": req.tags or [],
        "category": req.category or ""
    }

@router.get("/{note_id}")
async def get_note(note_id: str, user: dict = Depends(get_current_user)):
    """获取单篇笔记详情与正文"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, user_id, folder_id, title, content, is_public, is_pinned, is_starred, type, category, tags, created_at, updated_at
            FROM notes WHERE id = ?
            """,
            (note_id,)
        )
        note = cursor.fetchone()
        
    if not note:
        raise HTTPException(status_code=404, detail="笔记不存在")
        
    # 私有笔记只允许本人查看
    if not note["is_public"] and note["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="您无权查看此笔记")

    tags = []
    try:
        tags = json.loads(note["tags"] or "[]")
    except Exception:
        pass

    return {
        "id": note["id"],
        "user_id": note["user_id"],
        "folder_id": note["folder_id"],
        "title": note["title"],
        "content": note["content"],
        "is_public": bool(note["is_public"]),
        "is_pinned": bool(note["is_pinned"]),
        "is_starred": bool(note["is_starred"]),
        "type": note["type"],
        "category": note["category"],
        "tags": tags,
        "created_at": note["created_at"],
        "updated_at": note["updated_at"]
    }

@router.put("/{note_id}")
async def update_note(note_id: str, req: UpdateNoteRequest, user: dict = Depends(get_current_user)):
    """更新笔记内容、标题、属性或防抖保存"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM notes WHERE id = ? AND user_id = ?", (note_id, user["id"]))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="笔记不存在或无权编辑")

        updates = ["updated_at = datetime('now', 'localtime')"]
        params = []
        if req.title is not None:
            updates.append("title = ?")
            params.append(req.title)
        if req.content is not None:
            updates.append("content = ?")
            params.append(req.content)
        if req.folder_id is not None:
            updates.append("folder_id = ?")
            params.append(req.folder_id if req.folder_id != "none" else None)
        if req.is_public is not None:
            updates.append("is_public = ?")
            params.append(1 if req.is_public else 0)
        if req.is_pinned is not None:
            updates.append("is_pinned = ?")
            params.append(1 if req.is_pinned else 0)
        if req.is_starred is not None:
            updates.append("is_starred = ?")
            params.append(1 if req.is_starred else 0)
        if req.type is not None:
            updates.append("type = ?")
            params.append(req.type)
        if req.category is not None:
            updates.append("category = ?")
            params.append(req.category)
        if req.tags is not None:
            updates.append("tags = ?")
            params.append(json.dumps(req.tags))

        params.extend([note_id, user["id"]])
        cursor.execute(f"UPDATE notes SET {', '.join(updates)} WHERE id = ? AND user_id = ?", tuple(params))

    return {"success": True}

@router.delete("/{note_id}")
async def delete_note(note_id: str, user: dict = Depends(get_current_user)):
    """删除笔记及相关行动清单"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM notes WHERE id = ? AND user_id = ?", (note_id, user["id"]))
        cursor.execute("DELETE FROM action_items WHERE note_id = ?", (note_id,))
    return {"success": True}
