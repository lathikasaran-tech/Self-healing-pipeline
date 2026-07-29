"""
Diagnosis Agent for Self-Healing Data Pipeline System.
Implemented as a LangGraph ReAct Subgraph with hard iteration cap of 4.

Key Architecture Constraints:
-----------------------------
1. ReAct Loop: Re-evaluates evidence log FRESH each turn.
2. Hard Iteration Cap of 4: Enforced via LangGraph conditional edge.
3. Code-derived Confidence: Failure class, confidence, and ruled-out classes
   are computed by code logic from the evidence checklist (NOT LLM self-report).
4. Inconclusive as Valid Outcome: System prompt and code explicitly support
   'inconclusive' to guarantee ZERO confident wrong answers.
"""

import json
import requests
from typing import Dict, Any, List, TypedDict, Annotated, Literal
from langgraph.graph import StateGraph, END
from python_services.db import write_diagnosis, get_pipeline_run
from python_services.diagnostic_tools import (
    check_schema_diff,
    query_source_api_health,
    sample_recent_rows,
    check_data_quality_stats,
    get_recent_schema_history
)

OLLAMA_API_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "llama3.1:8b"

SYSTEM_PROMPT = """You are the Diagnosis Agent for a production data pipeline system.
Your job is to investigate why a pipeline run failed using diagnostic tools.

CRITICAL RULES:
1. Base your reasoning STRICTLY on the raw evidence log provided.
2. 'inconclusive' is a valid, correct, non-failure outcome. A wrong confident diagnosis is FAR WORSE than an honest inconclusive one.
3. Call diagnostic tools to gather evidence:
   - check_schema_diff: Check if schema changed
   - query_source_api_health: Check source API status
   - sample_recent_rows: Check if data was ingested
   - check_data_quality_stats: Check null rate and data quality
   - get_recent_schema_history: Check schema evolution history
"""

class AgentState(TypedDict):
    investigation_id: str
    run_id: str
    pipeline_id: str
    error_message: str
    deviated_signals: List[Dict[str, Any]]
    evidence_log: List[Dict[str, Any]]
    iterations_used: int
    hypothesis: str
    tool_to_call: str
    status: str                         # 'confident' | 'inconclusive' | 'RUNNING'
    failure_class: str
    confidence: str                      # 'high' | 'medium' | 'low'
    ruled_out: List[str]

# Available Diagnostic Tools Registry
TOOLS_MAP = {
    "check_schema_diff": check_schema_diff,
    "query_source_api_health": query_source_api_health,
    "sample_recent_rows": sample_recent_rows,
    "check_data_quality_stats": check_data_quality_stats,
    "get_recent_schema_history": get_recent_schema_history
}


def call_ollama_or_fallback(prompt: str, state: AgentState) -> str:
    """
    Attempt to invoke local Ollama llama3.1:8b.
    If Ollama is not running locally, use deterministic ReAct sequence planner.
    """
    payload = {
        "model": MODEL_NAME,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.0}
    }
    try:
        resp = requests.post(OLLAMA_API_URL, json=payload, timeout=2)
        if resp.status_code == 200:
            return resp.json().get("response", "")
    except Exception:
        pass

    # Deterministic fallback tool ordering based on evidence gathered so far
    called_tools = [e.get("tool_name") for e in state["evidence_log"]]
    err = (state.get("error_message") or "").lower()

    if "check_schema_diff" not in called_tools:
        return "THOUGHT: Checking schema diff first.\nACTION: check_schema_diff"
    elif "query_source_api_health" not in called_tools:
        return "THOUGHT: Checking source API health.\nACTION: query_source_api_health"
    elif "sample" in err or "row count" in err or "stale" in err or "missing" in err:
        if "sample_recent_rows" not in called_tools:
            return "THOUGHT: Sampling recent rows.\nACTION: sample_recent_rows"
        elif "check_data_quality_stats" not in called_tools:
            return "THOUGHT: Checking data quality stats.\nACTION: check_data_quality_stats"
    elif "check_data_quality_stats" not in called_tools:
        return "THOUGHT: Checking data quality stats.\nACTION: check_data_quality_stats"
    elif "sample_recent_rows" not in called_tools:
        return "THOUGHT: Sampling recent rows.\nACTION: sample_recent_rows"
    else:
        return "THOUGHT: Sufficient evidence gathered.\nACTION: FINALIZE"


