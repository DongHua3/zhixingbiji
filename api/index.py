from fastapi import FastAPI, UploadFile, File, Header, HTTPException, Depends
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
try:
    from markitdown import MarkItDown
except ImportError:
    class MarkItDown:
        def __init__(self, *args, **kwargs):
            pass
        def convert(self, path):
            class Res:
                text_content = "# 文档内容\n(请安装 markitdown 以启用完整解析)"
            return Res()
try:
    from openai import OpenAI, AsyncOpenAI
except ImportError:
    class OpenAI:
        def __init__(self, *args, **kwargs): pass
    class AsyncOpenAI:
        def __init__(self, *args, **kwargs): pass
from pydantic import BaseModel
from typing import List, Optional
import os
import tempfile
import traceback
import re
import httpx
import zipfile
import shutil
import uuid
import time
from datetime import date

# 引入自建系统模块
from api.config import UPLOAD_DIR
from api.db import init_db as init_app_db, get_db
from api.security import get_current_user
from api.routers import auth, folders, notes, action_items, square, favorites, storage, dashboard

# 自动从根目录加载 .env.local 环境变量
def load_env_local():
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env.local")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, val = line.split("=", 1)
                    # 去除引号与首尾空格
                    os.environ[key.strip()] = val.strip().strip("'\"")

load_env_local()

import sqlite3
from datetime import date

DB_PATH = os.path.join(os.path.dirname(__file__), "usage.db")
global_http_client = httpx.AsyncClient(timeout=10.0)

# Token 验证本地缓存配置
TOKEN_CACHE_TTL = 300       # 缓存有效期 5 分钟
MAX_TOKEN_CACHE_SIZE = 1000 # 最大缓存条目数，防止内存泄漏
token_cache = {}            # token -> (user_info, expires_at)

def cache_token_user(token: str, user_info: dict, expires_at: float):
    now = time.time()
    if len(token_cache) >= MAX_TOKEN_CACHE_SIZE:
        # 清理过期条目
        expired_keys = [k for k, (_, exp) in token_cache.items() if now >= exp]
        for k in expired_keys:
            del token_cache[k]
        # 若依然达到上限，淘汰最早加入的 200 个条目
        if len(token_cache) >= MAX_TOKEN_CACHE_SIZE:
            for k in list(token_cache.keys())[:200]:
                del token_cache[k]
    token_cache[token] = (user_info, expires_at)

async def check_and_increment_usage(user_id: str, limit: int = 200):
    """自建数据库每日原子限流校验"""
    today = date.today().isoformat()
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR IGNORE INTO user_daily_usage (user_id, usage_date, count) VALUES (?, ?, 0)",
                (user_id, today)
            )
            cursor.execute(
                "UPDATE user_daily_usage SET count = count + 1 WHERE user_id = ? AND usage_date = ? AND count < ?",
                (user_id, today, limit)
            )
            if cursor.rowcount == 0:
                raise HTTPException(
                    status_code=429,
                    detail=f"您今日的系统 AI 调用次数已达到上限（每天最多 {limit} 次），请明天再试。如需无限次调用，可在“AI设置”中配置个人 API Key。"
                )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Daily usage check error: {e}")
        # 安全降级，不阻断正常调用
        pass

def clean_header(val) -> Optional[str]:
    if val is None:
        return None
    val_str = str(val)
    if val_str.startswith("Header(") or val_str in ("None", "null", ""):
        return None
    val_stripped = val_str.strip()
    if not val_stripped:
        return None
    return val_stripped

# 验证 Supabase JWT 凭证依赖项
async def verify_supabase_token(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="未提供有效的 Authorization 身份凭证")
        
    token = authorization.split(" ")[1]
    
    # 检查缓存以避免重复发起网络请求
    now = time.time()
    if token in token_cache:
        user_info, expires_at = token_cache[token]
        if now < expires_at:
            return user_info
        else:
            del token_cache[token]
            
    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    supabase_anon_key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    
    if not supabase_url or not supabase_anon_key:
        print("Error: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY not set in backend environment")
        raise HTTPException(status_code=500, detail="后端环境未配置 Supabase 基础环境变量")
        
    url = f"{supabase_url.rstrip('/')}/auth/v1/user"
    headers = {
        "Authorization": f"Bearer {token}",
        "apikey": supabase_anon_key
    }
    
    try:
        response = await global_http_client.get(url, headers=headers, timeout=5.0)
        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="凭证已过期或无效，请重新登录")
        user_info = response.json()
        
        # 将验证成功的结果安全存入受控缓存
        cache_token_user(token, user_info, now + TOKEN_CACHE_TTL)
        return user_info
    except HTTPException:
        raise
    except Exception as e:
        print(f"Auth verification request error: {e}")
        raise HTTPException(status_code=503, detail="身份验证服务暂时不可用")


