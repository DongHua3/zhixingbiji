import smtplib
import random
import secrets
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
from typing import Tuple, Optional
from api.config import (
    SMTP_SERVER,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    SMTP_USE_SSL
)
from api.db import get_db

def generate_otp_code() -> str:
    """生成 6 位纯数字验证码"""
    return f"{random.randint(100000, 999999)}"

def check_rate_limit_and_create_otp(email: str, purpose: str = "signup") -> Tuple[bool, str, Optional[str]]:
    """
    检查 60s 防刷频率并生成存储新验证码。
    返回: (success, code, error_message)
    """
    now = datetime.now()
    now_str = now.strftime('%Y-%m-%d %H:%M:%S')
    
    with get_db() as conn:
        cursor = conn.cursor()
        # 1. 查找最近 60 秒内同一邮箱该目的的发送记录
        cursor.execute(
            "SELECT created_at FROM email_verifications WHERE email = ? AND purpose = ? ORDER BY id DESC LIMIT 1",
            (email, purpose)
        )
        last_rec = cursor.fetchone()
        if last_rec:
            try:
                last_time = datetime.strptime(last_rec["created_at"], '%Y-%m-%d %H:%M:%S')
                if (now - last_time).total_seconds() < 60:
                    wait_seconds = int(60 - (now - last_time).total_seconds())
                    return False, "", f"发送太频繁了！请等待 {wait_seconds} 秒后再试"
            except Exception:
                pass

        # 2. 生成新验证码，10 分钟有效期
        code = generate_otp_code()
        expire_at = (now + timedelta(minutes=10)).strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute(
            "INSERT INTO email_verifications (email, code, purpose, expires_at, used, created_at) VALUES (?, ?, ?, ?, 0, ?)",
            (email, code, purpose, expire_at, now_str)
        )
        
    return True, code, None

def verify_otp_code(email: str, code: str, purpose: str = "signup") -> Tuple[bool, str]:
    """
    核对验证码是否正确且未过期，校验成功后立即核销。
    """
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, expires_at FROM email_verifications 
            WHERE email = ? AND code = ? AND purpose = ? AND used = 0
            ORDER BY id DESC LIMIT 1
            """,
            (email, code.strip(), purpose)
        )
        rec = cursor.fetchone()
        if not rec:
            return False, "验证码错误或已被使用，请重新核对！"
            
        if rec["expires_at"] < now_str:
            return False, "验证码已过期，请重新获取验证码！"
            
        # 核销验证码
        cursor.execute("UPDATE email_verifications SET used = 1 WHERE id = ?", (rec["id"],))
        return True, "验证通过"

def send_verification_email_sync(to_email: str, code: str, purpose_desc: str = "注册账号"):
    """
    同步发信方法（供 BackgroundTasks 异步调用）
    若未配置 SMTP 则友好打印控制台日志，不阻断开发
    """
    if not SMTP_SERVER or not SMTP_USER or not SMTP_PASS:
        print("\n" + "="*60)
        print(f"📧 [知行笔记开发模式] 模拟邮件发送成功！")
        print(f"👉 目标邮箱: {to_email}")
        print(f"👉 业务类型: {purpose_desc}")
        print(f"👉 6位验证码: {code}")
        print("💡 提示: 若要在生产环境真实发信，请在 .env.local 中配置 SMTP_SERVER、SMTP_USER、SMTP_PASS")
        print("="*60 + "\n")
        return

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"【知行笔记】您的{purpose_desc}验证码：{code}"
        msg["From"] = f"知行笔记 <{SMTP_USER}>"
        msg["To"] = to_email

        html_body = f"""
        <!DOCTYPE html>
        <html>
        <body style="margin: 0; padding: 20px; background-color: #EFF6FF; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <div style="max-width: 500px; margin: 0 auto; background: #ffffff; border: 4px solid #000000; box-shadow: 6px 6px 0px #000000; padding: 32px; border-radius: 8px;">
                <div style="display: flex; align-items: center; margin-bottom: 20px;">
                    <span style="display: inline-block; width: 36px; height: 36px; line-height: 36px; text-align: center; background: #FFD700; border: 2px solid #000; font-weight: 900; font-size: 18px; margin-right: 10px;">知</span>
                    <h2 style="margin: 0; color: #000000; font-size: 22px; font-weight: 900;">知行笔记</h2>
                </div>
                <p style="font-size: 15px; color: #1e293b; line-height: 1.6; margin-bottom: 24px;">
                    您好！感谢您使用知行笔记。您正在进行 <strong>{purpose_desc}</strong> 操作，本次验证码为：
                </p>
                <div style="background: #EFF6FF; border: 3px solid #000000; box-shadow: 4px 4px 0px #000000; padding: 18px; text-align: center; margin: 24px 0;">
                    <span style="font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #2563EB;">{code}</span>
                </div>
                <p style="font-size: 13px; color: #64748b; line-height: 1.6;">
                    • 验证码有效期为 <strong>10 分钟</strong>，请尽快输入。<br/>
                    • 如果这不是您本人的操作，请忽略此邮件，您的账号安全不会受到影响。
                </p>
                <div style="margin-top: 32px; padding-top: 16px; border-top: 2px dashed #000000; text-align: center; color: #64748b; font-size: 12px; font-weight: bold;">
                    知行合一，学以致知；知行合一，学以致用。
                </div>
            </div>
        </body>
        </html>
        """
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        if SMTP_USE_SSL or SMTP_PORT == 465:
            with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT, timeout=10.0) as server:
                server.login(SMTP_USER, SMTP_PASS)
                server.sendmail(SMTP_USER, [to_email], msg.as_string())
        else:
            with smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=10.0) as server:
                server.starttls()
                server.login(SMTP_USER, SMTP_PASS)
                server.sendmail(SMTP_USER, [to_email], msg.as_string())
                
        print(f"[SMTP] Successfully sent verification email to {to_email}")
    except Exception as e:
        print(f"[SMTP Error] Failed to send email to {to_email}: {e}")
