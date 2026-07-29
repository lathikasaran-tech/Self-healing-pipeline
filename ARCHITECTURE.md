# Agent Architecture & Design Documentation

> Technical deep-dive into the Self-Healing Data Pipeline Agent system architecture, agent design patterns, data flow, and key design decisions.

---

## 1. System Design Philosophy

### 1.1 Separation of Concerns

Each agent has a single, well-defined responsibility:

| Agent | Responsibility | What It Does NOT Do |
|---|---|---|
| Monitor | Detect anomalies | Never diagnoses root cause |
| Diagnosis | Identify root cause | Never decides what action to take |
| Risk | Decide what to do | Never investigates what went wrong |
| Remediation | Execute and verify fixes | Never evaluates risk or makes policy decisions |
| Reporting | Explain what happened | Never makes operational decisions |

This separation ensures each agent can be **audited, tested, and tuned independently**.

### 1.2 Deterministic Where Possible, LLM Where Necessary

- **Monitor Agent**: 100% deterministic (threshold comparisons)
- **Risk Agent**: 100% deterministic (policy matrix lookup)
- **Remediation Agent**: 100% deterministic (action execution + verification)
- **Diagnosis Agent**: LLM-assisted but code-controlled (LangGraph graph enforces iteration cap; code computes confidence)
- **Reporting Agents**: 100% deterministic (template-based generation)

### 1.3 Safety by Default

- **Bounded retries**: Max 2 remediation attempts — never infinite loops
- **Mandatory verification**: Every fix is followed by `rerun_pipeline()` → `verify_success()`
- **Escalation as fallback**: When in doubt, escalate to humans
- **Audit trail**: Every decision is logged with justification

---

## 2. Data Flow

```
Pipeline Execution
       │
       ▼
┌──────────────────┐     run record      ┌──────────────────┐
│  record_pipeline │ ──────────────────→  │  pipeline_runs   │
│  _run()          │                      │  table            │
└──────────────────┘                      └──────────────────┘
       │
       ▼
┌──────────────────┐    HEALTHY?  ───→  STOP (no further processing)
│  Monitor Agent   │
│  evaluate_run()  │    ANOMALOUS? ──→  write_pending_investigation()
└──────────────────┘                           │
                                               ▼
                                    ┌──────────────────┐
                                    │  Diagnosis Agent  │
                                    │  run_diagnosis()  │
                                    │  → write_diagnosis│
                                    └──────────┬───────┘
                                               │
                                               ▼
                                    ┌──────────────────┐
                                    │  Risk Agent       │
                                    │  evaluate_policy()│
                                    │  → write_risk_    │
                                    │    decision       │
                                    └──────────┬───────┘
                                               │
                              ┌────────────────┼────────────────┐
                              │                │                │
                         auto-fix        auto-fix-notify   escalate-only
                              │                │                │
                              ▼                ▼                ▼
                     ┌────────────┐   ┌────────────┐   ┌────────────┐
                     │ Remediation│   │ Remediation│   │   SKIP     │
                     │ execute()  │   │ execute()  │   │ (ESCALATED)│
                     │ verify()   │   │ verify()   │   │            │
                     └─────┬──────┘   └─────┬──────┘   └─────┬──────┘
                           │                │                │
                           ▼                ▼                ▼
                     ┌─────────────────────────────────────────────┐
                     │         Reporting/Escalation Agent          │
                     │  stitch_trace() → generate_report()         │
                     │  → send_notification() → write_incident()   │
                     └─────────────────────────────────────────────┘
```

---

## 3. Agent Design Details

### 3.1 Monitor Agent (`monitor_agent.py`)

**Pattern**: Pure function with threshold comparison

```python
# Signal evaluation pseudocode
if abs(actual_rows - baseline_rows) / baseline_rows > 0.20:
    flag("row_count_deviation")

if abs(actual_duration - baseline_duration) / baseline_duration > 0.50:
    flag("duration_deviation")

if actual_null_rate - baseline_null_rate > 0.10 or actual_null_rate > 0.15:
    flag("null_rate_anomaly")

if status == "FAILED" or error_message:
    flag("error_status")
```

**Key Design Decision**: Thresholds are tuned conservatively to minimize false positives while catching genuine anomalies. The ±20% row count threshold accounts for normal batch volume variation (~15%) with a safety margin.

### 3.2 Diagnosis Agent (`diagnosis_agent.py`)

**Pattern**: LangGraph StateGraph with ReAct loop

```
START → reason_node → route_next_step → action_node → reason_node → ...
                          │
                          ├── iterations < 4 → continue loop
                          ├── tool == "FINALIZE" → finalize_node → END
                          └── iterations >= 4 → force_inconclusive → END
```

**Critical Design Decisions**:

