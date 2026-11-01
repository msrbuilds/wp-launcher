/**
 * DDL for the MCP/OAuth tables, shared by the production schema (utils/db.ts)
 * and the in-memory test schema (test-helpers/db.ts) so the two cannot drift.
 * Tokens and codes are stored only as SHA-256 hashes.
 */
export const OAUTH_DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS oauth_clients (
    client_id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('cimd', 'dcr')),
    client_name TEXT NOT NULL,
    logo_uri TEXT,
    redirect_uris TEXT NOT NULL,
    metadata_fetched_at TEXT,
    metadata_expires_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_authorized_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS oauth_auth_codes (
    code_hash TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    scopes TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    code_challenge TEXT NOT NULL,
    resource TEXT NOT NULL,
    token_version INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    grant_id TEXT,
    invalidated_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS oauth_grants (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    scopes TEXT NOT NULL,
    resource TEXT NOT NULL,
    token_version INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_used_at TEXT,
    revoked_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_oauth_grants_user ON oauth_grants(user_id)`,
  `CREATE TABLE IF NOT EXISTS oauth_tokens (
    token_hash TEXT PRIMARY KEY,
    grant_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('access', 'refresh')),
    scopes TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    rotated_at TEXT,
    replaced_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_oauth_tokens_grant ON oauth_tokens(grant_id)`,
  `CREATE TABLE IF NOT EXISTS mcp_audit_log (
    id TEXT PRIMARY KEY,
    grant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    tool TEXT NOT NULL,
    args_summary TEXT,
    outcome TEXT NOT NULL CHECK (outcome IN ('ok', 'error', 'denied')),
    error TEXT,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    bypass INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_mcp_audit_user ON mcp_audit_log(user_id, created_at)`,
];