def convert_prefixed_line_numbers_to_code_block(text: str) -> str:
    if not text:
        return ""
    lines = text.split('\n')
    n = len(lines)
    
    new_lines = []
    i = 0
    while i < n:
        sequence = []
        j = i
        
        while j < n:
            line = lines[j].strip()
            # Match a line number followed by optional colon/period and space, or a standalone number
            match = re.match(r'^(\d+)(?:\s*[:.]?\s+(.*)|$)', line)
            if match:
                val = int(match.group(1))
                content = match.group(2) if match.group(2) is not None else ""
                
                # Sequence must be consecutive integers starting from any number
                if not sequence or val == sequence[-1]['val'] + 1:
                    sequence.append({'idx': j, 'val': val, 'content': content})
                    j += 1
                else:
                    break
            else:
                break
                
        if len(sequence) >= 4 and any(item['content'].strip() for item in sequence):
            # Reconstruct the code block
            lang = ""
            pre_idx = i - 1
            # Skip empty lines
            while pre_idx >= 0 and not lines[pre_idx].strip():
                pre_idx -= 1
                
            if pre_idx >= 0:
                possible_lang = lines[pre_idx].strip().lower()
                possible_lang = re.sub(r'[*_`]', '', possible_lang)
                if possible_lang in ['python', 'py', 'javascript', 'js', 'typescript', 'ts', 'java', 'c', 'cpp', 'html', 'css', 'bash', 'sh', 'sql', 'go', 'json']:
                    lang = possible_lang
                    # Consume the language line from new_lines if we already appended it
                    while new_lines and not new_lines[-1].strip():
                        new_lines.pop()
                    if new_lines:
                        new_lines.pop() # Remove the language line
            
            code_lines = []
            for item in sequence:
                code_lines.append(item['content'])
                
            # Strip trailing/leading blank lines
            while code_lines and not code_lines[0].strip():
                code_lines.pop(0)
            while code_lines and not code_lines[-1].strip():
                code_lines.pop()
                
            code_block_text = f"```{lang}\n" + '\n'.join(code_lines) + "\n```"
            new_lines.append(code_block_text)
            i = j
        else:
            new_lines.append(lines[i])
            i += 1
            
    return '\n'.join(new_lines)

def clean_sequential_line_numbers(text: str) -> str:
    if not text:
        return ""
    lines = text.split('\n')
    n = len(lines)
    
    # 1. Identify all standalone numbers (with optional list bullets)
    standalone_numbers = []
    for idx, line in enumerate(lines):
        stripped = line.strip()
        # Match standalone number with optional list markers like "-", "*", "•"
        match = re.match(r'^(?:[-*•]\s*)?(\d+)$', stripped)
        if match:
            val = int(match.group(1))
            standalone_numbers.append({'idx': idx, 'val': val})
            
    if not standalone_numbers:
        return text

    # 2. Find chains of increasing numbers
    # A chain is a sequence where values are strictly increasing and the gap between them is small.
    # This allows bridging across code blocks or text segments.
    to_remove = set()
    i = 0
    m = len(standalone_numbers)
    while i < m:
        chain = [standalone_numbers[i]]
        j = i + 1
        while j < m:
            prev = chain[-1]
            curr = standalone_numbers[j]
            gap = curr['val'] - prev['val']
            # Gap of 1 is consecutive; up to 3 allows bridging small code blocks or paragraphs
            if 0 < gap <= 3:
                chain.append(curr)
                j += 1
            elif gap <= 0:
                # Value decreased (e.g. new page starting from 1)
                break
            else:
                # Gap too large
                break
                
        if len(chain) >= 4:
            for item in chain:
                to_remove.add(item['idx'])
            i = j  # Move past this chain
        else:
            i += 1
            
    # 3. Reconstruct text without the marked lines
    result_lines = []
    for idx in range(n):
        if idx in to_remove:
            continue
        result_lines.append(lines[idx])
        
    # Remove consecutive duplicate blank lines
    final_lines = []
    for line in result_lines:
        if not line.strip():
            if final_lines and not final_lines[-1].strip():
                continue
        final_lines.append(line)
        
    return '\n'.join(final_lines)

