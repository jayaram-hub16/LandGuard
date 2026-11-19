"""
Email utility for LandGuard — sends OTP emails via SMTP.
Never logs the OTP value.
"""
import os
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)


def _get_smtp_config() -> dict:
    """Read SMTP config from environment variables, supporting multiple naming conventions."""
    return {
        "host":      os.environ.get("SMTP_HOST") or os.environ.get("MAIL_SERVER", ""),
        "port":      int(os.environ.get("SMTP_PORT") or os.environ.get("MAIL_PORT", 587)),
        "username":  os.environ.get("SMTP_USERNAME") or os.environ.get("MAIL_USERNAME", ""),
        "password":  os.environ.get("SMTP_PASSWORD") or os.environ.get("MAIL_PASSWORD", ""),
        "from_email":os.environ.get("SMTP_FROM_EMAIL") or os.environ.get("MAIL_USERNAME", ""),
        "from_name": os.environ.get("SMTP_FROM_NAME", "LandGuard"),
        "use_tls":   (os.environ.get("MAIL_USE_TLS", "true")).lower() in ("1", "true", "yes"),
    }


def _build_otp_html(otp: str, expires_minutes: int, from_name: str) -> str:
    """Build a styled HTML email body for the OTP message."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Your OTP – {from_name}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:12px;overflow:hidden;
                    box-shadow:0 4px 24px rgba(30,58,95,0.10);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);
                     padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">
              🔐 {from_name}
            </h1>
            <p style="margin:6px 0 0;color:#bfdbfe;font-size:14px;">
              GIS-Based Land Encroachment Detection System
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px 20px;">
            <h2 style="margin:0 0 8px;color:#1e3a5f;font-size:18px;">
              Password Reset Verification
            </h2>
            <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
              We received a request to reset your {from_name} account password.
              Use the one-time passcode (OTP) below to continue:
            </p>

            <!-- OTP box -->
            <div style="background:#eff6ff;border:2px dashed #2563eb;border-radius:10px;
                        padding:24px;text-align:center;margin:0 0 24px;">
              <p style="margin:0 0 6px;color:#64748b;font-size:12px;
                        text-transform:uppercase;letter-spacing:1px;font-weight:600;">
                One-Time Passcode
              </p>
              <span style="font-size:40px;font-weight:800;letter-spacing:12px;
                           color:#1e40af;font-family:'Courier New',monospace;">
                {otp}
              </span>
              <p style="margin:12px 0 0;color:#ef4444;font-size:13px;font-weight:600;">
                ⏱ Expires in {expires_minutes} minutes
              </p>
            </div>

            <p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.6;">
              If you did not request a password reset, please ignore this email.
              Your account remains secure — no action is needed.
            </p>

            <div style="background:#fef9c3;border-left:4px solid #eab308;border-radius:4px;
                        padding:12px 16px;margin:0 0 20px;">
              <p style="margin:0;color:#713f12;font-size:13px;line-height:1.5;">
                ⚠ <strong>Security notice:</strong> {from_name} staff will never ask for
                this code. Do not share it with anyone.
              </p>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;
                     text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">
              © {from_name} · GIS Land Records System<br/>
              This is an automated message — please do not reply.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def send_otp_email(to_email: str, otp: str, expires_minutes: int = 5) -> tuple:
    """
    Send an OTP email to the given address.

    Args:
        to_email:        Recipient email address.
        otp:             The plaintext OTP to include in the email.
        expires_minutes: Validity window shown to the user.

    Returns:
        (True, "")          on success.
        (False, error_msg)  on failure.

    Security: the OTP value is NEVER written to any log.
    """
    cfg = _get_smtp_config()

    if not cfg["host"]:
        logger.warning("SMTP not configured — OTP email not sent to %s", to_email)
        return False, "SMTP server not configured."

    from_name  = cfg["from_name"]
    from_email = cfg["from_email"] or cfg["username"]
    subject    = f"Your {from_name} Password Reset OTP"

    # Build message
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = f"{from_name} <{from_email}>"
    msg["To"]      = to_email

    # Plain-text fallback
    plain_text = (
        f"Your {from_name} password-reset OTP is: {otp}\n"
        f"It expires in {expires_minutes} minutes.\n"
        f"If you did not request this, please ignore the email."
    )
    html_body = _build_otp_html(otp, expires_minutes, from_name)

    msg.attach(MIMEText(plain_text, "plain", "utf-8"))
    msg.attach(MIMEText(html_body,  "html",  "utf-8"))

    try:
        if cfg["use_tls"]:
            with smtplib.SMTP(cfg["host"], cfg["port"], timeout=10) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                if cfg["username"] and cfg["password"]:
                    server.login(cfg["username"], cfg["password"])
                server.sendmail(from_email, [to_email], msg.as_string())
        else:
            with smtplib.SMTP_SSL(cfg["host"], cfg["port"], timeout=10) as server:
                if cfg["username"] and cfg["password"]:
                    server.login(cfg["username"], cfg["password"])
                server.sendmail(from_email, [to_email], msg.as_string())

        logger.info("OTP email sent to %s", to_email)
        return True, ""

    except smtplib.SMTPAuthenticationError:
        logger.error("SMTP authentication failed for host=%s user=%s", cfg["host"], cfg["username"])
        return False, "SMTP authentication failed."
    except smtplib.SMTPException as exc:
        logger.error("SMTP error sending to %s: %s", to_email, type(exc).__name__)
        return False, f"SMTP error: {type(exc).__name__}"
    except Exception as exc:
        logger.error("Unexpected email error for %s: %s", to_email, type(exc).__name__)
        return False, "Failed to send email."
