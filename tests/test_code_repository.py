import unittest
import os
import sys

# Add parent directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from python_services import db
from python_services import sync_code_to_supabase
from python_services.remediation_agent import RemediationAgent

class TestCodeRepository(unittest.TestCase):
    def setUp(self):
        db.reset_db()

    def test_upsert_and_retrieve_code_file(self):
        file_info = {
            "file_path": "python_services/test_service.py",
            "file_name": "test_service.py",
            "file_category": "python_service",
            "language": "python",
            "code_content": "def hello(): return 'world'",
            "checksum": "abc123hash"
        }
        rec = db.upsert_code_file(file_info)
        self.assertEqual(rec["file_path"], "python_services/test_service.py")
        self.assertEqual(rec["version"], 1)

        # Upsert again -> version increment
        rec2 = db.upsert_code_file(file_info)
        self.assertEqual(rec2["version"], 2)

        files = db.get_all_code_files()
        self.assertEqual(len(files), 1)

        single = db.get_code_file_by_path("python_services/test_service.py")
        self.assertIsNotNone(single)
        self.assertEqual(single["checksum"], "abc123hash")

    def test_sync_codebase(self):
        root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        summary = sync_code_to_supabase.sync_code_to_supabase(root_dir)
        self.assertEqual(summary["status"], "SUCCESS")
        self.assertGreater(summary["total_files_scanned"], 0)

        all_files = db.get_all_code_files()
        self.assertGreaterEqual(len(all_files), summary["total_files_scanned"])

    def test_record_and_retrieve_remediation_patch(self):
        risk_decision = {
            "id": "dec-test-01",
            "diagnosis_id": "diag-01",
            "pipeline_id": "pipe-fin-tx-09",
            "run_id": "run-test-99",
            "decision": "auto-fix",
            "action_type": "retry_job"
        }
        res = RemediationAgent.execute_remediation(risk_decision)
        self.assertEqual(res["status"], "SUCCESS")

        patches = db.get_code_patches("run-test-99")
        self.assertEqual(len(patches), 1)
        self.assertIn("Remediation Patch", patches[0]["patch_name"])
        self.assertEqual(patches[0]["status"], "VERIFIED")

if __name__ == "__main__":
    unittest.main()
