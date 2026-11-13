CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount > 0), created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS expenses_user_created ON expenses(user_id, created_at);
CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS todos_user_created ON todos(user_id, created_at);
CREATE TABLE IF NOT EXISTS water_settings (
  user_id TEXT PRIMARY KEY, daily_goal INTEGER NOT NULL DEFAULT 2000
);
CREATE TABLE IF NOT EXISTS water_logs (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS water_user_created ON water_logs(user_id, created_at);
CREATE TABLE IF NOT EXISTS shopping_items (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL,
  checked INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS shopping_user_created ON shopping_items(user_id, created_at);
CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, title)
);
CREATE TABLE IF NOT EXISTS habit_logs (
  id TEXT PRIMARY KEY, habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL, day TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(habit_id, day)
);
CREATE INDEX IF NOT EXISTS habit_logs_user_day ON habit_logs(user_id, day);
