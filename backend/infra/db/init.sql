-- ════════════════════════════════════════════════════════════════════════
-- infra/db/init.sql — Initial PostgreSQL schema
-- Multi-user accounts, API keys, billing, and job history
-- ════════════════════════════════════════════════════════════════════════

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT UNIQUE NOT NULL,
    name            TEXT,
    plan            TEXT NOT NULL DEFAULT 'free',  -- free | pro | enterprise
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    active          BOOLEAN NOT NULL DEFAULT TRUE
);

-- Optional RBAC role separate from billing plan.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';


-- ── API Keys ──────────────────────────────────────────────────────────
-- Each user can have multiple API keys.
-- Keys are hashed — we never store the raw value after creation.
CREATE TABLE IF NOT EXISTS api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_hash        TEXT UNIQUE NOT NULL,     -- SHA-256 hash of the raw key
    key_prefix      TEXT NOT NULL,            -- first 8 chars for display
    label           TEXT,                     -- user-assigned name
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,              -- NULL = never expires
    active          BOOLEAN NOT NULL DEFAULT TRUE
);

-- ── Plans ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plans (
    id              TEXT PRIMARY KEY,         -- 'free' | 'pro' | 'enterprise'
    display_name    TEXT NOT NULL,
    max_jobs_month  INTEGER NOT NULL DEFAULT 50,
    max_concurrent  INTEGER NOT NULL DEFAULT 1,
    max_agents      INTEGER NOT NULL DEFAULT 10,
    max_kb_mb       INTEGER NOT NULL DEFAULT 100,
    price_usd_month NUMERIC(8,2) NOT NULL DEFAULT 0,
    features        JSONB NOT NULL DEFAULT '[]'
);

INSERT INTO plans (id, display_name, max_jobs_month, max_concurrent, max_agents, max_kb_mb, price_usd_month, features)
VALUES
    ('free',       'Free',       20,  1, 5,   50,  0.00, '["web_search","rag","3d_boardroom"]'),
    ('pro',        'Pro',        200, 3, 20,  500, 19.00, '["web_search","rag","3d_boardroom","telegram","self_improver","custom_agents","custom_tools"]'),
    ('enterprise', 'Enterprise', 0,  10, 100, 5000, 99.00, '["all_features","priority_support","custom_models","filesystem","sso"]')
ON CONFLICT (id) DO NOTHING;

-- ── Jobs ─────────────────────────────────────────────────────────────
-- Full job history for billing and analytics
CREATE TABLE IF NOT EXISTS jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    api_key_id      UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    job_ref         TEXT NOT NULL,            -- short job ID shown in UI
    topic           TEXT NOT NULL,
    mode            TEXT NOT NULL DEFAULT 'research',  -- research | query | file
    model           TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'queued',    -- queued | running | done | failed | timeout
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    tokens_in       INTEGER DEFAULT 0,
    tokens_out      INTEGER DEFAULT 0,
    report_format   TEXT,
    report_filename TEXT,
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Usage Counters ────────────────────────────────────────────────────
-- Monthly rollup for plan enforcement
CREATE TABLE IF NOT EXISTS usage_counters (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    month           TEXT NOT NULL,            -- 'YYYY-MM'
    jobs_count      INTEGER NOT NULL DEFAULT 0,
    tokens_in       BIGINT NOT NULL DEFAULT 0,
    tokens_out      BIGINT NOT NULL DEFAULT 0,
    UNIQUE (user_id, month)
);

-- ── Billing Events ────────────────────────────────────────────────────
-- Stripe webhook events / payment records
CREATE TABLE IF NOT EXISTS billing_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type      TEXT NOT NULL,            -- 'payment_succeeded' | 'subscription_created' etc.
    amount_usd      NUMERIC(8,2),
    stripe_event_id TEXT UNIQUE,
    payload         JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_api_keys_hash     ON api_keys (key_hash);
CREATE INDEX IF NOT EXISTS idx_jobs_user         ON jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status       ON jobs (status);
CREATE INDEX IF NOT EXISTS idx_usage_user_month  ON usage_counters (user_id, month);

-- ── Helper function: authenticate an API key ──────────────────────────
-- Usage: SELECT * FROM authenticate_key('mao_xxxxxxxx...');
CREATE OR REPLACE FUNCTION authenticate_key(raw_key TEXT)
RETURNS TABLE (
    user_id   UUID,
    key_id    UUID,
    plan      TEXT,
    active    BOOLEAN
) AS $$
    SELECT u.id, k.id, u.plan, u.active
    FROM   api_keys k
    JOIN   users    u ON k.user_id = u.id
    WHERE  k.key_hash  = encode(digest(raw_key, 'sha256'), 'hex')
    AND    k.active     = TRUE
    AND    (k.expires_at IS NULL OR k.expires_at > NOW())
    AND    u.active     = TRUE
    LIMIT 1;
$$ LANGUAGE sql STABLE;
