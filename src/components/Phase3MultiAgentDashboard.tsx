import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  Activity, 
  ShieldCheck, 
  ShieldAlert, 
  Zap, 
  Play, 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Terminal, 
  Layers, 
  Database,
  ArrowRight,
  UserCheck,
  UserX,
  Sparkles,
  Sliders,
  Check,
  X,
  FileCode,
  Search,
  Wrench,
  CheckCircle,
  HelpCircle,
  Upload
} from 'lucide-react';
import { MultiAgentEngine, EngineState } from '../services/multiAgentEngine';
import { DataService } from '../services/dataService';
import { AgentName, FailureScenario, Incident } from '../types/agent';
import { CodeRepositoryViewer } from './CodeRepositoryViewer';
import { FileUploadZone } from './FileUploadZone';
import confetti from 'canvas-confetti';

const AGENT_NODES: { id: AgentName; label: string; desc: string; icon: any; color: string }[] = [
  { 
    id: 'Monitor', 
    label: '1. Monitor Agent', 
    desc: 'Log ingestion & anomaly detection', 
    icon: Activity, 
    color: 'from-cyan-500 to-blue-500 text-cyan-400 border-cyan-500/40 bg-cyan-500/10' 
  },
  { 
    id: 'Diagnosis', 
    label: '2. Diagnosis Agent', 
    desc: 'Log parsing & vector RAG lookup', 
    icon: Search, 
    color: 'from-purple-500 to-indigo-500 text-purple-400 border-purple-500/40 bg-purple-500/10' 
  },
  { 
    id: 'RiskAuthority', 
    label: '3. Risk Authority', 
    desc: 'Governance policy & approval tier', 
    icon: ShieldAlert, 
    color: 'from-amber-500 to-orange-500 text-amber-400 border-amber-500/40 bg-amber-500/10' 
  },
  { 
    id: 'Remediation', 
    label: '4. Remediation Agent', 
    desc: 'Kubernetes patch & recovery execution', 
    icon: Wrench, 
    color: 'from-emerald-500 to-teal-500 text-emerald-400 border-emerald-500/40 bg-emerald-500/10' 
  },
  { 
    id: 'Reporting', 
    label: '5. Reporting Agent', 
    desc: 'Post-mortem report & KB learning update', 
    icon: FileCode, 
    color: 'from-pink-500 to-rose-500 text-pink-400 border-pink-500/40 bg-pink-500/10' 
  }
];

