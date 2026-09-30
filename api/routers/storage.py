import os
import uuid
import shutil
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from api.config import UPLOAD_DIR, NOTE_IMAGES_DIR, CONVERTS_DIR
from api.security import get_current_user

router = APIRouter(prefix="/api/storage", tags=["文件存储"])

ALLOWED_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    bucket: str = Form("note_images"), # note_images 或 converts
    user: dict = Depends(get_current_user)
):
    """上传文件到本地存储"""
    filename = file.filename or "temp"
    _, ext = os.path.splitext(filename)
    ext = ext.lower()

    if bucket == "note_images":
        if ext not in ALLOWED_IMAGE_EXTS:
            raise HTTPException(status_code=400, detail="只能上传图片格式文件 (PNG, JPG, JPEG, WEBP, GIF, SVG)")
        target_dir = os.path.join(NOTE_IMAGES_DIR, user["id"])
    else:
        target_dir = os.path.join(CONVERTS_DIR, user["id"])

    os.makedirs(target_dir, exist_ok=True)
    saved_name = f"{uuid.uuid4().hex}{ext}"
    saved_path = os.path.join(target_dir, saved_name)

    max_size = 10 * 1024 * 1024 if bucket == "note_images" else 20 * 1024 * 1024
    total_size = 0

    try:
        with open(saved_path, "wb") as f:
            while chunk := await file.read(1024 * 1024):
                total_size += len(chunk)
                if total_size > max_size:
                    f.close()
                    if os.path.exists(saved_path):
                        os.remove(saved_path)
                    raise HTTPException(status_code=413, detail="上传文件超出大小限制 (图片最大10MB，文档最大20MB)")
                f.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        if os.path.exists(saved_path):
            os.remove(saved_path)
        raise HTTPException(status_code=500, detail=f"保存文件失败: {str(e)}")

    # 返回静态访问相对 URL
    relative_url = f"/uploads/{'note_images' if bucket == 'note_images' else 'converts'}/{user['id']}/{saved_name}"
    return {
        "success": True,
        "url": relative_url,
        "filename": filename
    }

@router.get("/stats")
async def get_storage_stats(user: dict = Depends(get_current_user)):
    """获取当前用户在 converts 目录的文件统计"""
    user_converts_dir = os.path.join(CONVERTS_DIR, user["id"])
    count = 0
    total_size = 0
    if os.path.exists(user_converts_dir):
        for fname in os.listdir(user_converts_dir):
            fpath = os.path.join(user_converts_dir, fname)
            if os.path.isfile(fpath):
                count += 1
                total_size += os.path.getsize(fpath)
    return {
        "count": count,
        "total_size": total_size
    }

@router.post("/clear-converts")
async def clear_converts(user: dict = Depends(get_current_user)):
    """清空当前用户的转换备份文件"""
    user_converts_dir = os.path.join(CONVERTS_DIR, user["id"])
    if os.path.exists(user_converts_dir):
        shutil.rmtree(user_converts_dir, ignore_errors=True)
        os.makedirs(user_converts_dir, exist_ok=True)
    return {"success": True, "message": "已清空转换备份文件"}
