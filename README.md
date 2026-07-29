# 🔧 Self-Healing Data Pipeline Agent

> A production-grade, multi-agent autonomous system that monitors data pipelines, diagnoses failures, evaluates risk, executes remediation, and generates human-readable incident reports — all with human-in-the-loop governance controls and real-time observability.

[![GitHub Repo](https://img.shields.io/badge/GitHub-shreenidhir12%2Fself--healing--data--pipeline--agent-blue?logo=github)](https://github.com/shreenidhir12/self-healing-data-pipeline-agent)
[![App URL](https://img.shields.io/badge/Local%20App-http%3A%2F%2Flocalhost%3A3000%2F-emerald)](http://localhost:3000/)
[![Tests](https://img.shields.io/badge/tests-38%2F38%20passing-brightgreen)](#testing)
[![TypeScript](https://img.shields.io/badge/TypeScript-0%20errors-blue)](#tech-stack)
[![License](https://img.shields.io/badge/license-MIT-purple)](#license)

---

- **Primary GitHub Repository**: [https://github.com/lathikasaran-tech/Self-healing-pipeline](https://github.com/lathikasaran-tech/Self-healing-pipeline)
- **Secondary GitHub Repository 1**: [https://github.com/shreenidhir12/self-healing-data-pipeline-agent](https://github.com/shreenidhir12/self-healing-data-pipeline-agent)
- **Secondary GitHub Repository 2**: [https://github.com/lathikasaran26-cpu/self-healing-data-pipeline-agent](https://github.com/lathikasaran26-cpu/self-healing-data-pipeline-agent)
- **Local Application URL**: [http://localhost:3000/](http://localhost:3000/)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Agent Pipeline](#agent-pipeline)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Dashboard Guide](#dashboard-guide)
- [Authority Matrix](#authority-matrix)
- [License](#license)

---

## Overview

Traditional data pipelines break silently — schema changes upstream, API rate limits, credential expiry, data quality degradation. By the time a human notices, downstream dashboards are stale and stakeholders are frustrated.

**Self-Healing Data Pipeline Agent** eliminates this by deploying a coordinated team of 6 specialized agents that autonomously detect, diagnose, evaluate, fix, and report pipeline failures in seconds — not hours.

### Key Capabilities

| Capability | Description |
|---|---|
| **Autonomous Detection** | Deterministic rule-based gatekeeper evaluates every pipeline run against baselines |
| **Root Cause Diagnosis** | LangGraph ReAct subgraph with 5 diagnostic tools and hard iteration cap of 4 |
| **Risk-Aware Remediation** | Authority matrix maps (confidence × reversibility) to action decisions |
| **Bounded Retry** | Max 2 remediation attempts with mandatory post-fix verification |
| **Explainability** | Full trace stitching across all agents for any incident |
| **Human Governance** | Interactive HITL studio for escalated incidents requiring SRE sign-off |
| **Slack Notifications** | Outcome-based routing to `#ops-alerts` or `#oncall-pager` channels |
| **Observability** | Real-time MTTR tracking, agent performance waterfall, failure distribution analytics |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        React + Vite Frontend                        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ Multi-Agent   │ │  HITL        │ │Observa-  │ │  Data Engine  │  │
│  │ Engine (P3)   │ │  Studio (P9) │ │bility(P10│ │  (Phase 2)    │  │
│  └──────┬───────┘ └──────┬───────┘ └────┬─────┘ └───────┬───────┘  │
│         │                │              │               │           │
│         └────────────────┴──────────────┴───────────────┘           │
│                              │ HTTP API                             │
└──────────────────────────────┼──────────────────────────────────────┘
                               │
┌──────────────────────────────┼──────────────────────────────────────┐
│                    FastAPI Python Backend                            │
│                              │                                      │
│  ┌───────────┐  ┌────────────┴────────────┐  ┌──────────────────┐  │
│  │ Monitor   │→ │    Diagnosis Agent      │→ │  Risk/Authority  │  │
│  │ Agent     │  │  (LangGraph ReAct)      │  │  Policy Engine   │  │
│  │(Rule-Based│  │  • check_schema_diff    │  │  • Authority     │  │
│  │Gatekeeper)│  │  • query_source_api     │  │    Matrix        │  │
│  │           │  │  • sample_recent_rows   │  │  • Reversibility │  │
│  │ 4 Signals │  │  • check_data_quality   │  │    Tagging       │  │
│  │ Evaluated │  │  • get_schema_history   │  │                  │  │
│  └───────────┘  └─────────────────────────┘  └────────┬─────────┘  │
│                                                       │            │
│  ┌──────────────────┐  ┌──────────────────────────────┴─────────┐  │
│  │ Reporting &      │← │       Remediation Agent                │  │
│  │ Escalation Agent │  │  • Execute fix action                  │  │
│  │ • Trace Stitch   │  │  • Mandatory rerun_pipeline()          │  │
│  │ • Slack Webhook  │  │  • Mandatory verify_success()          │  │
│  │ • incident_reports│ │  • Max 2 attempts (bounded)            │  │
│  └──────────────────┘  └────────────────────────────────────────┘  │
│                              │                                      │
│                    ┌─────────┴──────────┐                           │
│                    │   In-Memory DB     │                           │
│                    │  (Supabase-Ready)  │                           │
│                    └────────────────────┘                           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React 18 + TypeScript + Vite | Interactive dashboard SPA |
| **Styling** | Tailwind CSS + Lucide Icons | Modern dark-theme UI |
| **Backend** | Python 3.12 + FastAPI | Agent orchestration service |
| **Agent Framework** | LangGraph | ReAct subgraph for Diagnosis Agent |
| **LLM (Optional)** | Ollama (llama3.1:8b) | Used only by Diagnosis Agent for hypothesis generation |
| **Database** | Supabase (Postgres) / In-Memory | Pipeline runs, baselines, diagnoses, decisions, reports |
| **Notifications** | Slack Webhooks | Outcome-based alert routing |

---

## Agent Pipeline

### Agent 1: Monitor/Trigger Agent
**Type:** Deterministic Rule-Based Gatekeeper (NO LLM)

Evaluates every pipeline run against baselines on 4 signals:

| Signal | Threshold | Rationale |
|---|---|---|
| Row Count | ±20% | Detects missing partitions or duplicate ingestion |
| Duration | ±50% | Detects API rate-limiting or premature termination |
| Null Rate | +10% points or >15% absolute | Detects schema mismatch or field renames |
| Status | `FAILED` or `error_message` present | Catches explicit job failures |

### Agent 2: Diagnosis Agent
**Type:** LangGraph ReAct Subgraph with Code-Derived Confidence

- Uses 5 diagnostic tools: `check_schema_diff`, `query_source_api_health`, `sample_recent_rows`, `check_data_quality_stats`, `get_recent_schema_history`
- **Hard iteration cap of 4** enforced via LangGraph conditional edge (not a prompt instruction)
- Confidence is computed by **code logic** from an evidence checklist — the LLM never self-reports confidence
- Failure classes: `SCHEMA_DRIFT`, `SOURCE_API_FAILURE`, `DATA_QUALITY_ANOMALY`, `STALE_MISSING_DATA`, `DOWNSTREAM_WRITE_FAILURE`, `CREDENTIAL_EXPIRED`

### Agent 3: Risk/Authority Agent
**Type:** Policy Engine (Structurally separate from Diagnosis)

See [Authority Matrix](#authority-matrix) below.

### Agent 4: Remediation Agent
**Type:** Actor with Mandatory Post-Fix Verification

- Executes fix action → calls `rerun_pipeline()` → calls `verify_success()`
- **Never assumes a fix worked** — always verifies against baseline tolerances
- Max 2 total attempts; if both fail, escalates instead of retrying

### Agent 5: Reporting & Learning Agent
**Type:** Post-Mortem Synthesis + RAG Feedback Loop

- Generates structured markdown post-mortem reports
- Computes downtime avoided metrics
- Updates knowledge base success weights

### Agent 6: Reporting/Escalation Agent
**Type:** Explainability Layer + Notification Delivery

- Stitches complete trace across all agents for any `run_id`
- Generates human-readable incident reports (not JSON dumps)
- Routes notifications via Slack Webhooks based on outcome type:
  - `SILENT_AUTOFIX` → No notification sent
  - `AUTOFIX_NOTIFY` → `#ops-alerts-slack`
  - `ESCALATION` → `#oncall-pager-slack`

---

## Project Structure

```
self_healing_data_agent_proj/
├── src/                              # React Frontend
│   ├── App.tsx                       # Main app with phase navigation
│   ├── components/
│   │   ├── Phase2DataEngine.tsx      # Supabase schema & RAG viewer
│   │   ├── Phase3MultiAgentDashboard.tsx  # Interactive agent graph + failure injector
│   │   ├── Phase9HITLGovernanceStudio.tsx  # Human governance sign-off queue
│   │   └── Phase10ObservabilityDashboard.tsx  # Analytics, MTTR, timeline
│   ├── services/
│   │   ├── dataService.ts            # Supabase/local data abstraction
│   │   ├── multiAgentEngine.ts       # Client-side agent orchestrator
│   │   └── pythonAgentService.ts     # FastAPI HTTP client
│   ├── types/agent.ts                # TypeScript type definitions
│   ├── data/mockData.ts              # Mock failure scenarios
│   └── lib/supabase.ts              # Supabase client config
│
├── python_services/                  # Python Agent Backend
│   ├── api.py                        # FastAPI orchestrator (all endpoints)
│   ├── db.py                         # In-memory DB with Supabase-ready schema
│   ├── monitor_agent.py              # Agent 1: Deterministic gatekeeper
│   ├── diagnosis_agent.py            # Agent 2: LangGraph ReAct subgraph
│   ├── diagnostic_tools.py           # 5 diagnostic tool implementations
│   ├── risk_agent.py                 # Agent 3: Policy engine
│   ├── remediation_agent.py          # Agent 4: Actor + verification
│   ├── reporting_agent.py            # Agent 5: Post-mortem + RAG feedback
│   └── reporting_escalation_agent.py # Agent 6: Trace stitching + Slack
│
├── tests/                            # Python Unit Tests (33 tests)
│   ├── test_monitor_agent.py         # 7 tests for Monitor Agent
│   ├── test_diagnosis_agent.py       # 7 tests for Diagnosis Agent
│   ├── test_risk_and_remediation_agents.py  # 12 tests for Risk + Remediation
│   ├── test_reporting_and_api.py     # 3 tests for Reporting + E2E API
│   └── test_reporting_escalation_agent.py   # 4 tests for Escalation Agent
│
├── supabase/
│   ├── migrations/
│   │   ├── 20260724_phase2_schema.sql    # Core tables DDL
│   │   └── 20260725_phase3_agents_schema.sql  # Agent tables DDL
│   └── seed.sql                      # Sample seed data
│
├── .env.example                      # Environment variable template
├── package.json                      # Node.js dependencies
├── tsconfig.json                     # TypeScript configuration
├── tailwind.config.js                # Tailwind CSS configuration
├── vite.config.ts                    # Vite build configuration
└── postcss.config.js                 # PostCSS configuration
```

---

## Getting Started

### Prerequisites

- **Node.js** v20+ ([download](https://nodejs.org/))
- **Python** 3.12+ ([download](https://www.python.org/))
- **Ollama** (optional, for LLM-powered diagnosis) ([download](https://ollama.com/))

### 1. Clone & Install

```bash
git clone https://github.com/your-username/self-healing-data-pipeline-agent.git
cd self-healing-data-pipeline-agent

# Install frontend dependencies
npm install

# Install Python dependencies
pip install fastapi uvicorn langgraph requests
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your Supabase credentials (optional for local dev)
```

### 3. Start the Frontend

```bash
npm run dev
# Dashboard available at http://127.0.0.1:3000/
```

### 4. Start the Python Backend (Optional)

```bash
uvicorn python_services.api:app --host 127.0.0.1 --port 8000 --reload
# API available at http://127.0.0.1:8000/api/health
```

### 5. Start Ollama (Optional)

```bash
ollama pull llama3.1:8b
ollama serve
# The Diagnosis Agent will use Ollama for hypothesis generation
# If Ollama is not running, it falls back to deterministic tool selection
```

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | No | Supabase project URL (falls back to in-memory) |
| `VITE_SUPABASE_ANON_KEY` | No | Supabase anonymous key |
| `OLLAMA_BASE_URL` | No | Ollama API URL (default: `http://localhost:11434`) |
| `SLACK_WEBHOOK_URL` | No | Slack incoming webhook URL for notifications |

---

## API Reference

### Base URL: `http://127.0.0.1:8000/api`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Service health check |
| `POST` | `/run-pipeline` | Execute full multi-agent pipeline |
| `GET` | `/investigations` | List all pending investigations |
| `GET` | `/diagnoses` | List all diagnosis records |
| `GET` | `/risk-decisions` | List all risk policy decisions |
| `GET` | `/remediation-attempts` | List all remediation attempts |
| `GET` | `/post-mortems` | List all post-mortem reports |
| `GET` | `/incident-reports` | List all incident reports |

### POST `/run-pipeline` Request Body

```json
{
  "pipeline_id": "pipe-fin-tx-09",
  "status": "SUCCESS",
  "row_count": 1000,
  "duration_seconds": 60.0,
  "null_rate": 0.02,
  "schema_snapshot": {"id": "INT", "user_id": "VARCHAR", "amount": "NUMERIC"},
  "error_message": null,
  "allow_irreversible_autofix": true
}
```

### Response (Anomaly Detected)

```json
{
  "status": "ANOMALY_HANDLED",
  "pipeline_id": "pipe-fin-tx-09",
  "run_id": "run-a1b2c3d4",
  "monitor": { "status": "ANOMALOUS", "deviated_signals": [...] },
  "diagnosis": { "failure_class": "SCHEMA_DRIFT", "confidence": "high" },
  "risk_decision": { "decision": "auto-fix-notify", "action_type": "apply_schema_patch" },
  "remediation": { "status": "SUCCESS", "attempts_count": 1 },
  "reporting": { "status": "RESOLVED", "downtime_avoided_mins": 45 },
  "incident_report": { "outcome_type": "AUTOFIX_NOTIFY", "delivery_status": "DELIVERED" }
}
```

---

## Testing

### Run All Tests

```bash
# Python agent unit tests (33 tests)
python -m unittest discover tests -v

# TypeScript type checking
npx tsc --noEmit

# Production build
npm run build
```

### Test Coverage by Agent

| Test File | Agent | Tests | Focus |
|---|---|---|---|
| `test_monitor_agent.py` | Monitor | 7 | Threshold signals, edge cases, graceful defaults |
| `test_diagnosis_agent.py` | Diagnosis | 7 | Clear-cut diagnoses, ambiguous cases, iteration cap enforcement |
| `test_risk_and_remediation_agents.py` | Risk + Remediation | 12 | Authority matrix rules, bounded retry, fallback escalation |
| `test_reporting_and_api.py` | Reporting + E2E | 3 | Post-mortem generation, clean runs, end-to-end orchestration |
| `test_reporting_escalation_agent.py` | Escalation | 4 | Silent/notify/escalation delivery, trace stitching |

---

## Dashboard Guide

Access the dashboard at **http://127.0.0.1:3000/** with 4 navigation tabs:

### 🚀 Agent Engine (Phase 3)
- Interactive 5-agent visual node graph
- Real-time ReAct thought terminal stream
- Failure scenario injection buttons (Schema Drift, API Failure, Null Spike, etc.)
- Human governance sign-off modal

### 👤 HITL Studio (Phase 9)
- Pending escalation queue with SRE sign-off controls
- Deep trace & justification inspector
- Actions: Approve, Reject, or Apply Custom Patch
- Full audit trail logging with timestamps

### 📊 Observability (Phase 10)
- KPI cards: Total Incidents, Auto-Resolution Rate, MTTR, Downtime Avoided
- Interactive incident timeline with click-to-expand agent execution waterfall
- Failure class distribution chart
- Agent average & max execution time tracking
- Resolution outcome breakdown (Auto-Resolved / Escalated / Failed)

### 🗄️ Data Engine (Phase 2)
- Supabase schema inspector
- Pipeline baselines viewer
- RAG knowledge articles browser

---

## Authority Matrix

The Risk/Authority Agent implements the following policy matrix:

| Confidence | Reversibility | Decision | Notification |
|---|---|---|---|
| **High** | Reversible | `auto-fix` | Silent |
| **High** | Irreversible | `auto-fix-notify` | `#ops-alerts-slack` |
| **High** | Irreversible (Strict Safety) | `escalate-only` | `#oncall-pager-slack` |
| **Medium** | Reversible | `auto-fix-notify` | `#ops-alerts-slack` |
| **Medium** | Irreversible | `escalate-only` | `#oncall-pager-slack` |
| **Low / Inconclusive** | Any | `escalate-only` | `#oncall-pager-slack` |

### Action Reversibility Classification

| Action | Reversibility | Rationale |
|---|---|---|
| `retry_job` | ✅ Reversible | Idempotent re-execution |
| `quarantine_rows` | ✅ Reversible | Soft-delete with rollback |
| `rerun_pipeline` | ✅ Reversible | Fresh execution |
| `apply_schema_patch` | ❌ Irreversible | DDL column modifications |
| `refresh_credentials` | ❌ Irreversible | Security token rotation |

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>Self-Healing Data Pipeline Agent</strong><br>
  Built with React, TypeScript, Tailwind CSS, Python, FastAPI, LangGraph & Supabase
</p>
