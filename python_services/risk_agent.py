"""
Risk Assessment Agent for Self-Healing Data Pipeline System.

RESPONSIBILITY: Evaluate the operational risk of proposed remediation for EACH
diagnosis independently, based on 5 risk dimensions.

THIS AGENT DOES NOT:
- Re-diagnose the problem.
- Decide whether to auto-fix, notify, or escalate (that's the Authority Agent).
- Consider diagnosis confidence when assigning risk.
- Combine multiple diagnoses into a single overall risk.

RISK EVALUATION DIMENSIONS:
1. Reversibility        — Reversible (Low) vs. Irreversible (High)
2. Data Impact          — No modification (Low), Permanent (Medium), Destructive (High)
3. Schema Impact        — No schema change (Low) vs. Schema modification (High)
4. Security Impact      — No credential changes (Low) vs. Credential/permission changes (High)
5. External System Impact — Internal-only (Low) vs. External system interaction (Medium)

OUTPUT FORMAT PER DIAGNOSIS:
[
  {
    "diagnosis_id": "...",
    "error": "...",
    "location": "...",
    "root_cause": "...",
    "proposed_remediation": "...",
    "remediation_explanation": "...",
    "risk_level": "LOW | MEDIUM | HIGH",
    "risk_justification": "...",
    "reversibility": "REVERSIBLE | IRREVERSIBLE"
  }
]
"""

from typing import Dict, Any, List, Optional
from python_services.db import write_risk_decision


# ─── Action → Remediation Metadata Defaults ────────────────────────────────────

ACTION_METADATA_DEFAULTS: Dict[str, Dict[str, bool]] = {
    "retry_job": {
        "reversible": True,
        "modifies_data": False,
        "modifies_schema": False,
        "changes_credentials": False,
        "affects_external_systems": False,
        "destructive": False,
    },
    "quarantine_rows": {
        "reversible": True,
        "modifies_data": True,
        "modifies_schema": False,
        "changes_credentials": False,
        "affects_external_systems": False,
        "destructive": False,
    },
    "rerun_pipeline": {
        "reversible": True,
        "modifies_data": False,
        "modifies_schema": False,
        "changes_credentials": False,
        "affects_external_systems": True,
        "destructive": False,
    },
    "apply_schema_patch": {
        "reversible": False,
        "modifies_data": False,
        "modifies_schema": True,
        "changes_credentials": False,
        "affects_external_systems": False,
        "destructive": False,
    },
    "refresh_credentials": {
        "reversible": False,
        "modifies_data": False,
        "modifies_schema": False,
        "changes_credentials": True,
        "affects_external_systems": True,
        "destructive": False,
    },
    "INCREASE_MEMORY_LIMIT": {
        "reversible": True,
        "modifies_data": False,
        "modifies_schema": False,
        "changes_credentials": False,
        "affects_external_systems": False,
        "destructive": False,
    },
    "FLUSH_CONNECTION_POOL": {
        "reversible": True,
        "modifies_data": False,
        "modifies_schema": False,
        "changes_credentials": False,
        "affects_external_systems": False,
        "destructive": False,
    },
    "ROLLBACK_MIGRATION": {
        "reversible": False,
        "modifies_data": False,
        "modifies_schema": True,
        "changes_credentials": False,
        "affects_external_systems": False,
        "destructive": False,
    },
    "RESTART_POD": {
        "reversible": True,
        "modifies_data": False,
        "modifies_schema": False,
        "changes_credentials": False,
        "affects_external_systems": False,
        "destructive": False,
    },
}

# ─── Failure Class Defaults ───────────────────────────────────────────────────