export function Phase3MultiAgentDashboard() {
  const [engineState, setEngineState] = useState<EngineState>(MultiAgentEngine.getState());
  const [activeTab, setActiveTab] = useState<'graph' | 'thoughts' | 'incident' | 'history' | 'codestore'>('graph');
  const [approverName, setApproverName] = useState<string>('Lead SRE Admin');
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [showRejectModal, setShowRejectModal] = useState<boolean>(false);
  const [historyIncidents, setHistoryIncidents] = useState<Incident[]>([]);

  useEffect(() => {
    const unsubscribe = MultiAgentEngine.subscribe(state => {
      setEngineState(state);
      if (state.activeIncident?.status === 'RESOLVED') {
        confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
        refreshHistory();
      }
    });

    refreshHistory();

    return () => unsubscribe();
  }, []);

  const refreshHistory = async () => {
    const list = await DataService.getIncidents();
    setHistoryIncidents(list);
  };

  const handleFileScenarioReady = (scenario: FailureScenario) => {
    MultiAgentEngine.triggerIncidentScenario(scenario);
  };

  const handleApprove = () => {
    MultiAgentEngine.approvePendingRemediation(approverName);
  };

  const handleReject = () => {
    MultiAgentEngine.rejectPendingRemediation(rejectionReason || 'Manually rejected by administrator');
    setShowRejectModal(false);
  };

  const handleReset = () => {
    MultiAgentEngine.reset();
  };

  const isPendingApproval = engineState.activeIncident?.status === 'PENDING_APPROVAL';

  return (
    <div className="space-y-8">
      {/* Top Banner / Hero Section */}
      <div className="p-6 md:p-8 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900/90 to-brand-950/60 border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute left-1/3 bottom-0 translate-y-12 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 text-xs font-mono font-bold rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                Phase 3 Multi-Agent ReAct Engine
              </span>
              <span className="px-3 py-1 text-xs font-mono font-medium rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                v1.3.0 Ready
              </span>
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight text-white">
              Autonomous Self-Healing Multi-Agent Pipeline
            </h2>
            <p className="text-xs md:text-sm text-slate-300 max-w-2xl">
              Upload your pipeline log files to trigger the 5-agent collaborative graph — real-time monitoring, vector RAG diagnosis, governance policy risk assessment, automated k8s remediation, and post-mortem reporting.
            </p>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 shrink-0">
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 text-center">
              <div className="text-[10px] font-mono text-slate-400 uppercase">Engine Status</div>
              <div className="text-xs font-bold font-mono mt-1 text-emerald-400 flex items-center justify-center gap-1">
                <span className={`h-2 w-2 rounded-full ${engineState.isExecuting ? 'bg-cyan-400 animate-ping' : 'bg-emerald-400'}`}></span>
                {engineState.isExecuting ? 'ACTIVE_RUN' : 'READY_IDLE'}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 text-center">
              <div className="text-[10px] font-mono text-slate-400 uppercase">Incidents Resolved</div>
              <div className="text-base font-bold text-slate-100 mt-0.5">
                {historyIncidents.filter(i => i.status === 'RESOLVED').length} / {historyIncidents.length}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 text-center col-span-2 sm:col-span-1">
              <div className="text-[10px] font-mono text-slate-400 uppercase">Success Rate</div>
              <div className="text-base font-bold text-emerald-400 mt-0.5">
                {historyIncidents.length > 0 
                  ? `${Math.round((historyIncidents.filter(i => i.status === 'RESOLVED').length / historyIncidents.length) * 100)}%` 
                  : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* File Upload Zone + Controls */}
        <div className="mt-8 pt-6 border-t border-slate-800/80 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Upload className="h-4 w-4 text-cyan-400" />
              Upload Pipeline Logs to Process:
            </span>

            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
                <Sliders className="h-3.5 w-3.5 text-slate-400 ml-2" />
                <button
                  onClick={() => MultiAgentEngine.setSpeed(2000)}
                  className={`px-2 py-1 rounded-lg transition-all text-[11px] ${engineState.executionSpeedMs === 2000 ? 'bg-slate-800 text-cyan-400 font-bold' : 'text-slate-400'}`}
                >
                  Slow
                </button>
                <button
                  onClick={() => MultiAgentEngine.setSpeed(1200)}
                  className={`px-2 py-1 rounded-lg transition-all text-[11px] ${engineState.executionSpeedMs === 1200 ? 'bg-slate-800 text-cyan-400 font-bold' : 'text-slate-400'}`}
                >
                  1.2s
                </button>
                <button
                  onClick={() => MultiAgentEngine.setSpeed(500)}
                  className={`px-2 py-1 rounded-lg transition-all text-[11px] ${engineState.executionSpeedMs === 500 ? 'bg-slate-800 text-cyan-400 font-bold' : 'text-slate-400'}`}
                >
                  Fast
                </button>
              </div>

              <button
                onClick={handleReset}
                className="px-3 py-1.5 text-xs font-medium rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-all"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset State
              </button>
            </div>
          </div>

          <FileUploadZone
            onScenarioReady={handleFileScenarioReady}
            isEngineExecuting={engineState.isExecuting}
          />
        </div>
      </div>

      {/* Human Approval Alert Card (When PENDING_APPROVAL) */}
      {isPendingApproval && engineState.activeIncident && (
        <div className="p-6 rounded-2xl bg-amber-950/40 border-2 border-amber-500/80 shadow-2xl space-y-4 animate-pulse-glow">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-amber-500/30 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                <AlertTriangle className="h-6 w-6 animate-bounce" />
              </div>
              <div>
                <h3 className="text-base font-bold text-amber-200 flex items-center gap-2">
                  HUMAN GOVERNANCE APPROVAL REQUIRED
                  <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-amber-500 text-slate-950 font-bold uppercase">
                    Risk Tier: {engineState.activeIncident.riskTier || 'MEDIUM'}
                  </span>
                </h3>
                <p className="text-xs text-amber-300/80">
                  Risk Authority Agent has paused execution. Proposed remediation requires explicit operator sign-off.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowRejectModal(true)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800/60 flex items-center gap-1.5 transition-all active:scale-95"
              >
                <UserX className="h-4 w-4" />
                Reject & Escalate
              </button>
              <button
                onClick={handleApprove}
                className="px-5 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition-all active:scale-95 animate-pulse"
              >
                <UserCheck className="h-4 w-4" />
                Approve & Execute Fix
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
              <span className="text-[10px] font-mono text-slate-400 block mb-1">PROPOSED REMEDIATION</span>
              <p className="font-semibold text-slate-100">{engineState.activeIncident.proposedRemediation?.description}</p>
              <div className="mt-2 text-[11px] text-cyan-400 font-mono">
                Action: {engineState.activeIncident.proposedRemediation?.actionType}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
              <span className="text-[10px] font-mono text-slate-400 block mb-1">TARGET COMPONENT</span>
              <p className="font-semibold text-slate-100">{engineState.activeIncident.affectedComponent}</p>
              <div className="mt-2 text-[11px] text-emerald-400 font-mono">
                Confidence Match: {engineState.activeIncident.confidenceScore}%
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
              <span className="text-[10px] font-mono text-slate-400 block mb-1">OPERATOR SIGN-OFF NAME</span>
              <input
                type="text"
                value={approverName}
                onChange={e => setApproverName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>
        </div>
      )}

      {/* Main 5-Agent Interactive Visual Node Canvas */}
      <div className="glass-panel p-6 md:p-8 rounded-2xl border border-slate-800 shadow-xl space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-cyan-400" />
            <h3 className="text-base font-bold text-slate-100">
              Multi-Agent Collaborative Graph Node Canvas
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Active Agent: <strong className="text-cyan-400">{engineState.activeAgent || 'None'}</strong>
          </span>
        </div>

        {/* 5-Agent Flow Node Grid */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 relative">
          {AGENT_NODES.map((node, index) => {
            const status = engineState.agentStatuses[node.id];
            const Icon = node.icon;
            const isCurrent = engineState.activeAgent === node.id;

            return (
              <div key={node.id} className="relative group">
                <div className={`p-4 rounded-2xl border transition-all duration-300 space-y-3 relative overflow-hidden ${
                  status === 'running'
                    ? 'border-cyan-400 bg-cyan-950/40 shadow-xl shadow-cyan-500/20 ring-2 ring-cyan-400/50 scale-[1.02]'
                    : status === 'completed'
                    ? 'border-emerald-500/60 bg-emerald-950/20 shadow-lg shadow-emerald-500/10'
                    : status === 'waiting_approval'
                    ? 'border-amber-500 bg-amber-950/40 animate-pulse'
                    : status === 'failed'
                    ? 'border-rose-500 bg-rose-950/30'
                    : 'border-slate-800/80 bg-slate-900/60 opacity-80 hover:opacity-100'
                }`}>
                  {/* Status Indicator Pill */}
                  <div className="flex items-center justify-between">
                    <div className={`h-9 w-9 rounded-xl flex items-center justify-center border shadow-md ${node.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-full uppercase border ${
                      status === 'running'
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 animate-pulse'
                        : status === 'completed'
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                        : status === 'waiting_approval'
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                        : status === 'failed'
                        ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}>
                      {status}
                    </span>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-slate-100">{node.label}</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{node.desc}</p>
                  </div>

                  {/* Active Processing Bar */}
                  {status === 'running' && (
                    <div className="w-full bg-slate-800 rounded-full h-1 overflow-hidden">
                      <div className="bg-cyan-400 h-1 rounded-full animate-pulse w-full"></div>
                    </div>
                  )}

                  {status === 'completed' && (
                    <div className="text-[10px] text-emerald-400 font-mono flex items-center gap-1 pt-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Step Passed
                    </div>
                  )}
                </div>

                {/* Arrow connector to next agent (desktop view) */}
                {index < AGENT_NODES.length - 1 && (
                  <div className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 z-20 pointer-events-none">
                    <div className={`h-6 w-6 rounded-full flex items-center justify-center border text-xs shadow-md ${
                      status === 'completed' ? 'bg-slate-900 border-emerald-500/60 text-emerald-400' : 'bg-slate-900 border-slate-800 text-slate-600'
                    }`}>
                      <ArrowRight className="h-3 w-3" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabs & Detailed Inspection Area */}
      <div className="space-y-4">
        <div className="flex border-b border-slate-800 overflow-x-auto gap-2">
          <button
            onClick={() => setActiveTab('graph')}
            className={`px-4 py-3 text-xs font-medium border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'graph'
                ? 'border-cyan-400 text-cyan-400 bg-cyan-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="h-4 w-4" />
            ReAct Thought Stream ({engineState.thoughts.length})
          </button>

          <button
            onClick={() => setActiveTab('incident')}
            className={`px-4 py-3 text-xs font-medium border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'incident'
                ? 'border-cyan-400 text-cyan-400 bg-cyan-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="h-4 w-4" />
            Active Incident Telemetry
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-3 text-xs font-medium border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'history'
                ? 'border-cyan-400 text-cyan-400 bg-cyan-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            Post-Mortem Ledger ({historyIncidents.length})
          </button>

          <button
            onClick={() => setActiveTab('codestore')}
            className={`px-4 py-3 text-xs font-medium border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'codestore'
                ? 'border-indigo-400 text-indigo-400 bg-indigo-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="h-4 w-4 text-indigo-400" />
            Supabase Code Store
          </button>
        </div>

        {/* Tab 1: Terminal ReAct Thought Feed */}
        {activeTab === 'graph' && (
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="text-xs font-mono text-slate-400 flex items-center gap-2">
                <Terminal className="h-4 w-4 text-cyan-400" />
                Live Agent Reasoning & Tool Trace Stream
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                Total Steps: {engineState.thoughts.length}
              </span>
            </div>

            <div className="terminal-window p-4 rounded-xl text-xs space-y-3 max-h-[420px] overflow-y-auto">
              {engineState.thoughts.length === 0 ? (
                <div className="text-slate-500 py-8 text-center font-mono">
                  <Upload className="h-8 w-8 mx-auto mb-3 text-slate-600" />
                  <p>[AWAITING_INPUT] Upload a pipeline log file above to start multi-agent execution...</p>
                </div>
              ) : (
                engineState.thoughts.map(thought => (
                  <div key={thought.id} className="p-3 rounded-lg bg-slate-950/90 border border-slate-800/80 space-y-1.5 font-mono">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-cyan-400 font-bold flex items-center gap-1.5">
                        <span className="text-slate-500">Step {thought.stepIndex}</span> • Agent: {thought.agentName}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                        thought.type === 'thought' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30' :
                        thought.type === 'action' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30' :
                        thought.type === 'observation' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
                        'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                      }`}>
                        {thought.type}
                      </span>
                    </div>

                    <p className="text-slate-200 text-xs leading-relaxed">{thought.content}</p>

                    {thought.toolName && (
                      <div className="mt-2 pt-2 border-t border-slate-800/60 text-[11px] text-cyan-300 space-y-1">
                        <div className="font-semibold text-slate-400">Tool Execution: <code>{thought.toolName}()</code></div>
                        {thought.toolInput && (
                          <div className="bg-slate-900 p-2 rounded border border-slate-800 text-[10px] text-slate-300 overflow-x-auto">
                            <strong>Input:</strong> {JSON.stringify(thought.toolInput)}
                          </div>
                        )}
                        {thought.toolOutput && (
                          <div className="bg-slate-900 p-2 rounded border border-slate-800 text-[10px] text-emerald-400 overflow-x-auto">
                            <strong>Output:</strong> {JSON.stringify(thought.toolOutput)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Active Incident Telemetry */}
        {activeTab === 'incident' && (
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
            {engineState.activeIncident ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <span className="text-xs font-mono font-bold text-cyan-400">{engineState.activeIncident.id}</span>
                    <h3 className="text-base font-bold text-slate-100">{engineState.activeIncident.pipelineName}</h3>
                  </div>
                  <span className="px-3 py-1 text-xs font-mono font-bold rounded-full bg-brand-500/10 border border-brand-500/30 text-brand-400">
                    {engineState.activeIncident.status}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                    <span className="text-[10px] font-mono text-slate-400 block">ERROR SUMMARY</span>
                    <p className="text-rose-400 font-mono p-2 rounded bg-rose-950/30 border border-rose-500/20">
                      {engineState.activeIncident.errorMessage}
                    </p>
                    <div className="text-slate-400 text-[11px]">
                      Category: <code className="text-slate-200">{engineState.activeIncident.failureCategory}</code>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                    <span className="text-[10px] font-mono text-slate-400 block">ROOT CAUSE DIAGNOSIS</span>
                    <p className="text-slate-200 font-medium">
                      {engineState.activeIncident.rootCause || 'Diagnosing root cause...'}
                    </p>
                    <div className="text-emerald-400 text-[11px] font-mono">
                      Confidence Score: {engineState.activeIncident.confidenceScore || 0}%
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                  <span className="text-[10px] font-mono text-slate-400 block">RAW EXECUTION LOGS</span>
                  <div className="terminal-window p-3 rounded-lg text-[11px] text-slate-300 space-y-1">
                    {engineState.activeIncident.rawLogs.map((log, i) => (
                      <div key={i}>{log}</div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-slate-500 py-12 text-center text-xs font-mono">
                <Upload className="h-8 w-8 mx-auto mb-3 text-slate-600" />
                No active incident. Upload a file from above to begin processing.
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Post-Mortem Ledger */}
        {activeTab === 'history' && (
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-3">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              Incidents Post-Mortem & Resolution History
            </h3>

            {historyIncidents.length === 0 ? (
              <div className="text-slate-500 py-12 text-center text-xs font-mono">
                <ShieldCheck className="h-8 w-8 mx-auto mb-3 text-slate-600" />
                No incidents yet. Upload a pipeline log file to create your first incident.
              </div>
            ) : (
              <div className="space-y-3">
                {historyIncidents.map(inc => (
                  <div key={inc.id} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-cyan-400">{inc.id} • {inc.pipelineName}</span>
                      <span className={`px-2.5 py-0.5 text-[10px] font-mono rounded-full font-bold border ${
                        inc.status === 'RESOLVED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      }`}>
                        {inc.status}
                      </span>
                    </div>

                    <p className="text-slate-300">{inc.rootCause || inc.errorMessage}</p>

                    {inc.proposedRemediation && (
                      <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-800/40 text-[11px] text-emerald-300">
                        <strong>Executed Fix:</strong> {inc.proposedRemediation.description} (Approved by: {inc.approvedBy || 'Policy Engine'})
                      </div>
                    )}

                    <div className="text-[10px] text-slate-500 text-right">
                      Created: {new Date(inc.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Supabase Code Store & Remediation Patches */}
        {activeTab === 'codestore' && (
          <CodeRepositoryViewer />
        )}
      </div>

      {/* Reject Modal Dialog */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 shadow-2xl max-w-md w-full space-y-4">
            <h3 className="text-base font-bold text-rose-400 flex items-center gap-2">
              <UserX className="h-5 w-5" />
              Reject Proposed Remediation
            </h3>
            <p className="text-xs text-slate-300">
              Provide a reason for rejecting the automated patch. The incident will be escalated directly to Tier-3 SRE response.
            </p>
            <textarea
              rows={3}
              value={rejectionReason}
              onChange={e => setRejectionReason(e.target.value)}
              placeholder="e.g. Memory limit increase requires infra budget approval first."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 focus:outline-none focus:border-rose-400"
            />
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 text-xs font-medium rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-500 text-white"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
