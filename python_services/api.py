"""
FastAPI Server exposing Multi-Agent Orchestrator endpoints.
Runs all 5 agents end-to-end: Monitor -> Diagnosis -> Risk -> Remediation -> Reporting.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, Optional, List

from python_services.db import (
    seed_baseline, 
    record_pipeline_run, 
    get_pending_investigations,
    get_diagnoses,
    get_risk_decisions,
    get_remediation_attempts,
    get_post_mortem_reports,
    get_incident_reports,
    get_all_code_files,
    get_code_file_by_path,
    get_code_patches,
    reset_db
)
from python_services.sync_code_to_supabase import sync_code_to_supabase
from python_services.monitor_agent import MonitorAgent
from python_services.diagnosis_agent import DiagnosisAgent
from python_services.risk_agent import RiskAgent
from python_services.remediation_agent import RemediationAgent
from python_services.reporting_agent import ReportingAgent
from python_services.reporting_escalation_agent import ReportingEscalationAgent

app = FastAPI(title="Self-Healing Data Pipeline Agent API", version="1.4.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Seed initial default baseline on startup
seed_baseline(
    pipeline_id="pipe-fin-tx-09",
    schema={"id": "INT", "user_id": "VARCHAR", "amount": "NUMERIC", "timestamp": "TIMESTAMPTZ"},
    avg_rows=1000,
    avg_duration=60.0,
    avg_null_rate=0.02
)

class RunPipelineRequest(BaseModel):
    pipeline_id: str = "pipe-fin-tx-09"
    status: str = "SUCCESS"
    row_count: int = 1000
    duration_seconds: float = 60.0
    null_rate: float = 0.02
    schema_snapshot: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    allow_irreversible_autofix: bool = True

@app.get("/api/health")
def health_check():
    return {"status": "ONLINE", "service": "Self-Healing Agent Python Service", "version": "1.4.0"}

@app.post("/api/run-pipeline")
def run_pipeline_orchestration(req: RunPipelineRequest):
    """
    Executes complete multi-agent self-healing loop:
    Monitor -> Diagnosis -> Risk -> Remediation -> Reporting -> Reporting/Escalation
    """
    schema = req.schema_snapshot or {"id": "INT", "user_id": "VARCHAR", "amount": "NUMERIC", "timestamp": "TIMESTAMPTZ"}

    # Step 1: Record Pipeline Run
    run_record = record_pipeline_run({
        "pipeline_id": req.pipeline_id,
        "status": req.status,
        "row_count": req.row_count,
        "duration_seconds": req.duration_seconds,
        "null_rate": req.null_rate,
        "schema_snapshot": schema,
        "error_message": req.error_message
    })

    # Step 2: Agent 1 - Monitor/Trigger Agent (Deterministic Gatekeeper)
    mon_res = MonitorAgent.evaluate_pipeline_run(run_record)

    if mon_res["status"] == "HEALTHY":
        return {
            "status": "HEALTHY",
            "pipeline_id": req.pipeline_id,
            "run_id": run_record["id"],
            "message": "Pipeline run executed cleanly within baseline tolerance thresholds."
        }

    # Step 3: Agent 2 - Diagnosis Agent (LangGraph ReAct Subgraph)
    inv_row = {
        "id": mon_res["investigation_id"],
        "run_id": run_record["id"],
        "pipeline_id": req.pipeline_id,
        "error_message": req.error_message or "Anomalies detected",
        "deviated_signals": mon_res["deviated_signals"]
    }
    diag_res = DiagnosisAgent.run_diagnosis(inv_row)

    # Step 4: Agent 3 - Risk/Authority Agent (Policy Engine)
    risk_dec = RiskAgent.evaluate_risk_policy(diag_res, allow_irreversible_autofix=req.allow_irreversible_autofix)

    # Step 5: Agent 4 - Remediation Agent (Actor + Verification)
    rem_res = RemediationAgent.execute_remediation(risk_dec)

    # Step 6: Agent 5 - Reporting & Learning Agent (Post-Mortem & RAG Update)
    report_res = ReportingAgent.generate_post_mortem(
        pipeline_id=req.pipeline_id,
        run_id=run_record["id"],
        diagnosis=diag_res,
        risk_decision=risk_dec,
        remediation=rem_res
    )

    # Step 7: Phase 8 Agent - Reporting/Escalation Agent (Trace Stitching + Notification Delivery)
    incident_report = ReportingEscalationAgent.process_incident(run_record["id"])

    return {
        "status": "ANOMALY_HANDLED",
        "pipeline_id": req.pipeline_id,
        "run_id": run_record["id"],
        "monitor": mon_res,
        "diagnosis": diag_res,
        "risk_decision": risk_dec,
        "remediation": rem_res,
        "reporting": report_res,
        "incident_report": incident_report
    }

@app.get("/api/investigations")
def get_all_investigations():
    return get_pending_investigations()

@app.get("/api/diagnoses")
def get_all_diagnoses():
    return get_diagnoses()

@app.get("/api/risk-decisions")
def get_all_risk_decisions():
    return get_risk_decisions()

@app.get("/api/remediation-attempts")
def get_all_remediation_attempts():
    return get_remediation_attempts()

@app.get("/api/post-mortems")
def get_all_post_mortems():
    return get_post_mortem_reports()

@app.get("/api/incident-reports")
def get_all_incident_reports():
    return get_incident_reports()

@app.get("/api/code-repository")
def get_code_repository(category: Optional[str] = None):
    files = get_all_code_files(category=category)
    if not files:
        # Perform auto-sync if empty
        sync_code_to_supabase()
        files = get_all_code_files(category=category)
    return files

@app.post("/api/code-repository/sync")
def trigger_code_sync():
    res = sync_code_to_supabase()
    return res

@app.get("/api/code-repository/file")
def get_code_file(file_path: str):
    file_record = get_code_file_by_path(file_path)
    if not file_record:
        raise HTTPException(status_code=404, detail="Code file not found in repository")
    return file_record

@app.get("/api/code-patches")
def get_all_code_patches(run_id: Optional[str] = None):
    return get_code_patches(run_id=run_id)

class ErrorReportRequest(BaseModel):
    logs_or_text: Optional[str] = None
    diagnoses: Optional[List[Dict[str, Any]]] = None

@app.post("/api/error-reports")
def generate_multi_error_reports(req: ErrorReportRequest):
    """
    Generates a comprehensive 11-field diagnostic report for EVERY error found in logs or diagnoses list.
    Does NOT stop after finding the first error.
    """
    from python_services.full_error_report_service import FullErrorReportGenerator
    reports = FullErrorReportGenerator.generate_reports(
        logs_or_text=req.logs_or_text or "",
        known_diagnoses=req.diagnoses
    )
    return reports

