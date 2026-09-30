import json
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from api.db import get_db
from api.security import get_current_user

router = APIRouter(prefix="/api/favorites", tags=["收藏与感悟"])

class FavoritePayload(BaseModel):
    insights: Optional[str] = ""
    tags: Optional[List[str]] = []

@router.get("")
async def list_favorites(tag: Optional[str] = None, user: dict = Depends(get_current_user)):
    """获取当前用户的收藏列表与感悟"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT f.note_id, f.insights, f.tags as fav_tags, f.created_at as favorited_at,
                   n.title, n.content, n.category, n.tags as note_tags, n.created_at as note_created_at,
                   u.username as author_username, p.avatar_url as author_avatar_url,
                   (SELECT COUNT(*) FROM note_likes WHERE note_id = n.id) as likes_count,
                   (SELECT COUNT(*) FROM favorites WHERE note_id = n.id) as favorites_count,
                   (SELECT COUNT(*) FROM note_comments WHERE note_id = n.id AND is_deleted = 0) as comments_count,
                   EXISTS(SELECT 1 FROM note_likes WHERE note_id = n.id AND user_id = ?) as is_liked
            FROM favorites f
            JOIN notes n ON f.note_id = n.id
            JOIN users u ON n.user_id = u.id
            LEFT JOIN profiles p ON n.user_id = p.user_id
            WHERE f.user_id = ?
            ORDER BY f.created_at DESC
            """,
            (user["id"], user["id"])
        )
        rows = cursor.fetchall()

    results = []
    for r in rows:
        fav_tags = []
        note_tags = []
        try:
            fav_tags = json.loads(r["fav_tags"] or "[]")
        except Exception:
            pass
        try:
            note_tags = json.loads(r["note_tags"] or "[]")
        except Exception:
            pass

        if tag and tag not in fav_tags:
            continue

        results.append({
            "note_id": r["note_id"],
            "insights": r["insights"],
            "tags": fav_tags,
            "created_at": r["favorited_at"],
            "note": {
                "id": r["note_id"],
                "title": r["title"],
                "content": r["content"],
                "category": r["category"],
                "tags": note_tags,
                "created_at": r["note_created_at"],
                "author": {
                    "username": r["author_username"],
                    "avatar_url": r["author_avatar_url"]
                },
                "likes_count": r["likes_count"],
                "favorites_count": r["favorites_count"],
                "comments_count": r["comments_count"],
                "is_liked": bool(r["is_liked"])
            }
        })
    return results

@router.post("/{note_id}")
async def add_favorite(note_id: str, req: FavoritePayload, user: dict = Depends(get_current_user)):
    """收藏笔记"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM notes WHERE id = ?", (note_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="笔记不存在")

        tags_str = json.dumps(req.tags or [])
        cursor.execute(
            """
            INSERT INTO favorites (user_id, note_id, insights, tags)
            VALUES (?, ?, ?, ?)
            ON CONFLICT (user_id, note_id) DO UPDATE SET
                insights = EXCLUDED.insights,
                tags = EXCLUDED.tags
            """,
            (user["id"], note_id, req.insights or "", tags_str)
        )
    return {"success": True, "is_favorited": True}

@router.put("/{note_id}")
async def update_favorite_insights(note_id: str, req: FavoritePayload, user: dict = Depends(get_current_user)):
    """更新收藏感悟与标签"""
    with get_db() as conn:
        cursor = conn.cursor()
        tags_str = json.dumps(req.tags or [])
        cursor.execute(
            "UPDATE favorites SET insights = ?, tags = ? WHERE user_id = ? AND note_id = ?",
            (req.insights or "", tags_str, user["id"], note_id)
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="未收藏该笔记")
    return {"success": True}

@router.delete("/{note_id}")
async def remove_favorite(note_id: str, user: dict = Depends(get_current_user)):
    """取消收藏"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM favorites WHERE user_id = ? AND note_id = ?", (user["id"], note_id))
    return {"success": True, "is_favorited": False}
