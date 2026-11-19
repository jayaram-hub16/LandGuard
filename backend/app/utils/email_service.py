"""
Email utility for LandGuard — sends OTP emails via SMTP.
Security: the OTP value is NEVER written to any log.
"""
import os
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)


def _get_smtp_config() -> dict:
    """
    Read SMTP config from environment variables.
    Supports both SMTP_* and MAIL_* naming conventions so the
    render.yaml / .env.example works with either set of variable names.
    """
    host     = os.environ.get("SMTP_HOST") or os.environ.get("MAIL_SERVER", "")
    port_raw = os.environ.get("SMTP_PORT") or os.environ.get("MAIL_PORT", "587")
    username = os.environ.get("SMTP_USERNAME") or os.environ.get("MAIL_USERNAME", "")
    password = os.environ.get("SMTP_PASSWORD") or os.environ.get("MAIL_PASSWORD", "")
    from_em  = os.environ.get("SMTP_FROM_EMAIL") or username
    from_nm  = os.environ.get("SMTP_FROM_NAME", "LandGuard")
    tls_raw  = os.environ.get("MAIL_USE_TLS", "true").lower()

    try:
        port = int(port_raw)
    except (ValueError, TypeError):
        port = 587

    return {
        "host":       host,
        "port":       port,
        "username":   username,
        "password":   password,
        "from_email": from_em,
        "from_name":  from_nm,
        "use_tls":    tls_raw in ("1", "true", "yes"),
    }


def check_smtp_config() -> tuple:
    """
    Quick sanity-check of SMTP environment variables.

    Returns:
        (True, "")          – all required vars are set.
        (False, error_msg)  – something is missing.
    """
    cfg = _get_smtp_config()
    missing = []
    if not cfg["host"]:
        missing.append("SMTP_HOST (or MAIL_SERVER)")
    if not cfg["username"]:
        missing.append("SMTP_USERNAME (or MAIL_USERNAME)")
    if not cfg["password"]:
        missing.append("SMTP_PASSWORD (or MAIL_PASSWORD)")
    if missing:
        return False, f"Missing SMTP environment variables: {', '.join(missing)}"
    return True, ""


