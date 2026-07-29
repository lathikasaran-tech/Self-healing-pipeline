/**
 * Autonomous Self-Healing Pipeline Agent System Types
 */

export type AgentName = 
  | 'Monitor'
  | 'Diagnosis'
  | 'RiskAuthority'
  | 'Remediation'
  | 'Reporting';

export type AgentStatus = 
  | 'idle'
  | 'running'
  | 'completed'
  | 'failed'
  | 'waiting_approval';

export type IncidentStatus = 
  | 'OPEN'
  | 'DIAGNOSING'
  | 'EVALUATING_RISK'
  | 'PENDING_APPROVAL'
  | 'REMEDIATING'
  | 'RESOLVED'
  | 'ESCALATED'
  | 'FAILED';

export type RiskTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type Environment = 'development' | 'staging' | 'production';

export type FailureCategory = 
  | 'OUT_OF_MEMORY'
  | 'DATABASE_TIMEOUT'
  | 'SCHEMA_MISMATCH'
  | 'RATE_LIMIT_EXCEEDED'
  | 'POD_CRASH_LOOP'
  | 'TEST_TIMEOUT'
  | 'UNKNOWN';

export interface AgentThought {
  id: string;
  incidentId: string;
  stepIndex: number;
  agentName: AgentName;
  type: 'thought' | 'action' | 'observation' | 'final_answer';
  content: string;
  toolName?: string;
  toolInput?: Record<string, any>;
  toolOutput?: Record<string, any>;
  timestamp: string;
}

export interface ProposedRemediation {
  actionType: string;
  description: string;
  parameters: Record<string, any>;
  estimatedDurationSeconds: number;
  riskTier: RiskTier;
  confidenceScore: number; // 0 to 100
  requiresHumanApproval: boolean;
  justification: string;
}

export interface Incident {
  id: string;
  pipelineId: string;
  pipelineName: string;
  environment: Environment;
  status: IncidentStatus;
  failureCategory: FailureCategory;
  errorMessage: string;
  rawLogs: string[];
  affectedComponent: string;
  rootCause?: string;
  confidenceScore?: number;
  proposedRemediation?: ProposedRemediation;
  riskTier?: RiskTier;
  approvedBy?: string;
  remediationLogs?: string[];
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export interface RiskPolicy {
  id: string;
  actionType: string;
  environment: Environment;
  maxRiskTier: RiskTier;
  minConfidenceRequired: number; // e.g., 85
  autoApprove: boolean;
  description: string;
}

export interface KnowledgeArticle {
  id: string;
  title: string;
  failureCategory: FailureCategory;
  symptomKeywords: string[];
  rootCausePattern: string;
  recommendedSolution: string;
  vectorSimilarity?: number; // Calculated dynamically during query
  successRate: number; // e.g., 95%
  timesApplied: number;
  createdAt: string;
}

export interface SystemMetrics {
  cpuUsagePct: number;
  memoryUsagePct: number;
  activeDbConnections: number;
  maxDbConnections: number;
  networkLatencyMs: number;
  errorRatePct: number;
  timestamp: string;
}

export interface FailureScenario {
  id: string;
  name: string;
  pipelineId: string;
  pipelineName: string;
  environment: Environment;
  category: FailureCategory;
  description: string;
  rawLogs: string[];
  expectedRootCause: string;
  expectedFix: ProposedRemediation;
}

export interface MultiAgentState {
  activeIncident: Incident | null;
  activeAgent: AgentName | null;
  agentStatuses: Record<AgentName, AgentStatus>;
  thoughts: AgentThought[];
  incidentHistory: Incident[];
  knowledgeBase: KnowledgeArticle[];
  riskPolicies: RiskPolicy[];
  isExecuting: boolean;
}
