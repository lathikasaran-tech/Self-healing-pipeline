import React, { useState, useCallback, useRef } from 'react';
import {
  Upload,
  FileUp,
  FileJson,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderUp,
  X,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Play,
  Trash2,
  Eye,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Zap,
} from 'lucide-react';
import { FileUploadService, ParsedUploadResult, UploadProgress } from '../services/fileUploadService';
import { FailureScenario } from '../types/agent';

interface FileUploadZoneProps {
  onScenarioReady: (scenario: FailureScenario) => void;
  isEngineExecuting: boolean;
}

const ACCEPTED_EXTENSIONS = ['.json', '.csv', '.log', '.txt'];
const MAX_FILE_SIZE_MB = 20;

function getFileIcon(type: string, name: string) {
  if (type === 'folder' || name.startsWith('📁')) return Folder;
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'json') return FileJson;
  if (ext === 'csv') return FileSpreadsheet;
  return FileText;
}

function getFileTypeBadge(type: string, name: string) {
  if (type === 'folder' || name.startsWith('📁')) {
    return {
      label: 'FOLDER',
      color: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    };
  }
  const ext = name.split('.').pop()?.toLowerCase() || 'TXT';
  const colors: Record<string, string> = {
    json: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    csv: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    log: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
    txt: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  };
  return {
    label: ext.toUpperCase(),
    color: colors[ext] || colors['txt'],
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Recursive FileSystemEntry scanner for drag-and-dropped folders & files
 */
async function scanFileSystemEntries(items: DataTransferItemList): Promise<{ files: File[]; folderName?: string }> {
  const fileEntries: File[] = [];
  let rootFolderName: string | undefined = undefined;

  const entries: any[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === 'file') {
      const entry = item.webkitGetAsEntry?.();
      if (entry) {
        if (entry.isDirectory && !rootFolderName) {
          rootFolderName = entry.name;
        }
        entries.push(entry);
      }
    }
  }

  const readEntry = async (entry: any) => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => {
        entry.file(resolve, reject);
      });
      fileEntries.push(file);
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const childEntries = await new Promise<any[]>((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });
      for (const child of childEntries) {
        await readEntry(child);
      }
    }
  };

  for (const entry of entries) {
    await readEntry(entry);
  }

  return { files: fileEntries, folderName: rootFolderName };
}

