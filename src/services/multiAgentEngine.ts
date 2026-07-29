import { DataService } from './dataService';
import { 
  Incident, 
  AgentThought, 
  AgentName, 
  AgentStatus, 
  IncidentStatus, 
  FailureScenario,
  ProposedRemediation,
  RiskTier 
} from '../types/agent';

export type EngineEventListener = (state: EngineState) => void;

export interface EngineState {
  activeIncident: Incident | null;
  activeAgent: AgentName | null;
  agentStatuses: Record<AgentName, AgentStatus>;
  thoughts: AgentThought[];
  isExecuting: boolean;
  autoPlay: boolean;
  executionSpeedMs: number;
  selectedScenarioId: string | null;
}

const INITIAL_AGENT_STATUSES: Record<AgentName, AgentStatus> = {
  Monitor: 'idle',
  Diagnosis: 'idle',
  RiskAuthority: 'idle',
  Remediation: 'idle',
  Reporting: 'idle'
};

export class MultiAgentEngine {
  private static state: EngineState = {
    activeIncident: null,
    activeAgent: null,
    agentStatuses: { ...INITIAL_AGENT_STATUSES },
    thoughts: [],
    isExecuting: false,
    autoPlay: true,
    executionSpeedMs: 1200,
    selectedScenarioId: null
  };

  private static listeners: Set<EngineEventListener> = new Set();
  private static executionTimer: NodeJS.Timeout | null = null;
  private static currentStepIndex = 0;

  /**
   * Subscribe to engine state changes
   */
  static subscribe(listener: EngineEventListener): () => void {
    this.listeners.add(listener);
    listener({ ...this.state });
    return () => this.listeners.delete(listener);
  }

  private static notify() {
    const currentState = { ...this.state };
    this.listeners.forEach(l => l(currentState));
  }

  /**
   * Get current engine state
   */
  static getState(): EngineState {
    return { ...this.state };
  }

  /**
   * Set execution speed delay (ms per agent step)
   */
  static setSpeed(ms: number) {
    this.state.executionSpeedMs = ms;
    this.notify();
  }

  /**
   * Reset engine state back to idle
   */
  static reset() {
    if (this.executionTimer) {
      clearTimeout(this.executionTimer);
      this.executionTimer = null;
    }
    this.currentStepIndex = 0;
    this.state = {
      ...this.state,
      activeIncident: null,
      activeAgent: null,
      agentStatuses: { ...INITIAL_AGENT_STATUSES },
      thoughts: [],
      isExecuting: false,
      selectedScenarioId: null
    };
    this.notify();
  }

  /**
   * Start multi-agent healing workflow for a failure scenario or custom incident
   */
  static async triggerIncidentScenario(scenario: FailureScenario) {
    this.reset();
    this.state.selectedScenarioId = scenario.id;
    this.state.isExecuting = true;
    this.notify();

    // 1. MONITOR AGENT: Detect Failure
    this.setAgentState('Monitor', 'running');
    const newInc = await DataService.createIncident({
      pipelineId: scenario.pipelineId,
      pipelineName: scenario.pipelineName,
      environment: scenario.environment,
      status: 'OPEN',
      failureCategory: scenario.category,
      errorMessage: scenario.description,
      rawLogs: scenario.rawLogs,
      affectedComponent: 'k8s-pod-worker'
    });

    this.state.activeIncident = newInc;
    this.currentStepIndex = 1;

    const t1 = await this.addThought({
      incidentId: newInc.id,
      stepIndex: this.currentStepIndex++,
      agentName: 'Monitor',
      type: 'observation',
      content: `[ALERT_RECEIVED] Pipeline '${scenario.pipelineName}' failed in ${scenario.environment}. Error: ${scenario.description}`,
      toolName: 'parsePipelineTelemetry',
      toolOutput: { status: 'FAILED', logsCount: scenario.rawLogs.length }
    });

    this.setAgentState('Monitor', 'completed');
    this.notify();

    if (this.state.autoPlay) {
      this.scheduleNextStep(() => this.runDiagnosisPhase(newInc, scenario));
    }
  }

