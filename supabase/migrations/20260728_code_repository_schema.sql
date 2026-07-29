-- Supabase Migration: Code Repository & Remediation Code Patches Storage
-- Allows storing Python Agent Services, SQL Migrations, Prompt Templates, and Self-Healing Patches

-- 1. Code Repository Table
CREATE TABLE IF NOT EXISTS code_repository (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_path VARCHAR(255) UNIQUE NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_category VARCHAR(50) NOT NULL CHECK (file_category IN ('python_service', 'sql_migration', 'frontend_component', 'prompt_template', 'other')),
    language VARCHAR(50) NOT NULL CHECK (language IN ('python', 'sql', 'typescript', 'json', 'markdown', 'text')),
    code_content TEXT NOT NULL,
    version INT NOT NULL DEFAULT 1,
    checksum VARCHAR(64) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Dynamic Remediation Code Patches Table
CREATE TABLE IF NOT EXISTS remediation_code_patches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id VARCHAR(100),
    run_id VARCHAR(100) NOT NULL,
    patch_name VARCHAR(255) NOT NULL,
    language VARCHAR(50) NOT NULL DEFAULT 'python',
    original_code TEXT,
    remediated_code TEXT NOT NULL,
    diff_content TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'GENERATED' CHECK (status IN ('GENERATED', 'APPLIED', 'VERIFIED', 'REVERTED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_code_repo_category ON code_repository(file_category);
CREATE INDEX IF NOT EXISTS idx_code_repo_language ON code_repository(language);
CREATE INDEX IF NOT EXISTS idx_code_patches_run ON remediation_code_patches(run_id);

-- Row Level Security (RLS)
ALTER TABLE code_repository ENABLE ROW LEVEL SECURITY;
ALTER TABLE remediation_code_patches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for code_repository" ON code_repository FOR SELECT USING (true);
CREATE POLICY "Public write access for code_repository" ON code_repository FOR ALL USING (true);

CREATE POLICY "Public read access for remediation_code_patches" ON remediation_code_patches FOR SELECT USING (true);
CREATE POLICY "Public write access for remediation_code_patches" ON remediation_code_patches FOR ALL USING (true);
