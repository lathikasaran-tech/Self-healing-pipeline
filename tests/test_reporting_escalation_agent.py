"""
Test Suite for Phase 8: Reporting / Escalation Agent.

Tests cover:
1. Silent Auto-Fix outcome: report stored, sent_to is None, delivery_status is SKIPPED_SILENT.
2. Auto-Fix With Notify outcome: report stored, sent_to is '#ops-alerts-slack', delivery_status is DELIVERED with confirmed HTTP 200 payload.
3. Full Escalation outcome: report stored, sent_to is '#oncall-pager-slack', delivery_status is DELIVERED with confirmed HTTP 200 payload.
4. Full Trace Stitching across Monitor, Diagnosis, Risk, Remediation.
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
    write_diagnosis,
    write_risk_decision,
    record_remediation_attempt,
    get_incident_reports,
    get_incident_report_by_run_id
)
from python_services.reporting_escalation_agent import ReportingEscalationAgent

class TestReportingEscalationAgent(unittest.TestCase):

    def setUp(self):
        reset_db()
        seed_baseline(
            pipeline_id="pipe-fin-tx-09",
            schema={"id": "INT", "user_id": "VARCHAR", "amount": "NUMERIC"},
            avg_rows=1000,
            avg_duration=60.0,
            avg_null_rate=0.02
        )

    def _setup_mock_incident_trace(self, run_id: str, decision: str, failure_class: str = "SOURCE_API_FAILURE"):
        # 1. Record run
        run_rec = record_pipeline_run({
            "id": run_id,
            "pipeline_id": "pipe-fin-tx-09",
            "status": "FAILED",
            "row_count": 0,
            "duration_seconds": 150.0,
            "null_rate": 0.02,
            "error_message": "HTTP 500 Source API Gateway Timeout"
        })

        # 2. Record investigation
        inv_rec = write_pending_investigation({
            "run_id": run_id,
            "pipeline_id": "pipe-fin-tx-09",
            "error_message": "HTTP 500 Source API Gateway Timeout",
            "deviated_signals": ["status: FAILED", "duration: 150.0s"]
        })

        # 3. Record diagnosis
        diag_rec = write_diagnosis({
            "investigation_id": inv_rec["id"],
            "pipeline_id": "pipe-fin-tx-09",
            "run_id": run_id,
            "status": "confident",
            "failure_class": failure_class,
            "confidence": "high",
            "ruled_out": ["SCHEMA_DRIFT", "DATA_QUALITY_ANOMALY"],
            "iterations_used": 2,
            "evidence": [
                {"tool_name": "check_schema_diff", "output": {"schema_match": True}},
                {"tool_name": "query_source_api_health", "output": {"http_status": 500, "is_up": False}}
            ]
        })

        # 4. Record risk decision
        risk_rec = write_risk_decision({
            "diagnosis_id": diag_rec["id"],
            "pipeline_id": "pipe-fin-tx-09",
            "run_id": run_id,
            "failure_class": failure_class,
            "decision": decision,
            "action_type": "retry_job",
            "is_reversible": True,
            "justification": f"Authority matrix evaluated decision: {decision}"
        })

        # 5. Record remediation attempt
        if decision != "escalate-only":
            record_remediation_attempt({
                "risk_decision_id": risk_rec["id"],
                "attempt_number": 1,
                "action_taken": "retry_job",
                "rerun_status": "SUCCESS",
                "verification_passed": True,
                "verification_details": {"row_count": 1000, "null_rate": 0.02}
            })

        return run_id

    def test_1_silent_autofix_report_and_delivery(self):
        """1. Test Silent Auto-Fix: stored in incident_reports, sent_to is None, delivery_status is SKIPPED_SILENT."""
        run_id = self._setup_mock_incident_trace("run-silent-01", decision="auto-fix")
        
        report_record = ReportingEscalationAgent.process_incident(run_id)

        self.assertIsNotNone(report_record["id"])
        self.assertEqual(report_record["outcome_type"], "SILENT_AUTOFIX")
        self.assertIsNone(report_record["sent_to"])
        self.assertEqual(report_record["delivery_status"], "SKIPPED_SILENT")
        self.assertIsNone(report_record["delivery_payload"])
        self.assertIn("AUTOMATED RECOVERY (SILENT AUTO-FIX)", report_record["report_markdown"])
        
        # Verify persistence
        stored = get_incident_report_by_run_id(run_id)
        self.assertIsNotNone(stored)
        self.assertEqual(stored["outcome_type"], "SILENT_AUTOFIX")

    def test_2_autofix_notify_report_and_delivery(self):
        """2. Test Auto-Fix With Notify: stored, sent_to='#ops-alerts-slack', delivery_status='DELIVERED' with confirmed payload."""
        run_id = self._setup_mock_incident_trace("run-notify-02", decision="auto-fix-notify", failure_class="SCHEMA_DRIFT")
        
        report_record = ReportingEscalationAgent.process_incident(run_id)

        self.assertIsNotNone(report_record["id"])
        self.assertEqual(report_record["outcome_type"], "AUTOFIX_NOTIFY")
        self.assertEqual(report_record["sent_to"], "#ops-alerts-slack")
        self.assertEqual(report_record["delivery_status"], "DELIVERED")
        
        # Verify Delivery Payload Response
        payload = report_record["delivery_payload"]
        self.assertIsNotNone(payload)
        self.assertEqual(payload["http_status_code"], 200)
        self.assertEqual(payload["slack_response"], "ok")
        self.assertEqual(payload["channel_delivered"], "#ops-alerts-slack")

        self.assertIn("AUTOMATED RECOVERY WITH OPS NOTIFICATION", report_record["report_markdown"])

    def test_3_full_escalation_report_and_delivery(self):
        """3. Test Full Escalation: stored, sent_to='#oncall-pager-slack', delivery_status='DELIVERED' with confirmed payload."""
        run_id = self._setup_mock_incident_trace("run-escalate-03", decision="escalate-only", failure_class="CREDENTIAL_EXPIRED")
        
        report_record = ReportingEscalationAgent.process_incident(run_id)

        self.assertIsNotNone(report_record["id"])
        self.assertEqual(report_record["outcome_type"], "ESCALATION")
        self.assertEqual(report_record["sent_to"], "#oncall-pager-slack")
        self.assertEqual(report_record["delivery_status"], "DELIVERED")

        # Verify Delivery Payload Response
        payload = report_record["delivery_payload"]
        self.assertIsNotNone(payload)
        self.assertEqual(payload["http_status_code"], 200)
        self.assertEqual(payload["slack_response"], "ok")
        self.assertEqual(payload["channel_delivered"], "#oncall-pager-slack")

        self.assertIn("ESCALATED TO ON-CALL HUMAN GOVERNANCE", report_record["report_markdown"])

    def test_4_all_three_report_types_stored(self):
        """4. Verify that all 3 outcome report types exist simultaneously in incident_reports."""
        self._setup_mock_incident_trace("run-s1", decision="auto-fix")
        self._setup_mock_incident_trace("run-n2", decision="auto-fix-notify")
        self._setup_mock_incident_trace("run-e3", decision="escalate-only")

        ReportingEscalationAgent.process_incident("run-s1")
        ReportingEscalationAgent.process_incident("run-n2")
        ReportingEscalationAgent.process_incident("run-e3")

        all_reports = get_incident_reports()
        self.assertEqual(len(all_reports), 3)
        
        outcomes = [r["outcome_type"] for r in all_reports]
        self.assertIn("SILENT_AUTOFIX", outcomes)
        self.assertIn("AUTOFIX_NOTIFY", outcomes)
        self.assertIn("ESCALATION", outcomes)

if __name__ == '__main__':
    unittest.main()
