import React, { useState } from 'react';
import { Activity, Cpu, ShieldCheck, Terminal, Layers, Sparkles, Database, UserCheck, BarChart3 } from 'lucide-react';
import { Phase2DataEngine } from './components/Phase2DataEngine';
import { Phase3MultiAgentDashboard } from './components/Phase3MultiAgentDashboard';
import { Phase9HITLGovernanceStudio } from './components/Phase9HITLGovernanceStudio';
import { Phase10ObservabilityDashboard } from './components/Phase10ObservabilityDashboard';

export default function App() {
  const [activePhase, setActivePhase] = useState<'phase3' | 'phase9' | 'phase10' | 'phase2'>('phase10');

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans">
      {/* Header Bar */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-brand-600 via-cyan-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-brand-500/20">
            <Cpu className="h-6 w-6 text-white animate-pulse" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent flex items-center gap-2">
              Self-Healing Pipeline Agent
            </h1>
            <p className="text-xs text-slate-400 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
              Multi-Agent Orchestration, HITL Governance & Observability (Phase 10)
            </p>
          </div>
        </div>

        {/* Phase Toggle Tabs & Status Badges */}
        <div className="flex items-center gap-4">
          <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center gap-1 text-xs">
            <button
              onClick={() => setActivePhase('phase3')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                activePhase === 'phase3'
                  ? 'bg-gradient-to-r from-brand-600 to-cyan-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Agent Engine
            </button>

            <button
              onClick={() => setActivePhase('phase9')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                activePhase === 'phase9'
                  ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <UserCheck className="h-3.5 w-3.5" />
              HITL Studio
            </button>

            <button
              onClick={() => setActivePhase('phase10')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                activePhase === 'phase10'
                  ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Observability
            </button>

            <button
              onClick={() => setActivePhase('phase2')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                activePhase === 'phase2'
                  ? 'bg-gradient-to-r from-brand-600 to-cyan-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Database className="h-3.5 w-3.5" />
              Data Engine
            </button>
          </div>

          <span className="hidden sm:flex px-3 py-1 text-xs font-mono rounded-full bg-slate-800 border border-slate-700 text-cyan-400 items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            Supabase DB & RAG Active
          </span>
          <span className="px-3 py-1 text-xs font-mono rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            v1.5.0-phase10
          </span>
        </div>
      </header>

      {/* Main Dashboard Workspace */}
      <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full space-y-8">
        {activePhase === 'phase3' ? (
          <Phase3MultiAgentDashboard />
        ) : activePhase === 'phase9' ? (
          <Phase9HITLGovernanceStudio />
        ) : activePhase === 'phase10' ? (
          <Phase10ObservabilityDashboard />
        ) : (
          <Phase2DataEngine />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 py-4 px-6 text-center text-xs text-slate-500 font-mono">
        Self-Healing Pipeline Agent • Phase 10 Multi-Agent Orchestration, HITL Governance & Observability • React, TypeScript, Tailwind CSS, FastAPI & Supabase
      </footer>
    </div>
  );
}

