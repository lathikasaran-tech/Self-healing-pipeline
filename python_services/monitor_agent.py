"""
Monitor / Trigger Agent for Self-Healing Data Pipeline System.
Deterministic Rule-Based Gatekeeper - NO LLM Calls.

Threshold Rationale:
--------------------
1. ROW_COUNT_THRESHOLD = ±0.20 (±20%):
   Normal organic batch volumes vary up to ~15%. A drop > 20% indicates missing source partitions or stale data.
   A surge > 20% indicates duplicate ingestion or upstream pipeline re-runs.

2. DURATION_THRESHOLD = ±0.50 (±50%):
   Pipeline execution times fluctuate under normal cluster load. A duration increase > 50% indicates API rate-limiting,
   unindexed database locks, or worker throttling. A drop > 50% indicates premature job termination or skipped stages.

3. NULL_RATE_THRESHOLD_DELTA = +0.10 (+10% points) OR ABSOLUTE_NULL_LIMIT = 0.15 (15%):
   Well-structured data streams maintain a low null baseline (~2%). A jump > 10 percentage points indicates schema mismatch,
   unparsed JSON attributes, or breaking API payload field renames.
"""

import datetime
from typing import Dict, Any, Optional, List
from python_services.db import get_baseline, get_pipeline_run, write_pending_investigation

ROW_COUNT_THRESHOLD_PCT = 0.20        # ±20%
DURATION_THRESHOLD_PCT = 0.50         # ±50%
NULL_RATE_DELTA_THRESHOLD = 0.10      # +10% points
NULL_RATE_ABSOLUTE_LIMIT = 0.15       # 15% absolute threshold

class MonitorAgent:
    """
    Deterministic gatekeeper that evaluates pipeline executions against baselines.
    """

    @staticmethod
    def evaluate_pipeline_run(run_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Evaluate a single pipeline run against baseline metrics.
        Returns evaluation summary. If anomalous, writes row to `pending_investigations`.
        """
        pipeline_id = run_data.get("pipeline_id")
        run_id = run_data.get("id")

        if not pipeline_id or not run_id:
            raise ValueError("run_data must contain 'pipeline_id' and 'id'")

        baseline = get_baseline(pipeline_id)
        if not baseline:
            # If no baseline exists, default baseline values
            baseline = {
                "avg_row_count": 1000,
                "avg_duration_seconds": 60.0,
                "avg_null_rate": 0.02
            }

        deviated_signals: List[Dict[str, Any]] = []

        # Signal 1: Outright Failure Check
        is_failed = run_data.get("status") == "FAILED" or bool(run_data.get("error_message"))
        if is_failed:
            err_msg = run_data.get("error_message") or "Pipeline job execution failed with exception"
            deviated_signals.append({
                "signal": "OUTRIGHT_FAILURE",
                "message": err_msg,
                "amount": "FAILED"
            })

        # Signal 2: Row Count Deviation Check
        actual_rows = run_data.get("row_count", 0)
        baseline_rows = baseline["avg_row_count"]
        row_diff_pct = abs(actual_rows - baseline_rows) / max(baseline_rows, 1)

        if row_diff_pct > ROW_COUNT_THRESHOLD_PCT:
            direction = "drop" if actual_rows < baseline_rows else "surge"
            deviated_signals.append({
                "signal": "ROW_COUNT_DEVIATION",
                "message": f"Row count {direction} detected: {actual_rows} vs baseline {baseline_rows} ({row_diff_pct * 100:.1f}% shift)",
                "actual": actual_rows,
                "baseline": baseline_rows,
                "deviation_pct": round(row_diff_pct * 100, 2)
            })

        # Signal 3: Duration Deviation Check
        actual_duration = run_data.get("duration_seconds", 0.0)
        baseline_duration = baseline["avg_duration_seconds"]
        duration_diff_pct = abs(actual_duration - baseline_duration) / max(baseline_duration, 0.001)

        if duration_diff_pct > DURATION_THRESHOLD_PCT:
            direction = "slowdown" if actual_duration > baseline_duration else "premature completion"
            deviated_signals.append({
                "signal": "DURATION_DEVIATION",
                "message": f"Duration {direction} detected: {actual_duration}s vs baseline {baseline_duration}s ({duration_diff_pct * 100:.1f}% shift)",
                "actual": actual_duration,
                "baseline": baseline_duration,
                "deviation_pct": round(duration_diff_pct * 100, 2)
            })

        # Signal 4: Null Rate / Data Quality Deviation Check
        actual_null_rate = run_data.get("null_rate", 0.0)
        baseline_null_rate = baseline["avg_null_rate"]
        null_delta = actual_null_rate - baseline_null_rate

        if null_delta > NULL_RATE_DELTA_THRESHOLD or actual_null_rate > NULL_RATE_ABSOLUTE_LIMIT:
            deviated_signals.append({
                "signal": "NULL_RATE_DEVIATION",
                "message": f"Data quality null rate anomaly: {actual_null_rate * 100:.1f}% vs baseline {baseline_null_rate * 100:.1f}%",
                "actual_null_rate": actual_null_rate,
                "baseline_null_rate": baseline_null_rate,
                "delta_pct": round(null_delta * 100, 2)
            })

        # Decision Gate
        if not deviated_signals:
            return {
                "status": "HEALTHY",
                "run_id": run_id,
                "pipeline_id": pipeline_id,
                "investigation_id": None,
                "message": "Pipeline run executed cleanly within baseline tolerance thresholds.",
                "evaluated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
            }

        # Package Structured Failure Context for Pending Investigations
        investigation_payload = {
            "run_id": run_id,
            "pipeline_id": pipeline_id,
            "error_message": run_data.get("error_message") or f"Anomalies detected in {len(deviated_signals)} signals",
            "deviated_signals": deviated_signals,
            "status": "PENDING"
        }

        inv_record = write_pending_investigation(investigation_payload)

        return {
            "status": "ANOMALOUS",
            "run_id": run_id,
            "pipeline_id": pipeline_id,
            "investigation_id": inv_record["id"],
            "deviated_signals_count": len(deviated_signals),
            "deviated_signals": deviated_signals,
            "evaluated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }
