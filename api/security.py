import hashlib
import hmac
import base64
import json
import time
import secrets
from typing import Optional, Dict, Any
from fastapi import HTTPException, Header, Request, status
from api.config import JWT_SECRET, JWT_EXPIRE_DAYS
from api.db import get_db

# ----------------------------------------------------
# 1. 密码安全散列 (PBKDF2-HMAC-SHA256 加盐)
# ----------------------------------------------------
def hash_password(password: str) -> str:
    """使用 16 字节安全随机盐和 100,000 次 PBKDF2 迭代生成密码散列"""
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        iterations=100000
    )
    return f"{salt}${key.hex()}"

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """校验明文密码与已存散列"""
    try:
        salt, expected_hex = hashed_password.split('$', 1)
        actual_key = hashlib.pbkdf2_hmac(
            'sha256',
            plain_password.encode('utf-8'),
            salt.encode('utf-8'),
            iterations=100000
        )
        return hmac.compare_digest(actual_key.hex(), expected_hex)
    except Exception:
        return False

# ----------------------------------------------------
# 2. 轻量且标准安全的 JWT 生成与验证
# ----------------------------------------------------
def _b64_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode('utf-8').rstrip('=')

def _b64_decode(data: str) -> bytes:
    padding = '=' * (4 - (len(data) % 4)) if len(data) % 4 != 0 else ''
    return base64.urlsafe_b64decode((data + padding).encode('utf-8'))

def create_access_token(user_id: str, email: str, username: str) -> str:
    """签发标准 HS256 JWT Token"""
    header = {"alg": "HS256", "typ": "JWT"}
    now = int(time.time())
    payload = {
        "sub": user_id,
        "email": email,
        "username": username,
        "iat": now,
        "exp": now + (JWT_EXPIRE_DAYS * 86400)
    }
    header_b64 = _b64_encode(json.dumps(header, separators=(',', ':')).encode('utf-8'))
    payload_b64 = _b64_encode(json.dumps(payload, separators=(',', ':')).encode('utf-8'))
    signature = hmac.new(
        JWT_SECRET.encode('utf-8'),
        f"{header_b64}.{payload_b64}".encode('utf-8'),
        hashlib.sha256
    ).digest()
    sig_b64 = _b64_encode(signature)
    return f"{header_b64}.{payload_b64}.{sig_b64}"

def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """验证并解码 JWT Token，过期或被篡改返回 None"""
    try:
        parts = token.split('.')
        if len(parts) != 3:
            return None
        header_b64, payload_b64, sig_b64 = parts
        expected_sig = hmac.new(
            JWT_SECRET.encode('utf-8'),
            f"{header_b64}.{payload_b64}".encode('utf-8'),
            hashlib.sha256
        ).digest()
        actual_sig = _b64_decode(sig_b64)
        if not hmac.compare_digest(expected_sig, actual_sig):
            return None
        payload = json.loads(_b64_decode(payload_b64).decode('utf-8'))
        if int(time.time()) > payload.get("exp", 0):
            return None # 已过期
        return payload
    except Exception:
        return None

# ----------------------------------------------------
# 3. FastAPI 路由鉴权依赖项
# ----------------------------------------------------
async def get_current_user(request: Request, authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    """从 Header (Authorization: Bearer <token>) 或 Cookie (access_token) 提取登录用户信息"""
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1].strip()
    elif "access_token" in request.cookies:
        token = request.cookies.get("access_token")
        
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="请先登录后再进行此操作",
            headers={"WWW-Authenticate": "Bearer"}
        )
        
    payload = decode_access_token(token)
    if not payload or not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登录凭证已过期或无效，请重新登录",
            headers={"WWW-Authenticate": "Bearer"}
        )
        
    user_id = payload["sub"]
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, email, username, is_active FROM users WHERE id = ?", (user_id,))
        user = cursor.fetchone()
        if not user or not user["is_active"]:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在或已被禁用")
            
    return user
