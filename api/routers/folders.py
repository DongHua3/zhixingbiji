import uuid
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from api.db import get_db
from api.security import get_current_user

router = APIRouter(prefix="/api/folders", tags=["文件夹管理"])

class CreateFolderRequest(BaseModel):
    name: str
    parent_id: Optional[str] = None

class UpdateFolderRequest(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[str] = None
    is_pinned: Optional[bool] = None
    is_starred: Optional[bool] = None

@router.get("")
async def list_folders(user: dict = Depends(get_current_user)):
    """获取当前用户的所有文件夹"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, name, parent_id, is_pinned, is_starred, created_at FROM folders WHERE user_id = ? ORDER BY created_at ASC",
            (user["id"],)
        )
        rows = cursor.fetchall()
        
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "parent_id": r["parent_id"],
            "is_pinned": bool(r["is_pinned"]),
            "is_starred": bool(r["is_starred"]),
            "created_at": r["created_at"]
        }
        for r in rows
    ]

@router.post("")
async def create_folder(req: CreateFolderRequest, user: dict = Depends(get_current_user)):
    """新建文件夹"""
    name = req.name.strip() or "新建文件夹"
    folder_id = str(uuid.uuid4())
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO folders (id, user_id, parent_id, name) VALUES (?, ?, ?, ?)",
            (folder_id, user["id"], req.parent_id, name)
        )
        
    return {
        "id": folder_id,
        "name": name,
        "parent_id": req.parent_id,
        "is_pinned": False,
        "is_starred": False
    }

@router.put("/{folder_id}")
async def update_folder(folder_id: str, req: UpdateFolderRequest, user: dict = Depends(get_current_user)):
    """更新文件夹名称、移动父级或变更状态"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, parent_id FROM folders WHERE id = ? AND user_id = ?", (folder_id, user["id"]))
        existing = cursor.fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="文件夹不存在或无权访问")
            
        updates = []
        params = []
        if req.name is not None:
            updates.append("name = ?")
            params.append(req.name.strip())
        if req.parent_id is not None:
            target_pid = req.parent_id if req.parent_id != "none" else None
            if target_pid == folder_id:
                raise HTTPException(status_code=400, detail="不能将文件夹移入自身")
            if target_pid:
                # 递归检查祖先链，杜绝死循环
                curr = target_pid
                while curr:
                    cursor.execute("SELECT parent_id FROM folders WHERE id = ?", (curr,))
                    row = cursor.fetchone()
                    if not row:
                        break
                    if row["parent_id"] == folder_id:
                        raise HTTPException(status_code=400, detail="不能将文件夹移入其子文件夹中")
                    curr = row["parent_id"]
            updates.append("parent_id = ?")
            params.append(target_pid)
        if req.is_pinned is not None:
            updates.append("is_pinned = ?")
            params.append(1 if req.is_pinned else 0)
        if req.is_starred is not None:
            updates.append("is_starred = ?")
            params.append(1 if req.is_starred else 0)
            
        if updates:
            params.extend([folder_id, user["id"]])
            cursor.execute(f"UPDATE folders SET {', '.join(updates)} WHERE id = ? AND user_id = ?", tuple(params))
            
    return {"success": True}

@router.delete("/{folder_id}")
async def delete_folder(folder_id: str, user: dict = Depends(get_current_user)):
    """删除文件夹（级联删除子文件夹并重置关联笔记）"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM folders WHERE id = ? AND user_id = ?", (folder_id, user["id"]))
        # 将归属于该文件夹的笔记移出至根目录
        cursor.execute("UPDATE notes SET folder_id = NULL WHERE folder_id = ? AND user_id = ?", (folder_id, user["id"]))
        
    return {"success": True}
