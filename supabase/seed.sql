-- Autonomous Self-Healing Pipeline Agent System
-- Phase 2 Database Seed Script

-- 1. Seed Default Risk Policies
INSERT INTO risk_policies (id, action_type, environment, max_risk_tier, min_confidence_required, auto_approve, description)
VALUES 
('11111111-1111-1111-1111-111111111111', 'RESTART_POD', 'production', 'LOW', 80.00, true, 'Automatic pod restart allowed for non-critical transient crashes'),
('22222222-2222-2222-2222-222222222222', 'SCALE_REPLICAS', 'production', 'MEDIUM', 85.00, true, 'Auto-scale memory or compute replicas for OOM / rate limit errors'),
('33333333-3333-3333-3333-333333333333', 'FLUSH_CONNECTION_POOL', 'production', 'MEDIUM', 90.00, true, 'Flush deadlocked connection pools during DB timeouts'),
('44444444-4444-4444-4444-444444444444', 'ROLLBACK_MIGRATION', 'production', 'HIGH', 95.00, false, 'Database schema rollback requires human approval in production'),
('55555555-5555-5555-5555-555555555555', 'INCREASE_MEMORY_LIMIT', 'production', 'LOW', 85.00, true, 'Automatically boost pod RAM allocation by +512MB on OOM')
ON CONFLICT (id) DO NOTHING;

-- 2. Seed Knowledge Articles (RAG Database)
INSERT INTO knowledge_articles (id, title, failure_category, symptom_keywords, root_cause_pattern, recommended_solution, success_rate, times_applied)
VALUES
('a1111111-1111-1111-1111-111111111111', 
 'Spark Heap OutOfMemoryError Resolution', 
 'OUT_OF_MEMORY', 
 ARRAY['java.lang.OutOfMemoryError', 'Container killed by YARN', 'heap limit'], 
 'Worker nodes exceeding 8GB RAM allocation during massive parquet shuffle operations.', 
 'Scale container memory limit from 8GB to 16GB and increase spark.sql.shuffle.partitions to 400.', 
 98.50, 42),

('a2222222-2222-2222-2222-222222222222', 
 'PostgreSQL Deadlock & Connection Pool Exhaustion', 
 'DATABASE_TIMEOUT', 
 ARRAY['Connection reset by peer', 'too many clients already', 'pool exhausted'], 
 'Max connection limit (100) reached due to unclosed connection leak in batch ETL worker.', 
 'Issue `ALTER SYSTEM SET max_connections = 250` and trigger graceful connection pool flush on pool manager.', 
 94.00, 31),

('a3333333-3333-3333-3333-333333333333', 
 'ClickHouse Column Type Mismatch Error', 
 'SCHEMA_MISMATCH', 
 ARRAY['Cannot parse string into UInt64', 'Type mismatch on column', 'schema evolution'], 
 'Upstream service published JSON payloads with string values for `user_id` instead of numeric ID.', 
 'Apply temporary transform adapter in ingest pipe: `CAST(user_id AS Nullable(UInt64))` and notify payload provider.', 
 91.20, 19),

('a4444444-4444-4444-4444-444444444444', 
 'Stripe API Rate Limit Exceeded (429)', 
 'RATE_LIMIT_EXCEEDED', 
 ARRAY['HTTP 429 Too Many Requests', 'Rate limit exceeded', 'StripeAPIException'], 
 'Batch sync worker sending >100 requests per second without exponential backoff retry policy.', 
 'Enforce Token Bucket rate-limiter wrapper with max 50 req/sec and jittered exponential retry policy.', 
 99.00, 56),

('a5555555-5555-5555-5555-555555555555', 
 'Kubernetes Pod OOMKilled CrashLoopBackOff', 
 'POD_CRASH_LOOP', 
 ARRAY['CrashLoopBackOff', 'OOMKilled', 'exit code 137'], 
 'Pod memory request (512Mi) set too close to limit (512Mi), causing sudden spikes during batch start to get terminated.', 
 'Update K8s deployment spec memory requests to 1Gi and limits to 2Gi with burst buffer.', 
 96.80, 27)
ON CONFLICT (id) DO NOTHING;

-- 3. Seed Failure Scenarios
INSERT INTO failure_scenarios (id, name, pipeline_id, pipeline_name, environment, category, description, raw_logs, expected_root_cause, expected_fix)
VALUES
('f1111111-1111-1111-1111-111111111111',
 'FinTech Realtime Transaction Aggregator - Out of Memory Failure',
 'pipe-fin-tx-09',
 'FinTech Ingestion Pipeline',
 'production',
 'OUT_OF_MEMORY',
 'High-frequency transaction stream caused Java JVM Heap space crash on worker pod 3.',
 '[
   "2026-07-24T12:00:01Z [INFO] Processing transaction batch 884920...",
   "2026-07-24T12:00:05Z [WARN] JVM GC overhead limit exceeded (98% time in GC)",
   "2026-07-24T12:00:08Z [ERROR] java.lang.OutOfMemoryError: Java heap space",
   "2026-07-24T12:00:09Z [FATAL] Process terminated with exit code 137 (OOMKilled)"
 ]'::jsonb,
 'Java JVM heap space exhausted due to memory leak in windowed aggregation buffer.',
 '{
   "actionType": "INCREASE_MEMORY_LIMIT",
   "description": "Increase worker pod RAM limit from 2GiB to 4GiB and restart deployment",
   "parameters": { "podName": "tx-aggregator-worker-3", "newLimit": "4Gi" },
   "estimatedDurationSeconds": 30,
   "riskTier": "LOW",
   "confidenceScore": 95.0,
   "requiresHumanApproval": false,
   "justification": "Safe transient memory scaling rule with high confidence match in knowledge base."
 }'::jsonb),

('f2222222-2222-2222-2222-222222222222',
 'Customer Analytics Data Warehouse - Database Timeout',
 'pipe-analytics-dw-02',
 'Analytics ETL Pipeline',
 'production',
 'DATABASE_TIMEOUT',
 'Redshift/Postgres connection pool exhausted during nightly aggregations.',
 '[
   "2026-07-24T12:10:00Z [INFO] Initiating nightly rollups...",
   "2026-07-24T12:10:30Z [ERROR] HikariPool-1 - Connection is not available, request timed out after 30005ms.",
   "2026-07-24T12:10:31Z [ERROR] org.postgresql.util.PSQLException: FATAL: sorry, too many clients already"
 ]'::jsonb,
 'Unclosed connection leak in legacy ETL query script holding pool lock.',
 '{
   "actionType": "FLUSH_CONNECTION_POOL",
   "description": "Flush idle connections in HikariPool and reset connection limit",
   "parameters": { "poolName": "HikariPool-1", "targetConnections": 150 },
   "estimatedDurationSeconds": 15,
   "riskTier": "MEDIUM",
   "confidenceScore": 90.0,
   "requiresHumanApproval": false,
   "justification": "Flushing idle pools restores DB responsiveness without downtime."
 }'::jsonb)
ON CONFLICT (id) DO NOTHING;
