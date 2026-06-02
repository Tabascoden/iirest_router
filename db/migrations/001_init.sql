CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  title text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assistants (
  id text PRIMARY KEY,
  title text NOT NULL,
  relay_account_id text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identities (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('telegram', 'max')),
  platform_user_id text NOT NULL,
  chat_id text NOT NULL,
  username text,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(platform, platform_user_id)
);
CREATE INDEX IF NOT EXISTS identities_user_id_idx ON identities(user_id);
CREATE INDEX IF NOT EXISTS identities_platform_user_idx ON identities(platform, platform_user_id);

CREATE TABLE IF NOT EXISTS user_assistants (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assistant_id text NOT NULL REFERENCES assistants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, assistant_id)
);

CREATE TABLE IF NOT EXISTS active_assistants (
  id text PRIMARY KEY,
  platform text NOT NULL CHECK (platform IN ('telegram', 'max')),
  platform_user_id text NOT NULL,
  chat_id text NOT NULL,
  assistant_id text NOT NULL REFERENCES assistants(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(platform, platform_user_id, chat_id)
);

CREATE TABLE IF NOT EXISTS context_aliases (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assistant_id text NOT NULL REFERENCES assistants(id) ON DELETE CASCADE,
  relay_peer_id text NOT NULL,
  relay_sender_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'closed')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  last_message_at timestamptz,
  reset_reason text CHECK (reset_reason IN ('manual', 'daily', 'idle', 'admin', 'unknown')),
  UNIQUE(assistant_id, relay_peer_id)
);
CREATE INDEX IF NOT EXISTS context_aliases_active_idx ON context_aliases(user_id, assistant_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS context_aliases_one_active_idx ON context_aliases(user_id, assistant_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS relay_accounts (
  id text PRIMARY KEY,
  relay_account_id text NOT NULL UNIQUE,
  assistant_id text NOT NULL UNIQUE REFERENCES assistants(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'disabled')),
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id text PRIMARY KEY,
  event_id text NOT NULL UNIQUE,
  assistant_id text NOT NULL REFERENCES assistants(id) ON DELETE CASCADE,
  relay_account_id text NOT NULL,
  relay_peer_id text NOT NULL,
  relay_sender_id text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('telegram', 'max')),
  platform_user_id text NOT NULL,
  chat_id text NOT NULL,
  inbound_message_id text NOT NULL,
  text text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'sent_to_relay', 'processing', 'answered', 'failed', 'timeout', 'cancelled')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  answered_at timestamptz,
  failed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  ack_deadline_at timestamptz,
  processing_started_at timestamptz,
  cancelled_at timestamptz
);
CREATE INDEX IF NOT EXISTS jobs_relay_status_next_attempt_idx ON jobs(relay_account_id, status, next_attempt_at);
CREATE INDEX IF NOT EXISTS jobs_status_created_idx ON jobs(status, created_at);

CREATE TABLE IF NOT EXISTS relay_outbound_messages (
  id text PRIMARY KEY,
  event_id text NOT NULL,
  job_id text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  relay_account_id text NOT NULL,
  relay_peer_id text NOT NULL,
  text text NOT NULL,
  status text NOT NULL CHECK (status IN ('received', 'delivered', 'failed', 'ignored')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS relay_outbound_event_delivered_unique ON relay_outbound_messages(event_id) WHERE status = 'delivered';
