"""
Test Suite for Risk/Authority Agent (Agent 3) & Remediation Agent (Agent 4).
Verifies:
- All 5 rows of the Risk Authority Matrix produce correct decisions.
- High Confidence + Irreversible explicitly falls through to escalate-only under safety policy.
- LLM fallback path is reached ONLY for uncovered policy cases.
- 3/3 auto-fix scenarios show verified successful re-runs logged in remediation_attempts.
- Fallback scenario stops after 2 total attempts and correctly signals escalation.
"""

import sys
import os
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from python_services.db import (
    reset_db, 
    seed_baseline, 
    write_diagnosis, 
    get_risk_decisions,
    get_remediation_attempts
)
from python_services.risk_agent import RiskAgent
from python_services.remediation_agent import RemediationAgent

class TestRiskAndRemediationAgents(unittest.TestCase):

    def setUp(self):
        reset_db()
        seed_baseline(
            pipeline_id="pipe-risk-01",
            schema={"id": "INT", "user_id": "VARCHAR", "amount": "NUMERIC"},
            avg_rows=1000,
            avg_duration=60.0,
            avg_null_rate=0.02
        )

    # -------------------------------------------------------------
    # AGENT 3: RISK / AUTHORITY AGENT TESTS
    # -------------------------------------------------------------
    def test_risk_rule_1_high_confidence_reversible(self):
        """1. High Confidence + Reversible -> auto-fix."""
        diag = write_diagnosis({
            "investigation_id": "inv-r1",
            "pipeline_id": "pipe-risk-01",
            "run_id": "run-r1",
            "status": "confident",
            "failure_class": "SOURCE_API_FAILURE",
            "confidence": "high",
            "ruled_out": []
        })

        dec = RiskAgent.evaluate_risk_policy(diag)
        self.assertEqual(dec["decision"], "auto-fix")
        self.assertEqual(dec["action_type"], "retry_job")
        self.assertTrue(dec["is_reversible"])
        self.assertFalse(dec["fallback_used"])

    def test_risk_rule_2_high_confidence_irreversible_autofix_notify(self):
        """2a. High Confidence + Irreversible -> auto-fix-notify (standard matrix)."""
        diag = write_diagnosis({
            "investigation_id": "inv-r2a",
            "pipeline_id": "pipe-risk-01",
            "run_id": "run-r2a",
            "status": "confident",
            "failure_class": "SCHEMA_DRIFT",
            "confidence": "high",
            "ruled_out": []
        })

        dec = RiskAgent.evaluate_risk_policy(diag, allow_irreversible_autofix=True)
        self.assertEqual(dec["decision"], "auto-fix-notify")
        self.assertEqual(dec["action_type"], "apply_schema_patch")
        self.assertFalse(dec["is_reversible"])

    def test_risk_rule_2_high_confidence_irreversible_strict_safety_escalate(self):
        """2b. High Confidence + Irreversible under strict safety policy -> escalate-only."""
        diag = write_diagnosis({
            "investigation_id": "inv-r2b",
            "pipeline_id": "pipe-risk-01",
            "run_id": "run-r2b",
            "status": "confident",
            "failure_class": "SCHEMA_DRIFT",
            "confidence": "high",
            "ruled_out": []
        })

        dec = RiskAgent.evaluate_risk_policy(diag, allow_irreversible_autofix=False)
        self.assertEqual(dec["decision"], "escalate-only")
        self.assertIn("blocked from auto-fix", dec["justification"])

    def test_risk_rule_3_medium_confidence_reversible(self):
        """3. Medium Confidence + Reversible -> auto-fix-notify."""
        diag = write_diagnosis({
            "investigation_id": "inv-r3",
            "pipeline_id": "pipe-risk-01",
            "run_id": "run-r3",
            "status": "confident",
            "failure_class": "STALE_MISSING_DATA",
            "confidence": "medium",
            "ruled_out": []
        })

        dec = RiskAgent.evaluate_risk_policy(diag)
        self.assertEqual(dec["decision"], "auto-fix-notify")
        self.assertEqual(dec["action_type"], "rerun_pipeline")
        self.assertTrue(dec["is_reversible"])

    def test_risk_rule_4_medium_confidence_irreversible(self):
        """4. Medium Confidence + Irreversible -> escalate-only."""
        diag = write_diagnosis({
            "investigation_id": "inv-r4",
            "pipeline_id": "pipe-risk-01",
            "run_id": "run-r4",
            "status": "confident",
            "failure_class": "DOWNSTREAM_WRITE_FAILURE",
            "confidence": "medium",
            "ruled_out": []
        })

        dec = RiskAgent.evaluate_risk_policy(diag)
        self.assertEqual(dec["decision"], "escalate-only")

    def test_risk_rule_5_low_confidence_or_inconclusive(self):
        """5. Low Confidence or Inconclusive Status -> escalate-only."""
        diag = write_diagnosis({
            "investigation_id": "inv-r5",
            "pipeline_id": "pipe-risk-01",
            "run_id": "run-r5",
            "status": "inconclusive",
            "failure_class": "UNKNOWN",
            "confidence": "low",
            "ruled_out": []
        })

        dec = RiskAgent.evaluate_risk_policy(diag)
        self.assertEqual(dec["decision"], "escalate-only")

    def test_risk_llm_fallback_uncovered_case(self):
        """6. Uncovered policy case -> LLM fallback path reached -> escalate-only."""
        diag = write_diagnosis({
            "investigation_id": "inv-r6",
            "pipeline_id": "pipe-risk-01",
            "run_id": "run-r6",
            "status": "confident",
            "failure_class": "UNKNOWN", # Uncovered failure class in confident status
            "confidence": "high",
            "ruled_out": []
        })

        dec = RiskAgent.evaluate_risk_policy(diag)
        self.assertEqual(dec["decision"], "escalate-only")
        self.assertTrue(dec["fallback_used"])
        self.assertIn("LLM_FALLBACK_REACHED", dec["justification"])

    # -------------------------------------------------------------
    # AGENT 4: REMEDIATION AGENT TESTS
    # -------------------------------------------------------------
    def test_remediation_autofix_scenario_1_retry(self):
        """1. Auto-Fix Scenario 1: Retry job -> rerun -> verified successful."""
        diag = write_diagnosis({
            "investigation_id": "inv-rem1",
            "pipeline_id": "pipe-risk-01",
            "run_id": "run-rem1",
            "status": "confident",
            "failure_class": "SOURCE_API_FAILURE",
            "confidence": "high"
        })
        dec = RiskAgent.evaluate_risk_policy(diag)
        
        rem_res = RemediationAgent.execute_remediation(dec)

        self.assertEqual(rem_res["status"], "SUCCESS")
        self.assertEqual(rem_res["attempts_count"], 1)
        
        attempts = get_remediation_attempts(dec["id"])
        self.assertEqual(len(attempts), 1)
        self.assertTrue(attempts[0]["verification_passed"])
        self.assertEqual(attempts[0]["rerun_status"], "SUCCESS")

    def test_remediation_autofix_scenario_2_quarantine(self):
        """2. Auto-Fix Scenario 2: Quarantine rows -> rerun -> verified successful."""
        diag = write_diagnosis({
            "investigation_id": "inv-rem2",
            "pipeline_id": "pipe-risk-01",
            "run_id": "run-rem2",
            "status": "confident",
            "failure_class": "DATA_QUALITY_ANOMALY",
            "confidence": "high"
        })
        dec = RiskAgent.evaluate_risk_policy(diag)
        
        rem_res = RemediationAgent.execute_remediation(dec)

        self.assertEqual(rem_res["status"], "SUCCESS")
        self.assertEqual(rem_res["attempts_count"], 1)
        
        attempts = get_remediation_attempts(dec["id"])
        self.assertEqual(len(attempts), 1)
        self.assertTrue(attempts[0]["verification_passed"])

    def test_remediation_autofix_scenario_3_schema_patch(self):
        """3. Auto-Fix Scenario 3: Apply schema patch -> rerun -> verified successful."""
        diag = write_diagnosis({
            "investigation_id": "inv-rem3",
            "pipeline_id": "pipe-risk-01",
            "run_id": "run-rem3",
            "status": "confident",
            "failure_class": "SCHEMA_DRIFT",
            "confidence": "high"
        })
        dec = RiskAgent.evaluate_risk_policy(diag, allow_irreversible_autofix=True)
        
        rem_res = RemediationAgent.execute_remediation(dec)

        self.assertEqual(rem_res["status"], "SUCCESS")
        self.assertEqual(rem_res["attempts_count"], 1)
        
        attempts = get_remediation_attempts(dec["id"])
        self.assertEqual(len(attempts), 1)
        self.assertTrue(attempts[0]["verification_passed"])

    def test_remediation_fallback_scenario_attempt2_success(self):
        """4. Fallback Scenario: Attempt 1 fails verification -> Attempt 2 runs & succeeds."""
        diag = write_diagnosis({
            "investigation_id": "inv-rem4",
            "pipeline_id": "pipe-risk-01",
            "run_id": "run-rem4",
            "status": "confident",
            "failure_class": "SOURCE_API_FAILURE",
            "confidence": "high"
        })
        dec = RiskAgent.evaluate_risk_policy(diag)

        # Simulate failure on attempt 1
        rem_res = RemediationAgent.execute_remediation(dec, simulate_first_attempt_failure=True)

        self.assertEqual(rem_res["status"], "SUCCESS")
        self.assertEqual(rem_res["attempts_count"], 2)
        
        attempts = get_remediation_attempts(dec["id"])
        self.assertEqual(len(attempts), 2)
        self.assertFalse(attempts[0]["verification_passed"]) # Attempt 1 failed
        self.assertTrue(attempts[1]["verification_passed"])  # Attempt 2 passed

    def test_remediation_bounded_max_2_attempts_escalation(self):
        """5. Bounded Limit Scenario: Both attempt 1 & attempt 2 fail -> stops at 2 & escalates."""
        diag = write_diagnosis({
            "investigation_id": "inv-rem5",
            "pipeline_id": "pipe-risk-01",
            "run_id": "run-rem5",
            "status": "confident",
            "failure_class": "SOURCE_API_FAILURE",
            "confidence": "high"
        })
        dec = RiskAgent.evaluate_risk_policy(diag)

        # Simulate failure on both attempt 1 and attempt 2
        rem_res = RemediationAgent.execute_remediation(dec, simulate_both_attempts_failure=True)

        self.assertEqual(rem_res["status"], "FAILED_ESCALATED")
        self.assertEqual(rem_res["attempts_count"], 2) # Strictly bounded at 2 total attempts
        
        attempts = get_remediation_attempts(dec["id"])
        self.assertEqual(len(attempts), 2)
        self.assertFalse(attempts[0]["verification_passed"])
        self.assertFalse(attempts[1]["verification_passed"])
        self.assertIn("AUTO_FIX_FAILED_ESCALATE_INSTEAD", rem_res["message"])

    def test_risk_assessment_agent_single_diagnosis(self):
        """Test RiskAssessmentAgent evaluating a single diagnosis across 5 risk dimensions."""
        from python_services.risk_agent import RiskAssessmentAgent
        diagnoses = [
            {
                "diagnosis_id": "diag-101",
                "failure_class": "SCHEMA_DRIFT",
                "proposed_remediation": "apply_schema_patch",
                "remediation_metadata": {
                    "reversible": False,
                    "modifies_data": False,
                    "modifies_schema": True,
                    "changes_credentials": False,
                    "affects_external_systems": False,
                    "destructive": False
                }
            }
        ]
        results = RiskAssessmentAgent.assess_risk(diagnoses)
        self.assertEqual(len(results), 1)
        res = results[0]
        self.assertEqual(res["diagnosis_id"], "diag-101")
        self.assertEqual(res["risk_level"], "HIGH")
        self.assertEqual(res["dimension_breakdown"]["schema_impact"], "HIGH")
        self.assertEqual(res["dimension_breakdown"]["reversibility"], "HIGH")

    def test_risk_assessment_agent_multiple_diagnoses(self):
        """Test RiskAssessmentAgent evaluating multiple diagnoses independently without calculating combined risk."""
        from python_services.risk_agent import RiskAssessmentAgent
        diagnoses = [
            {
                "diagnosis_id": "diag-201",
                "failure_class": "SOURCE_API_FAILURE",
                "proposed_remediation": "retry_job",
                "remediation_metadata": {
                    "reversible": True,
                    "modifies_data": False,
                    "modifies_schema": False,
                    "changes_credentials": False,
                    "affects_external_systems": False,
                    "destructive": False
                }
            },
            {
                "diagnosis_id": "diag-202",
                "failure_class": "CREDENTIAL_EXPIRED",
                "proposed_remediation": "refresh_credentials",
                "remediation_metadata": {
                    "reversible": False,
                    "modifies_data": False,
                    "modifies_schema": False,
                    "changes_credentials": True,
                    "affects_external_systems": True,
                    "destructive": False
                }
            }
        ]
        results = RiskAssessmentAgent.assess_risk(diagnoses)
        self.assertEqual(len(results), 2)
        # Check diagnosis 1 -> LOW
        self.assertEqual(results[0]["diagnosis_id"], "diag-201")
        self.assertEqual(results[0]["risk_level"], "LOW")
        # Check diagnosis 2 -> HIGH
        self.assertEqual(results[1]["diagnosis_id"], "diag-202")
        self.assertEqual(results[1]["risk_level"], "HIGH")
        self.assertEqual(results[1]["dimension_breakdown"]["security_impact"], "HIGH")

if __name__ == '__main__':
    unittest.main()
