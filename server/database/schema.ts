export const RELATIONAL_SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

CREATE TABLE IF NOT EXISTS disciplines (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL CHECK (color GLOB '#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]'),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL CHECK (kind IN ('technical', 'general')),
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_disciplines_user_order ON disciplines (user_id, sort_order);

CREATE TABLE IF NOT EXISTS topics (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  discipline_id TEXT NOT NULL,
  title TEXT NOT NULL,
  parent_topic_id TEXT NULL,
  status TEXT NOT NULL CHECK (status IN ('nao-iniciado', 'em-andamento', 'concluido', 'dominado')),
  notes TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_topics_user_discipline ON topics (user_id, discipline_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_topics_user_parent ON topics (user_id, parent_topic_id);

CREATE TABLE IF NOT EXISTS study_sessions (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  date TEXT NOT NULL,
  discipline_id TEXT NOT NULL,
  topic_id TEXT NULL,
  planned_start TEXT NULL,
  planned_minutes INTEGER NOT NULL CHECK (planned_minutes > 0),
  actual_seconds INTEGER NOT NULL DEFAULT 0 CHECK (actual_seconds >= 0),
  status TEXT NOT NULL CHECK (status IN ('planejada', 'concluida', 'perdida')),
  objective TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  origin TEXT NOT NULL CHECK (origin IN ('planejada', 'avulsa')),
  started_at TEXT NULL,
  ended_at TEXT NULL,
  recovered_from_id TEXT NULL,
  is_manual INTEGER NULL CHECK (is_manual IN (0, 1) OR is_manual IS NULL),
  sort_order INTEGER NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_date ON study_sessions (user_id, date);
CREATE INDEX IF NOT EXISTS idx_sessions_user_status ON study_sessions (user_id, status);

CREATE TABLE IF NOT EXISTS study_session_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('criada', 'reagendada', 'status', 'executada', 'recuperada', 'editada')),
  description TEXT NOT NULL,
  FOREIGN KEY (user_id, session_id) REFERENCES study_sessions(user_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_history_lookup ON study_session_history (user_id, session_id, seq);

CREATE TABLE IF NOT EXISTS timer_states (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL DEFAULT 'active',
  session_id TEXT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'paused')),
  started_at INTEGER NULL,
  first_started_at INTEGER NOT NULL,
  accumulated_seconds REAL NOT NULL DEFAULT 0 CHECK (accumulated_seconds >= 0),
  planned_seconds INTEGER NOT NULL CHECK (planned_seconds >= 0),
  discipline_id TEXT NOT NULL,
  topic_id TEXT NULL,
  objective TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS question_logs (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  date TEXT NOT NULL,
  discipline_id TEXT NOT NULL,
  topic_id TEXT NULL,
  source TEXT NOT NULL DEFAULT '',
  total INTEGER NOT NULL CHECK (total >= 0),
  correct INTEGER NOT NULL CHECK (correct >= 0),
  incorrect INTEGER NOT NULL CHECK (incorrect >= 0),
  blank INTEGER NOT NULL CHECK (blank >= 0),
  duration_minutes INTEGER NULL,
  notes TEXT NOT NULL DEFAULT '',
  session_id TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_question_logs_user_date ON question_logs (user_id, date);
CREATE INDEX IF NOT EXISTS idx_question_logs_user_discipline ON question_logs (user_id, discipline_id);

CREATE TABLE IF NOT EXISTS error_notes (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  question_log_id TEXT NULL,
  discipline_id TEXT NOT NULL,
  topic_id TEXT NULL,
  source_reference TEXT NOT NULL DEFAULT '',
  error_type TEXT NOT NULL CHECK (error_type IN ('falta-conteudo', 'interpretacao', 'desatencao', 'confusao-alternativas', 'outro')),
  explanation TEXT NOT NULL DEFAULT '',
  error_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('revisar', 'revisado', 'dominado')),
  next_review_date TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_error_notes_user_status ON error_notes (user_id, status);

CREATE TABLE IF NOT EXISTS review_tasks (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  discipline_id TEXT NOT NULL,
  topic_id TEXT NULL,
  error_note_id TEXT NULL,
  title TEXT NOT NULL,
  due_date TEXT NOT NULL,
  interval_days INTEGER NOT NULL CHECK (interval_days >= 0),
  status TEXT NOT NULL CHECK (status IN ('pendente', 'concluida')),
  completed_at TEXT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reviews_user_due ON review_tasks (user_id, due_date, status);

CREATE TABLE IF NOT EXISTS weekly_plans (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  week_index INTEGER NOT NULL CHECK (week_index > 0),
  week_start TEXT NOT NULL,
  objectives TEXT NOT NULL DEFAULT '',
  planned_content TEXT NOT NULL DEFAULT '',
  planned_minutes INTEGER NOT NULL CHECK (planned_minutes >= 0),
  status TEXT NOT NULL CHECK (status IN ('pendente', 'em-andamento', 'concluida')),
  notes TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (user_id, id),
  UNIQUE (user_id, week_index),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  id TEXT NOT NULL DEFAULT 'settings',
  daily_goal_minutes INTEGER NOT NULL DEFAULT 120,
  weekly_goal_minutes INTEGER NOT NULL DEFAULT 840,
  daily_question_goal INTEGER NULL,
  accuracy_goal INTEGER NOT NULL DEFAULT 80,
  topic_completion_goal INTEGER NULL,
  review_intervals_json TEXT NOT NULL,
  theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
  exam_date TEXT NULL,
  schedule_start_date TEXT NULL,
  schedule_weeks INTEGER NOT NULL DEFAULT 24,
  distribution_json TEXT NOT NULL,
  gemini_api_key TEXT NULL,
  ai_provider TEXT NOT NULL DEFAULT 'builtin' CHECK (ai_provider IN ('builtin', 'gemini')),
  contest_id TEXT NULL,
  contest_name TEXT NULL,
  contest_role TEXT NULL,
  edital_file_name TEXT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mock_exams (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  title TEXT NOT NULL,
  exam_file_name TEXT NULL,
  key_file_name TEXT NULL,
  question_count INTEGER NOT NULL CHECK (question_count >= 0),
  option_count INTEGER NOT NULL CHECK (option_count BETWEEN 2 AND 5),
  answer_key_json TEXT NOT NULL,
  ranges_json TEXT NOT NULL,
  responses_json TEXT NOT NULL,
  submitted_at TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`;
