CREATE TABLE IF NOT EXISTS matrices (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  columns_json TEXT NOT NULL DEFAULT '[]',
  document_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_matrices_deal_id ON matrices(deal_id);
CREATE INDEX IF NOT EXISTS idx_matrices_user_id ON matrices(user_id);

CREATE TABLE IF NOT EXISTS matrix_cells (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  matrix_id TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  column_index INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  content_json TEXT NOT NULL DEFAULT '{}',
  retrieval_mode TEXT NOT NULL DEFAULT 'full_text',
  error TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(matrix_id, doc_id, column_index),
  FOREIGN KEY(matrix_id) REFERENCES matrices(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_matrix_cells_matrix_id ON matrix_cells(matrix_id);
