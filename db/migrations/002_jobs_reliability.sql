ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS ack_deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE INDEX IF NOT EXISTS jobs_relay_status_next_attempt_idx
ON jobs(relay_account_id, status, next_attempt_at);

CREATE INDEX IF NOT EXISTS jobs_status_created_idx
ON jobs(status, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS jobs_event_id_unique
ON jobs(event_id);

CREATE UNIQUE INDEX IF NOT EXISTS relay_outbound_event_delivered_unique
ON relay_outbound_messages(event_id)
WHERE status = 'delivered';
