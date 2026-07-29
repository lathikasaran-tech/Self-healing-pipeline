"""
Full Multi-Error Diagnostic Report Generator Service.

RESPONSIBILITY: For EVERY detected error in a pipeline log or diagnosis list,
generate a comprehensive 11-field diagnostic report.

Evaluates MULTIPLE errors independently — does NOT stop after the first error.

REQUIRED 11-FIELD STRUCTURE PER ERROR:
[
  {
    "error_name": "...",
    "error_message": "...",
    "error_location": {
      "file": "...",
      "function": "...",
      "line_number": 123,
      "pipeline_stage": "..."
    },
    "root_cause": "...",
    "evidence": [
      "...",
      "..."
    ],
    "confidence_score": "95.0%",
    "risk_level": "LOW | MEDIUM | HIGH",
    "risk_justification": "...",
    "recommended_remediation": "...",
    "error_rectification": [
      "Step 1: ...",
      "Step 2: ...",
      "Step 3: ..."
    ],
    "expected_outcome": "..."
  }
]
"""

import re
import json
from typing import Dict, Any, List, Optional
from python_services.risk_agent import RiskAssessmentAgent, ACTION_METADATA_DEFAULTS


# ─── Error Signature Catalog & Location Extractor ───────────────────────────────

KNOWN_ERROR_PATTERNS = [
    {
        "pattern": r"(OutOfMemoryError|OOMKilled|heap space|GC overhead|exit code 137)",
        "error_name": "OutOfMemoryError",
        "default_stage": "INGESTION_COMPUTE",
        "default_file": "spark_ingest_worker.py",
        "default_function": "process_batch_chunk()",
        "default_line": 142,
        "failure_class": "OUT_OF_MEMORY",
        "action": "INCREASE_MEMORY_LIMIT",
        "root_cause": "JVM memory heap allocation exceeded 95% capacity due to unexpected peak batch volume.",
        "remediation_explanation": [
          "Step 1: Increase worker pod memory request from 4Gi to 8Gi and limit to 16Gi in K8s manifest.",
          "Step 2: Apply dynamic chunk size reducer parameter (batch_size=5000 -> batch_size=2000).",
          "Step 3: Restart compute pod and trigger checkpoint resume from last successful state."
        ],
        "expected_outcome": "Worker pod executes full batch without memory pressure; heap utilization remains under 65%."
    },
    {
        "pattern": r"(connection timed out|too many clients|HikariPool|connection pool|FATAL: sorry|db connection)",
        "error_name": "DatabaseTimeoutException",
        "default_stage": "STORAGE_WRITE",
        "default_file": "db_connection_pool.py",
        "default_function": "get_connection_handle()",
        "default_line": 88,
        "failure_class": "DATABASE_TIMEOUT",
        "action": "FLUSH_CONNECTION_POOL",
        "root_cause": "Database connection pool exhaustion caused by unclosed connection handles during concurrent batch writes.",
        "remediation_explanation": [
          "Step 1: Send SIGUSR1 signal to connection pool manager to flush idle and leaked handles.",
          "Step 2: Scale max_connections parameter from 50 to 150 in connection pool configuration.",
          "Step 3: Trigger retry of pending transaction queue with exponential backoff."
        ],
        "expected_outcome": "Connection handles reset to 0 active leaks; write queries execute within <15ms latency."
    },
    {
        "pattern": r"(Cannot parse|schema drift|type mismatch|column not found|UInt64|missing column)",
        "error_name": "SchemaMismatchException",
        "default_stage": "SCHEMA_VALIDATION",
        "default_file": "schema_validator.py",
        "default_function": "validate_and_cast_record()",
        "default_line": 215,
        "failure_class": "SCHEMA_DRIFT",
        "action": "apply_schema_patch",
        "root_cause": "Upstream data producer added new unannounced columns / altered column types without updating migration version.",
        "remediation_explanation": [
          "Step 1: Generate dynamic DDL ALTER TABLE patch for new columns with NULLABLE defaults.",
          "Step 2: Inject schema casting wrapper into ingestion stage to handle type conversions.",
          "Step 3: Re-verify table schema integrity and resume pipeline processing."
        ],
        "expected_outcome": "Target database table accepts incoming payload without column mismatch or type conversion errors."
    },
    {
        "pattern": r"(rate limit|429|throttled|too many requests|quota exceeded)",
        "error_name": "RateLimitExceededException",
        "default_stage": "EXT_API_INGEST",
        "default_file": "external_api_client.py",
        "default_function": "fetch_upstream_payload()",
        "default_line": 64,
        "failure_class": "RATE_LIMIT_EXCEEDED",
        "action": "retry_job",
        "root_cause": "Upstream REST API returned HTTP 429 Too Many Requests due to burst request frequency.",
        "remediation_explanation": [
          "Step 1: Pause active worker execution threads for designated Retry-After header period (60s).",
          "Step 2: Enable exponential backoff retry policy with randomized full-jitter delay.",
          "Step 3: Resume API fetch requests at throttled rate of 10 req/sec."
        ],
        "expected_outcome": "API requests complete with HTTP 200 OK responses; zero 429 throttling errors."
    },
    {
        "pattern": r"(CrashLoopBackOff|crash loop|container exit|pod restart)",
        "error_name": "PodCrashLoopException",
        "default_stage": "CONTAINER_ORCHESTRATION",
        "default_file": "k8s_deployment_controller.py",
        "default_function": "monitor_pod_liveness()",
        "default_line": 103,
        "failure_class": "POD_CRASH_LOOP",
        "action": "RESTART_POD",
        "root_cause": "Container pod exited with non-zero exit code repeatedly due to transient initialization race condition.",
        "remediation_explanation": [
          "Step 1: Terminate stuck pod instance using graceful Kubernetes deletion signal (grace-period=30).",
          "Step 2: Re-read secret mounts and environment config maps.",
          "Step 3: Spin up replacement pod instance with verified health check probe."
        ],
        "expected_outcome": "Pod enters 1/1 Running state; liveness and readiness probes pass successfully."
    },
    {
        "pattern": r"(quarantine|null rate|data quality|invalid value)",
        "error_name": "DataQualityAnomalyException",
        "default_stage": "DATA_QUALITY_TRANSFORM",
        "default_file": "data_quality_guard.py",
        "default_function": "audit_batch_quality()",
        "default_line": 178,
        "failure_class": "DATA_QUALITY_ANOMALY",
        "action": "quarantine_rows",
        "root_cause": "Batch dataset null rate (14.2%) exceeded acceptable tolerance threshold (2.0%).",
        "remediation_explanation": [
          "Step 1: Filter out bad/null records and copy them into `quarantine_invalid_rows` table.",
          "Step 2: Log anomaly summary notification to on-call data engine alert queue.",
          "Step 3: Pass valid data records downstream to complete pipeline run without blocking clean data."
        ],
        "expected_outcome": "Clean records reach storage engine uninterrupted; invalid rows safely stored for review."
    },
    {
        "pattern": r"(credential|token expired|unauthorized|401|403|access denied)",
        "error_name": "CredentialExpiredException",
        "default_stage": "SECURITY_AUTH",
        "default_file": "auth_token_manager.py",
        "default_function": "acquire_service_token()",
        "default_line": 52,
        "failure_class": "CREDENTIAL_EXPIRED",
        "action": "refresh_credentials",
        "root_cause": "Service OAuth2 / IAM bearer token expired past its 3600-second validity window.",
        "remediation_explanation": [
          "Step 1: Issue OAuth2 refresh_token request to IAM identity provider.",
          "Step 2: Update in-memory authorization header cache with new access_token.",
          "Step 3: Retry failed write/read operation using refreshed credentials."
        ],
        "expected_outcome": "Authentication succeeds; API/Database operations complete with full read/write permissions."
    }
]