def clean_broken_pdf_lines(text: str) -> str:
    if not text:
        return ""
    import re
    blocks = re.split(r'\n{2,}', text)
    new_blocks = []
    
    def is_asian(c):
        return '\u4e00' <= c <= '\u9fff' or c in '，。！？；：“”‘’（）【】《》、'
        
    for block in blocks:
        if block.strip().startswith('```'):
            new_blocks.append(block)
            continue
            
        lines = block.split('\n')
        if len(lines) <= 1:
            new_blocks.append(block)
            continue
            
        merged = [lines[0].rstrip()]
        for line in lines[1:]:
            prev_line = merged[-1]
            curr_line = line.lstrip()
            
            if re.match(r'^(\#+|\-|\*|\d+\.|>)\s', curr_line):
                merged.append(line)
                continue
                
            if not prev_line or not curr_line:
                merged.append(line)
                continue
                
            last_char = prev_line[-1]
            first_char = curr_line[0]
            
            terminal_punctuations = set('。！？：；!?:;')
            if last_char in terminal_punctuations:
                merged.append(line)
                continue
            
            if is_asian(last_char) or is_asian(first_char):
                merged[-1] = prev_line + curr_line
            else:
                merged[-1] = prev_line + ' ' + curr_line
                
        new_blocks.append('\n'.join(merged))
    
    return '\n\n'.join(new_blocks)
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    model: Optional[str] = None
    temperature: Optional[float] = 0.7

app = FastAPI(docs_url="/api/py/docs", openapi_url="/api/py/openapi.json")

# 初始化自建数据表
init_app_db()

# 挂载业务路由
app.include_router(auth.router)
app.include_router(folders.router)
app.include_router(notes.router)
app.include_router(action_items.router)
app.include_router(square.router)
app.include_router(favorites.router)
app.include_router(storage.router)
app.include_router(dashboard.router)

# 挂载本地文件存储
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

ALLOWED_EXTENSIONS = {
    '.pdf', '.docx', '.xlsx', '.pptx', '.txt', '.html', '.md',
    '.png', '.jpg', '.jpeg', '.mp3', '.wav', '.zip'
}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB

def wrap_openai_client_with_image_compression(client: OpenAI) -> OpenAI:
    original_create = client.chat.completions.create

    def compressed_create(*args, **kwargs):
        messages = kwargs.get("messages")
        if messages:
            for message in messages:
                content = message.get("content")
                if isinstance(content, list):
                    for part in content:
                        if isinstance(part, dict) and part.get("type") == "image_url":
                            image_url = part.get("image_url", {})
                            url = image_url.get("url", "")
                            if url.startswith("data:image/") and ";base64," in url:
                                try:
                                    import io
                                    import base64
                                    from PIL import Image
                                    
                                    # Parse MIME type and base64 string
                                    header, base64_data = url.split(";base64,", 1)
                                    
                                    # Load image into Pillow
                                    image_bytes = base64.b64decode(base64_data)
                                    img = Image.open(io.BytesIO(image_bytes))
                                    
                                    # Compress image
                                    # Max dimension: 1024
                                    max_size = 1024
                                    if img.width > max_size or img.height > max_size:
                                        img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
                                    
                                    # Save compressed image back to base64 (JPEG format with high compression)
                                    output = io.BytesIO()
                                    # Convert RGBA to RGB if saving to JPEG
                                    if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
                                        img = img.convert('RGB')
                                    img.save(output, format="JPEG", quality=75, optimize=True)
                                    compressed_base64 = base64.b64encode(output.getvalue()).decode("utf-8")
                                    
                                    # Update payload url
                                    image_url["url"] = f"data:image/jpeg;base64,{compressed_base64}"
                                    print(f"Successfully compressed Base64 image payload from {len(base64_data)} to {len(compressed_base64)} chars.")
                                except Exception as img_err:
                                    print(f"Warning: failed to compress Base64 image: {img_err}")
        return original_create(*args, **kwargs)

    client.chat.completions.create = compressed_create
    return client

