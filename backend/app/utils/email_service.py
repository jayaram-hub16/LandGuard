"""
Email utility for LandGuard.

Primary transport: Brevo transactional email REST API (EMAIL_PROVIDER=brevo).
Fallback transport: SMTP (existing Gmail / SMTP_* vars).

Security:
  - OTP values are NEVER written to any log.
  - API keys and SMTP passwords are NEVER logged.
  - Only presence/absence of env vars is ever surfaced externally.
"""
import os
import json
import logging
import smtplib
import urllib.request
import urllib.error
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)


# ── SMTP config ─────────────────────────────────────────────────────────────

def _get_smtp_config() -> dict:
    """
    Read SMTP config from environment variables.
    Supports both SMTP_* and MAIL_* naming conventions.
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


# ── Brevo config ─────────────────────────────────────────────────────────────

def _get_brevo_config() -> dict:
    """Read Brevo API config from environment variables."""
    return {
        "provider":   os.environ.get("EMAIL_PROVIDER", "smtp").lower(),
        "api_key":    os.environ.get("BREVO_API_KEY", ""),
        "from_email": (
            os.environ.get("EMAIL_FROM_EMAIL")
            or os.environ.get("SMTP_FROM_EMAIL")
            or os.environ.get("SMTP_USERNAME", "")
        ),
        "from_name": (
            os.environ.get("EMAIL_FROM_NAME")
            or os.environ.get("SMTP_FROM_NAME", "LandGuard")
        ),
    }


def check_brevo_config() -> tuple:
    """
    Quick sanity-check of Brevo environment variables.

    Returns:
        (True, "")          – ready to send.
        (False, error_msg)  – something is missing.
    """
    cfg = _get_brevo_config()
    if not cfg["api_key"]:
        return False, "BREVO_API_KEY is not set."
    if not cfg["from_email"]:
        return False, "EMAIL_FROM_EMAIL is not set."
    return True, ""


def _send_via_brevo(to_email: str, subject: str, html_body: str,
                    plain_text: str, cfg: dict) -> tuple:
    """
    Send a transactional email via the Brevo REST API.
    Uses Python stdlib urllib — no extra packages required.

    Returns (True, "") on success; (False, error_message) on failure.
    API key is NEVER logged.
    """
    payload = {
        "sender": {"name": cfg["from_name"], "email": cfg["from_email"]},
        "to": [{"email": to_email}],
        "subject": subject,
        "htmlContent": html_body,
        "textContent": plain_text,
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email",
        data=data,
        headers={
            "api-key":      cfg["api_key"],
            "Content-Type": "application/json",
            "Accept":       "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            status = resp.status
            if 200 <= status < 300:
                logger.info(
                    "OTP email accepted by Brevo API (HTTP %s) for recipient=%s",
                    status, to_email
                )
                return True, ""
            body = resp.read().decode("utf-8", errors="replace")
            logger.error(
                "Brevo API non-2xx response %s for %s: %s",
                status, to_email, body[:200]
            )
            return False, f"Brevo API returned HTTP {status}."

    except urllib.error.HTTPError as exc:
        body = ""
        try:
            body = exc.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        logger.error(
            "Brevo HTTP error %s for %s: %s",
            exc.code, to_email, body[:200]
        )
        if exc.code == 401:
            return False, "Brevo API key is invalid or not authorised."
        if exc.code == 400:
            return False, (
                f"Brevo rejected the request (bad sender or payload). "
                f"Ensure '{cfg['from_email']}' is a verified sender in your Brevo account."
            )
        if exc.code == 429:
            return False, "Brevo rate limit exceeded. Try again shortly."
        return False, f"Brevo API error HTTP {exc.code}."

    except urllib.error.URLError as exc:
        logger.error("Brevo network error for %s: %s", to_email, type(exc).__name__)
        return False, "Cannot reach Brevo API servers (network error)."

    except TimeoutError:
        logger.error("Brevo request timed out for %s", to_email)
        return False, "Brevo API request timed out."

    except Exception as exc:
        logger.error(
            "Unexpected Brevo error for %s: %s", to_email, type(exc).__name__
        )
        return False, "Unexpected error calling Brevo API."


# ── HTML email body builder ───────────────────────────────────────────────────

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


# ── Primary send function ─────────────────────────────────────────────────────

def send_otp_email(to_email: str, otp: str, expires_minutes: int = 5) -> tuple:
    """
    Send an OTP password-recovery email to the given address.

    Transport selection (in priority order):
      1. Brevo REST API  — when EMAIL_PROVIDER=brevo and BREVO_API_KEY is set.
      2. SMTP fallback   — existing SMTP_* / MAIL_* environment variables.

    Args:
        to_email:        Recipient email address.
        otp:             The plaintext OTP to include in the email body.
        expires_minutes: Validity window shown to the user.

    Returns:
        (True, "")          on success.
        (False, error_msg)  on any failure.

    Security:
        - The OTP value is NEVER written to any log.
        - SMTP credentials and API keys are NEVER logged.
    """
    subject    = "LandGuard – Password Recovery Verification Code"
    brevo_cfg  = _get_brevo_config()

    # ── Brevo primary transport ──────────────────────────────────────────────
    if brevo_cfg["provider"] == "brevo":
        ok, err = check_brevo_config()
        if ok:
            html_body  = _build_otp_html(otp, expires_minutes, brevo_cfg["from_name"])
            plain_text = (
                f"Your {brevo_cfg['from_name']} password-reset OTP: {otp}\n"
                f"It expires in {expires_minutes} minutes.\n"
                f"If you did not request this, ignore this email.\n"
                f"Security: {brevo_cfg['from_name']} staff will never ask for this code."
            )
            return _send_via_brevo(to_email, subject, html_body, plain_text, brevo_cfg)
        else:
            logger.warning(
                "EMAIL_PROVIDER=brevo but Brevo not configured (%s). "
                "Falling back to SMTP.", err
            )
    # ── SMTP fallback ────────────────────────────────────────────────────────
    return _send_via_smtp(to_email, otp, expires_minutes, subject)


def _send_via_smtp(to_email: str, otp: str, expires_minutes: int,
                   subject: str) -> tuple:
    """Internal: deliver OTP email via SMTP (existing logic, unchanged)."""
    cfg = _get_smtp_config()

    config_ok, config_error = check_smtp_config()
    if not config_ok:
        logger.warning("OTP email NOT sent to %s — %s", to_email, config_error)
        return False, f"Email not configured. {config_error}"

    from_name  = cfg["from_name"]
    from_email = cfg["from_email"] or cfg["username"]

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = f"{from_name} <{from_email}>"
    msg["To"]      = to_email
    msg["X-Mailer"] = "LandGuard GIS Security System"

    plain_text = (
        f"Your {from_name} password-reset OTP is: {otp}\n"
        f"It expires in {expires_minutes} minutes.\n"
        f"If you did not request this, please ignore the email.\n"
        f"Security: {from_name} staff will never ask for this code."
    )
    html_body = _build_otp_html(otp, expires_minutes, from_name)

    msg.attach(MIMEText(plain_text, "plain", "utf-8"))
    msg.attach(MIMEText(html_body,  "html",  "utf-8"))

    try:
        if cfg["use_tls"]:
            with smtplib.SMTP(cfg["host"], cfg["port"], timeout=15) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(cfg["username"], cfg["password"])
                server.sendmail(from_email, [to_email], msg.as_string())
        else:
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
        logger.error("SMTP error sending to %s: %s", to_email, type(exc).__name__)
        return False, f"SMTP error: {type(exc).__name__}"

    except OSError as exc:
        logger.error(
            "Network/OS error sending OTP email to %s: %s", to_email, type(exc).__name__
        )
        return False, "Network error: could not reach the SMTP server."

    except Exception as exc:
        logger.error(
            "Unexpected error sending OTP email to %s: %s", to_email, type(exc).__name__
        )
        return False, "An unexpected error occurred while sending the email."


# ── Future channels (not yet active) ─────────────────────────────────────────

def send_otp_sms(to_phone: str, otp: str, expires_minutes: int = 5) -> tuple:
    """
    Future: Send OTP via SMS.

    Currently disabled — no SMS provider is configured.
    Integrate an SMS provider (e.g. Twilio, MSG91) and set the required
    environment variables before activating this function.

    Args:
        to_phone:        E.164-formatted phone number (e.g. +919876543210).
        otp:             Plaintext OTP. Never log this value.
        expires_minutes: Validity window to show in the message.

    Returns:
        (False, "SMS delivery is not yet configured.") always.
    """
    logger.info(
        "SMS OTP requested for phone ending ...%s — SMS provider not configured.",
        to_phone[-4:] if len(to_phone) >= 4 else "****"
    )
    return False, "SMS delivery is not yet configured."


def send_otp_whatsapp(to_phone: str, otp: str, expires_minutes: int = 5) -> tuple:
    """
    Future: Send OTP via WhatsApp Business API.

    Currently disabled — no WhatsApp provider is configured.
    Integrate a WhatsApp Business API provider (e.g. Twilio, Gupshup, WATI)
    and set the required environment variables before activating.

    Note: WhatsApp OTP messages require pre-approved message templates.

    Args:
        to_phone:        E.164-formatted phone number.
        otp:             Plaintext OTP. Never log this value.
        expires_minutes: Validity window to show in the message.

    Returns:
        (False, "WhatsApp delivery is not yet configured.") always.
    """
    logger.info(
        "WhatsApp OTP requested for phone ending ...%s — provider not configured.",
        to_phone[-4:] if len(to_phone) >= 4 else "****"
    )
    return False, "WhatsApp delivery is not yet configured."
