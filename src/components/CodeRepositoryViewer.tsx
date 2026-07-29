import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Code, 
  FileText, 
  RefreshCw, 
  Search, 
  CheckCircle2, 
  Copy, 
  Layers, 
  GitCommit, 
  FileCode,
  Sparkles,
  ShieldCheck
} from 'lucide-react';
import { pythonAgentService, CodeFileRecord, RemediationCodePatch } from '../services/pythonAgentService';

export const CodeRepositoryViewer: React.FC = () => {
  const [codeFiles, setCodeFiles] = useState<CodeFileRecord[]>([]);
  const [codePatches, setCodePatches] = useState<RemediationCodePatch[]>([]);
  const [selectedFile, setSelectedFile] = useState<CodeFileRecord | null>(null);
  const [selectedPatch, setSelectedPatch] = useState<RemediationCodePatch | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'REPOSITORY' | 'PATCHES'>('REPOSITORY');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const loadRepositoryData = async () => {
    const files = await pythonAgentService.fetchCodeRepository();
    const patches = await pythonAgentService.fetchCodePatches();
    setCodeFiles(files);
    setCodePatches(patches);
    if (files.length > 0 && !selectedFile) {
      setSelectedFile(files[0]);
    }
  };

  useEffect(() => {
    loadRepositoryData();
  }, []);

  const handleSyncToSupabase = async () => {
    setIsSyncing(true);
    setSyncStatusMsg('Scanning & Syncing Codebase to Supabase...');
    const result = await pythonAgentService.syncCodeToSupabase();
    setIsSyncing(false);
    if (result && result.status === 'SUCCESS') {
      setSyncStatusMsg(`✅ Successfully synced ${result.total_files_scanned} files into Supabase!`);
      await loadRepositoryData();
    } else {
      setSyncStatusMsg('⚠️ Code sync completed locally.');
    }
    setTimeout(() => setSyncStatusMsg(null), 4000);
  };

  const handleCopyCode = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredFiles = codeFiles.filter(file => {
    const matchesCategory = activeCategory === 'ALL' || file.file_category === activeCategory;
    const matchesSearch = file.file_path.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          file.file_name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const getCategoryBadgeClass = (category: string) => {
    switch (category) {
      case 'python_service': return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'sql_migration': return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
      case 'frontend_component': return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'prompt_template': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 relative overflow-hidden shadow-xl">
        <div className="absolute -top-12 -right-12 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <div className="p-2 bg-indigo-500/20 border border-indigo-500/30 rounded-lg text-indigo-400">
                <Database className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">Supabase Code Repository</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Synchronized & Persisted
              </span>
            </div>
            <p className="text-sm text-slate-400">
              Centralized Supabase code storage for Python agent services, SQL migrations, frontend components, and dynamic self-healing code patches.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSyncToSupabase}
              disabled={isSyncing}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white text-sm font-medium rounded-lg transition shadow-lg shadow-indigo-600/20 border border-indigo-500/30"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Sync Code to Supabase'}
            </button>
          </div>
        </div>

        {syncStatusMsg && (
          <div className="mt-4 p-3 bg-indigo-950/60 border border-indigo-500/40 text-indigo-200 rounded-lg text-xs font-mono flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
            {syncStatusMsg}
          </div>
        )}
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('REPOSITORY')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition ${
              activeTab === 'REPOSITORY'
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <FileCode className="w-4 h-4" />
            Stored Code Files ({codeFiles.length})
          </button>

          <button
            onClick={() => setActiveTab('PATCHES')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition ${
              activeTab === 'PATCHES'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <GitCommit className="w-4 h-4" />
            Auto-Healed Patches ({codePatches.length})
          </button>
        </div>

        {activeTab === 'REPOSITORY' && (
          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search code files..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        )}
      </div>

      {/* REPOSITORY TAB */}
      {activeTab === 'REPOSITORY' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* File Tree / List Sidebar */}
          <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col h-[650px]">
            {/* Category Filter Pills */}
            <div className="flex flex-wrap gap-1.5 pb-3 border-b border-slate-800 mb-3">
              {['ALL', 'python_service', 'sql_migration', 'frontend_component'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                    activeCategory === cat
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {cat === 'ALL' ? 'All Files' : cat.replace('_', ' ')}
                </button>
              ))}
            </div>

            {/* File List */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
              {filteredFiles.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">
                  No files found matching criteria.
                </div>
              ) : (
                filteredFiles.map(file => {
                  const isSelected = selectedFile?.file_path === file.file_path;
                  return (
                    <div
                      key={file.file_path}
                      onClick={() => setSelectedFile(file)}
                      className={`p-3 rounded-lg border text-left cursor-pointer transition ${
                        isSelected
                          ? 'bg-indigo-950/40 border-indigo-500/50 text-white'
                          : 'bg-slate-900/60 border-slate-800/60 text-slate-300 hover:border-slate-700 hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-xs font-semibold truncate max-w-[200px]">
                          {file.file_name}
                        </span>
                        <span className={`px-1.5 py-0.5 text-[10px] uppercase font-mono rounded border ${getCategoryBadgeClass(file.file_category)}`}>
                          {file.language}
                        </span>
                      </div>

                      <div className="text-[11px] font-mono text-slate-500 truncate">
                        {file.file_path}
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2 font-mono">
                        <span>v{file.version}</span>
                        <span>{file.checksum.substring(0, 8)}...</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Code Viewer Panel */}
          <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col h-[650px]">
            {selectedFile ? (
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-indigo-400" />
                      <span className="font-mono font-bold text-sm text-white">{selectedFile.file_path}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11px] font-mono text-slate-400">
                      <span>Category: <strong className="text-slate-200">{selectedFile.file_category}</strong></span>
                      <span>Version: <strong className="text-indigo-400">v{selectedFile.version}</strong></span>
                      <span>SHA256: <strong className="text-slate-400">{selectedFile.checksum.substring(0, 12)}...</strong></span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleCopyCode(selectedFile.code_content)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg transition border border-slate-700"
                  >
                    {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied!' : 'Copy Code'}
                  </button>
                </div>

                {/* Code Body */}
                <div className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono text-xs text-slate-300 overflow-auto custom-scrollbar leading-relaxed">
                  <pre className="whitespace-pre">{selectedFile.code_content}</pre>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm">
                <Code className="w-10 h-10 mb-2 stroke-1" />
                Select a code file from the sidebar to inspect stored contents.
              </div>
            )}
          </div>
        </div>
      )}

      {/* PATCHES TAB */}
      {activeTab === 'PATCHES' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col h-[650px]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-amber-400" /> Dynamic Remediation Patches
            </h3>

            <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
              {codePatches.length === 0 ? (
                <div className="text-center py-16 text-slate-500 text-xs">
                  No dynamic code patches recorded yet. Trigger pipeline anomalies to generate remediation patches.
                </div>
              ) : (
                codePatches.map(patch => {
                  const isSelected = selectedPatch?.id === patch.id;
                  return (
                    <div
                      key={patch.id}
                      onClick={() => setSelectedPatch(patch)}
                      className={`p-3 rounded-lg border text-left cursor-pointer transition ${
                        isSelected
                          ? 'bg-amber-950/40 border-amber-500/50 text-white'
                          : 'bg-slate-900/60 border-slate-800/60 text-slate-300 hover:border-slate-700 hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-xs font-bold text-amber-300">
                          {patch.patch_name}
                        </span>
                        <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          {patch.status}
                        </span>
                      </div>

                      <div className="text-[11px] font-mono text-slate-400 mt-1">
                        Run ID: {patch.run_id}
                      </div>

                      <div className="text-[10px] text-slate-500 mt-2 font-mono">
                        Created: {new Date(patch.created_at).toLocaleString()}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col h-[650px]">
            {selectedPatch ? (
              <div className="flex flex-col h-full">
                <div className="pb-3 border-b border-slate-800 mb-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-white text-base">{selectedPatch.patch_name}</h3>
                    <span className="px-2 py-0.5 text-xs font-mono rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      Run: {selectedPatch.run_id}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 flex-1 overflow-hidden">
                  <div className="flex flex-col h-full bg-slate-950 border border-slate-800 rounded-lg p-3">
                    <span className="text-xs font-mono font-bold text-slate-400 mb-2">Original Code</span>
                    <pre className="flex-1 font-mono text-xs text-rose-300/80 overflow-auto whitespace-pre bg-rose-950/20 p-2.5 rounded border border-rose-900/30">
                      {selectedPatch.original_code}
                    </pre>
                  </div>

                  <div className="flex flex-col h-full bg-slate-950 border border-slate-800 rounded-lg p-3">
                    <span className="text-xs font-mono font-bold text-emerald-400 mb-2">Remediated Code (Supabase Stored)</span>
                    <pre className="flex-1 font-mono text-xs text-emerald-300 overflow-auto whitespace-pre bg-emerald-950/20 p-2.5 rounded border border-emerald-900/30">
                      {selectedPatch.remediated_code}
                    </pre>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm">
                <GitCommit className="w-10 h-10 mb-2 stroke-1" />
                Select a remediation patch to inspect original vs auto-healed code diffs stored in Supabase.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
