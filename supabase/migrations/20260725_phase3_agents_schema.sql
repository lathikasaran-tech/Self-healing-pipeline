-- Phase 3 Schema Definition for Monitor/Trigger Agent & Diagnosis Agent

CREATE TABLE IF NOT EXISTS pipeline_baselines (
    pipeline_id VARCHAR(100) PRIMARY KEY,
    schema_snapshot JSONB NOT NULL,
    avg_row_count INT NOT NULL DEFAULT 1000,
    avg_duration_seconds NUMERIC(8,2) NOT NULL DEFAULT 60.00,
    avg_null_rate NUMERIC(5,4) NOT NULL DEFAULT 0.02,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
    id VARCHAR(100) PRIMARY KEY,
    pipeline_id VARCHAR(100) NOT NULL REFERENCES pipeline_baselines(pipeline_id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL CHECK (status IN ('SUCCESS', 'FAILED')),
    row_count INT NOT NULL,
    duration_seconds NUMERIC(8,2) NOT NULL,
    null_rate NUMERIC(5,4) NOT NULL DEFAULT 0.0,
    duplicate_rate NUMERIC(5,4) NOT NULL DEFAULT 0.0,
    schema_snapshot JSONB NOT NULL,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pending_investigations (
    id VARCHAR(100) PRIMARY KEY,
    run_id VARCHAR(100) NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
    pipeline_id VARCHAR(100) NOT NULL,
    error_message TEXT,
    deviated_signals JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'INVESTIGATING', 'DIAGNOSED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS diagnoses (
    id VARCHAR(100) PRIMARY KEY,
    investigation_id VARCHAR(100) NOT NULL REFERENCES pending_investigations(id) ON DELETE CASCADE,
    pipeline_id VARCHAR(100) NOT NULL,
    run_id VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('confident', 'inconclusive')),
    failure_class VARCHAR(100) NOT NULL,
    ruled_out JSONB NOT NULL DEFAULT '[]'::jsonb,
    confidence VARCHAR(50) NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
    evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
    iterations_used INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schema_snapshots_history (
    id SERIAL PRIMARY KEY,
    pipeline_id VARCHAR(100) NOT NULL,
    version INT NOT NULL,
    schema_snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mock_source_api_status (
    pipeline_id VARCHAR(100) PRIMARY KEY,
    http_status_code INT NOT NULL DEFAULT 200,
    latency_ms NUMERIC(8,2) NOT NULL DEFAULT 120.0,
    rate_limit_remaining INT NOT NULL DEFAULT 100,
    is_up BOOLEAN NOT NULL DEFAULT true,
    last_checked TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS Enablement & Policies
ALTER TABLE pipeline_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_investigations ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnoses ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_snapshots_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE mock_source_api_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read for baselines" ON pipeline_baselines FOR ALL USING (true);
CREATE POLICY "Public read for runs" ON pipeline_runs FOR ALL USING (true);
CREATE POLICY "Public read for investigations" ON pending_investigations FOR ALL USING (true);
CREATE POLICY "Public read for diagnoses" ON diagnoses FOR ALL USING (true);
CREATE POLICY "Public read for schema history" ON schema_snapshots_history FOR ALL USING (true);
CREATE POLICY "Public read for mock source api" ON mock_source_api_status FOR ALL USING (true);