def clean_header(val) -> Optional[str]:
    if val is None:
        return None
    val_str = str(val)
    if val_str.startswith("Header(") or val_str in ("None", "null", ""):
        return None
    val_stripped = val_str.strip()
    if not val_stripped:
        return None
    return val_stripped

def get_markitdown(
    x_user_ai_key: Optional[str] = None,
    x_user_ai_base: Optional[str] = None,
    x_user_ai_model: Optional[str] = None
) -> MarkItDown:
    system_key = os.environ.get("SYSTEM_OPENAI_API_KEY")
    system_base = os.environ.get("SYSTEM_OPENAI_BASE_URL")
    system_model = os.environ.get("SYSTEM_OPENAI_MODEL", "mimo-v2.5")

    # 1. User custom LLM
    if x_user_ai_key:
        client = OpenAI(
            api_key=x_user_ai_key,
            base_url=x_user_ai_base if x_user_ai_base else None
        )
        client = wrap_openai_client_with_image_compression(client)
        model = x_user_ai_model if x_user_ai_model else "gpt-4o"
        return MarkItDown(llm_client=client, llm_model=model)
    # 2. System default LLM
    elif system_key:
        client = OpenAI(
            api_key=system_key,
            base_url=system_base if system_base else None
        )
        client = wrap_openai_client_with_image_compression(client)
        return MarkItDown(llm_client=client, llm_model=system_model)
    # 3. Offline Mode
    else:
        return MarkItDown()

def process_zip_file(zip_path: str, md_instance: MarkItDown) -> List[dict]:
    extracted_notes = []
    temp_extract_dir = os.path.join(tempfile.gettempdir(), f"zip_extract_{uuid.uuid4()}")
    os.makedirs(temp_extract_dir, exist_ok=True)
    
    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            for member in zip_ref.infolist():
                filename = member.filename
                if member.is_dir() or "__MACOSX" in filename or filename.split('/')[-1].startswith('.'):
                    continue
                
                clean_filename = os.path.basename(filename)
                if not clean_filename:
                    continue
                
                parts = filename.split('/')
                safe_parts = []
                for part in parts:
                    if part == '..' or part == '.':
                        continue
                    safe_parts.append(part)
                
                target_path = os.path.join(temp_extract_dir, *safe_parts)
                os.makedirs(os.path.dirname(target_path), exist_ok=True)
                
                with zip_ref.open(member) as source, open(target_path, "wb") as target:
                    shutil.copyfileobj(source, target)
        
        for root, _, files in os.walk(temp_extract_dir):
            for file in files:
                _, ext = os.path.splitext(file)
                if ext.lower() in ALLOWED_EXTENSIONS and ext.lower() != '.zip':
                    file_path = os.path.join(root, file)
                    try:
                        result = md_instance.convert(file_path)
                        text_content = result.text_content
                    except Exception as e:
                        print(f"Error converting ZIP member {file} with custom engine: {e}. Trying standard offline fallback...")
                        try:
                            fallback_md = MarkItDown()
                            result = fallback_md.convert(file_path)
                            text_content = result.text_content
                        except Exception as fallback_e:
                            print(f"Fallback offline conversion also failed for ZIP member {file}: {fallback_e}")
                            text_content = f"\n# 📄 {file}\n\n*转换失败: {str(e)}*\n"

                    try:
                        code_blocked_text = convert_prefixed_line_numbers_to_code_block(text_content)
                        cleaned_text = clean_sequential_line_numbers(code_blocked_text)
                        cleaned_text = clean_broken_pdf_lines(cleaned_text)
                        
                        rel_path = os.path.relpath(file_path, temp_extract_dir)
                        rel_path_title = rel_path.replace(os.sep, '/')
                        
                        extracted_notes.append({
                            "filename": rel_path_title,
                            "text": cleaned_text
                        })
                    except Exception as clean_err:
                        print(f"Cleaning text failed for ZIP member {file}: {clean_err}")
                        rel_path = os.path.relpath(file_path, temp_extract_dir)
                        rel_path_title = rel_path.replace(os.sep, '/')
                        extracted_notes.append({
                            "filename": rel_path_title,
                            "text": text_content
                        })
    finally:
        if os.path.exists(temp_extract_dir):
            shutil.rmtree(temp_extract_dir, ignore_errors=True)
            
    return extracted_notes