  /**
   * Step 2: DIAGNOSIS AGENT
   */
  private static async runDiagnosisPhase(incident: Incident, scenario: FailureScenario) {
    this.setAgentState('Diagnosis', 'running');
    this.state.activeAgent = 'Diagnosis';
    await DataService.updateIncidentStatus(incident.id, 'DIAGNOSING');
    this.notify();

    await this.addThought({
      incidentId: incident.id,
      stepIndex: this.currentStepIndex++,
      agentName: 'Diagnosis',
      type: 'thought',
      content: `Analyzing raw execution logs and stack trace to categorize failure pattern...`
    });

    const kbMatches = await DataService.queryKnowledgeBase(incident.failureCategory);
    const topMatch = kbMatches[0];

    const confidence = topMatch ? topMatch.successRate : 88.0;
    const rootCause = scenario.expectedRootCause || (topMatch ? topMatch.rootCausePattern : 'Resource constraint anomaly');

    await this.addThought({
      incidentId: incident.id,
      stepIndex: this.currentStepIndex++,
      agentName: 'Diagnosis',
      type: 'action',
      content: `Querying pgvector embedding store for resolution articles matching category '${incident.failureCategory}'`,
      toolName: 'queryKnowledgeBase',
      toolInput: { failureCategory: incident.failureCategory },
      toolOutput: { matchId: topMatch?.id || 'kb-default', similarity: 0.965, recommendedSolution: scenario.expectedFix.description }
    });

    const updatedInc = await DataService.updateIncidentStatus(incident.id, 'DIAGNOSING', {
      rootCause,
      confidenceScore: confidence,
      proposedRemediation: scenario.expectedFix
    });

    if (updatedInc) this.state.activeIncident = updatedInc;
    this.setAgentState('Diagnosis', 'completed');
    this.notify();

    if (this.state.autoPlay) {
      this.scheduleNextStep(() => this.runRiskEvaluationPhase(this.state.activeIncident!, scenario.expectedFix));
    }
  }

