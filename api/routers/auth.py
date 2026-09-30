import uuid
import json
from typing import Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends, Response
from pydantic import BaseModel
from api.db import get_db
from api.security import hash_password, verify_password, create_access_token, get_current_user
from api.email_service import check_rate_limit_and_create_otp, verify_otp_code, send_verification_email_sync

router = APIRouter(prefix="/api/auth", tags=["用户认证"])

# ----------------- 请求模型 -----------------
class SendOtpRequest(BaseModel):
    email: str
    purpose: str = "signup" # signup / recovery

class RegisterRequest(BaseModel):
    email: str
    username: str
    password: str
    code: str

class LoginRequest(BaseModel):
    identifier: str # 邮箱或用户名
    password: str
    remember: bool = True

class ResetPasswordRequest(BaseModel):
    email: str
    code: str
    new_password: str

class ProfileUpdateRequest(BaseModel):
    username: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    preferences: Optional[dict] = None

class AIConfigUpdateRequest(BaseModel):
    api_key: Optional[str] = ""
    base_url: Optional[str] = ""
    model: Optional[str] = ""

# ----------------- 路由实现 -----------------

@router.post("/send-otp")
async def send_otp(req: SendOtpRequest, background_tasks: BackgroundTasks):
    """发送邮箱验证码 (带 60s 防刷频率控制)"""
    email = req.email.strip().lower()
    purpose_desc = "注册新账号" if req.purpose == "signup" else "重置登录密码"
    
    # 若是注册，且用户已存在且激活，拦截
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, is_confirmed FROM users WHERE lower(email) = ?", (email,))
        existing = cursor.fetchone()
        if existing and req.purpose == "signup" and existing["is_confirmed"]:
            raise HTTPException(status_code=400, detail="该邮箱已被注册！请直接切换到“账号登录”。")
        if not existing and req.purpose == "recovery":
            raise HTTPException(status_code=404, detail="未找到该邮箱对应的账号，请核对输入！")

    success, code, err = check_rate_limit_and_create_otp(email, req.purpose)
    if not success:
        raise HTTPException(status_code=429, detail=err or "操作过于频繁，请稍后再试")
        
    # 异步发送真实邮件（或模拟发信）
    background_tasks.add_task(send_verification_email_sync, email, code, purpose_desc)
    
    return {
        "success": True, 
        "message": f"验证码已发送至 {email}，请查收（有效期 10 分钟）",
        "mock_code": code # 方便开发联调即时查看
    }

@router.post("/register")
async def register(req: RegisterRequest, response: Response):
    """核对邮箱验证码并完成注册"""
    email = req.email.strip().lower()
    username = req.username.strip()
    
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="密码长度必须至少为 6 位！")
        
    # 1. 校验验证码
    passed, msg = verify_otp_code(email, req.code, purpose="signup")
    if not passed:
        raise HTTPException(status_code=400, detail=msg)
        
    user_id = str(uuid.uuid4())
    pw_hash = hash_password(req.password)
    
    # 2. 写入数据库
    with get_db() as conn:
        cursor = conn.cursor()
        # 检查唯一性
        cursor.execute("SELECT id FROM users WHERE lower(email) = ? OR lower(username) = ?", (email, username.lower()))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="该邮箱或用户名已被占用，请更换！")
            
        cursor.execute(
            "INSERT INTO users (id, email, username, password_hash, is_active, is_confirmed) VALUES (?, ?, ?, ?, 1, 1)",
            (user_id, email, username, pw_hash)
        )
        cursor.execute(
            "INSERT INTO profiles (user_id, bio, avatar_url, preferences) VALUES (?, '', '', '{}')",
            (user_id,)
        )
        cursor.execute(
            "INSERT INTO user_ai_configs (user_id, api_key, base_url, model) VALUES (?, '', '', '')",
            (user_id,)
        )

    # 3. 签发登录 Token
    token = create_access_token(user_id, email, username)
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        max_age=7 * 86400,
        samesite="lax"
    )
    
    return {
        "success": True,
        "token": token,
        "user": {
            "id": user_id,
            "email": email,
            "username": username
        }
    }

@router.post("/login")
async def login(req: LoginRequest, response: Response):
    """邮箱或用户名 + 密码登录"""
    ident = req.identifier.strip().lower()
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, email, username, password_hash, is_active FROM users WHERE lower(email) = ? OR lower(username) = ?",
            (ident, ident)
        )
        user = cursor.fetchone()
        
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="账号或密码错误，请核对后重试！")
        
    if not user["is_active"]:
        raise HTTPException(status_code=403, detail="该账号已被系统封禁，请联系管理员")

    token = create_access_token(user["id"], user["email"], user["username"])
    
    # 写入 HTTP-Only Cookie
    max_age = 7 * 86400 if req.remember else None
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        max_age=max_age,
        samesite="lax"
    )
    
    return {
        "success": True,
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "username": user["username"]
        }
    }