FAILURE_CLASS_DEFAULTS: Dict[str, Dict[str, str]] = {
    "SOURCE_API_FAILURE": {
        "action": "retry_job",
        "error": "External source API endpoint returned 5xx/429 error or connection timeout.",
        "location": "Ingestion Stage -> Source API Client (/api/v1/fetch)",
        "root_cause": "Upstream API rate limit or transient network latency caused connection drop during fetch.",
        "remediation_explanation": "Retries the job with exponential backoff and jittered delay to bypass transient rate limits.",
    },
    "STALE_MISSING_DATA": {
        "action": "rerun_pipeline",
        "error": "Partition sync failed or expected data records were missing from source.",
        "location": "Ingestion Stage -> Partition Sync Worker",
        "root_cause": "Delayed upstream data sync caused missing data partition in current run window.",
        "remediation_explanation": "Re-runs the pipeline execution step for the missing data partition window.",
    },
    "DATA_QUALITY_ANOMALY": {
        "action": "quarantine_rows",
        "error": "Data quality checks failed due to null rate or invalid values exceeding tolerance threshold.",
        "location": "Validation Stage -> Data Quality Check Guard",
        "root_cause": "Corrupted or unexpected record values injected into batch dataset.",
        "remediation_explanation": "Isolates invalid rows into quarantine table, allowing clean records to continue downstream.",
    },
    "SCHEMA_DRIFT": {
        "action": "apply_schema_patch",
        "error": "Schema mismatch or column type incompatibility detected during ingest.",
        "location": "Ingest Stage -> Schema Validator (public.transactions table)",
        "root_cause": "Upstream source modified column structure or types without updating downstream schema migration.",
        "remediation_explanation": "Applies automated DDL schema patch and dynamic type cast wrapper to align target table.",
    },
    "DOWNSTREAM_WRITE_FAILURE": {
        "action": "refresh_credentials",
        "error": "Database write failed due to connection pool exhaustion or expired write credentials.",
        "location": "Storage Stage -> PostgreSQL Connection Pool / Sink Writer",
        "root_cause": "Expired IAM token or database connection pool exhaustion prevented write transactions.",
        "remediation_explanation": "Refreshes IAM write tokens and flushes active database connection handles.",
    },
    "CREDENTIAL_EXPIRED": {
        "action": "refresh_credentials",
        "error": "Authentication token or IAM credential expired.",
        "location": "Security & Auth Stage -> IAM Service / Secret Manager",
        "root_cause": "API or database connection key expired past its validity window.",
        "remediation_explanation": "Fetches updated OAuth2 / IAM token from Secrets Manager and re-authenticates client.",
    },
    "OUT_OF_MEMORY": {
        "action": "INCREASE_MEMORY_LIMIT",
        "error": "JVM/Container memory allocation exceeded due to workload spike (OOMKilled).",
        "location": "Compute Infrastructure -> Kubernetes Worker Pod",
        "root_cause": "Heap memory allocation exceeded due to high batch volume or memory leak.",
        "remediation_explanation": "Increases memory allocation limit for the worker pod and restarts instance.",
    },
    "DATABASE_TIMEOUT": {
        "action": "FLUSH_CONNECTION_POOL",
        "error": "Database connection pool exhausted or queries timed out under load.",
        "location": "Database Layer -> Connection Pool Manager",
        "root_cause": "Unclosed connection handles or concurrent query spikes exhausted DB pool limit.",
        "remediation_explanation": "Flushes idle database connection handles and expands connection pool limit.",
    },
    "POD_CRASH_LOOP": {
        "action": "RESTART_POD",
        "error": "Container entered CrashLoopBackOff state due to unhandled exception.",
        "location": "Orchestration Layer -> K8s Deployment Controller",
        "root_cause": "Pod crashed repeatedly on startup due to transient dependency initialization failure.",
        "remediation_explanation": "Restarts the container pod with reset environment configuration.",
    },
}


