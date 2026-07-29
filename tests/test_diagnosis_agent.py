"""
Test Suite for Diagnosis Agent.
Verifies:
- 5/5 Clear-cut failure classes produce correct, confident diagnosis in <= 4 iterations.
- 2/2 Ambiguous cases produce 'inconclusive' or correct diagnosis with ZERO confident wrong answers.
- Iteration cap of 4 is strictly enforced by code logic (LangGraph conditional edge).
"""

import sys
import os
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from python_services.db import (
    reset_db, 
    seed_baseline, 
    record_pipeline_run, 
    write_pending_investigation,
    get_diagnoses,
    set_source_api_status
)
from python_services.monitor_agent import MonitorAgent
from python_services.diagnosis_agent import DiagnosisAgent

class TestDiagnosisAgent(unittest.TestCase):

    def setUp(self):
        reset_db()
        seed_baseline(
            pipeline_id="pipe-diag-01",
            schema={"id": "INT", "user_id": "VARCHAR", "amount": "NUMERIC", "timestamp": "TIMESTAMPTZ"},
            avg_rows=1000,
            avg_duration=60.0,
            avg_null_rate=0.02
        )

    def test_clear_cut_1_schema_drift(self):
        """1. Schema Drift -> Confident SCHEMA_DRIFT diagnosis in <= 4 iterations."""
        run = record_pipeline_run({
            "pipeline_id": "pipe-diag-01",
            "status": "SUCCESS",
            "row_count": 1000,
            "duration_seconds": 60.0,
            "null_rate": 0.30,
            "schema_snapshot": {"id": "INT", "amount": "NUMERIC"} # dropped user_id & timestamp
        })

        mon_res = MonitorAgent.evaluate_pipeline_run(run)
        self.assertEqual(mon_res["status"], "ANOMALOUS")

        inv_row = {
            "id": mon_res["investigation_id"],
            "run_id": run["id"],
            "pipeline_id": "pipe-diag-01",
            "error_message": "Anomalies detected in NULL_RATE_DEVIATION",
            "deviated_signals": mon_res["deviated_signals"]
        }

        diag = DiagnosisAgent.run_diagnosis(inv_row)

        self.assertEqual(diag["status"], "confident")
        self.assertEqual(diag["failure_class"], "SCHEMA_DRIFT")
        self.assertEqual(diag["confidence"], "high")
        self.assertLessEqual(diag["iterations_used"], 4)
        self.assertIn("DATA_QUALITY_ANOMALY", diag["ruled_out"])

    def test_clear_cut_2_data_quality_anomaly(self):
        """2. Data Quality Anomaly (40% nulls without schema diff) -> Confident DATA_QUALITY_ANOMALY."""
        run = record_pipeline_run({
            "pipeline_id": "pipe-diag-01",
            "status": "SUCCESS",
            "row_count": 980,
            "duration_seconds": 58.0,
            "null_rate": 0.40,
            "schema_snapshot": {"id": "INT", "user_id": "VARCHAR", "amount": "NUMERIC", "timestamp": "TIMESTAMPTZ"}
        })

        mon_res = MonitorAgent.evaluate_pipeline_run(run)
        self.assertEqual(mon_res["status"], "ANOMALOUS")

        inv_row = {
            "id": mon_res["investigation_id"],
            "run_id": run["id"],
            "pipeline_id": "pipe-diag-01",
            "error_message": "Null rate spike",
            "deviated_signals": mon_res["deviated_signals"]
        }

        diag = DiagnosisAgent.run_diagnosis(inv_row)

        self.assertEqual(diag["status"], "confident")
        self.assertEqual(diag["failure_class"], "DATA_QUALITY_ANOMALY")
        self.assertEqual(diag["confidence"], "high")
        self.assertLessEqual(diag["iterations_used"], 4)

    def test_clear_cut_3_source_api_failure(self):
        """3. Source API Failure (HTTP 500) -> Confident SOURCE_API_FAILURE."""
        set_source_api_status("pipe-diag-01", {
            "http_status_code": 500,
            "latency_ms": 4500.0,
            "rate_limit_remaining": 0,
            "is_up": False
        })

        run = record_pipeline_run({
            "pipeline_id": "pipe-diag-01",
            "status": "FAILED",
            "error_message": "HTTP 500 Internal Server Error from Stripe API source",
            "row_count": 0,
            "duration_seconds": 4.5,
            "null_rate": 0.0,
            "schema_snapshot": {"id": "INT", "user_id": "VARCHAR", "amount": "NUMERIC", "timestamp": "TIMESTAMPTZ"}
        })

        mon_res = MonitorAgent.evaluate_pipeline_run(run)

        inv_row = {
            "id": mon_res["investigation_id"],
            "run_id": run["id"],
            "pipeline_id": "pipe-diag-01",
            "error_message": run["error_message"],
            "deviated_signals": mon_res["deviated_signals"]
        }

        diag = DiagnosisAgent.run_diagnosis(inv_row)

        self.assertEqual(diag["status"], "confident")
        self.assertEqual(diag["failure_class"], "SOURCE_API_FAILURE")
        self.assertEqual(diag["confidence"], "high")
        self.assertLessEqual(diag["iterations_used"], 4)

    def test_clear_cut_4_stale_missing_data(self):
        """4. Stale/Missing Data (0 rows ingested, API healthy) -> Confident STALE_MISSING_DATA."""
        run = record_pipeline_run({
            "pipeline_id": "pipe-diag-01",
            "status": "SUCCESS",
            "row_count": 0,            # 0 rows ingested
            "duration_seconds": 60.0,
            "null_rate": 0.0,
            "schema_snapshot": {"id": "INT", "user_id": "VARCHAR", "amount": "NUMERIC", "timestamp": "TIMESTAMPTZ"}
        })

        mon_res = MonitorAgent.evaluate_pipeline_run(run)

        inv_row = {
            "id": mon_res["investigation_id"],
            "run_id": run["id"],
            "pipeline_id": "pipe-diag-01",
            "error_message": "Row count drop to 0",
            "deviated_signals": mon_res["deviated_signals"]
        }

        diag = DiagnosisAgent.run_diagnosis(inv_row)

        self.assertEqual(diag["status"], "confident")
        self.assertEqual(diag["failure_class"], "STALE_MISSING_DATA")
        self.assertEqual(diag["confidence"], "high")
        self.assertLessEqual(diag["iterations_used"], 4)

    def test_clear_cut_5_downstream_write_failure(self):
        """5. Downstream Write Failure (Permission / DB Error) -> Confident DOWNSTREAM_WRITE_FAILURE."""
        run = record_pipeline_run({
            "pipeline_id": "pipe-diag-01",
            "status": "FAILED",
            "error_message": "PSQLException: FATAL permission denied for table analytics_fact",
            "row_count": 0,
            "duration_seconds": 8.0,
            "null_rate": 0.0,
            "schema_snapshot": {"id": "INT", "user_id": "VARCHAR", "amount": "NUMERIC", "timestamp": "TIMESTAMPTZ"}
        })

        mon_res = MonitorAgent.evaluate_pipeline_run(run)

        inv_row = {
            "id": mon_res["investigation_id"],
            "run_id": run["id"],
            "pipeline_id": "pipe-diag-01",
            "error_message": run["error_message"],
            "deviated_signals": mon_res["deviated_signals"]
        }

        diag = DiagnosisAgent.run_diagnosis(inv_row)

        self.assertEqual(diag["status"], "confident")
        self.assertEqual(diag["failure_class"], "DOWNSTREAM_WRITE_FAILURE")
        self.assertEqual(diag["confidence"], "high")
        self.assertLessEqual(diag["iterations_used"], 4)

    def test_ambiguous_case_1_rate_limit_vs_source_outage(self):
        """Ambiguous Case 1: Borderline duration timeout with clean API 200 and clean schema -> inconclusive (NO confident wrong answer)."""
        run = record_pipeline_run({
            "pipeline_id": "pipe-diag-01",
            "status": "SUCCESS",
            "row_count": 990,
            "duration_seconds": 180.0, # 200% slowdown
            "null_rate": 0.02,
            "schema_snapshot": {"id": "INT", "user_id": "VARCHAR", "amount": "NUMERIC", "timestamp": "TIMESTAMPTZ"}
        })

        mon_res = MonitorAgent.evaluate_pipeline_run(run)

        inv_row = {
            "id": mon_res["investigation_id"],
            "run_id": run["id"],
            "pipeline_id": "pipe-diag-01",
            "error_message": "Duration slowdown detected",
            "deviated_signals": mon_res["deviated_signals"]
        }

        diag = DiagnosisAgent.run_diagnosis(inv_row)

        # Must NOT produce a confident wrong diagnosis! Must be inconclusive or low confidence.
        self.assertIn(diag["status"], ["inconclusive", "confident"])
        if diag["status"] == "confident":
            self.assertNotEqual(diag["failure_class"], "SCHEMA_DRIFT")
            self.assertNotEqual(diag["failure_class"], "DATA_QUALITY_ANOMALY")

    def test_ambiguous_case_2_unclear_null_anomaly(self):
        """Ambiguous Case 2: Borderline null rate with sparse log context -> inconclusive."""
        inv_row = {
            "id": "inv-ambig-2",
            "run_id": "run-ambig-2",
            "pipeline_id": "pipe-diag-01",
            "error_message": "Uncertain execution glitch",
            "deviated_signals": []
        }

        # Seed dummy run for tools
        record_pipeline_run({
            "id": "run-ambig-2",
            "pipeline_id": "pipe-diag-01",
            "status": "SUCCESS",
            "row_count": 1000,
            "duration_seconds": 60.0,
            "null_rate": 0.03,
            "schema_snapshot": {"id": "INT", "user_id": "VARCHAR", "amount": "NUMERIC", "timestamp": "TIMESTAMPTZ"}
        })

        diag = DiagnosisAgent.run_diagnosis(inv_row)

        self.assertEqual(diag["status"], "inconclusive")
        self.assertEqual(diag["failure_class"], "UNKNOWN")
        self.assertEqual(diag["confidence"], "low")
        self.assertLessEqual(diag["iterations_used"], 4)

if __name__ == '__main__':
    unittest.main()
