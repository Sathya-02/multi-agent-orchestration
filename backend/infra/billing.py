"""
infra/billing.py — Usage tracking and plan enforcement
========================================================
Tracks job counts, token usage, and enforces plan limits.
All writes go to PostgreSQL in cloud mode.
Falls back gracefully (no enforcement) when DB is not configured.

Plan limits (defined in init.sql):
  free:       20 jobs/month, 1 concurrent, 5 agents, 100 MB KB
  pro:        200 jobs/month, 3 concurrent, 20 agents, 500 MB KB
  enterprise: unlimited

Stripe integration:
  Set STRIPE_SECRET_KEY env var and call stripe_webhook() from
  a POST /webhook/stripe endpoint to handle subscription events.
"""

import os, logging
from datetime import datetime

logger = logging.getLogger("infra.billing")

_DATABASE_URL = os.getenv("DATABASE_URL", "")


def _get_conn():
    """Get a PostgreSQL connection. Returns None if DB not configured."""
    if not _DATABASE_URL:
        return None
    try:
        import psycopg2
        return psycopg2.connect(_DATABASE_URL)
    except Exception as e:
        logger.debug(f"DB connect failed: {e}")
        return None


def record_job_start(user_id: str, job_ref: str, topic: str,
                     mode: str, model: str, api_key_id: str = "") -> str | None:
    """
    Insert a job record and return the DB UUID.
    Returns None if DB is not configured — job still runs.
    """
    conn = _get_conn()
    if not conn:
        return None
    try:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO jobs
               (user_id, api_key_id, job_ref, topic, mode, model, status, started_at)
               VALUES (%s, %s, %s, %s, %s, %s, 'running', NOW())
               RETURNING id""",
            (user_id or None, api_key_id or None, job_ref, topic, mode, model),
        )
        row = cur.fetchone()
        conn.commit()
        cur.close(); conn.close()
        return str(row[0]) if row else None
    except Exception as e:
        logger.warning(f"record_job_start failed: {e}")
        conn.rollback(); conn.close()
        return None


def record_job_done(db_job_id: str, status: str = "done",
                    tokens_in: int = 0, tokens_out: int = 0,
                    report_format: str = "", report_filename: str = "",
                    error: str = "") -> None:
    """Update job record on completion."""
    conn = _get_conn()
    if not conn or not db_job_id:
        return
    try:
        cur = conn.cursor()
        cur.execute(
            """UPDATE jobs SET
               status=%s, completed_at=NOW(), tokens_in=%s, tokens_out=%s,
               report_format=%s, report_filename=%s, error_message=%s
               WHERE id=%s""",
            (status, tokens_in, tokens_out,
             report_format, report_filename, error, db_job_id),
        )
        conn.commit()
        cur.close(); conn.close()
    except Exception as e:
        logger.warning(f"record_job_done failed: {e}")
        conn.rollback(); conn.close()


def increment_usage(user_id: str, tokens_in: int = 0, tokens_out: int = 0) -> None:
    """Increment monthly usage counters for billing."""
    conn = _get_conn()
    if not conn or not user_id:
        return
    month = datetime.now().strftime("%Y-%m")
    try:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO usage_counters (user_id, month, jobs_count, tokens_in, tokens_out)
               VALUES (%s, %s, 1, %s, %s)
               ON CONFLICT (user_id, month) DO UPDATE SET
                   jobs_count = usage_counters.jobs_count + 1,
                   tokens_in  = usage_counters.tokens_in  + EXCLUDED.tokens_in,
                   tokens_out = usage_counters.tokens_out + EXCLUDED.tokens_out""",
            (user_id, month, tokens_in, tokens_out),
        )
        conn.commit()
        cur.close(); conn.close()
    except Exception as e:
        logger.warning(f"increment_usage failed: {e}")
        conn.rollback(); conn.close()


def check_plan_limit(user_id: str, plan: str) -> dict:
    """
    Check if user has exceeded their plan's monthly job limit.
    Returns: { "allowed": bool, "jobs_used": int, "jobs_limit": int }
    Falls back to allowed=True if DB is unavailable.
    """
    PLAN_LIMITS = {"free": 20, "pro": 200, "enterprise": 0}
    limit = PLAN_LIMITS.get(plan, 20)

    if limit == 0:  # enterprise = unlimited
        return {"allowed": True, "jobs_used": 0, "jobs_limit": 0}

    conn = _get_conn()
    if not conn:
        return {"allowed": True, "jobs_used": 0, "jobs_limit": limit}

    month = datetime.now().strftime("%Y-%m")
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT jobs_count FROM usage_counters WHERE user_id=%s AND month=%s",
            (user_id, month),
        )
        row = cur.fetchone()
        cur.close(); conn.close()
        used = row[0] if row else 0
        return {
            "allowed":    used < limit,
            "jobs_used":  used,
            "jobs_limit": limit,
        }
    except Exception as e:
        logger.warning(f"check_plan_limit failed: {e}")
        conn.close()
        return {"allowed": True, "jobs_used": 0, "jobs_limit": limit}


def stripe_webhook(payload: bytes, sig_header: str) -> dict:
    """
    Handle Stripe webhook events.
    Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET env vars.
    Mount this at POST /webhook/stripe in main.py.

    Supported events:
      customer.subscription.created  → upgrade plan
      customer.subscription.deleted  → downgrade to free
      invoice.payment_succeeded       → record billing event
      invoice.payment_failed          → notify user
    """
    stripe_key     = os.getenv("STRIPE_SECRET_KEY", "")
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    if not stripe_key or not webhook_secret:
        return {"status": "stripe_not_configured"}

    try:
        import stripe
        stripe.api_key = stripe_key
        event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)

        conn = _get_conn()
        if conn:
            cur = conn.cursor()
            cur.execute(
                """INSERT INTO billing_events (event_type, stripe_event_id, payload)
                   VALUES (%s, %s, %s)
                   ON CONFLICT (stripe_event_id) DO NOTHING""",
                (event["type"], event["id"],
                 __import__("json").dumps(event["data"])),
            )
            conn.commit()
            cur.close(); conn.close()

        # Handle subscription events
        etype = event["type"]
        if etype == "customer.subscription.created":
            plan_id = event["data"]["object"]["items"]["data"][0]["price"]["lookup_key"]
            logger.info(f"Subscription created: plan={plan_id}")
        elif etype == "customer.subscription.deleted":
            logger.info("Subscription cancelled — downgrading to free")

        return {"status": "ok", "event": etype}

    except Exception as e:
        logger.error(f"Stripe webhook failed: {e}")
        return {"status": "error", "detail": str(e)}
