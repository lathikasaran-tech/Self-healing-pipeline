"""
Test Suite for Agent 5 (Reporting Agent) and End-to-End API Orchestration.
"""

import sys
import os
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from python_services.db import reset_db, seed_baseline, get_post_mortem_reports
from python_services.reporting_agent import ReportingAgent
from python_services.api import app, run_pipeline_orchestration, RunPipelineRequest

class TestReportingAndAPI(unittest.TestCase):

    def setUp(self):
        reset_db()
        seed_baseline(
            pipeline_id="pipe-e2e-01",
            schema={"id": "INT", "user_id": "VARCHAR", "amount": "NUMERIC"},
            avg_rows=1000,
            avg_duration=60.0,
            avg_null_rate=0.02
        )

    def test_reporting_agent_generates_markdown_post_mortem(self):
        """1. Reporting Agent generates markdown post-mortem report and RAG learning update."""
        diagnosis = {
            "status": "confident",
            "failure_class": "SOURCE_API_FAILURE",
            "confidence": "high",
            "ruled_out": ["SCHEMA_DRIFT", "DATA_QUALITY_ANOMALY"],
            "iterations_used": 2
        }
        risk_decision = {
            "decision": "auto-fix",
            "action_type": "retry_job",
            "is_reversible": True,
            "justification": "High confidence reversible retry."
        }
        remediation = {
            "status": "SUCCESS",
            "attempts_count": 1
        }

        report = ReportingAgent.generate_post_mortem(
            pipeline_id="pipe-e2e-01",
            run_id="run-e2e-1",
            diagnosis=diagnosis,
            risk_decision=risk_decision,
            remediation=remediation
        )

        self.assertEqual(report["status"], "RESOLVED")
        self.assertEqual(report["downtime_avoided_mins"], 45)
        self.assertIn("# Incident Post-Mortem Report", report["post_mortem_md"])
        self.assertEqual(len(get_post_mortem_reports()), 1)

    def test_e2e_pipeline_orchestration_clean_run(self):
        """2. End-to-End Orchestration: Clean Run -> Monitor returns HEALTHY."""
        req = RunPipelineRequest(
            pipeline_id="pipe-e2e-01",
            status="SUCCESS",
            row_count=1010,
            duration_seconds=61.0,
            null_rate=0.02
        )
        res = run_pipeline_orchestration(req)

        self.assertEqual(res["status"], "HEALTHY")
        self.assertIn("executed cleanly", res["message"])

    def test_e2e_pipeline_orchestration_schema_drift(self):
        """3. End-to-End Orchestration: Schema Drift -> All 5 Agents run sequentially."""
        req = RunPipelineRequest(
            pipeline_id="pipe-e2e-01",
            status="SUCCESS",
            row_count=1000,
            duration_seconds=60.0,
            null_rate=0.35, # 35% null rate
            schema_snapshot={"id": "INT"} # user_id and amount dropped
        )
        res = run_pipeline_orchestration(req)

        self.assertEqual(res["status"], "ANOMALY_HANDLED")
        self.assertEqual(res["monitor"]["status"], "ANOMALOUS")
        self.assertEqual(res["diagnosis"]["failure_class"], "SCHEMA_DRIFT")
        self.assertEqual(res["risk_decision"]["decision"], "auto-fix-notify")
        self.assertEqual(res["remediation"]["status"], "SUCCESS")
        self.assertEqual(res["reporting"]["status"], "RESOLVED")

if __name__ == '__main__':
    unittest.main()