1. **Iteration Cap Enforcement**: The cap of 4 is enforced by the graph's conditional edge router function, NOT by a prompt instruction to the LLM. This is non-negotiable — the LLM cannot override it.

2. **Code-Derived Confidence**: The `evaluate_evidence_checklist()` function computes failure class and confidence from the raw tool outputs. The LLM is never asked to self-report confidence.

3. **Fresh Hypothesis Per Turn**: Each reasoning turn regenerates hypotheses from the full raw evidence log, preventing hypothesis anchoring.

### 3.3 Risk Agent (`risk_agent.py`)

**Pattern**: Policy matrix lookup with reversibility tagging

The agent tags each action type with a reversibility classification, then looks up the (confidence, reversibility) pair in the authority matrix to produce a decision.

**Key Design Decision**: The Risk Agent is structurally separate from the Diagnosis Agent. It never re-examines evidence or questions the diagnosis. It only asks: "Given this diagnosis, what should we do?"

### 3.4 Remediation Agent (`remediation_agent.py`)

**Pattern**: Execute → Rerun → Verify → Retry-or-Escalate

```python
for attempt in range(1, 3):  # Max 2 attempts
    result = execute_action(action_type)
    rerun = rerun_pipeline()
    verified = verify_success(baseline)

    if verified:
        return SUCCESS

    if attempt == 2:
        return ESCALATED  # Stop retrying
```

**Key Design Decision**: The agent NEVER assumes a fix worked. Post-fix verification checks actual row counts and null rates against baseline tolerances.

---

## 4. Database Schema

### Core Tables

| Table | Purpose | Key Columns |
|---|---|---|
| `pipeline_runs` | Every pipeline execution | id, pipeline_id, status, row_count, duration, null_rate, schema_snapshot |
| `pipeline_baselines` | Known-good metrics per pipeline | pipeline_id, avg_row_count, avg_duration, avg_null_rate, schema_snapshot |
| `pending_investigations` | Monitor-flagged anomalies | id, run_id, pipeline_id, deviated_signals, status |
| `diagnoses` | Root cause analysis results | id, investigation_id, failure_class, confidence, ruled_out, evidence |
| `risk_decisions` | Policy engine outcomes | id, diagnosis_id, decision, action_type, is_reversible, justification |
| `remediation_attempts` | Fix execution records | id, risk_decision_id, attempt_number, action_taken, verification_passed |
| `incident_reports` | Full trace reports | id, run_id, outcome_type, sent_to, delivery_status, report_markdown |

### Foreign Key Chain

```
pipeline_runs.id
  └→ pending_investigations.run_id
       └→ diagnoses.investigation_id
            └→ risk_decisions.diagnosis_id
                 └→ remediation_attempts.risk_decision_id
                      └→ incident_reports.run_id (references pipeline_runs)
```

---

## 5. Failure Classes

| Failure Class | Typical Signals | Diagnostic Evidence |
|---|---|---|
| `SCHEMA_DRIFT` | High null rate, schema mismatch | `check_schema_diff` returns missing/added columns |
| `SOURCE_API_FAILURE` | FAILED status, high duration | `query_source_api_health` returns HTTP 5xx or `is_up: false` |
| `DATA_QUALITY_ANOMALY` | High null rate, schema matches | `check_data_quality_stats` shows elevated nulls without schema change |
| `STALE_MISSING_DATA` | Very low row count, API healthy | `sample_recent_rows` shows 0 rows with healthy upstream |
| `DOWNSTREAM_WRITE_FAILURE` | FAILED status, schema OK, API OK | Error message contains DB permission or write failure keywords |
| `CREDENTIAL_EXPIRED` | FAILED status, HTTP 401/403 | `query_source_api_health` returns 401/403 |

---

## 6. Notification Routing

```
Outcome Type          Channel                    Action
─────────────────────────────────────────────────────────
SILENT_AUTOFIX    →   None (not sent)        →   Report stored only
AUTOFIX_NOTIFY    →   #ops-alerts-slack      →   Report stored + Slack notification
ESCALATION        →   #oncall-pager-slack    →   Report stored + Slack notification + HITL queue
```

---

## 7. Testing Strategy

### Unit Test Design Principles

1. **Clear-Cut Cases**: Each failure class has at least one test with unambiguous signal patterns that MUST produce the correct diagnosis.

2. **Ambiguous Cases**: Tests with borderline or conflicting signals that MUST produce `inconclusive` rather than a confident wrong answer.

3. **Boundary Enforcement**: Tests verify that iteration caps, retry limits, and policy rules are enforced by code structure, not by hoping the LLM cooperates.

4. **Integration Tests**: End-to-end tests that run all 6 agents sequentially on synthetic pipeline runs and verify the complete trace.

### Test Isolation

Every test calls `reset_db()` in `setUp()` to guarantee clean in-memory state between tests. No test depends on another test's side effects.