class FullErrorReportGenerator:
    """
    Scans raw log content or input diagnosis records, identifies ALL distinct errors,
    and returns a separate 11-field report for EACH error.
    """

    @staticmethod
    def generate_reports(
        logs_or_text: str,
        known_diagnoses: Optional[List[Dict[str, Any]]] = None
    ) -> List[Dict[str, Any]]:
        """
        Scans input for all errors and returns an 11-field diagnostic report per error.
        Does NOT stop after the first error.
        """
        detected_errors: List[Dict[str, Any]] = []

        # 1. Process explicit known diagnoses if provided
        if known_diagnoses:
            for idx, diag in enumerate(known_diagnoses):
                parsed = FullErrorReportGenerator._parse_diagnosis_item(diag, idx + 1)
                detected_errors.append(parsed)

        # 2. Scan text/logs for all error patterns
        if logs_or_text and isinstance(logs_or_text, str):
            log_lines = logs_or_text.split('\n')
            matched_patterns = set()

            for pattern_obj in KNOWN_ERROR_PATTERNS:
                regex = re.compile(pattern_obj["pattern"], re.IGNORECASE)

                matching_lines = [
                    line.strip() for line in log_lines 
                    if regex.search(line)
                ]

                if matching_lines:
                    pattern_name = pattern_obj["error_name"]
                    if pattern_name not in matched_patterns:
                        matched_patterns.add(pattern_name)

                        # If already added via known_diagnoses, skip duplicate name
                        already_added = any(e["error_name"] == pattern_name for e in detected_errors)
                        if not already_added:
                            parsed_from_logs = FullErrorReportGenerator._build_report_from_pattern(
                                pattern_obj, 
                                matching_lines, 
                                len(detected_errors) + 1
                            )
                            detected_errors.append(parsed_from_logs)

        # 3. Fallback: If no specific error pattern matched, build generic error report
        if not detected_errors:
            lines = [l.strip() for l in logs_or_text.split('\n') if l.strip()] if logs_or_text else []
            error_line = next((l for l in lines if re.search(r'\b(error|fatal|exception)\b', l, re.I)), "Pipeline Execution Anomaly Detected")
            
            generic_report = FullErrorReportGenerator._build_generic_report(error_line, lines)
            detected_errors.append(generic_report)

        return detected_errors

    @staticmethod
    def _parse_diagnosis_item(diag: Dict[str, Any], index: int) -> Dict[str, Any]:
        """
        Parses an input diagnosis record into the complete 11-field report format.
        """
        diag_id = diag.get("diagnosis_id") or diag.get("id") or f"err-diag-{index:03d}"
        failure_class = diag.get("failure_class", "UNKNOWN")

        # Match pattern obj for defaults
        matched_pattern = next((p for p in KNOWN_ERROR_PATTERNS if p["failure_class"] == failure_class), None)

        error_name = (
            diag.get("error_name") or 
            (matched_pattern["error_name"] if matched_pattern else f"{failure_class}_Exception")
        )

        error_message = (
            diag.get("error_message") or 
            diag.get("error") or 
            (matched_pattern["root_cause"] if matched_pattern else f"Pipeline failure in class '{failure_class}'.")
        )

        # Location breakdown
        loc = diag.get("error_location")
        if not isinstance(loc, dict):
            loc = {
                "file": diag.get("file") or (matched_pattern["default_file"] if matched_pattern else "pipeline_worker.py"),
                "function": diag.get("function") or (matched_pattern["default_function"] if matched_pattern else "execute_pipeline_task()"),
                "line_number": diag.get("line_number") or (matched_pattern["default_line"] if matched_pattern else 101),
                "pipeline_stage": diag.get("pipeline_stage") or (matched_pattern["default_stage"] if matched_pattern else "PIPELINE_EXECUTION"),
            }

        root_cause = (
            diag.get("root_cause") or 
            diag.get("expected_root_cause") or 
            (matched_pattern["root_cause"] if matched_pattern else "Root cause identified by Diagnosis Agent based on raw execution logs.")
        )

        evidence = diag.get("evidence") or diag.get("rawLogs") or [error_message]
        if isinstance(evidence, str):
            evidence = [evidence]

        confidence_val = diag.get("confidence_score") or diag.get("confidence") or "92.0%"
        if isinstance(confidence_val, (int, float)):
            confidence_score = f"{confidence_val}%"
        else:
            confidence_score = str(confidence_val) if "%" in str(confidence_val) else f"{confidence_val}%"

        remediation = (
            diag.get("recommended_remediation") or 
            diag.get("proposed_remediation") or 
            (matched_pattern["action"] if matched_pattern else "RESTART_POD")
        )

        rectification = (
            diag.get("error_rectification") or 
            (matched_pattern["remediation_explanation"] if matched_pattern else [
                f"Step 1: Execute '{remediation}' action on target component.",
                "Step 2: Verify component health status and query metrics.",
                "Step 3: Resume pipeline execution from last valid checkpoint."
            ])
        )

        expected_outcome = (
            diag.get("expected_outcome") or 
            (matched_pattern["expected_outcome"] if matched_pattern else "Pipeline run resumes successfully with 0 active error signals.")
        )

        # Run 5-dimension risk evaluation
        risk_result = RiskAssessmentAgent.assess_risk([{
            "diagnosis_id": diag_id,
            "failure_class": failure_class,
            "proposed_remediation": remediation,
            "remediation_metadata": diag.get("remediation_metadata")
        }])[0]

        return {
            "diagnosis_id": diag_id,
            "error_name": error_name,
            "error_message": error_message,
            "error_location": loc,
            "root_cause": root_cause,
            "evidence": evidence,
            "confidence_score": confidence_score,
            "risk_level": risk_result["risk_level"],
            "risk_justification": risk_result["risk_justification"],
            "recommended_remediation": remediation,
            "error_rectification": rectification,
            "expected_outcome": expected_outcome
        }

    @staticmethod
    def _build_report_from_pattern(
        pattern_obj: Dict[str, Any], 
        matching_lines: List[str], 
        index: int
    ) -> Dict[str, Any]:
        """
        Builds a full 11-field report from a matched log pattern.
        """
        diag_id = f"err-log-{index:03d}"
        remediation = pattern_obj["action"]

        risk_result = RiskAssessmentAgent.assess_risk([{
            "diagnosis_id": diag_id,
            "failure_class": pattern_obj["failure_class"],
            "proposed_remediation": remediation
        }])[0]

        return {
            "diagnosis_id": diag_id,
            "error_name": pattern_obj["error_name"],
            "error_message": matching_lines[0] if matching_lines else pattern_obj["root_cause"],
            "error_location": {
                "file": pattern_obj["default_file"],
                "function": pattern_obj["default_function"],
                "line_number": pattern_obj["default_line"],
                "pipeline_stage": pattern_obj["default_stage"]
            },
            "root_cause": pattern_obj["root_cause"],
            "evidence": matching_lines[:5],
            "confidence_score": "94.5%",
            "risk_level": risk_result["risk_level"],
            "risk_justification": risk_result["risk_justification"],
            "recommended_remediation": remediation,
            "error_rectification": pattern_obj["remediation_explanation"],
            "expected_outcome": pattern_obj["expected_outcome"]
        }

    @staticmethod
    def _build_generic_report(error_line: str, all_lines: List[str]) -> Dict[str, Any]:
        """
        Fallback generator for unmapped error logs.
        """
        diag_id = "err-gen-001"
        remediation = "RESTART_POD"

        risk_result = RiskAssessmentAgent.assess_risk([{
            "diagnosis_id": diag_id,
            "failure_class": "UNKNOWN",
            "proposed_remediation": remediation
        }])[0]

        return {
            "diagnosis_id": diag_id,
            "error_name": "PipelineExecutionException",
            "error_message": error_line,
            "error_location": {
                "file": "pipeline_executor.py",
                "function": "run_pipeline_step()",
                "line_number": 95,
                "pipeline_stage": "PIPELINE_EXECUTION"
            },
            "root_cause": "Unhandled execution anomaly in pipeline worker task.",
            "evidence": all_lines[:5] if all_lines else [error_line],
            "confidence_score": "75.0%",
            "risk_level": risk_result["risk_level"],
            "risk_justification": risk_result["risk_justification"],
            "recommended_remediation": remediation,
            "error_rectification": [
                "Step 1: Restart compute pod instance with refreshed configuration.",
                "Step 2: Monitor log trace for initialization errors.",
                "Step 3: Escalate to Tier-3 SRE if error persists after restart."
            ],
            "expected_outcome": "Container pod restarts successfully and clears transient execution deadlock."
        }