export function FileUploadZone({ onScenarioReady, isEngineExecuting }: FileUploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<ParsedUploadResult[]>([]);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedPreview, setExpandedPreview] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || '');
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return `Unsupported file type "${ext}". Accepted: ${ACCEPTED_EXTENSIONS.join(', ')}`;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return `File exceeds ${MAX_FILE_SIZE_MB}MB limit (${formatBytes(file.size)}).`;
    }
    return null;
  };

  const processFile = useCallback(async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setProgress({ stage: 'reading', percent: 0, message: 'Starting...' });

    try {
      const result = await FileUploadService.processFile(file, (p) => {
        setProgress(p);
      });

      setUploadedFiles(prev => [result, ...prev]);

      if (result.parseWarnings.length > 0) {
        console.warn('[FileUpload] Parse warnings:', result.parseWarnings);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to process file.');
    } finally {
      setIsProcessing(false);
      setTimeout(() => setProgress(null), 1500);
    }
  }, []);

  const processFolderFiles = useCallback(async (files: File[], folderName: string = 'Uploaded Folder') => {
    if (files.length === 0) {
      setErrorMessage('No files found in selected folder.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setProgress({ stage: 'reading', percent: 0, message: `Scanning folder "${folderName}"...` });

    try {
      const result = await FileUploadService.processFolder(files, folderName, (p) => {
        setProgress(p);
      });

      setUploadedFiles(prev => [result, ...prev]);

      if (result.parseWarnings.length > 0) {
        console.warn('[FileUpload] Folder parse warnings:', result.parseWarnings);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to process folder.');
    } finally {
      setIsProcessing(false);
      setTimeout(() => setProgress(null), 1500);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      try {
        const { files, folderName } = await scanFileSystemEntries(e.dataTransfer.items);

        if (folderName && files.length > 0) {
          // Folder dropped
          await processFolderFiles(files, folderName);
        } else if (files.length > 1) {
          // Multiple files dropped
          await processFolderFiles(files, 'Batch Upload');
        } else if (files.length === 1) {
          // Single file dropped
          await processFile(files[0]);
        }
      } catch (err: any) {
        setErrorMessage('Failed to read dropped item: ' + err.message);
      }
    } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesList = Array.from(e.dataTransfer.files);
      if (filesList.length === 1) {
        processFile(filesList[0]);
      } else {
        processFolderFiles(filesList, 'Batch Upload');
      }
    }
  }, [processFile, processFolderFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length === 1) {
      processFile(files[0]);
    } else if (files && files.length > 1) {
      processFolderFiles(Array.from(files), 'File Selection');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [processFile, processFolderFiles]);

  const handleFolderSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const filesArray = Array.from(files);
      // Extract root folder name from webkitRelativePath
      const firstPath = filesArray[0]?.webkitRelativePath || '';
      const folderName = firstPath.split('/')[0] || 'Selected Folder';
      processFolderFiles(filesArray, folderName);
    }
    if (folderInputRef.current) folderInputRef.current.value = '';
  }, [processFolderFiles]);

  const handleRemoveFile = (fileName: string) => {
    setUploadedFiles(prev => prev.filter(f => f.fileName !== fileName));
  };

  const handleProcessScenario = (result: ParsedUploadResult) => {
    onScenarioReady(result.parsedScenario);
  };

  const togglePreview = (fileName: string) => {
    setExpandedPreview(prev => prev === fileName ? null : fileName);
  };

  return (
    <div className="space-y-4">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(',')}
        onChange={handleFileSelect}
        className="hidden"
        id="pipeline-file-upload"
      />

      {/* Hidden Folder Input with webkitdirectory */}
      <input
        ref={folderInputRef}
        type="file"
        // @ts-ignore
        webkitdirectory=""
        directory=""
        multiple
        onChange={handleFolderSelect}
        className="hidden"
        id="pipeline-folder-upload"
      />

      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`upload-drop-zone relative rounded-2xl border-2 border-dashed p-8 transition-all duration-300 group ${
          isDragOver
            ? 'border-cyan-400 bg-cyan-500/10 shadow-xl shadow-cyan-500/10 scale-[1.01]'
            : isProcessing
            ? 'border-slate-700 bg-slate-900/50 cursor-wait'
            : 'border-slate-700/80 bg-slate-900/40 hover:border-brand-500/60 hover:bg-brand-500/5 hover:shadow-lg hover:shadow-brand-500/5'
        }`}
      >
        {/* Background glow effect */}
        <div className={`absolute inset-0 rounded-2xl pointer-events-none transition-opacity duration-500 ${
          isDragOver ? 'opacity-100' : 'opacity-0'
        }`}>
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-brand-500/5 rounded-2xl"></div>
        </div>

        <div className="relative z-10 flex flex-col items-center gap-4 text-center">
          {isProcessing ? (
            <>
              <div className="h-14 w-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                <Loader2 className="h-7 w-7 text-cyan-400 animate-spin" />
              </div>
              <div className="space-y-2 w-full max-w-md">
                <p className="text-sm font-semibold text-slate-200">
                  {progress?.message || 'Processing...'}
                </p>
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="upload-progress-bar h-2 rounded-full bg-gradient-to-r from-cyan-500 to-brand-500 transition-all duration-500"
                    style={{ width: `${progress?.percent || 0}%` }}
                  />
                </div>
                <p className="text-[11px] font-mono text-slate-500 uppercase">
                  Stage: {progress?.stage || '...'}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className={`h-14 w-14 rounded-2xl border flex items-center justify-center transition-all duration-300 ${
                isDragOver
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-400 scale-110'
                  : 'bg-slate-800/80 border-slate-700 text-slate-400 group-hover:text-brand-400 group-hover:border-brand-500/40'
              }`}>
                <Upload className="h-7 w-7" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-200">
                  {isDragOver ? 'Drop file or folder here!' : 'Drag & drop file OR entire folder here'}
                </p>
                <p className="text-xs text-slate-400 mt-1 flex items-center justify-center gap-2">
                  <span>Choose input:</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                    className="px-3 py-1 rounded-lg bg-brand-500/10 border border-brand-500/30 text-brand-400 hover:bg-brand-500/20 font-semibold text-xs transition-all flex items-center gap-1.5"
                  >
                    <FileUp className="h-3.5 w-3.5" />
                    Browse File
                  </button>
                  <span className="text-slate-600">or</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click(); }}
                    className="px-3 py-1 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-400 hover:bg-purple-500/20 font-semibold text-xs transition-all flex items-center gap-1.5"
                  >
                    <FolderUp className="h-3.5 w-3.5" />
                    Browse Folder
                  </button>
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-center">
                {[
                  { label: 'FOLDER', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
                  { label: 'JSON', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
                  { label: 'CSV', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
                  { label: 'LOG', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
                  { label: 'TXT', color: 'text-slate-400 bg-slate-500/10 border-slate-500/20' },
                ].map(ft => (
                  <span
                    key={ft.label}
                    className={`px-2.5 py-0.5 text-[10px] font-mono font-bold rounded-full border ${ft.color}`}
                  >
                    {ft.label === 'FOLDER' ? '📁 Directory' : `.${ft.label.toLowerCase()}`}
                  </span>
                ))}
                <span className="text-[10px] text-slate-500 font-mono">
                  max {MAX_FILE_SIZE_MB}MB
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 flex items-start gap-3 animate-fadeIn">
          <AlertTriangle className="h-4 w-4 text-rose-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-rose-300">{errorMessage}</p>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-400">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Uploaded Files / Folders List */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <FileUp className="h-3.5 w-3.5 text-cyan-400" />
              Parsed Inputs ({uploadedFiles.length})
            </span>
          </div>

          {uploadedFiles.map(result => {
            const Icon = getFileIcon(result.fileType, result.fileName);
            const badge = getFileTypeBadge(result.fileType, result.fileName);
            const isExpanded = expandedPreview === result.fileName;
            const sc = result.parsedScenario;

            return (
              <div
                key={result.fileName + result.parsedAt}
                className="rounded-xl border border-slate-800 bg-slate-900/70 overflow-hidden transition-all hover:border-slate-700"
              >
                {/* File / Folder Header */}
                <div className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                    <Icon className={`h-5 w-5 ${result.fileType === 'folder' ? 'text-purple-400' : 'text-slate-400'}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-100 truncate">
                        {result.fileName}
                      </span>
                      <span className={`px-2 py-0.5 text-[9px] font-mono font-bold rounded-full border ${badge.color}`}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400">
                      <span>{formatBytes(result.fileSizeBytes)}</span>
                      <span>•</span>
                      <span>{sc.rawLogs.length} log lines</span>
                      {result.containedFileCount && (
                        <>
                          <span>•</span>
                          <span className="text-purple-400 font-semibold">{result.containedFileCount} files</span>
                        </>
                      )}
                      <span>•</span>
                      <span className={`font-mono font-semibold ${
                        sc.category === 'UNKNOWN' ? 'text-slate-400' : 'text-amber-400'
                      }`}>
                        {sc.category}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => togglePreview(result.fileName)}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-all border border-slate-700"
                      title="Preview parsed data"
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => handleRemoveFile(result.fileName)}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-400 transition-all border border-slate-700 hover:border-rose-500/40"
                      title="Remove file"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleProcessScenario(result)}
                      disabled={isEngineExecuting}
                      className="px-4 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-brand-600 to-cyan-600 hover:from-brand-500 hover:to-cyan-500 text-white shadow-lg shadow-brand-500/20 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Run agent pipeline on this input"
                    >
                      <Play className="h-3.5 w-3.5 fill-white" />
                      Process
                    </button>
                  </div>
                </div>

                {/* Expanded Preview Panel */}
                {isExpanded && (
                  <div className="border-t border-slate-800 p-4 space-y-3 bg-slate-950/60 animate-fadeIn">
                    {/* Parsed Metadata */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                        <div className="text-[9px] font-mono text-slate-500 uppercase">Pipeline</div>
                        <div className="text-xs font-semibold text-slate-200 mt-0.5 truncate">{sc.pipelineName}</div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                        <div className="text-[9px] font-mono text-slate-500 uppercase">Environment</div>
                        <div className="text-xs font-semibold text-cyan-400 mt-0.5">{sc.environment}</div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                        <div className="text-[9px] font-mono text-slate-500 uppercase">Category</div>
                        <div className={`text-xs font-semibold mt-0.5 ${sc.category === 'UNKNOWN' ? 'text-slate-400' : 'text-amber-400'}`}>
                          {sc.category}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                        <div className="text-[9px] font-mono text-slate-500 uppercase">Risk Tier</div>
                        <div className={`text-xs font-semibold mt-0.5 ${
                          sc.expectedFix.riskTier === 'LOW' ? 'text-emerald-400' :
                          sc.expectedFix.riskTier === 'MEDIUM' ? 'text-amber-400' :
                          'text-rose-400'
                        }`}>
                          {sc.expectedFix.riskTier}
                        </div>
                      </div>
                    </div>

                    {/* Error Description */}
                    <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-500/20">
                      <div className="text-[9px] font-mono text-slate-500 uppercase mb-1">Error Description</div>
                      <p className="text-xs text-rose-300 font-mono leading-relaxed">{sc.description}</p>
                    </div>

                    {/* Proposed Fix */}
                    <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/20">
                      <div className="text-[9px] font-mono text-slate-500 uppercase mb-1">Proposed Remediation</div>
                      <p className="text-xs text-emerald-300 leading-relaxed">
                        <span className="font-bold text-emerald-400">{sc.expectedFix.actionType}</span> — {sc.expectedFix.description}
                      </p>
                    </div>

                    {/* Raw Logs Preview */}
                    <div>
                      <div className="text-[9px] font-mono text-slate-500 uppercase mb-1">
                        Raw Log Lines (first {Math.min(sc.rawLogs.length, 10)})
                      </div>
                      <div className="terminal-window p-3 rounded-lg text-[11px] text-slate-300 space-y-0.5 max-h-[180px] overflow-y-auto">
                        {sc.rawLogs.slice(0, 10).map((line, i) => (
                          <div key={i} className="flex gap-2">
                            <span className="text-slate-600 select-none shrink-0 w-6 text-right">{i + 1}</span>
                            <span className={
                              /\b(ERROR|FATAL|CRITICAL)\b/i.test(line) ? 'text-rose-400' :
                              /\b(WARN)\b/i.test(line) ? 'text-amber-400' :
                              line.startsWith('[FOLDER_ENTRY:') ? 'text-purple-400 font-bold' :
                              'text-slate-400'
                            }>{line}</span>
                          </div>
                        ))}
                        {sc.rawLogs.length > 10 && (
                          <div className="text-slate-600 text-center pt-1">
                            ... and {sc.rawLogs.length - 10} more lines
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Parse Warnings */}
                    {result.parseWarnings.length > 0 && (
                      <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-500/20">
                        <div className="text-[9px] font-mono text-slate-500 uppercase mb-1">Parse Warnings</div>
                        {result.parseWarnings.map((w, i) => (
                          <p key={i} className="text-xs text-amber-400 flex items-start gap-1.5">
                            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                            {w}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
