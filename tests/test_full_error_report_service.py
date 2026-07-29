"""
Unit Test Suite for Full Multi-Error Diagnostic Report Generator Service.
"""

import sys
import os
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from python_services.full_error_report_service import FullErrorReportGenerator

class TestFullErrorReportService(unittest.TestCase):

    def test_multi_error_log_report_generation(self):
        """Verify that multiple errors in log text return separate reports for EVERY error."""
        multi_error_log = """
        2026-07-29 10:00:01 [ERROR] java.lang.OutOfMemoryError: Java heap space allocation exceeded threshold.
        2026-07-29 10:00:05 [WARN] HikariPool-1 - Connection pool acquisition timed out after 30000ms.
        2026-07-29 10:00:10 [ERROR] SchemaMismatchException: Column 'user_tier' UInt64 cannot be cast to VARCHAR.
        """

        reports = FullErrorReportGenerator.generate_reports(multi_error_log)
        
        # Must return separate report for EACH error (3 distinct errors in this log)
        self.assertEqual(len(reports), 3)

        # Report 1: OutOfMemoryError
        r1 = reports[0]
        self.assertEqual(r1["error_name"], "OutOfMemoryError")
        self.assertIn("OutOfMemoryError", r1["error_message"])
        self.assertIn("file", r1["error_location"])
        self.assertIn("function", r1["error_location"])
        self.assertIn("line_number", r1["error_location"])
        self.assertIn("pipeline_stage", r1["error_location"])
        self.assertIsNotNone(r1["root_cause"])
        self.assertIsNotNone(r1["evidence"])
        self.assertIsNotNone(r1["confidence_score"])
        self.assertIn(r1["risk_level"], ["LOW", "MEDIUM", "HIGH"])
        self.assertIsNotNone(r1["risk_justification"])
        self.assertEqual(r1["recommended_remediation"], "INCREASE_MEMORY_LIMIT")
        self.assertTrue(len(r1["error_rectification"]) >= 3)
        self.assertIsNotNone(r1["expected_outcome"])

        # Report 2: DatabaseTimeoutException
        r2 = reports[1]
        self.assertEqual(r2["error_name"], "DatabaseTimeoutException")
        self.assertEqual(r2["recommended_remediation"], "FLUSH_CONNECTION_POOL")

        # Report 3: SchemaMismatchException
        r3 = reports[2]
        self.assertEqual(r3["error_name"], "SchemaMismatchException")
        self.assertEqual(r3["recommended_remediation"], "apply_schema_patch")
        self.assertEqual(r3["risk_level"], "HIGH")

    def test_explicit_diagnoses_list_report_generation(self):
        """Verify that a list of diagnosis objects returns all 11 fields per diagnosis."""
        diagnoses = [
            {
                "diagnosis_id": "diag-501",
                "failure_class": "CREDENTIAL_EXPIRED",
                "affected_component": "IAM_OAuth2_Client",
                "proposed_remediation": "refresh_credentials"
            },
            {
                "diagnosis_id": "diag-502",
                "failure_class": "DATA_QUALITY_ANOMALY",
                "affected_component": "Data_Quality_Guard",
                "proposed_remediation": "quarantine_rows"
            }
        ]

        reports = FullErrorReportGenerator.generate_reports("", known_diagnoses=diagnoses)
        self.assertEqual(len(reports), 2)

        # Check all 11 required fields on report 1
        r1 = reports[0]
        required_keys = [
            "diagnosis_id",
            "error_name",
            "error_message",
            "error_location",
            "root_cause",
            "evidence",
            "confidence_score",
            "risk_level",
            "risk_justification",
            "recommended_remediation",
            "error_rectification",
            "expected_outcome"
        ]

        for k in required_keys:
            self.assertIn(k, r1, f"Missing required key: {k}")

        self.assertEqual(r1["diagnosis_id"], "diag-501")
        self.assertEqual(r1["error_name"], "CredentialExpiredException")
        self.assertEqual(r1["risk_level"], "HIGH")

if __name__ == '__main__':
    unittest.main()