@app.post("/api/convert")
@app.post("/api/py/convert")
async def convert_file(
    file: UploadFile = File(...),
    x_user_ai_key: Optional[str] = Header(None),
    x_user_ai_base: Optional[str] = Header(None),
    x_user_ai_model: Optional[str] = Header(None),
    x_conversion_mode: Optional[str] = Header("ai"),
    user_info: dict = Depends(get_current_user)
):
    # Clean incoming headers to handle empty strings or raw Header parameter objects
    x_user_ai_key = clean_header(x_user_ai_key)
    x_user_ai_base = clean_header(x_user_ai_base)
    x_user_ai_model = clean_header(x_user_ai_model)
    x_conversion_mode = clean_header(x_conversion_mode) or "ai"

    temp_path = None
    try:
        filename = getattr(file, "filename", None) or "temp"
        _, ext = os.path.splitext(filename)
        if not ext:
            ext = ".tmp"
            
        if not re.match(r"^\.[a-zA-Z0-9]+$", ext) or ext.lower() not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail="不支持或非法的物理文件后缀格式")
            
        import uuid
        temp_dir = tempfile.gettempdir()
        temp_path = os.path.join(temp_dir, f"{uuid.uuid4()}{ext}")
        
        total_size = 0
        with open(temp_path, "wb") as temp_file:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total_size += len(chunk)
                if total_size > MAX_FILE_SIZE:
                    temp_file.close()
                    if os.path.exists(temp_path):
                        os.remove(temp_path)
                    raise HTTPException(status_code=413, detail="上传文件大小超过 20MB 限制")
                temp_file.write(chunk)

        if x_conversion_mode == 'standard':
            # 快速标准转换：不调用大模型API，且免去每日限额扣减，只在服务端进行标准文件流解析
            md_instance = MarkItDown()
        else:
            # AI 智能增强转换：调用大模型，如果是系统通道则累加计入用户每日频次额度
            if not x_user_ai_key and os.environ.get("SYSTEM_OPENAI_API_KEY"):
                user_id = user_info.get("id")
                if not user_id:
                    raise HTTPException(status_code=401, detail="无效的用户凭证")
                await check_and_increment_usage(user_id, 200)

            md_instance = get_markitdown(x_user_ai_key, x_user_ai_base, x_user_ai_model)

        import asyncio
        if ext.lower() == '.zip':
            zip_notes = await asyncio.to_thread(process_zip_file, temp_path, md_instance)
            if os.path.exists(temp_path):
                os.remove(temp_path)
            return {"is_zip": True, "notes": zip_notes}
        else:
            try:
                result = await asyncio.to_thread(md_instance.convert, temp_path)
            except Exception as e:
                # If AI-enhanced or custom OpenAI conversion fails, fall back to standard offline conversion
                if x_conversion_mode != 'standard':
                    print(f"AI conversion failed: {e}. Falling back to standard offline conversion...")
                    try:
                        fallback_md = MarkItDown()
                        result = await asyncio.to_thread(fallback_md.convert, temp_path)
                    except Exception as fallback_err:
                        print(f"Fallback standard conversion also failed: {fallback_err}")
                        # Graceful fallback: return clean markdown error details rather than throwing 500
                        if os.path.exists(temp_path):
                            os.remove(temp_path)
                        return {
                            "is_zip": False, 
                            "text": f"\n# ❌ 文档解析失败\n\n*   **转换内核**: AI 智能增强 / 标准离线转换\n*   **异常原因**: {str(fallback_err)}\n\n💡 **排查建议**:\n1. 检查上传的文件是否损坏，或者是否是受密码保护/加密的文档。\n2. 若配置了自定义 AI 密钥，请在“AI 设置”页面检查密钥与 API 代理端点的连通性。\n"
                        }
                else:
                    # Standard mode offline conversion failure
                    if os.path.exists(temp_path):
                        os.remove(temp_path)
                    return {
                        "is_zip": False,
                        "text": f"\n# ❌ 快速标准解析失败\n\n*   **转换内核**: 标准离线转换 (MarkItDown)\n*   **异常原因**: {str(e)}\n\n💡 **排查建议**:\n1. 建议切换至 **🤖 AI 智能增强转换** 模式（该模式对扫描版 PDF 或图片提供 OCR 视觉识别支持）。\n2. 确保文档可读、未损坏且未设置打开密码限制。\n"
                    }

            if os.path.exists(temp_path):
                os.remove(temp_path)
            
            code_blocked_text = convert_prefixed_line_numbers_to_code_block(result.text_content)
            cleaned_text = clean_sequential_line_numbers(code_blocked_text)
            cleaned_text = clean_broken_pdf_lines(cleaned_text)
            
            return {"is_zip": False, "text": cleaned_text}
            
    except HTTPException as he:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
        raise he
    except Exception as e:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
        error_trace = traceback.format_exc()
        print(error_trace)
        is_prod = os.environ.get("VERCEL") is not None or os.environ.get("NODE_ENV") == "production"
        client_err = "文档解析服务暂时发生异常，请稍后再试" if is_prod else f"文档解析失败: {str(e)}"
        return JSONResponse(status_code=500, content={"error": client_err})

