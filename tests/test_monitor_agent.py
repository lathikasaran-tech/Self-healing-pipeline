"""
Test Suite for Monitor/Trigger Agent.
Verifies all 5 failure classes, 1 clean run, and 1 borderline case.
"""

import sys
import os
import unittest

# Ensure root workspace is in python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from python_services.db import reset_db, seed_baseline, record_pipeline_run, get_pending_investigations
from python_services.monitor_agent import MonitorAgent

class TestMonitorAgent(unittest.TestCase):

    def setUp(self):
        reset_db()
        # Seed standard baseline for test pipeline 'pipe-test-01'
        seed_baseline(
            pipeline_id="pipe-test-01",
            schema={"id": "INT", "user_id": "VARCHAR", "amount": "NUMERIC", "timestamp": "TIMESTAMPTZ"},
            avg_rows=1000,
            avg_duration=60.0,
            avg_null_rate=0.02
        )

    def test_clean_run_stays_silent(self):
        """Test 1: Clean run within normal variation must stay silent."""
        clean_run = record_pipeline_run({
            "pipeline_id": "pipe-test-01",
            "status": "SUCCESS",
            "row_count": 1020,         # +2% deviation (threshold 20%)
            "duration_seconds": 62.0,  # +3.3% deviation (threshold 50%)
            "null_rate": 0.021,        # +0.1% delta (threshold 10%)
            "schema_snapshot": {"id": "INT", "user_id": "VARCHAR", "amount": "NUMERIC", "timestamp": "TIMESTAMPTZ"}
        })

        result = MonitorAgent.evaluate_pipeline_run(clean_run)
        self.assertEqual(result["status"], "HEALTHY")
        self.assertIsNone(result["investigation_id"])
        self.assertEqual(len(get_pending_investigations()), 0)

    def test_borderline_case_stays_silent(self):
        """Test 2: Borderline variation (12% rows, 30% duration, 5% null) below thresholds must stay silent."""
        borderline_run = record_pipeline_run({
            "pipeline_id": "pipe-test-01",
            "status": "SUCCESS",
            "row_count": 1120,         # +12% deviation (below 20% limit)
            "duration_seconds": 78.0,  # +30% deviation (below 50% limit)
            "null_rate": 0.05,         # +3% delta (below 10% limit)
            "schema_snapshot": {"id": "INT", "user_id": "VARCHAR", "amount": "NUMERIC", "timestamp": "TIMESTAMPTZ"}
        })

        result = MonitorAgent.evaluate_pipeline_run(borderline_run)
        self.assertEqual(result["status"], "HEALTHY")
        self.assertIsNone(result["investigation_id"])
        self.assertEqual(len(get_pending_investigations()), 0)

    def test_failure_class_1_schema_drift(self):
        """Test 3: Schema drift triggering high null rate."""
        run = record_pipeline_run({
            "pipeline_id": "pipe-test-01",
            "status": "SUCCESS",
            "row_count": 1000,
            "duration_seconds": 60.0,
            "null_rate": 0.28,         # 28% null rate due to dropped column
            "schema_snapshot": {"id": "INT", "amount": "NUMERIC"} # user_id dropped
        })

        result = MonitorAgent.evaluate_pipeline_run(run)
        self.assertEqual(result["status"], "ANOMALOUS")
        self.assertIsNotNone(result["investigation_id"])
        self.assertEqual(len(get_pending_investigations()), 1)
        signals = [s["signal"] for s in result["deviated_signals"]]
        self.assertIn("NULL_RATE_DEVIATION", signals)

    def test_failure_class_2_data_quality_anomaly(self):
        """Test 4: Data quality null rate spike (45%)."""
        run = record_pipeline_run({
            "pipeline_id": "pipe-test-01",
            "status": "SUCCESS",
            "row_count": 980,
            "duration_seconds": 58.0,
            "null_rate": 0.45,
            "schema_snapshot": {"id": "INT", "user_id": "VARCHAR", "amount": "NUMERIC", "timestamp": "TIMESTAMPTZ"}
        })

        result = MonitorAgent.evaluate_pipeline_run(run)
        self.assertEqual(result["status"], "ANOMALOUS")
        self.assertIsNotNone(result["investigation_id"])
        self.assertEqual(len(get_pending_investigations()), 1)

    def test_failure_class_3_api_source_failure(self):
        """Test 5: API source failure with explicit error status."""
        run = record_pipeline_run({
            "pipeline_id": "pipe-test-01",
            "status": "FAILED",
            "error_message": "HTTP 500 Internal Server Error from upstream Stripe API source",
            "row_count": 0,
            "duration_seconds": 5.0,
            "null_rate": 0.0
        })

        result = MonitorAgent.evaluate_pipeline_run(run)
        self.assertEqual(result["status"], "ANOMALOUS")
        self.assertIsNotNone(result["investigation_id"])
        signals = [s["signal"] for s in result["deviated_signals"]]
        self.assertIn("OUTRIGHT_FAILURE", signals)

    def test_failure_class_4_stale_missing_data(self):
        """Test 6: Missing data (95% row count drop)."""
        run = record_pipeline_run({
            "pipeline_id": "pipe-test-01",
            "status": "SUCCESS",
            "row_count": 50,           # 95% drop from baseline 1000
            "duration_seconds": 55.0,
            "null_rate": 0.01
        })

        result = MonitorAgent.evaluate_pipeline_run(run)
        self.assertEqual(result["status"], "ANOMALOUS")
        self.assertIsNotNone(result["investigation_id"])
        signals = [s["signal"] for s in result["deviated_signals"]]
        self.assertIn("ROW_COUNT_DEVIATION", signals)

    def test_failure_class_5_downstream_write_failure(self):
        """Test 7: Downstream DB write failure."""
        run = record_pipeline_run({
            "pipeline_id": "pipe-test-01",
            "status": "FAILED",
            "error_message": "PSQLException: FATAL permission denied for table analytics_fact",
            "row_count": 0,
            "duration_seconds": 12.0,
            "null_rate": 0.0
        })

        result = MonitorAgent.evaluate_pipeline_run(run)
        self.assertEqual(result["status"], "ANOMALOUS")
        self.assertIsNotNone(result["investigation_id"])
        signals = [s["signal"] for s in result["deviated_signals"]]
        self.assertIn("OUTRIGHT_FAILURE", signals)

if __name__ == '__main__':
    unittest.main()
