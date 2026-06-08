CREATE TABLE IF NOT EXISTS max_group_bindings (
  id text PRIMARY KEY,
  chat_id text NOT NULL UNIQUE,
  assistant_id text NOT NULL REFERENCES assistants(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text,
  mode text NOT NULL CHECK (mode IN ('mention_only', 'all_messages', 'admin_only')),
  status text NOT NULL CHECK (status IN ('active', 'disabled')),
  created_by_platform_user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS max_group_bindings_assistant_idx
ON max_group_bindings(assistant_id);

CREATE INDEX IF NOT EXISTS max_group_bindings_user_idx
ON max_group_bindings(user_id);