@app.post("/api/chat")
@app.post("/api/py/chat")
async def chat_proxy(
    request_data: ChatRequest,
    x_user_ai_key: Optional[str] = Header(None),
    x_user_ai_base: Optional[str] = Header(None),
    x_user_ai_model: Optional[str] = Header(None),
    user_info: dict = Depends(get_current_user)
):
    # Clean incoming headers to handle empty strings or raw Header parameter objects
    x_user_ai_key = clean_header(x_user_ai_key)
    x_user_ai_base = clean_header(x_user_ai_base)
    x_user_ai_model = clean_header(x_user_ai_model)

    system_key = os.environ.get("SYSTEM_OPENAI_API_KEY")
    system_base = os.environ.get("SYSTEM_OPENAI_BASE_URL")
    system_model = os.environ.get("SYSTEM_OPENAI_MODEL", "mimo-v2.5")

    if x_user_ai_key:
        api_key = x_user_ai_key
        base_url = x_user_ai_base if x_user_ai_base else None
        model = x_user_ai_model if x_user_ai_model else (request_data.model or "gpt-4o-mini")
    elif system_key:
        user_id = user_info.get("id")
        if not user_id:
            raise HTTPException(status_code=401, detail="无效的用户凭证")
        await check_and_increment_usage(user_id, 200)

        api_key = system_key
        base_url = system_base if system_base else None
        model = system_model if system_model else (request_data.model or "mimo-v2.5")
    else:
        raise HTTPException(status_code=400, detail="未配置 AI 秘钥，请在设置中配置后重试")

    try:
        print(f"[DEBUG] Initializing AsyncOpenAI client with base_url={base_url}, model={model}")
        client = AsyncOpenAI(api_key=api_key, base_url=base_url, http_client=global_http_client)
        
        print("[DEBUG] Calling client.chat.completions.create asynchronously...")
        response = await client.chat.completions.create(
            model=model,
            messages=[{"role": m.role, "content": m.content} for m in request_data.messages],
            temperature=request_data.temperature if request_data.temperature is not None else 0.7,
            stream=True
        )
        print("[DEBUG] Async stream created successfully")
        
        async def generate():
            try:
                print("[DEBUG] Start yielding chunks from async stream")
                async for chunk in response:
                    if chunk.choices and len(chunk.choices) > 0:
                        content = chunk.choices[0].delta.content
                        if content:
                            yield content
                print("[DEBUG] Finished yielding chunks from async stream")
            except Exception as ge:
                print(f"[DEBUG] Exception inside generator: {ge}")
                traceback.print_exc()

        return StreamingResponse(
            generate(), 
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )
    except Exception as e:
        error_trace = traceback.format_exc()
        print(f"[DEBUG] Chat API proxy failed: {e}\n{error_trace}")
        is_prod = os.environ.get("VERCEL") is not None or os.environ.get("NODE_ENV") == "production"
        client_err = "AI 服务响应发生异常，请稍后重试" if is_prod else f"AI 服务异常: {str(e)}"
        return JSONResponse(status_code=500, content={"error": client_err})
