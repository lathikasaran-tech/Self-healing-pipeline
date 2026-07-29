import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Server, 
  BookOpen, 
  ShieldAlert, 
  Activity, 
  RefreshCw, 
  CheckCircle2, 
  Cpu, 
  FileText,
  Zap,
  ListFilter
} from 'lucide-react';
import { DataService, DataEngineStatus } from '../services/dataService';
import { Incident, AgentThought, KnowledgeArticle, RiskPolicy, SystemMetrics } from '../types/agent';

export function Phase2DataEngine() {
  const [activeTab, setActiveTab] = useState<'incidents' | 'thoughts' | 'knowledge' | 'policies' | 'telemetry'>('incidents');
  const [engineStatus, setEngineStatus] = useState<DataEngineStatus>(DataService.getEngineStatus());
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [thoughts, setThoughts] = useState<AgentThought[]>([]);
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeArticle[]>([]);
  const [riskPolicies, setRiskPolicies] = useState<RiskPolicy[]>([]);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const incList = await DataService.getIncidents();
      setIncidents(incList);

      if (incList.length > 0) {
        const thList = await DataService.getAgentThoughts(incList[0].id);
        setThoughts(thList);
      }

      const kbList = await DataService.queryKnowledgeBase();
      setKnowledgeBase(kbList);

      const polList = await DataService.getRiskPolicies();
      setRiskPolicies(polList);

      const met = await DataService.getSystemMetrics();
      setMetrics(met);

      setEngineStatus(DataService.getEngineStatus());
    } catch (err) {
      console.error('Data Engine fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);



  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-brand-950/40 border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
              <Database className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100">Phase 2: Supabase Data Engine</h2>
                <span className="px-2.5 py-0.5 text-xs font-mono font-medium rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Engine Operational
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                PostgreSQL schema, pgvector RAG database, risk policy engine, and file upload processing interface.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              disabled={isLoading}
              className="px-3.5 py-2 text-xs font-medium rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh Tables
            </button>
          </div>
        </div>

        {/* Engine Status Indicators */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-4 border-t border-slate-800/80">
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <div className="text-[10px] font-mono text-slate-400">DATA ENGINE MODE</div>
            <div className="text-xs font-semibold font-mono text-cyan-400 mt-1 flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5" />
              {engineStatus.engineMode}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <div className="text-[10px] font-mono text-slate-400">TOTAL INCIDENTS</div>
            <div className="text-sm font-semibold text-slate-100 mt-0.5">{incidents.length} Records</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <div className="text-[10px] font-mono text-slate-400">KNOWLEDGE ARTICLES</div>
            <div className="text-sm font-semibold text-emerald-400 mt-0.5">{knowledgeBase.length} RAG Vectors</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <div className="text-[10px] font-mono text-slate-400">RISK POLICIES</div>
            <div className="text-sm font-semibold text-brand-400 mt-0.5">{riskPolicies.length} Active Rules</div>
          </div>
        </div>

        {notification && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-fadeIn">
            <Zap className="h-4 w-4 shrink-0" />
            <span>{notification}</span>
          </div>
        )}
      </div>

      {/* Tabs Bar */}
      <div className="flex border-b border-slate-800 overflow-x-auto gap-2">
        <button
          onClick={() => setActiveTab('incidents')}
          className={`px-4 py-3 text-xs font-medium border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
            activeTab === 'incidents'
              ? 'border-cyan-400 text-cyan-400 bg-cyan-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="h-4 w-4" />
          Incidents ({incidents.length})
        </button>

        <button
          onClick={() => setActiveTab('thoughts')}
          className={`px-4 py-3 text-xs font-medium border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
            activeTab === 'thoughts'
              ? 'border-cyan-400 text-cyan-400 bg-cyan-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <ListFilter className="h-4 w-4" />
          ReAct Thought Trace ({thoughts.length})
        </button>

        <button
          onClick={() => setActiveTab('knowledge')}
          className={`px-4 py-3 text-xs font-medium border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
            activeTab === 'knowledge'
              ? 'border-cyan-400 text-cyan-400 bg-cyan-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <BookOpen className="h-4 w-4" />
          Knowledge Base ({knowledgeBase.length})
        </button>

        <button
          onClick={() => setActiveTab('policies')}
          className={`px-4 py-3 text-xs font-medium border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
            activeTab === 'policies'
              ? 'border-cyan-400 text-cyan-400 bg-cyan-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShieldAlert className="h-4 w-4" />
          Risk Policies ({riskPolicies.length})
        </button>

        <button
          onClick={() => setActiveTab('telemetry')}
          className={`px-4 py-3 text-xs font-medium border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
            activeTab === 'telemetry'
              ? 'border-cyan-400 text-cyan-400 bg-cyan-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="h-4 w-4" />
          System Telemetry
        </button>
      </div>

      {/* Tab Content Display */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 shadow-xl min-h-[320px]">
        {activeTab === 'incidents' && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <FileText className="h-4 w-4 text-cyan-400" />
              Incidents Table (`incidents`)
            </h3>

            {incidents.length === 0 ? (
              <div className="text-slate-500 py-12 text-center text-xs font-mono">
                No incidents yet. Upload a pipeline log file from the Agent Engine tab to create incidents.
              </div>
            ) : (
              <div className="space-y-3">
                {incidents.map(inc => (
                  <div key={inc.id} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-cyan-400">{inc.id}</span>
                      <span className="px-2.5 py-0.5 text-[10px] font-mono rounded-full bg-brand-500/10 text-brand-400 border border-brand-500/30">
                        {inc.status}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-slate-100">{inc.pipelineName}</div>
                    <div className="text-xs text-rose-400 font-mono bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">
                      {inc.errorMessage}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                      <span>Component: <code className="text-slate-300">{inc.affectedComponent}</code></span>
                      <span>{new Date(inc.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'thoughts' && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <ListFilter className="h-4 w-4 text-cyan-400" />
              Agent Thoughts & ReAct Trace (`agent_thoughts`)
            </h3>

            <div className="space-y-3 font-mono text-xs">
              {thoughts.map(th => (
                <div key={th.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span className="text-brand-400 font-bold">Step {th.stepIndex} • Agent: {th.agentName}</span>
                    <span>{th.type.toUpperCase()}</span>
                  </div>
                  <div className="text-slate-200">{th.content}</div>
                  {th.toolName && (
                    <div className="text-[11px] text-cyan-400 pt-1">
                      Tool: <code>{th.toolName}</code>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'knowledge' && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-emerald-400" />
              Knowledge Base RAG Articles (`knowledge_articles`)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {knowledgeBase.map(kb => (
                <div key={kb.id} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-100">{kb.title}</span>
                    <span className="text-xs font-mono text-emerald-400">{kb.successRate}% Success</span>
                  </div>
                  <p className="text-xs text-slate-400">{kb.rootCausePattern}</p>
                  <div className="p-2 rounded.lg bg-emerald-500/5 border border-emerald-500/20 text-xs text-emerald-300">
                    <strong>Solution:</strong> {kb.recommendedSolution}
                  </div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {kb.symptomKeywords.map((kw, i) => (
                      <span key={i} className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-800 text-slate-300">
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'policies' && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-brand-400" />
              Risk Policies Table (`risk_policies`)
            </h3>

            <div className="space-y-3">
              {riskPolicies.map(pol => (
                <div key={pol.id} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-bold font-mono text-brand-300">{pol.actionType}</div>
                    <div className="text-xs text-slate-400 mt-1">{pol.description}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`px-2.5 py-1 text-[10px] font-mono rounded-full font-semibold ${
                      pol.autoApprove ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    }`}>
                      {pol.autoApprove ? 'AUTO-APPROVE' : 'APPROVAL REQ'}
                    </span>
                    <div className="text-[10px] text-slate-500 mt-1 font-mono">Min Conf: {pol.minConfidenceRequired}%</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'telemetry' && metrics && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Cpu className="h-4 w-4 text-cyan-400" />
              System Telemetry Metrics (`system_metrics`)
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="text-xs font-mono text-slate-400">CPU USAGE</div>
                <div className="text-xl font-bold text-slate-100 mt-1">{metrics.cpuUsagePct}%</div>
              </div>
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="text-xs font-mono text-slate-400">MEMORY ALLOCATION</div>
                <div className="text-xl font-bold text-amber-400 mt-1">{metrics.memoryUsagePct}%</div>
              </div>
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="text-xs font-mono text-slate-400">DB CONNECTIONS</div>
                <div className="text-xl font-bold text-cyan-400 mt-1">{metrics.activeDbConnections} / {metrics.maxDbConnections}</div>
              </div>
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="text-xs font-mono text-slate-400">NETWORK LATENCY</div>
                <div className="text-xl font-bold text-emerald-400 mt-1">{metrics.networkLatencyMs} ms</div>
              </div>
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="text-xs font-mono text-slate-400">ERROR RATE</div>
                <div className="text-xl font-bold text-rose-400 mt-1">{metrics.errorRatePct}%</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