  /**
   * Step 3: RISK AUTHORITY AGENT — 5-Dimension Risk Assessment
   */
  private static async runRiskEvaluationPhase(incident: Incident, remediation: ProposedRemediation) {
    this.setAgentState('RiskAuthority', 'running');
    this.state.activeAgent = 'RiskAuthority';
    await DataService.updateIncidentStatus(incident.id, 'EVALUATING_RISK');
    this.notify();

    // Determine remediation metadata based on action type
    const ACTION_META: Record<string, { reversible: boolean; modifies_data: boolean; modifies_schema: boolean; changes_credentials: boolean; affects_external: boolean; destructive: boolean }> = {
      'INCREASE_MEMORY_LIMIT': { reversible: true, modifies_data: false, modifies_schema: false, changes_credentials: false, affects_external: false, destructive: false },
      'FLUSH_CONNECTION_POOL': { reversible: true, modifies_data: false, modifies_schema: false, changes_credentials: false, affects_external: false, destructive: false },
      'ROLLBACK_MIGRATION':   { reversible: false, modifies_data: false, modifies_schema: true, changes_credentials: false, affects_external: false, destructive: false },
      'RESTART_POD':          { reversible: true, modifies_data: false, modifies_schema: false, changes_credentials: false, affects_external: false, destructive: false },
      'retry_job':            { reversible: true, modifies_data: false, modifies_schema: false, changes_credentials: false, affects_external: false, destructive: false },
      'quarantine_rows':      { reversible: true, modifies_data: true, modifies_schema: false, changes_credentials: false, affects_external: false, destructive: false },
      'rerun_pipeline':       { reversible: true, modifies_data: false, modifies_schema: false, changes_credentials: false, affects_external: true, destructive: false },
      'apply_schema_patch':   { reversible: false, modifies_data: false, modifies_schema: true, changes_credentials: false, affects_external: false, destructive: false },
      'refresh_credentials':  { reversible: false, modifies_data: false, modifies_schema: false, changes_credentials: true, affects_external: true, destructive: false },
    };

    const meta = ACTION_META[remediation.actionType] || { reversible: false, modifies_data: false, modifies_schema: false, changes_credentials: false, affects_external: false, destructive: false };

    await this.addThought({
      incidentId: incident.id,
      stepIndex: this.currentStepIndex++,
      agentName: 'RiskAuthority',
      type: 'thought',
      content: `Evaluating 5-dimension risk assessment for action '${remediation.actionType}' in '${incident.environment}' environment.`
    });

    // ── 5-Dimension Risk Evaluation ──
    const dimReversibility = meta.reversible ? 'LOW' : 'HIGH';
    const dimData = meta.destructive ? 'HIGH' : meta.modifies_data ? 'MEDIUM' : 'LOW';
    const dimSchema = meta.modifies_schema ? 'HIGH' : 'LOW';
    const dimSecurity = meta.changes_credentials ? 'HIGH' : 'LOW';
    const dimExternal = meta.affects_external ? 'MEDIUM' : 'LOW';

    const dims = [dimReversibility, dimData, dimSchema, dimSecurity, dimExternal];
    const overallRisk: RiskTier = dims.includes('HIGH') ? 'HIGH' : dims.includes('MEDIUM') ? 'MEDIUM' : 'LOW';

    const reasons: string[] = [];
    if (dimReversibility !== 'LOW') reasons.push(`[${dimReversibility}] Action is irreversible — cannot be undone once applied.`);
    if (dimData !== 'LOW') reasons.push(`[${dimData}] ${meta.destructive ? 'Action deletes data — permanent loss risk.' : 'Action permanently modifies data — requires monitoring.'}`);
    if (dimSchema !== 'LOW') reasons.push(`[${dimSchema}] Action modifies database schema (DDL changes) — high impact.`);
    if (dimSecurity !== 'LOW') reasons.push(`[${dimSecurity}] Action refreshes credentials/permissions — security-sensitive.`);
    if (dimExternal !== 'LOW') reasons.push(`[${dimExternal}] Action calls external systems — cross-system side effects possible.`);
    if (reasons.length === 0) {
      reasons.push('[LOW] Action is reversible — can be safely rolled back.');
      reasons.push('[LOW] No permanent data modification — data remains intact.');
      reasons.push('[LOW] No schema, security, or external system impact.');
    }

    await this.addThought({
      incidentId: incident.id,
      stepIndex: this.currentStepIndex++,
      agentName: 'RiskAuthority',
      type: 'action',
      content: `Risk Assessment Complete → Overall: ${overallRisk} | Reversibility: ${dimReversibility} | Data: ${dimData} | Schema: ${dimSchema} | Security: ${dimSecurity} | External: ${dimExternal}`,
      toolName: 'evaluateRiskDimensions',
      toolInput: { actionType: remediation.actionType, environment: incident.environment, metadata: meta },
      toolOutput: { risk_level: overallRisk, reasons, dimensions: { reversibility: dimReversibility, data_impact: dimData, schema_impact: dimSchema, security_impact: dimSecurity, external_system_impact: dimExternal } }
    });

    const policies = await DataService.getRiskPolicies();
    const matchingPolicy = policies.find(p => p.actionType === remediation.actionType);
    const requiresApproval = overallRisk === 'HIGH' || remediation.requiresHumanApproval || (matchingPolicy ? !matchingPolicy.autoApprove : false);

    if (requiresApproval) {
      const pendingInc = await DataService.updateIncidentStatus(incident.id, 'PENDING_APPROVAL', {
        riskTier: overallRisk
      });
      if (pendingInc) this.state.activeIncident = pendingInc;
      
      this.setAgentState('RiskAuthority', 'waiting_approval');
      this.state.isExecuting = false;
      
      await this.addThought({
        incidentId: incident.id,
        stepIndex: this.currentStepIndex++,
        agentName: 'RiskAuthority',
        type: 'final_answer',
        content: `⚠️ Risk Level: ${overallRisk}. Action '${remediation.actionType}' flagged for Human Governance Approval. Reasons: ${reasons.join(' | ')}`
      });

      this.notify();
    } else {
      const approvedInc = await DataService.updateIncidentStatus(incident.id, 'REMEDIATING', {
        riskTier: overallRisk,
        approvedBy: 'Auto-Policy Engine'
      });
      if (approvedInc) this.state.activeIncident = approvedInc;

      this.setAgentState('RiskAuthority', 'completed');
      this.notify();

      if (this.state.autoPlay) {
        this.scheduleNextStep(() => this.runRemediationPhase(this.state.activeIncident!, remediation));
      }
    }
  }

  /**
   * User Action: Approve pending remediation
   */
  static async approvePendingRemediation(approverName: string = 'System Admin') {
    if (!this.state.activeIncident || this.state.activeIncident.status !== 'PENDING_APPROVAL') return;

    const incident = this.state.activeIncident;
    const remediation = incident.proposedRemediation!;

    const updatedInc = await DataService.updateIncidentStatus(incident.id, 'REMEDIATING', {
      approvedBy: approverName
    });

    if (updatedInc) this.state.activeIncident = updatedInc;

    this.setAgentState('RiskAuthority', 'completed');
    this.state.isExecuting = true;

    await this.addThought({
      incidentId: incident.id,
      stepIndex: this.currentStepIndex++,
      agentName: 'RiskAuthority',
      type: 'observation',
      content: `✓ Human Governance Approval granted by '${approverName}'. Resuming autonomous remediation loop.`
    });

    this.notify();
    this.scheduleNextStep(() => this.runRemediationPhase(this.state.activeIncident!, remediation));
  }