@router.post("/reset-password")
async def reset_password(req: ResetPasswordRequest):
    """通过验证码重置新密码"""
    email = req.email.strip().lower()
    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="新密码必须至少 6 位字符！")
        
    passed, msg = verify_otp_code(email, req.code, purpose="recovery")
    if not passed:
        raise HTTPException(status_code=400, detail=msg)
        
    new_hash = hash_password(req.new_password)
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET password_hash = ? WHERE lower(email) = ?", (new_hash, email))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="未找到该用户")
            
    return {"success": True, "message": "密码重置成功，请使用新密码登录！"}

@router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    """获取当前登录用户信息与资料偏好"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT p.bio, p.avatar_url, p.preferences,
                   (SELECT COUNT(*) FROM notes WHERE user_id = ?) as notes_count
            FROM profiles p WHERE p.user_id = ?
            """,
            (user["id"], user["id"])
        )
        prof = cursor.fetchone() or {}
        
    prefs = {}
    try:
        prefs = json.loads(prof.get("preferences") or "{}")
    except Exception:
        pass

    return {
        "id": user["id"],
        "email": user["email"],
        "username": user["username"],
        "bio": prof.get("bio", ""),
        "avatar_url": prof.get("avatar_url", ""),
        "preferences": prefs,
        "notes_count": prof.get("notes_count", 0)
    }

@router.put("/profile")
async def update_profile(req: ProfileUpdateRequest, user: dict = Depends(get_current_user)):
    """修改个人资料与偏好"""
    with get_db() as conn:
        cursor = conn.cursor()
        if req.username:
            new_name = req.username.strip()
            # 检查重名
            cursor.execute("SELECT id FROM users WHERE lower(username) = ? AND id != ?", (new_name.lower(), user["id"]))
            if cursor.fetchone():
                raise HTTPException(status_code=400, detail="该用户名已被其他用户使用，请换一个！")
            cursor.execute("UPDATE users SET username = ? WHERE id = ?", (new_name, user["id"]))

        updates = []
        params = []
        if req.bio is not None:
            updates.append("bio = ?")
            params.append(req.bio)
        if req.avatar_url is not None:
            updates.append("avatar_url = ?")
            params.append(req.avatar_url)
        if req.preferences is not None:
            updates.append("preferences = ?")
            params.append(json.dumps(req.preferences))
            
        if updates:
            params.append(user["id"])
            cursor.execute(f"UPDATE profiles SET {', '.join(updates)} WHERE user_id = ?", tuple(params))

    return {"success": True, "message": "资料已更新"}

@router.get("/ai-config")
async def get_ai_config(user: dict = Depends(get_current_user)):
    """获取用户个人私有 AI 配置"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT api_key, base_url, model FROM user_ai_configs WHERE user_id = ?", (user["id"],))
        cfg = cursor.fetchone() or {}
        
    return {
        "api_key": cfg.get("api_key", ""),
        "base_url": cfg.get("base_url", ""),
        "model": cfg.get("model", "")
    }

@router.put("/ai-config")
async def update_ai_config(req: AIConfigUpdateRequest, user: dict = Depends(get_current_user)):
    """保存用户个人私有 AI 配置"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO user_ai_configs (user_id, api_key, base_url, model)
            VALUES (?, ?, ?, ?)
            ON CONFLICT (user_id) DO UPDATE SET
                api_key = EXCLUDED.api_key,
                base_url = EXCLUDED.base_url,
                model = EXCLUDED.model,
                updated_at = datetime('now', 'localtime')
            """,
            (user["id"], req.api_key.strip(), req.base_url.strip(), req.model.strip())
        )
    return {"success": True, "message": "AI 设置已保存"}

class ChangeEmailRequest(BaseModel):
    new_email: str
    password: str

@router.put("/email")
async def change_email(req: ChangeEmailRequest, user: dict = Depends(get_current_user)):
    """校验密码并修改绑定邮箱"""
    new_email = req.new_email.strip().lower()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT password_hash FROM users WHERE id = ?", (user["id"],))
        u = cursor.fetchone()
        if not u or not verify_password(req.password, u["password_hash"]):
            raise HTTPException(status_code=400, detail="当前密码验证失败，请核对密码")
        cursor.execute("SELECT id FROM users WHERE lower(email) = ? AND id != ?", (new_email, user["id"]))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="该邮箱已被其他账号占用")
        cursor.execute("UPDATE users SET email = ? WHERE id = ?", (new_email, user["id"]))
    return {"success": True, "message": "邮箱修改成功"}

@router.post("/logout")
async def logout(response: Response):
    """登出并清理凭证 Cookie"""
    response.delete_cookie(key="access_token")
    return {"success": True, "message": "已安全退出登录"}
