-- File Uploads tracking table
-- Stores metadata for all uploaded pipeline log files processed by the agent system

CREATE TABLE IF NOT EXISTS file_uploads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_name VARCHAR(500) NOT NULL,
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    file_type VARCHAR(20) NOT NULL DEFAULT 'unknown',
    detected_category failure_category_type NOT NULL DEFAULT 'UNKNOWN',
    parsed_scenario JSONB,
    log_line_count INT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_file_uploads_status ON file_uploads(status);
CREATE INDEX IF NOT EXISTS idx_file_uploads_category ON file_uploads(detected_category);

-- Row Level Security
ALTER TABLE file_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access for file_uploads" ON file_uploads FOR SELECT USING (true);
CREATE POLICY "Public write access for file_uploads" ON file_uploads FOR ALL USING (true);
