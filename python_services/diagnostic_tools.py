"""
Diagnostic Tools for Diagnosis Agent.
Plain, independently-testable Python functions.
"""

from typing import Dict, Any, List
from python_services.db import (
    get_baseline, 
    get_pipeline_run, 
    get_schema_history, 
    get_source_api_status
)

def check_schema_diff(pipeline_id: str, run_id: str) -> Dict[str, Any]:
    """
    Compares current run schema snapshot vs pipeline_baselines snapshot.
    """
    baseline = get_baseline(pipeline_id)
    run = get_pipeline_run(run_id)

    if not baseline:
        return {"has_diff": False, "error": f"Baseline not found for {pipeline_id}"}
    if not run:
        return {"has_diff": False, "error": f"Pipeline run not found for {run_id}"}

    base_schema = baseline.get("schema_snapshot", {})
    run_schema = run.get("schema_snapshot", {})

    dropped_fields = [k for k in base_schema if k not in run_schema]
    added_fields = [k for k in run_schema if k not in base_schema]
    type_mismatches = []

    for k in base_schema:
        if k in run_schema and base_schema[k] != run_schema[k]:
            type_mismatches.append({
                "field": k,
                "expected": base_schema[k],
                "actual": run_schema[k]
            })

    has_diff = bool(dropped_fields or added_fields or type_mismatches)

    return {
        "tool_name": "check_schema_diff",
        "has_diff": has_diff,
        "dropped_fields": dropped_fields,
        "added_fields": added_fields,
        "type_mismatches": type_mismatches,
        "base_field_count": len(base_schema),
        "run_field_count": len(run_schema)
    }


def query_source_api_health(pipeline_id: str, run_id: str = "") -> Dict[str, Any]:
    """
    Pings the mock source API, captures status code, latency, and rate-limit headers.
    """
    api_status = get_source_api_status(pipeline_id)

    return {
        "tool_name": "query_source_api_health",
        "pipeline_id": pipeline_id,
        "http_status_code": api_status.get("http_status_code", 200),
        "latency_ms": api_status.get("latency_ms", 120.0),
        "rate_limit_remaining": api_status.get("rate_limit_remaining", 100),
        "is_up": api_status.get("is_up", True),
        "error_state": None if api_status.get("http_status_code") == 200 else f"HTTP {api_status.get('http_status_code')}"
    }


def sample_recent_rows(pipeline_id: str, run_id: str) -> Dict[str, Any]:
    """
    Pulls a sample of recent data rows for inspection.
    """
    run = get_pipeline_run(run_id)
    row_count = run.get("row_count", 0) if run else 0

    if row_count == 0:
        return {
            "tool_name": "sample_recent_rows",
            "sampled_count": 0,
            "is_empty": True,
            "sample": [],
            "warning": "No rows were ingested in this run."
        }

    # Generate representative mock sample
    sample_data = [
        {"id": i, "user_id": f"usr_{100 + i}", "amount": 49.99 + i, "null_fields_count": 0}
        for i in range(min(5, row_count))
    ]

    return {
        "tool_name": "sample_recent_rows",
        "sampled_count": len(sample_data),
        "is_empty": False,
        "total_rows": row_count,
        "sample": sample_data
    }


def check_data_quality_stats(pipeline_id: str, run_id: str) -> Dict[str, Any]:
    """
    Inspects data quality metrics: null rate, duplicate rate, type mismatches.
    """
    run = get_pipeline_run(run_id)
    baseline = get_baseline(pipeline_id)

    null_rate = run.get("null_rate", 0.0) if run else 0.0
    duplicate_rate = run.get("duplicate_rate", 0.0) if run else 0.0
    base_null = baseline.get("avg_null_rate", 0.02) if baseline else 0.02

    is_anomalous_null = (null_rate - base_null > 0.10) or (null_rate > 0.15)
    is_anomalous_dup = duplicate_rate > 0.05

    return {
        "tool_name": "check_data_quality_stats",
        "null_rate": null_rate,
        "baseline_null_rate": base_null,
        "duplicate_rate": duplicate_rate,
        "is_anomalous_null": is_anomalous_null,
        "is_anomalous_dup": is_anomalous_dup,
        "quality_score": round(100.0 * (1.0 - null_rate - duplicate_rate), 2)
    }


def get_recent_schema_history(pipeline_id: str, run_id: str = "") -> Dict[str, Any]:
    """
    Retrieves recent schema snapshots to provide drift context.
    """
    history = get_schema_history(pipeline_id)
    return {
        "tool_name": "get_recent_schema_history",
        "pipeline_id": pipeline_id,
        "snapshot_count": len(history),
        "history": history
    }