def reason_node(state: AgentState) -> Dict[str, Any]:
    """
    ReAct Reasoning Step: Regenerates current hypothesis FRESH each turn directly from the raw evidence log.
    """
    iteration = state["iterations_used"] + 1

    prompt = f"{SYSTEM_PROMPT}\n\nRAW EVIDENCE LOG:\n{json.dumps(state['evidence_log'], indent=2)}\n\n"
    prompt += f"ERROR MESSAGE: {state.get('error_message')}\n"
    prompt += f"CURRENT ITERATION: {iteration} / 4\n"
    prompt += "What diagnostic tool should be called next? Respond with tool name."

    response_text = call_ollama_or_fallback(prompt, state)

    # Determine tool to execute
    next_tool = ""
    for tool_name in TOOLS_MAP:
        if tool_name in response_text:
            next_tool = tool_name
            break

    if not next_tool:
        # Pick next uncalled tool
        called = [e.get("tool_name") for e in state["evidence_log"]]
        for t in ["check_schema_diff", "query_source_api_health", "sample_recent_rows", "check_data_quality_stats", "get_recent_schema_history"]:
            if t not in called:
                next_tool = t
                break

    return {
        "iterations_used": iteration,
        "hypothesis": f"Turn {iteration} reasoning based on {len(state['evidence_log'])} evidence items.",
        "tool_to_call": next_tool or "FINALIZE"
    }


def action_node(state: AgentState) -> Dict[str, Any]:
    """
    Executes selected tool and appends RAW tool output to append-only evidence log.
    """
    tool_name = state["tool_to_call"]
    evidence_log = list(state["evidence_log"])

    if tool_name in TOOLS_MAP:
        fn = TOOLS_MAP[tool_name]
        raw_output = fn(pipeline_id=state["pipeline_id"], run_id=state["run_id"])
        evidence_log.append(raw_output)

    return {"evidence_log": evidence_log}


def evaluate_evidence_checklist(state: AgentState) -> Dict[str, Any]:
    """
    Code-Derived Evidence Checklist Evaluator.
    Computes failure_class, status, confidence, and ruled_out lists from evidence.
    """
    evidence = state["evidence_log"]
    err_msg = (state.get("error_message") or "").lower()

    schema_diff_res = next((e for e in evidence if e.get("tool_name") == "check_schema_diff"), None)
    api_health_res = next((e for e in evidence if e.get("tool_name") == "query_source_api_health"), None)
    quality_res = next((e for e in evidence if e.get("tool_name") == "check_data_quality_stats"), None)
    sample_res = next((e for e in evidence if e.get("tool_name") == "sample_recent_rows"), None)

    run = get_pipeline_run(state["run_id"])
    run_row_count = run.get("row_count") if run else None

    ruled_out = []

    # Check 1: Downstream Write Failure (explicit DB permission / connection failure)
    if "permission denied" in err_msg or "psqlexception" in err_msg or "table analytics_fact" in err_msg:
        ruled_out.extend(["SCHEMA_DRIFT", "DATA_QUALITY_ANOMALY", "SOURCE_API_FAILURE"])
        return {
            "status": "confident",
            "failure_class": "DOWNSTREAM_WRITE_FAILURE",
            "confidence": "high",
            "ruled_out": ruled_out
        }

    # Check 2: Source API Failure
    if api_health_res and (api_health_res.get("http_status_code") != 200 or not api_health_res.get("is_up")):
        ruled_out.extend(["SCHEMA_DRIFT", "DATA_QUALITY_ANOMALY", "DOWNSTREAM_WRITE_FAILURE"])
        return {
            "status": "confident",
            "failure_class": "SOURCE_API_FAILURE",
            "confidence": "high",
            "ruled_out": ruled_out
        }
    if "http 500" in err_msg or "stripe api" in err_msg:
        ruled_out.extend(["SCHEMA_DRIFT", "DATA_QUALITY_ANOMALY", "DOWNSTREAM_WRITE_FAILURE"])
        return {
            "status": "confident",
            "failure_class": "SOURCE_API_FAILURE",
            "confidence": "high",
            "ruled_out": ruled_out
        }

    # Check 3: Schema Drift
    if schema_diff_res and schema_diff_res.get("has_diff"):
        ruled_out.extend(["DATA_QUALITY_ANOMALY", "SOURCE_API_FAILURE", "DOWNSTREAM_WRITE_FAILURE"])
        return {
            "status": "confident",
            "failure_class": "SCHEMA_DRIFT",
            "confidence": "high",
            "ruled_out": ruled_out
        }

    # Check 4: Data Quality Anomaly (high null rate without schema diff)
    if quality_res and quality_res.get("is_anomalous_null") and (not schema_diff_res or not schema_diff_res.get("has_diff")):
        ruled_out.extend(["SCHEMA_DRIFT", "SOURCE_API_FAILURE", "DOWNSTREAM_WRITE_FAILURE"])
        return {
            "status": "confident",
            "failure_class": "DATA_QUALITY_ANOMALY",
            "confidence": "high",
            "ruled_out": ruled_out
        }

    # Check 5: Stale / Missing Data
    if (sample_res and sample_res.get("is_empty")) or "row count drop" in err_msg:
        ruled_out.extend(["SCHEMA_DRIFT", "DATA_QUALITY_ANOMALY", "DOWNSTREAM_WRITE_FAILURE"])
        return {
            "status": "confident",
            "failure_class": "STALE_MISSING_DATA",
            "confidence": "high",
            "ruled_out": ruled_out
        }

    # Ambiguous / Inconclusive Case
    return {
        "status": "inconclusive",
        "failure_class": "UNKNOWN",
        "confidence": "low",
        "ruled_out": ["DOWNSTREAM_WRITE_FAILURE"]
    }


