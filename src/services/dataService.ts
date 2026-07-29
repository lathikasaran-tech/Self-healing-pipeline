import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { 
  Incident, 
  AgentThought, 
  RiskPolicy, 
  KnowledgeArticle, 
  SystemMetrics, 
  FailureScenario,
  IncidentStatus,
  AgentName
} from '../types/agent';

// In-memory state store — starts EMPTY; populated only from real uploads or Supabase
let localIncidents: Incident[] = [];
let localThoughts: AgentThought[] = [];
let localRiskPolicies: RiskPolicy[] = [];
let localKnowledgeBase: KnowledgeArticle[] = [];

export interface DataEngineStatus {
  isLiveSupabase: boolean;
  engineMode: 'SUPABASE_LIVE' | 'LOCAL_ENGINE_ACTIVE';
  totalIncidents: number;
  totalKnowledgeArticles: number;
  totalPolicies: number;
}

export class DataService {
  /**
   * Get current engine status
   */
  static getEngineStatus(): DataEngineStatus {
    return {
      isLiveSupabase: isSupabaseConfigured,
      engineMode: isSupabaseConfigured ? 'SUPABASE_LIVE' : 'LOCAL_ENGINE_ACTIVE',
      totalIncidents: localIncidents.length,
      totalKnowledgeArticles: localKnowledgeBase.length,
      totalPolicies: localRiskPolicies.length
    };
  }

  /**
   * Fetch all incidents
   */
  static async getIncidents(): Promise<Incident[]> {
    if (!isSupabaseConfigured) {
      return [...localIncidents];
    }
    try {
      const { data, error } = await supabase
        .from('incidents')
        .select('*')
        .order('created_at', { ascending: false });

      if (error || !data) {
        console.warn('[DataService] Supabase fetch error, using local fallback:', error);
        return [...localIncidents];
      }
      return data as Incident[];
    } catch (err) {
      console.error('[DataService] Query exception:', err);
      return [...localIncidents];
    }
  }

