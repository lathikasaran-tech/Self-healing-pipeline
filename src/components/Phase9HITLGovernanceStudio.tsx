import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  CheckCircle2, 
  XCircle, 
  UserCheck, 
  AlertTriangle, 
  RefreshCw, 
  FileText, 
  Activity, 
  Layers, 
  Database,
  Terminal,
  Send,
  Zap
} from 'lucide-react';
import { pythonAgentService } from '../services/pythonAgentService';

export interface PendingEscalationItem {
  id: string;
  run_id: string;
  pipeline_id: string;
  failure_class: string;
  confidence: string;
  decision: string;
  justification: string;
  is_reversible: boolean;
  action_type: string;
  created_at: string;
  status: 'PENDING_HUMAN_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CUSTOM_PATCH_APPLIED';
  audit_history?: Array<{
    action: string;
    user: string;
    timestamp: string;
    notes?: string;
  }>;
}

export const Phase9HITLGovernanceStudio: React.FC = () => {
  const [escalations, setEscalations] = useState<PendingEscalationItem[]>([
    {
      id: 'esc-001',
      run_id: 'run-cred-892',
      pipeline_id: 'pipe-fin-tx-09',
      failure_class: 'CREDENTIAL_EXPIRED',
      confidence: 'medium',
      decision: 'escalate-only',
      justification: 'Medium confidence + Irreversible fix (Refresh OAuth token requiring security team sign-off).',
      is_reversible: false,
      action_type: 'refresh_credentials',
      created_at: new Date(Date.now() - 15 * 60000).toISOString(),
      status: 'PENDING_HUMAN_APPROVAL',
      audit_history: []
    },
    {
      id: 'esc-002',
      run_id: 'run-schema-901',
      pipeline_id: 'pipe-user-profiles-02',
      failure_class: 'SCHEMA_DRIFT',
      confidence: 'high',
      decision: 'escalate-only',
      justification: 'High confidence + Irreversible column drop safety policy restriction enforced.',
      is_reversible: false,
      action_type: 'apply_schema_patch',
      created_at: new Date(Date.now() - 45 * 60000).toISOString(),
      status: 'PENDING_HUMAN_APPROVAL',
      audit_history: []
    }
  ]);

  const [selectedEscalation, setSelectedEscalation] = useState<PendingEscalationItem | null>(escalations[0]);
  const [customNotes, setCustomNotes] = useState('');
  const [customPatchSql, setCustomPatchSql] = useState('ALTER TABLE finance_transactions ADD COLUMN tx_fee NUMERIC DEFAULT 0.0;');
  const [activeTab, setActiveTab] = useState<'queue' | 'audit_log'>('queue');
  const [backendStatus, setBackendStatus] = useState<boolean>(false);
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);

  useEffect(() => {
    checkPythonBackend();
  }, []);

  const checkPythonBackend = async () => {
    const isOnline = await pythonAgentService.checkHealth();
    setBackendStatus(isOnline);
    if (isOnline) {
      loadBackendIncidents();
    }
  };

  const loadBackendIncidents = async () => {
    const reports = await pythonAgentService.fetchIncidentReports();
    if (reports && reports.length > 0) {
      const backendEscalations: PendingEscalationItem[] = reports
        .filter((r: any) => r.outcome_type === 'ESCALATION')
        .map((r: any) => ({
          id: r.id,
          run_id: r.run_id,
          pipeline_id: r.pipeline_id,
          failure_class: r.stitched_trace?.diagnosis_stage?.failure_class || 'UNKNOWN',
          confidence: r.stitched_trace?.diagnosis_stage?.confidence || 'medium',
          decision: r.stitched_trace?.risk_stage?.decision || 'escalate-only',
          justification: r.stitched_trace?.risk_stage?.justification || 'Human approval required.',
          is_reversible: r.stitched_trace?.risk_stage?.is_reversible ?? false,
          action_type: r.stitched_trace?.risk_stage?.action_type || 'manual_override',
          created_at: r.created_at,
          status: 'PENDING_HUMAN_APPROVAL',
          audit_history: []
        }));

      if (backendEscalations.length > 0) {
        setEscalations(prev => [...backendEscalations, ...prev]);
        setSelectedEscalation(backendEscalations[0]);
      }
    }
  };

  const handleHumanAction = (actionType: 'APPROVE' | 'REJECT' | 'CUSTOM_PATCH') => {
    if (!selectedEscalation) return;

    const timestamp = new Date().toISOString();
    let newStatus: PendingEscalationItem['status'] = 'APPROVED';
    let actionLabel = 'Approved Proposed Remediation';

    if (actionType === 'REJECT') {
      newStatus = 'REJECTED';
      actionLabel = 'Rejected Proposed Remediation';
    } else if (actionType === 'CUSTOM_PATCH') {
      newStatus = 'CUSTOM_PATCH_APPLIED';
      actionLabel = `Applied Custom Patch: "${customPatchSql}"`;
    }

    const updatedItem: PendingEscalationItem = {
      ...selectedEscalation,
      status: newStatus,
      audit_history: [
        ...(selectedEscalation.audit_history || []),
        {
          action: actionLabel,
          user: 'sre-lead@company.com (Human Governance SRE)',
          timestamp,
          notes: customNotes || 'Action signed off via HITL Studio'
        }
      ]
    };

    setEscalations(prev => prev.map(item => item.id === updatedItem.id ? updatedItem : item));
    setSelectedEscalation(updatedItem);
    setCustomNotes('');

    setNotificationMessage(`Human Decision Signed Off: ${actionLabel} for incident ${selectedEscalation.run_id}`);
    setTimeout(() => setNotificationMessage(null), 5000);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400">
              <UserCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                Human-in-the-Loop (HITL) Governance Studio
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Phase 9 Active
                </span>
              </h2>
              <p className="text-sm text-slate-400">
                Interactive safety sign-off queue for high-risk, irreversible, or low-confidence data pipeline escalations.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-xs">
            <span className={`w-2 h-2 rounded-full ${backendStatus ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
            <span className="text-slate-300 font-mono">
              FastAPI Engine: {backendStatus ? 'CONNECTED (127.0.0.1:8000)' : 'STANDALONE MODE'}
            </span>
          </div>

          <button
            onClick={checkPythonBackend}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors border border-slate-700"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh Queue
          </button>
        </div>
      </div>

      {notificationMessage && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 p-4 rounded-xl flex items-center gap-3 animate-fade-in text-sm font-medium">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{notificationMessage}</span>
        </div>
      )}

      {/* Grid Layout: Left Queue sidebar, Right Detail & Decision Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Escalation Queue List */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col h-[650px]">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Pending Governance Queue</h3>
            </div>
            <span className="px-2 py-0.5 bg-slate-800 text-amber-400 text-xs font-mono font-semibold rounded-full border border-slate-700">
              {escalations.filter(e => e.status === 'PENDING_HUMAN_APPROVAL').length} Pending
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {escalations.map((item) => {
              const isSelected = selectedEscalation?.id === item.id;
              const isPending = item.status === 'PENDING_HUMAN_APPROVAL';

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedEscalation(item)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    isSelected 
                      ? 'bg-slate-800/90 border-amber-500/50 shadow-md ring-1 ring-amber-500/30' 
                      : 'bg-slate-950/60 border-slate-800 hover:bg-slate-800/40 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <span className="text-xs font-mono font-bold text-amber-400">{item.run_id}</span>
                      <h4 className="text-sm font-semibold text-slate-200">{item.pipeline_id}</h4>
                    </div>

                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                      isPending
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        : item.status === 'APPROVED'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`}>
                      {item.status.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-400 mt-2">
                    <span className="bg-slate-900 px-2 py-0.5 rounded text-slate-300 font-mono">
                      {item.failure_class}
                    </span>
                    <span>Confidence: <strong className="text-slate-200">{item.confidence}</strong></span>
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-2 mt-2 font-sans italic bg-slate-950 p-2 rounded border border-slate-800/80">
                    "{item.justification}"
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Governance Sign-Off Console */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg flex flex-col justify-between">
          {selectedEscalation ? (
            <div className="space-y-6">
              {/* Incident Header */}
              <div className="flex items-start justify-between pb-4 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-400 font-bold border border-slate-700">
                      ID: {selectedEscalation.run_id}
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      {new Date(selectedEscalation.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-100">{selectedEscalation.pipeline_id}</h3>
                </div>

                <div className="text-right">
                  <div className="text-xs text-slate-400">Authority Policy Override</div>
                  <div className="text-xs font-mono font-bold text-amber-400 mt-0.5">
                    {selectedEscalation.decision.toUpperCase()}
                  </div>
                </div>
              </div>

              {/* Trace Context Breakdown */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800">
                  <span className="text-xs font-medium text-slate-400 block mb-1">Diagnosed Cause</span>
                  <div className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyan-400" />
                    {selectedEscalation.failure_class}
                  </div>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800">
                  <span className="text-xs font-medium text-slate-400 block mb-1">Action Reversibility</span>
                  <div className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-amber-400" />
                    {selectedEscalation.is_reversible ? 'REVERSIBLE (Low Risk)' : 'IRREVERSIBLE (Requires SRE)'}
                  </div>
                </div>
              </div>

              {/* Governance Justification Box */}
              <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-xl">
                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Policy Engine Decision Justification
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed font-sans">
                  {selectedEscalation.justification}
                </p>
              </div>

              {/* Custom Sign-Off Inputs & Controls */}
              {selectedEscalation.status === 'PENDING_HUMAN_APPROVAL' ? (
                <div className="space-y-4 pt-2 border-t border-slate-800">
                  <div>
                    <label className="text-xs font-medium text-slate-300 block mb-1.5">
                      Human Governance SRE Notes / Rationale:
                    </label>
                    <textarea
                      value={customNotes}
                      onChange={(e) => setCustomNotes(e.target.value)}
                      placeholder="Enter SRE sign-off notes, security authorization code, or manual patch rationale..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-amber-500/50 resize-none h-16 font-sans"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => handleHumanAction('APPROVE')}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-950/50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Approve & Execute Remediation
                    </button>

                    <button
                      onClick={() => handleHumanAction('REJECT')}
                      className="flex-1 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject Proposed Fix
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300">Human Governance Audit Record:</span>
                    <span className="text-xs text-emerald-400 font-mono font-semibold">
                      STATUS: {selectedEscalation.status}
                    </span>
                  </div>

                  {selectedEscalation.audit_history?.map((log, idx) => (
                    <div key={idx} className="text-xs bg-slate-900 p-3 rounded border border-slate-800 space-y-1">
                      <div className="text-amber-400 font-medium">{log.action}</div>
                      <div className="text-slate-400 font-mono text-[11px]">{log.user} • {new Date(log.timestamp).toLocaleTimeString()}</div>
                      <div className="text-slate-300 italic">"{log.notes}"</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-2 py-20">
              <ShieldAlert className="w-12 h-12 stroke-[1.5]" />
              <p className="text-sm font-medium">Select an escalation incident from the queue to review and sign off.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