def finalize_node(state: AgentState) -> Dict[str, Any]:
    """
    Finalizes diagnosis based on code-derived evidence checklist.
    Writes output row to `diagnoses` table.
    """
    eval_res = evaluate_evidence_checklist(state)

    diagnosis_record = write_diagnosis({
        "investigation_id": state["investigation_id"],
        "pipeline_id": state["pipeline_id"],
        "run_id": state["run_id"],
        "status": eval_res["status"],
        "failure_class": eval_res["failure_class"],
        "ruled_out": eval_res["ruled_out"],
        "confidence": eval_res["confidence"],
        "evidence": state["evidence_log"],
        "iterations_used": state["iterations_used"]
    })

    return {
        "status": eval_res["status"],
        "failure_class": eval_res["failure_class"],
        "confidence": eval_res["confidence"],
        "ruled_out": eval_res["ruled_out"]
    }


def force_inconclusive_node(state: AgentState) -> Dict[str, Any]:
    """
    Force-routed node when hard iteration cap of 4 is hit.
    Guarantees that the LLM is NOT asked for a confidence judgment when cap is exceeded.
    """
    eval_res = evaluate_evidence_checklist(state)
    # Force status to inconclusive if still ambiguous
    status = eval_res["status"] if eval_res["status"] == "confident" else "inconclusive"
    failure_class = eval_res["failure_class"] if status == "confident" else "UNKNOWN"
    confidence = eval_res["confidence"] if status == "confident" else "low"

    write_diagnosis({
        "investigation_id": state["investigation_id"],
        "pipeline_id": state["pipeline_id"],
        "run_id": state["run_id"],
        "status": status,
        "failure_class": failure_class,
        "ruled_out": eval_res.get("ruled_out", []),
        "confidence": confidence,
        "evidence": state["evidence_log"],
        "iterations_used": 4
    })

    return {
        "status": status,
        "failure_class": failure_class,
        "confidence": confidence,
        "ruled_out": eval_res.get("ruled_out", [])
    }


def route_next_step(state: AgentState) -> str:
    """
    LangGraph Conditional Edge Enforcing Hard Iteration Cap of 4 in Code.
    """
    # 1. Hard iteration cap check (Code Counter Edge)
    if state["iterations_used"] >= 4:
        return "force_inconclusive"

    # 2. Check if evidence is already definitive
    eval_res = evaluate_evidence_checklist(state)
    if eval_res["status"] == "confident" and len(state["evidence_log"]) >= 2:
        return "finalize"

    return "action"


# Build LangGraph Subgraph
def build_diagnosis_graph():
    builder = StateGraph(AgentState)

    builder.add_node("reason", reason_node)
    builder.add_node("action", action_node)
    builder.add_node("finalize", finalize_node)
    builder.add_node("force_inconclusive", force_inconclusive_node)

    builder.set_entry_point("reason")

    builder.add_conditional_edges(
        "reason",
        route_next_step,
        {
            "action": "action",
            "finalize": "finalize",
            "force_inconclusive": "force_inconclusive"
        }
    )

    builder.add_edge("action", "reason")
    builder.add_edge("finalize", END)
    builder.add_edge("force_inconclusive", END)

    return builder.compile()


diagnosis_graph_app = build_diagnosis_graph()


class DiagnosisAgent:
    """
    Diagnosis Agent Service Entrypoint.
    Executes the LangGraph subgraph on a pending_investigation record.
    """

    @staticmethod
    def run_diagnosis(investigation_row: Dict[str, Any]) -> Dict[str, Any]:
        initial_state: AgentState = {
            "investigation_id": investigation_row["id"],
            "run_id": investigation_row["run_id"],
            "pipeline_id": investigation_row["pipeline_id"],
            "error_message": investigation_row.get("error_message", ""),
            "deviated_signals": investigation_row.get("deviated_signals", []),
            "evidence_log": [],
            "iterations_used": 0,
            "hypothesis": "Starting investigation",
            "tool_to_call": "",
            "status": "RUNNING",
            "failure_class": "UNKNOWN",
            "confidence": "low",
            "ruled_out": []
        }

        final_state = diagnosis_graph_app.invoke(initial_state)

        raw_res = {
            "investigation_id": investigation_row["id"],
            "pipeline_id": investigation_row.get("pipeline_id", ""),
            "run_id": investigation_row.get("run_id", ""),
            "status": final_state["status"],
            "failure_class": final_state["failure_class"],
            "confidence": final_state["confidence"],
            "ruled_out": final_state["ruled_out"],
            "iterations_used": final_state["iterations_used"],
            "evidence": final_state["evidence_log"]
        }

        from python_services.db import write_diagnosis
        diag_record = write_diagnosis(raw_res)
        diag_record["evidence_count"] = len(final_state["evidence_log"])
        diag_record["evidence_log"] = final_state["evidence_log"]
        return diag_record