class RiskAssessmentAgent:
    """
    Risk Assessment Agent — evaluates operational risk per diagnosis independently.
    Returns structured JSON for each diagnosis record.
    """

    @staticmethod
    def assess_risk(diagnoses: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Evaluate risk for a list of diagnosis records independently.

        Each diagnosis dict can contain:
            - diagnosis_id (or id)
            - failure_class / error / error_summary
            - location / error_location / affected_component
            - root_cause / expected_root_cause
            - proposed_remediation
            - remediation_explanation
            - remediation_metadata (optional dict with boolean flags:
                reversible, modifies_data, modifies_schema, changes_credentials,
                affects_external_systems, destructive)

        Returns a list of risk assessment results, one per diagnosis.
        """
        results = []
        for diag in diagnoses:
            assessment = RiskAssessmentAgent._evaluate_single(diag)
            results.append(assessment)
        return results

    @staticmethod
    def _evaluate_single(diag: Dict[str, Any]) -> Dict[str, Any]:
        """
        Evaluate a single diagnosis record against the 5 risk dimensions.
        """
        diagnosis_id = (
            diag.get("diagnosis_id") or 
            diag.get("id") or 
            f"diag-{Math_rand_id()}"
        )
        failure_class = diag.get("failure_class", "UNKNOWN")
        defaults = FAILURE_CLASS_DEFAULTS.get(failure_class, {})

        # Extract or resolve fields
        error_summary = (
            diag.get("error") or 
            diag.get("error_summary") or 
            diag.get("error_message") or 
            defaults.get("error", f"Pipeline error detected: {failure_class}")
        )

        location = (
            diag.get("location") or 
            diag.get("error_location") or 
            diag.get("affected_component") or 
            defaults.get("location", "Pipeline Execution Component")
        )

        root_cause = (
            diag.get("root_cause") or 
            diag.get("expected_root_cause") or 
            defaults.get("root_cause", "Root cause identified by Diagnosis Agent based on log trace analysis.")
        )

        proposed_remediation = (
            diag.get("proposed_remediation") or 
            defaults.get("action", "RESTART_POD")
        )

        remediation_explanation = (
            diag.get("remediation_explanation") or 
            defaults.get("remediation_explanation", f"Executes {proposed_remediation} to restore system stability.")
        )

        # Resolve remediation metadata: explicit overrides > defaults > safe fallback
        meta = diag.get("remediation_metadata")
        if not meta:
            meta = ACTION_METADATA_DEFAULTS.get(
                proposed_remediation,
                {
                    "reversible": False,
                    "modifies_data": False,
                    "modifies_schema": False,
                    "changes_credentials": False,
                    "affects_external_systems": False,
                    "destructive": False,
                }
            )

        # ── Dimension 1: Reversibility ──────────────────────────────────────
        is_reversible = meta.get("reversible", False)
        reversibility_risk = "LOW" if is_reversible else "HIGH"
        reversibility_str = "REVERSIBLE" if is_reversible else "IRREVERSIBLE"
        reversibility_reason = (
            "Action is reversible — can be safely rolled back."
            if is_reversible
            else "Action is irreversible — cannot be undone once applied."
        )

        # ── Dimension 2: Data Impact ────────────────────────────────────────
        is_destructive = meta.get("destructive", False)
        modifies_data = meta.get("modifies_data", False)

        if is_destructive:
            data_risk = "HIGH"
            data_reason = "Action deletes or destroys data — permanent data loss risk."
        elif modifies_data:
            data_risk = "MEDIUM"
            data_reason = "Action permanently modifies data — requires monitoring."
        else:
            data_risk = "LOW"
            data_reason = "No permanent data modification — data remains intact."

        # ── Dimension 3: Schema Impact ──────────────────────────────────────
        modifies_schema = meta.get("modifies_schema", False)
        schema_risk = "HIGH" if modifies_schema else "LOW"
        schema_reason = (
            "Action modifies database schema (DDL changes) — high impact."
            if modifies_schema
            else "No schema changes — table structure remains unchanged."
        )

        # ── Dimension 4: Security Impact ────────────────────────────────────
        changes_credentials = meta.get("changes_credentials", False)
        security_risk = "HIGH" if changes_credentials else "LOW"
        security_reason = (
            "Action refreshes or rotates credentials/permissions — security-sensitive."
            if changes_credentials
            else "No credential or permission changes — security state unchanged."
        )

        # ── Dimension 5: External System Impact ────────────────────────────
        affects_external = meta.get("affects_external_systems", False)
        external_risk = "MEDIUM" if affects_external else "LOW"
        external_reason = (
            "Action calls or modifies external systems — cross-system side effects possible."
            if affects_external
            else "Action is internal-only — no external system interaction."
        )

        # ── Calculate Overall Risk Level ────────────────────────────────────
        dimension_risks = [
            reversibility_risk,
            data_risk,
            schema_risk,
            security_risk,
            external_risk,
        ]

        if "HIGH" in dimension_risks:
            overall_risk = "HIGH"
        elif "MEDIUM" in dimension_risks:
            overall_risk = "MEDIUM"
        else:
            overall_risk = "LOW"

        # ── Build Risk Justification ────────────────────────────────────────
        justification_parts = []
        for dim_risk, dim_reason in [
            (reversibility_risk, reversibility_reason),
            (data_risk, data_reason),
            (schema_risk, schema_reason),
            (security_risk, security_reason),
            (external_risk, external_reason),
        ]:
            if dim_risk != "LOW" or overall_risk == "LOW":
                justification_parts.append(f"[{dim_risk}] {dim_reason}")

        risk_justification = (
            f"Remediation '{proposed_remediation}' evaluated as {overall_risk} risk. "
            + " ".join(justification_parts)
        )

        return {
            "diagnosis_id": diagnosis_id,
            "error": error_summary,
            "location": location,
            "root_cause": root_cause,
            "proposed_remediation": proposed_remediation,
            "remediation_explanation": remediation_explanation,
            "risk_level": overall_risk,
            "risk_justification": risk_justification,
            "reversibility": reversibility_str,
            # Backward-compatibility fields
            "failure_class": failure_class,
            "reasons": justification_parts,
            "dimension_breakdown": {
                "reversibility": reversibility_risk,
                "data_impact": data_risk,
                "schema_impact": schema_risk,
                "security_impact": security_risk,
                "external_system_impact": external_risk,
            },
        }


def Math_rand_id() -> str:
    import uuid
    return uuid.uuid4().hex[:6]


# ─── Backward-Compatible Wrapper (keeps existing orchestrator API working) ──────

class RiskAgent:
    """
    Backward-compatible wrapper that bridges the existing orchestrator
    (which calls evaluate_risk_policy with a single diagnosis) to the
    new RiskAssessmentAgent.
    """

    @staticmethod
    def evaluate_risk_policy(
        diagnosis_row: Dict[str, Any],
        allow_irreversible_autofix: bool = True
    ) -> Dict[str, Any]:
        """
        Evaluates a diagnosis record: first runs risk assessment, then applies
        the Authority Matrix to decide action (auto-fix / auto-fix-notify / escalate-only).
        Writes decision to `risk_decisions` table.
        """
        diagnosis_id = diagnosis_row["id"]
        pipeline_id = diagnosis_row["pipeline_id"]
        run_id = diagnosis_row["run_id"]
        status = diagnosis_row.get("status", "inconclusive")
        confidence = diagnosis_row.get("confidence", "low").lower()
        failure_class = diagnosis_row.get("failure_class", "UNKNOWN")

        proposed_remediation = diag_action_map(failure_class)

        # ── Step 1: Run Risk Assessment ─────────────────────────────────────
        assessment = RiskAssessmentAgent._evaluate_single({
            "diagnosis_id": diagnosis_id,
            "failure_class": failure_class,
            "proposed_remediation": proposed_remediation,
        })

        risk_level = assessment["risk_level"]
        is_reversible = assessment["reversibility"] == "REVERSIBLE"

        # ── Step 2: Authority Matrix Decision ───────────────────────────────
        fallback_used = False
        decision = "escalate-only"
        justification = ""

        is_uncovered = (
            status == "confident" and
            (failure_class == "UNKNOWN" or proposed_remediation == "UNKNOWN_ACTION")
        )

        if is_uncovered:
            fallback_used = True
            decision = "escalate-only"
            justification = (
                f"[LLM_FALLBACK_REACHED] Uncovered policy scenario: failure_class "
                f"'{failure_class}' has no standard matrix mapping. "
                f"Risk level: {risk_level}. Defaulting to escalate-only for audit."
            )

        # Rule 5: Low Confidence or Inconclusive -> escalate-only
        elif status == "inconclusive" or confidence == "low":
            decision = "escalate-only"
            justification = (
                f"Diagnosis status is '{status}' with confidence '{confidence}'. "
                f"Risk assessment: {risk_level}. Matrix rule 5 mandates escalate-only."
            )

        # Rule 1 & 2: High Confidence
        elif confidence == "high":
            if is_reversible and risk_level == "LOW":
                # Rule 1: High Confidence + Reversible + Low Risk -> auto-fix
                decision = "auto-fix"
                justification = (
                    f"High confidence diagnosis for '{failure_class}' with reversible "
                    f"action '{proposed_remediation}'. Risk: {risk_level}. "
                    f"Matrix rule 1 allows auto-fix."
                )
            elif risk_level == "HIGH" and not allow_irreversible_autofix:
                # Strict safety override -> escalate
                decision = "escalate-only"
                justification = (
                    f"Strict safety policy override: HIGH risk action "
                    f"'{proposed_remediation}' for '{failure_class}' blocked from "
                    f"auto-fix. Escalated for operator sign-off."
                )
            else:
                # Rule 2: High Confidence + any other risk combo -> auto-fix-notify
                decision = "auto-fix-notify"
                justification = (
                    f"High confidence diagnosis for '{failure_class}' with "
                    f"action '{proposed_remediation}'. Risk: {risk_level}. "
                    f"Matrix rule 2 assigns auto-fix-notify."
                )

        # Rule 3 & 4: Medium Confidence
        elif confidence == "medium":
            if is_reversible and risk_level in ("LOW", "MEDIUM"):
                # Rule 3: Medium Confidence + Reversible + Low/Medium Risk -> auto-fix-notify
                decision = "auto-fix-notify"
                justification = (
                    f"Medium confidence diagnosis for '{failure_class}' with "
                    f"reversible action '{proposed_remediation}'. Risk: {risk_level}. "
                    f"Matrix rule 3 assigns auto-fix-notify."
                )
            else:
                # Rule 4: Medium Confidence + Irreversible or High Risk -> escalate-only
                decision = "escalate-only"
                justification = (
                    f"Medium confidence diagnosis for '{failure_class}' with "
                    f"action '{proposed_remediation}'. Risk: {risk_level}. "
                    f"Matrix rule 4 mandates escalate-only."
                )

        # ── Step 3: Persist to risk_decisions table ─────────────────────────
        decision_record = write_risk_decision({
            "diagnosis_id": diagnosis_id,
            "pipeline_id": pipeline_id,
            "run_id": run_id,
            "failure_class": failure_class,
            "decision": decision,
            "justification": justification,
            "action_type": proposed_remediation,
            "is_reversible": is_reversible,
            "risk_level": risk_level,
            "risk_reasons": assessment["reasons"],
            "risk_dimensions": assessment["dimension_breakdown"],
            "fallback_used": fallback_used,
        })

        return decision_record


def diag_action_map(failure_class: str) -> str:
    m = {
        "SOURCE_API_FAILURE": "retry_job",
        "STALE_MISSING_DATA": "rerun_pipeline",
        "DATA_QUALITY_ANOMALY": "quarantine_rows",
        "SCHEMA_DRIFT": "apply_schema_patch",
        "DOWNSTREAM_WRITE_FAILURE": "refresh_credentials",
        "CREDENTIAL_EXPIRED": "refresh_credentials",
    }
    return m.get(failure_class, "UNKNOWN_ACTION")
