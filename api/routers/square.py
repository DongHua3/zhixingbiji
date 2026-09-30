import uuid
import json
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from api.db import get_db
from api.security import get_current_user

router = APIRouter(prefix="/api/square", tags=["社区广场与互动"])

class CreateCommentRequest(BaseModel):
    note_id: str
    content: str
    parent_id: Optional[str] = None
    reply_to_user_id: Optional[str] = None

class ToggleCommentPinRequest(BaseModel):
    is_pinned: bool

@router.get("/notes")
async def list_square_notes(
    category: Optional[str] = None, 
    tag: Optional[str] = None,
    search: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """
    获取笔记广场公开列表（服务端聚合资料、点赞状态、收藏状态）
    """
    with get_db() as conn:
        cursor = conn.cursor()
        query = """
            SELECT n.id, n.user_id, n.title, n.content, n.tags, n.category, n.created_at, n.updated_at,
                   u.username, p.avatar_url,
                   (SELECT COUNT(*) FROM note_likes WHERE note_id = n.id) as likes_count,
                   (SELECT COUNT(*) FROM favorites WHERE note_id = n.id) as favorites_count,
                   (SELECT COUNT(*) FROM note_comments WHERE note_id = n.id AND is_deleted = 0) as comments_count,
                   EXISTS(SELECT 1 FROM note_likes WHERE note_id = n.id AND user_id = ?) as is_liked,
                   EXISTS(SELECT 1 FROM favorites WHERE note_id = n.id AND user_id = ?) as is_favorited
            FROM notes n
            JOIN users u ON n.user_id = u.id
            LEFT JOIN profiles p ON n.user_id = p.user_id
            WHERE n.is_public = 1
        """
        params = [user["id"], user["id"]]
        
        if category:
            query += " AND n.category = ?"
            params.append(category)
        if search:
            query += " AND (n.title LIKE ? OR n.content LIKE ?)"
            params.extend([f"%{search}%", f"%{search}%"])
            
        query += " ORDER BY n.created_at DESC"
        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()

    results = []
    for r in rows:
        tags = []
        try:
            tags = json.loads(r["tags"] or "[]")
        except Exception:
            pass
            
        if tag and tag not in tags:
            continue
            
        results.append({
            "id": r["id"],
            "user_id": r["user_id"],
            "title": r["title"],
            "content": r["content"],
            "category": r["category"],
            "tags": tags,
            "created_at": r["created_at"],
            "updated_at": r["updated_at"],
            "author": {
                "username": r["username"],
                "avatar_url": r["avatar_url"]
            },
            "likes_count": r["likes_count"],
            "favorites_count": r["favorites_count"],
            "comments_count": r["comments_count"],
            "is_liked": bool(r["is_liked"]),
            "is_favorited": bool(r["is_favorited"])
        })
    return results

@router.post("/notes/{note_id}/like")
async def toggle_note_like(note_id: str, user: dict = Depends(get_current_user)):
    """点赞或取消点赞笔记"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM note_likes WHERE user_id = ? AND note_id = ?", (user["id"], note_id))
        exists = cursor.fetchone()
        if exists:
            cursor.execute("DELETE FROM note_likes WHERE user_id = ? AND note_id = ?", (user["id"], note_id))
            is_liked = False
        else:
            cursor.execute("INSERT INTO note_likes (user_id, note_id) VALUES (?, ?)", (user["id"], note_id))
            is_liked = True
            
        cursor.execute("SELECT COUNT(*) as cnt FROM note_likes WHERE note_id = ?", (note_id,))
        count = cursor.fetchone()["cnt"]

    return {"is_liked": is_liked, "likes_count": count}

@router.get("/notes/{note_id}/comments")
async def get_note_comments(note_id: str, user: dict = Depends(get_current_user)):
    """获取单篇笔记的所有评论（附带点赞数及当前用户是否点赞）"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT c.id, c.user_id, c.note_id, c.parent_id, c.reply_to_user_id, c.content, c.is_pinned, c.is_deleted, c.created_at,
                   u.username, p.avatar_url,
                   ru.username as reply_to_username,
                   (SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id) as likes_count,
                   EXISTS(SELECT 1 FROM comment_likes WHERE comment_id = c.id AND user_id = ?) as is_liked
            FROM note_comments c
            JOIN users u ON c.user_id = u.id
            LEFT JOIN profiles p ON c.user_id = p.user_id
            LEFT JOIN users ru ON c.reply_to_user_id = ru.id
            WHERE c.note_id = ?
            ORDER BY c.is_pinned DESC, c.created_at ASC
            """,
            (user["id"], note_id)
        )
        rows = cursor.fetchall()

    return [
        {
            "id": r["id"],
            "user_id": r["user_id"],
            "note_id": r["note_id"],
            "parent_id": r["parent_id"],
            "reply_to_user_id": r["reply_to_user_id"],
            "reply_to_username": r["reply_to_username"],
            "content": r["content"],
            "is_pinned": bool(r["is_pinned"]),
            "is_deleted": bool(r["is_deleted"]),
            "created_at": r["created_at"],
            "author": {
                "username": r["username"],
                "avatar_url": r["avatar_url"]
            },
            "likes_count": r["likes_count"],
            "is_liked": bool(r["is_liked"])
        }
        for r in rows
    ]

@router.post("/comments")
async def create_comment(req: CreateCommentRequest, user: dict = Depends(get_current_user)):
    """发表笔记评论或回复"""
    content = req.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="评论内容不能为空")

    comment_id = str(uuid.uuid4())
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO note_comments (id, user_id, note_id, parent_id, reply_to_user_id, content)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (comment_id, user["id"], req.note_id, req.parent_id, req.reply_to_user_id, content)
        )

    return {"id": comment_id, "success": True}

@router.delete("/comments/{comment_id}")
async def delete_comment(comment_id: str, user: dict = Depends(get_current_user)):
    """删除自己的评论，或作者管理删除笔记下的评论"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT c.id, c.user_id, n.user_id as note_owner_id
            FROM note_comments c
            JOIN notes n ON c.note_id = n.id
            WHERE c.id = ?
            """,
            (comment_id,)
        )
        c = cursor.fetchone()
        if not c:
            raise HTTPException(status_code=404, detail="评论不存在")
            
        if c["user_id"] != user["id"] and c["note_owner_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="无权删除该评论")

        # 软删除标记
        cursor.execute("UPDATE note_comments SET is_deleted = 1, content = '该评论已被删除' WHERE id = ?", (comment_id,))

    return {"success": True}

@router.put("/comments/{comment_id}/pin")
async def toggle_pin_comment(comment_id: str, req: ToggleCommentPinRequest, user: dict = Depends(get_current_user)):
    """笔记作者置顶/取消置顶评论"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT c.id, n.user_id as note_owner_id
            FROM note_comments c
            JOIN notes n ON c.note_id = n.id
            WHERE c.id = ?
            """,
            (comment_id,)
        )
        c = cursor.fetchone()
        if not c:
            raise HTTPException(status_code=404, detail="评论不存在")
        if c["note_owner_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="只有笔记作者可以置顶评论")

        cursor.execute("UPDATE note_comments SET is_pinned = ? WHERE id = ?", (1 if req.is_pinned else 0, comment_id))

    return {"success": True}

@router.post("/comments/{comment_id}/like")
async def toggle_comment_like(comment_id: str, user: dict = Depends(get_current_user)):
    """点赞或取消点赞评论"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM comment_likes WHERE user_id = ? AND comment_id = ?", (user["id"], comment_id))
        exists = cursor.fetchone()
        if exists:
            cursor.execute("DELETE FROM comment_likes WHERE user_id = ? AND comment_id = ?", (user["id"], comment_id))
            is_liked = False
        else:
            cursor.execute("INSERT INTO comment_likes (user_id, comment_id) VALUES (?, ?)", (user["id"], comment_id))
            is_liked = True
            
        cursor.execute("SELECT COUNT(*) as cnt FROM comment_likes WHERE comment_id = ?", (comment_id,))
        count = cursor.fetchone()["cnt"]

    return {"is_liked": is_liked, "likes_count": count}