  /**
   * Fetch incident by ID
   */
  static async getIncidentById(id: string): Promise<Incident | null> {
    if (!isSupabaseConfigured) {
      return localIncidents.find(inc => inc.id === id) || null;
    }
    try {
      const { data, error } = await supabase
        .from('incidents')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) return localIncidents.find(inc => inc.id === id) || null;
      return data as Incident;
    } catch {
      return localIncidents.find(inc => inc.id === id) || null;
    }
  }

  /**
   * Create a new pipeline incident
   */
  static async createIncident(incident: Partial<Incident>): Promise<Incident> {
    const newIncident: Incident = {
      id: incident.id || `inc-${Math.floor(1000 + Math.random() * 9000)}`,
      pipelineId: incident.pipelineId || 'pipe-default',
      pipelineName: incident.pipelineName || 'Data Pipeline',
      environment: incident.environment || 'production',
      status: incident.status || 'OPEN',
      failureCategory: incident.failureCategory || 'UNKNOWN',
      errorMessage: incident.errorMessage || 'System error detected',
      rawLogs: incident.rawLogs || [],
      affectedComponent: incident.affectedComponent || 'worker-node',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...incident
    };

    if (!isSupabaseConfigured) {
      localIncidents.unshift(newIncident);
      return newIncident;
    }

    try {
      const { data, error } = await supabase
        .from('incidents')
        .insert([newIncident])
        .select()
        .single();

      if (error || !data) {
        localIncidents.unshift(newIncident);
        return newIncident;
      }
      return data as Incident;
    } catch {
      localIncidents.unshift(newIncident);
      return newIncident;
    }
  }

  /**
   * Update incident status and attributes
   */
  static async updateIncidentStatus(
    id: string, 
    status: IncidentStatus, 
    extraData?: Partial<Incident>
  ): Promise<Incident | null> {
    const patch = {
      status,
      updatedAt: new Date().toISOString(),
      ...(status === 'RESOLVED' ? { resolvedAt: new Date().toISOString() } : {}),
      ...extraData
    };

    if (!isSupabaseConfigured) {
      const idx = localIncidents.findIndex(inc => inc.id === id);
      if (idx !== -1) {
        localIncidents[idx] = { ...localIncidents[idx], ...patch };
        return localIncidents[idx];
      }
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('incidents')
        .update(patch)
        .eq('id', id)
        .select()
        .single();

      if (error || !data) {
        const idx = localIncidents.findIndex(inc => inc.id === id);
        if (idx !== -1) {
          localIncidents[idx] = { ...localIncidents[idx], ...patch };
          return localIncidents[idx];
        }
        return null;
      }
      return data as Incident;
    } catch {
      return null;
    }
  }

  /**
   * Fetch step-by-step agent thoughts for an incident
   */
  static async getAgentThoughts(incidentId: string): Promise<AgentThought[]> {
    if (!isSupabaseConfigured) {
      return localThoughts.filter(t => t.incidentId === incidentId).sort((a,b) => a.stepIndex - b.stepIndex);
    }
    try {
      const { data, error } = await supabase
        .from('agent_thoughts')
        .select('*')
        .eq('incident_id', incidentId)
        .order('step_index', { ascending: true });

      if (error || !data) {
        return localThoughts.filter(t => t.incidentId === incidentId);
      }
      return data as AgentThought[];
    } catch {
      return localThoughts.filter(t => t.incidentId === incidentId);
    }
  }

  /**
   * Record a new agent ReAct thought / step
   */
  static async addAgentThought(thought: Omit<AgentThought, 'id' | 'timestamp'>): Promise<AgentThought> {
    const newThought: AgentThought = {
      id: `th-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      ...thought
    };

    if (!isSupabaseConfigured) {
      localThoughts.push(newThought);
      return newThought;
    }

    try {
      const { data, error } = await supabase
        .from('agent_thoughts')
        .insert([newThought])
        .select()
        .single();

      if (error || !data) {
        localThoughts.push(newThought);
        return newThought;
      }
      return data as AgentThought;
    } catch {
      localThoughts.push(newThought);
      return newThought;
    }
  }

  /**
   * Get all active Risk Policies
   */
  static async getRiskPolicies(): Promise<RiskPolicy[]> {
    if (!isSupabaseConfigured) {
      return [...localRiskPolicies];
    }
    try {
      const { data, error } = await supabase.from('risk_policies').select('*');
      if (error || !data) return [...localRiskPolicies];
      return data as RiskPolicy[];
    } catch {
      return [...localRiskPolicies];
    }
  }

  /**
   * Query Knowledge Base (RAG vector / keyword search)
   */
  static async queryKnowledgeBase(failureCategory?: string): Promise<KnowledgeArticle[]> {
    if (!isSupabaseConfigured) {
      if (!failureCategory) return [...localKnowledgeBase];
      return localKnowledgeBase.filter(k => k.failureCategory === failureCategory);
    }
    try {
      let query = supabase.from('knowledge_articles').select('*');
      if (failureCategory) {
        query = query.eq('failure_category', failureCategory);
      }
      const { data, error } = await query;
      if (error || !data) return [...localKnowledgeBase];
      return data as KnowledgeArticle[];
    } catch {
      return [...localKnowledgeBase];
    }
  }

  /**
   * Fetch current system metrics telemetry
   */
  static async getSystemMetrics(): Promise<SystemMetrics> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('system_metrics')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (!error && data) {
          return {
            cpuUsagePct: data.cpu_usage_pct,
            memoryUsagePct: data.memory_usage_pct,
            activeDbConnections: data.active_db_connections,
            maxDbConnections: data.max_db_connections,
            networkLatencyMs: data.network_latency_ms,
            errorRatePct: data.error_rate_pct,
            timestamp: data.created_at,
          };
        }
      } catch {
        // fall through to defaults
      }
    }

    // Return zeroed-out defaults when no real data exists
    return {
      cpuUsagePct: 0,
      memoryUsagePct: 0,
      activeDbConnections: 0,
      maxDbConnections: 100,
      networkLatencyMs: 0,
      errorRatePct: 0,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Fetch benchmark failure scenarios catalog — returns empty (no mock scenarios)
   */
  static async getFailureScenarios(): Promise<FailureScenario[]> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.from('failure_scenarios').select('*');
        if (!error && data) return data as FailureScenario[];
      } catch {
        // fall through
      }
    }
    return [];
  }
}