def _build_otp_html(otp: str, expires_minutes: int, from_name: str) -> str:
    """Build a professional HTML OTP email body. OTP value is embedded in the email only."""
    import datetime
    now_str = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Password Recovery – {from_name}</title>
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
            <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:1px;">
              🔐 {from_name}
            </h1>
            <p style="margin:6px 0 0;color:#bfdbfe;font-size:13px;letter-spacing:0.5px;">
              GIS-Based Land Encroachment Detection &amp; Protection System
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px 20px;">
            <h2 style="margin:0 0 8px;color:#1e3a5f;font-size:20px;font-weight:700;">
              Password Reset Verification Code
            </h2>
            <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
              We received a request to reset the password for your {from_name} account.
              Use the one-time passcode below to continue:
            </p>

            <!-- OTP box -->
            <div style="background:#eff6ff;border:2px dashed #2563eb;border-radius:12px;
                        padding:28px;text-align:center;margin:0 0 28px;">
              <p style="margin:0 0 8px;color:#64748b;font-size:11px;
                        text-transform:uppercase;letter-spacing:2px;font-weight:700;">
                Your One-Time Passcode
              </p>
              <span style="font-size:44px;font-weight:900;letter-spacing:14px;
                           color:#1e40af;font-family:'Courier New',monospace;">
                {otp}
              </span>
              <p style="margin:14px 0 0;color:#ef4444;font-size:13px;font-weight:700;">
                ⏱ Expires in {expires_minutes} minutes
              </p>
            </div>

            <!-- Instructions -->
            <p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.7;">
              Enter this code in the LandGuard password recovery screen.
              If you did not request a password reset, please ignore this email —
              your account is safe and no changes have been made.
            </p>

            <!-- Security notice -->
            <div style="background:#fef9c3;border-left:4px solid #eab308;border-radius:6px;
                        padding:14px 18px;margin:0 0 24px;">
              <p style="margin:0;color:#713f12;font-size:13px;line-height:1.6;">
                ⚠ <strong>Security notice:</strong> {from_name} staff will
                <strong>never</strong> ask for this code.
                Do not share it with anyone.
              </p>
            </div>

            <!-- Request metadata -->
            <p style="margin:0;color:#94a3b8;font-size:12px;">
              Request time: {now_str}
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;
                     text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">
              © {from_name} · GIS Land Records &amp; Encroachment Detection System<br/>
              This is an automated security message — please do not reply.
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
    Send an OTP password-recovery email to the given address.

    Args:
        to_email:        Recipient email address.
        otp:             The plaintext OTP to include in the email body.
        expires_minutes: Validity window shown to the user.

    Returns:
        (True, "")          on success.
        (False, error_msg)  on any failure — SMTP not configured, auth error, etc.

    Security:
        - The OTP value is NEVER written to any log.
        - SMTP credentials are NEVER logged.
    """
    cfg = _get_smtp_config()

    # Validate config before attempting connection
    config_ok, config_error = check_smtp_config()
    if not config_ok:
        logger.warning("OTP email NOT sent to %s — %s", to_email, config_error)
        return False, f"SMTP not configured. {config_error}"

    from_name  = cfg["from_name"]
    from_email = cfg["from_email"] or cfg["username"]
    subject    = f"LandGuard – Password Recovery Verification Code"

    # Build MIME message
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = f"{from_name} <{from_email}>"
    msg["To"]      = to_email
    msg["X-Mailer"] = "LandGuard GIS Security System"

    # Plain-text fallback (no OTP in subject or headers)
    plain_text = (
        f"Your {from_name} password-reset OTP is: {otp}\n"
        f"It expires in {expires_minutes} minutes.\n"
        f"If you did not request this, please ignore the email.\n"
        f"Security: {from_name} staff will never ask for this code."
    )
    html_body = _build_otp_html(otp, expires_minutes, from_name)

    msg.attach(MIMEText(plain_text, "plain", "utf-8"))
    msg.attach(MIMEText(html_body,  "html",  "utf-8"))

    # Attempt SMTP delivery with structured error handling
    try:
        if cfg["use_tls"]:
            # Port 587 — STARTTLS
            with smtplib.SMTP(cfg["host"], cfg["port"], timeout=15) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(cfg["username"], cfg["password"])
                server.sendmail(from_email, [to_email], msg.as_string())
        else:
            # Port 465 — implicit SSL
            with smtplib.SMTP_SSL(cfg["host"], cfg["port"], timeout=15) as server:
                server.login(cfg["username"], cfg["password"])
                server.sendmail(from_email, [to_email], msg.as_string())

        logger.info("OTP email accepted by SMTP server for recipient=%s", to_email)
        return True, ""

    except smtplib.SMTPAuthenticationError:
        logger.error(
            "SMTP authentication FAILED — host=%s port=%s user=%s. "
            "For Gmail: use an App Password, not your login password.",
            cfg["host"], cfg["port"], cfg["username"]
        )
        return False, (
            "SMTP authentication failed. "
            "If you are using Gmail, generate an App Password: "
            "Google Account → Security → 2-Step Verification → App Passwords."
        )

    except smtplib.SMTPConnectError:
        logger.error(
            "SMTP connection failed — cannot reach %s:%s", cfg["host"], cfg["port"]
        )
        return False, f"Cannot connect to SMTP server {cfg['host']}:{cfg['port']}."

    except smtplib.SMTPRecipientsRefused:
        logger.error("SMTP: recipient address refused for %s", to_email)
        return False, "Recipient address was refused by the mail server."

    except smtplib.SMTPException as exc:
        logger.error(
            "SMTP error sending to %s: %s", to_email, type(exc).__name__
        )
        return False, f"SMTP error: {type(exc).__name__}"

    except OSError as exc:
        # Covers timeout, network unreachable, etc.
        logger.error(
            "Network/OS error sending OTP email to %s: %s", to_email, type(exc).__name__
        )
        return False, "Network error: could not reach the SMTP server."

    except Exception as exc:
        logger.error(
            "Unexpected error sending OTP email to %s: %s", to_email, type(exc).__name__
        )
        return False, "An unexpected error occurred while sending the email."