  /**
   * User Action: Reject pending remediation
   */
  static async rejectPendingRemediation(reason: string = 'Manually rejected by admin') {
    if (!this.state.activeIncident || this.state.activeIncident.status !== 'PENDING_APPROVAL') return;

    const incident = this.state.activeIncident;
    const updatedInc = await DataService.updateIncidentStatus(incident.id, 'ESCALATED');

    if (updatedInc) this.state.activeIncident = updatedInc;

    this.setAgentState('RiskAuthority', 'failed');
    this.state.isExecuting = false;

    await this.addThought({
      incidentId: incident.id,
      stepIndex: this.currentStepIndex++,
      agentName: 'RiskAuthority',
      type: 'final_answer',
      content: `❌ Human Governance rejected proposed remediation. Incident escalated to Tier-3 Site Reliability Engineering. Reason: ${reason}`
    });

    this.notify();
  }

  /**
   * Step 4: REMEDIATION AGENT
   */
  private static async runRemediationPhase(incident: Incident, remediation: ProposedRemediation) {
    this.setAgentState('Remediation', 'running');
    this.state.activeAgent = 'Remediation';
    this.notify();

    await this.addThought({
      incidentId: incident.id,
      stepIndex: this.currentStepIndex++,
      agentName: 'Remediation',
      type: 'thought',
      content: `Dispatching API execution payload to Kubernetes controller... Action: ${remediation.actionType}`
    });

    const remLogs = [
      `[API_CALL] Executing ${remediation.actionType} with parameters: ${JSON.stringify(remediation.parameters)}`,
      `[K8S_EVENT] Patching pod deployment spec...`,
      `[HEALTH_CHECK] Waiting for pod readiness probe (200 OK)...`,
      `[SUCCESS] Instance healthy. Pipeline latency normalized.`
    ];

    await this.addThought({
      incidentId: incident.id,
      stepIndex: this.currentStepIndex++,
      agentName: 'Remediation',
      type: 'action',
      content: `Executed recovery patch: ${remediation.description}`,
      toolName: 'executeKubernetesPatch',
      toolInput: remediation.parameters,
      toolOutput: { status: 'SUCCESS', statusCode: 200, executionTimeSec: 4.2 }
    });

    const resInc = await DataService.updateIncidentStatus(incident.id, 'RESOLVED', {
      remediationLogs: remLogs
    });

    if (resInc) this.state.activeIncident = resInc;
    this.setAgentState('Remediation', 'completed');
    this.notify();

    if (this.state.autoPlay) {
      this.scheduleNextStep(() => this.runReportingPhase(this.state.activeIncident!));
    }
  }

  /**
   * Step 5: REPORTING AGENT
   */
  private static async runReportingPhase(incident: Incident) {
    this.setAgentState('Reporting', 'running');
    this.state.activeAgent = 'Reporting';
    this.notify();

    await this.addThought({
      incidentId: incident.id,
      stepIndex: this.currentStepIndex++,
      agentName: 'Reporting',
      type: 'thought',
      content: `Generating post-mortem incident report and updating vector knowledge article metrics...`
    });

    await this.addThought({
      incidentId: incident.id,
      stepIndex: this.currentStepIndex++,
      agentName: 'Reporting',
      type: 'final_answer',
      content: `🎉 INCIDENT ${incident.id} RESOLVED SUCCESSFULLY. Total downtime avoided: ~45 mins. Vector RAG weight updated.`
    });

    this.setAgentState('Reporting', 'completed');
    this.state.isExecuting = false;
    this.state.activeAgent = null;
    this.notify();
  }

  private static setAgentState(agent: AgentName, status: AgentStatus) {
    this.state.agentStatuses[agent] = status;
  }

  private static async addThought(thought: Omit<AgentThought, 'id' | 'timestamp'>): Promise<AgentThought> {
    const created = await DataService.addAgentThought(thought);
    this.state.thoughts = [...this.state.thoughts, created];
    return created;
  }

  private static scheduleNextStep(fn: () => void) {
    if (this.executionTimer) clearTimeout(this.executionTimer);
    this.executionTimer = setTimeout(fn, this.state.executionSpeedMs);
  }
}
