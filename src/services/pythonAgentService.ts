/**
 * Python Agent API Client Service
 * Connects the React dashboard directly to the live Python FastAPI agent service.
 */

const API_BASE_URL = 'http://127.0.0.1:8000/api';

export interface RunPipelinePayload {
  pipeline_id?: string;
  status?: string;
  row_count?: number;
  duration_seconds?: number;
  null_rate?: number;
  schema_snapshot?: Record<string, string>;
  error_message?: string;
  allow_irreversible_autofix?: boolean;
}

export interface PythonOrchestrationResponse {
  status: string;
  pipeline_id: string;
  run_id: string;
  message?: string;
  monitor?: any;
  diagnosis?: any;
  risk_decision?: any;
  remediation?: any;
  reporting?: any;
  incident_report?: any;
}

export interface CodeFileRecord {
  id: string;
  file_path: string;
  file_name: string;
  file_category: 'python_service' | 'sql_migration' | 'frontend_component' | 'prompt_template' | 'other';
  language: 'python' | 'sql' | 'typescript' | 'json' | 'markdown' | 'text';
  code_content: string;
  version: number;
  checksum: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RemediationCodePatch {
  id: string;
  incident_id?: string;
  run_id: string;
  patch_name: string;
  language: string;
  original_code: string;
  remediated_code: string;
  diff_content: string;
  status: string;
  created_at: string;
}

export const pythonAgentService = {
  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE_URL}/health`, { method: 'GET' });
      if (!res.ok) return false;
      const data = await res.json();
      return data.status === 'ONLINE';
    } catch (e) {
      return false;
    }
  },

  async runPipeline(payload: RunPipelinePayload): Promise<PythonOrchestrationResponse> {
    const res = await fetch(`${API_BASE_URL}/run-pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pipeline_id: payload.pipeline_id || 'pipe-fin-tx-09',
        status: payload.status || 'SUCCESS',
        row_count: payload.row_count ?? 1000,
        duration_seconds: payload.duration_seconds ?? 60.0,
        null_rate: payload.null_rate ?? 0.02,
        schema_snapshot: payload.schema_snapshot || { id: 'INT', user_id: 'VARCHAR', amount: 'NUMERIC', timestamp: 'TIMESTAMPTZ' },
        error_message: payload.error_message,
        allow_irreversible_autofix: payload.allow_irreversible_autofix ?? true,
      }),
    });

    if (!res.ok) {
      throw new Error(`Python Service Error: ${res.statusText}`);
    }

    return await res.json();
  },

  async fetchIncidentReports(): Promise<any[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/incident-reports`);
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  },

  async fetchDiagnoses(): Promise<any[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/diagnoses`);
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  },

  async fetchRiskDecisions(): Promise<any[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/risk-decisions`);
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  },

  async fetchCodeRepository(category?: string): Promise<CodeFileRecord[]> {
    try {
      const url = category ? `${API_BASE_URL}/code-repository?category=${category}` : `${API_BASE_URL}/code-repository`;
      const res = await fetch(url);
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  },

  async syncCodeToSupabase(): Promise<any> {
    try {
      const res = await fetch(`${API_BASE_URL}/code-repository/sync`, { method: 'POST' });
      if (!res.ok) throw new Error('Code sync failed');
      return await res.json();
    } catch (e: any) {
      return { status: 'ERROR', message: e.message };
    }
  },

  async fetchCodePatches(runId?: string): Promise<RemediationCodePatch[]> {
    try {
      const url = runId ? `${API_BASE_URL}/code-patches?run_id=${runId}` : `${API_BASE_URL}/code-patches`;
      const res = await fetch(url);
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  }
};

