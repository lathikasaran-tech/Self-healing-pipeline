-- Autonomous Self-Healing Pipeline Agent System
-- Phase 2 Database Schema Definition (Supabase PostgreSQL + pgvector)

-- Enable extension for vector embeddings (RAG search)
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enum Types
DO $$ BEGIN
    CREATE TYPE agent_name_type AS ENUM ('Monitor', 'Diagnosis', 'RiskAuthority', 'Remediation', 'Reporting');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE incident_status_type AS ENUM ('OPEN', 'DIAGNOSING', 'EVALUATING_RISK', 'PENDING_APPROVAL', 'REMEDIATING', 'RESOLVED', 'ESCALATED', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE risk_tier_type AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE environment_type AS ENUM ('development', 'staging', 'production');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE failure_category_type AS ENUM ('OUT_OF_MEMORY', 'DATABASE_TIMEOUT', 'SCHEMA_MISMATCH', 'RATE_LIMIT_EXCEEDED', 'POD_CRASH_LOOP', 'TEST_TIMEOUT', 'UNKNOWN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Incidents Table
CREATE TABLE IF NOT EXISTS incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pipeline_id VARCHAR(100) NOT NULL,
    pipeline_name VARCHAR(255) NOT NULL,
    environment environment_type NOT NULL DEFAULT 'production',
    status incident_status_type NOT NULL DEFAULT 'OPEN',
    failure_category failure_category_type NOT NULL DEFAULT 'UNKNOWN',
    error_message TEXT NOT NULL,
    raw_logs JSONB NOT NULL DEFAULT '[]'::jsonb,
    affected_component VARCHAR(255) NOT NULL,
    root_cause TEXT,
    confidence_score NUMERIC(5,2),
    proposed_remediation JSONB,
    risk_tier risk_tier_type,
    approved_by VARCHAR(100),
    remediation_logs JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- 2. Agent Thoughts & ReAct Trace Table
CREATE TABLE IF NOT EXISTS agent_thoughts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    step_index INT NOT NULL,
    agent_name agent_name_type NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('thought', 'action', 'observation', 'final_answer')),
    content TEXT NOT NULL,
    tool_name VARCHAR(100),
    tool_input JSONB,
    tool_output JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Risk Policies Table
CREATE TABLE IF NOT EXISTS risk_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action_type VARCHAR(100) NOT NULL,
    environment environment_type NOT NULL,
    max_risk_tier risk_tier_type NOT NULL,
    min_confidence_required NUMERIC(5,2) NOT NULL DEFAULT 85.0,
    auto_approve BOOLEAN NOT NULL DEFAULT false,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Knowledge Base (RAG) Table with Vector Embedding
CREATE TABLE IF NOT EXISTS knowledge_articles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    failure_category failure_category_type NOT NULL,
    symptom_keywords TEXT[] NOT NULL DEFAULT '{}',
    root_cause_pattern TEXT NOT NULL,
    recommended_solution TEXT NOT NULL,
    embedding VECTOR(1536), -- OpenAI / Gemini embedding representation
    success_rate NUMERIC(5,2) NOT NULL DEFAULT 100.0,
    times_applied INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. System Metrics Telemetry Table
CREATE TABLE IF NOT EXISTS system_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cpu_usage_pct NUMERIC(5,2) NOT NULL,
    memory_usage_pct NUMERIC(5,2) NOT NULL,
    active_db_connections INT NOT NULL,
    max_db_connections INT NOT NULL DEFAULT 100,
    network_latency_ms NUMERIC(7,2) NOT NULL,
    error_rate_pct NUMERIC(5,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Failure Scenarios (Benchmark Test Catalog)
CREATE TABLE IF NOT EXISTS failure_scenarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    pipeline_id VARCHAR(100) NOT NULL,
    pipeline_name VARCHAR(255) NOT NULL,
    environment environment_type NOT NULL DEFAULT 'production',
    category failure_category_type NOT NULL,
    description TEXT NOT NULL,
    raw_logs JSONB NOT NULL DEFAULT '[]'::jsonb,
    expected_root_cause TEXT NOT NULL,
    expected_fix JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for High Performance Queries
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_category ON incidents(failure_category);
CREATE INDEX IF NOT EXISTS idx_thoughts_incident ON agent_thoughts(incident_id, step_index);
CREATE INDEX IF NOT EXISTS idx_kb_category ON knowledge_articles(failure_category);

-- Row Level Security (RLS) Enablement
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_thoughts ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE failure_scenarios ENABLE ROW LEVEL SECURITY;

-- Permissive Public Policies for Development / Agent Service Roles
CREATE POLICY "Public read access for incidents" ON incidents FOR SELECT USING (true);
CREATE POLICY "Public write access for incidents" ON incidents FOR ALL USING (true);

CREATE POLICY "Public read access for thoughts" ON agent_thoughts FOR SELECT USING (true);
CREATE POLICY "Public write access for thoughts" ON agent_thoughts FOR ALL USING (true);

CREATE POLICY "Public read access for risk_policies" ON risk_policies FOR SELECT USING (true);
CREATE POLICY "Public write access for risk_policies" ON risk_policies FOR ALL USING (true);

CREATE POLICY "Public read access for knowledge_articles" ON knowledge_articles FOR SELECT USING (true);
CREATE POLICY "Public write access for knowledge_articles" ON knowledge_articles FOR ALL USING (true);

CREATE POLICY "Public read access for system_metrics" ON system_metrics FOR SELECT USING (true);
CREATE POLICY "Public write access for system_metrics" ON system_metrics FOR ALL USING (true);

CREATE POLICY "Public read access for failure_scenarios" ON failure_scenarios FOR SELECT USING (true);
CREATE POLICY "Public write access for failure_scenarios" ON failure_scenarios FOR ALL USING (true);
