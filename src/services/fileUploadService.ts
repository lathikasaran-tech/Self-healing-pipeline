/**
 * File & Folder Upload & Parsing Service
 * Handles CSV, JSON, LOG/TXT uploads as well as whole FOLDER directory trees.
 * Extracts pipeline run data and converts them into FailureScenario objects for the Multi-Agent Engine.
 */

import { FailureScenario, FailureCategory, ProposedRemediation, Environment } from '../types/agent';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

// ----- Types -----

export interface ParsedUploadResult {
  fileName: string;
  fileType: 'json' | 'csv' | 'log' | 'txt' | 'folder' | 'unknown';
  fileSizeBytes: number;
  parsedScenario: FailureScenario;
  rawContent: string;
  parseWarnings: string[];
  parsedAt: string;
  containedFileCount?: number;
}

export interface UploadProgress {
  stage: 'reading' | 'parsing' | 'classifying' | 'storing' | 'done' | 'error';
  percent: number;
  message: string;
}

export type UploadProgressCallback = (progress: UploadProgress) => void;

// ----- Error Pattern Detection -----

interface ErrorPattern {
  category: FailureCategory;
  keywords: string[];
  actionType: string;
  defaultRootCause: string;
  defaultFixDescription: string;
  riskTier: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

const ERROR_PATTERNS: ErrorPattern[] = [
  {
    category: 'OUT_OF_MEMORY',
    keywords: ['OutOfMemoryError', 'OOMKilled', 'heap space', 'GC overhead', 'exit code 137', 'oom', 'memory limit'],
    actionType: 'INCREASE_MEMORY_LIMIT',
    defaultRootCause: 'JVM/container memory allocation exceeded due to workload spike.',
    defaultFixDescription: 'Scale worker pod memory allocation and restart instance.',
    riskTier: 'LOW',
  },
  {
    category: 'DATABASE_TIMEOUT',
    keywords: ['connection timed out', 'too many clients', 'HikariPool', 'connection pool', 'FATAL: sorry', 'timeout', 'db connection', 'database timeout'],
    actionType: 'FLUSH_CONNECTION_POOL',
    defaultRootCause: 'Connection pool exhaustion due to unclosed handles or concurrent overload.',
    defaultFixDescription: 'Flush idle connection pool and increase pool limit.',
    riskTier: 'MEDIUM',
  },
  {
    category: 'SCHEMA_MISMATCH',
    keywords: ['schema', 'Cannot parse', 'type mismatch', 'schema evolution', 'column not found', 'UInt64', 'schema drift', 'missing column'],
    actionType: 'ROLLBACK_MIGRATION',
    defaultRootCause: 'Upstream data source changed schema without pipeline update.',
    defaultFixDescription: 'Inject dynamic CAST wrapper in ingest stage and queue schema update task.',
    riskTier: 'HIGH',
  },
  {
    category: 'RATE_LIMIT_EXCEEDED',
    keywords: ['rate limit', '429', 'throttled', 'too many requests', 'quota exceeded', 'rate_limit'],
    actionType: 'RESTART_POD',
    defaultRootCause: 'API rate limit exceeded due to burst request pattern.',
    defaultFixDescription: 'Implement exponential backoff and retry with jittered delay.',
    riskTier: 'LOW',
  },
  {
    category: 'POD_CRASH_LOOP',
    keywords: ['CrashLoopBackOff', 'crash loop', 'pod restart', 'container exit', 'restarting', 'backoff'],
    actionType: 'RESTART_POD',
    defaultRootCause: 'Pod entering crash-loop due to misconfiguration or dependency failure.',
    defaultFixDescription: 'Restart pod with corrected environment configuration.',
    riskTier: 'LOW',
  },
];

// ----- Core Service -----

export class FileUploadService {
  /**
   * Process a single uploaded file
   */
  static async processFile(
    file: File,
    onProgress?: UploadProgressCallback
  ): Promise<ParsedUploadResult> {
    const warnings: string[] = [];

    // Stage 1: Read file content
    onProgress?.({ stage: 'reading', percent: 10, message: `Reading ${file.name}...` });
    const rawContent = await this.readFileContent(file);

    // Stage 2: Parse based on file type
    onProgress?.({ stage: 'parsing', percent: 30, message: 'Parsing file content...' });
    const fileType = this.detectFileType(file.name);

    let parsedData: Partial<FailureScenario> & { rawLogs: string[] };

    switch (fileType) {
      case 'json':
        parsedData = this.parseJsonFile(rawContent, warnings);
        break;
      case 'csv':
        parsedData = this.parseCsvFile(rawContent, warnings);
        break;
      case 'log':
      case 'txt':
        parsedData = this.parseLogFile(rawContent, warnings);
        break;
      default:
        parsedData = this.parseLogFile(rawContent, warnings);
        warnings.push('Unknown file type — treating as plain text log.');
    }

    // Stage 3: Auto-classify failure category
    onProgress?.({ stage: 'classifying', percent: 60, message: 'Classifying failure pattern...' });
    const classification = this.classifyFailure(parsedData.rawLogs, rawContent);

    const scenario = this.buildScenario(file.name, parsedData, classification);

    // Stage 4: Store metadata in Supabase (if configured)
    onProgress?.({ stage: 'storing', percent: 85, message: 'Storing upload record...' });
    await this.storeUploadRecord(file.name, file.size, fileType, scenario);

    // Done
    onProgress?.({ stage: 'done', percent: 100, message: 'File processed successfully!' });

    return {
      fileName: file.name,
      fileType,
      fileSizeBytes: file.size,
      parsedScenario: scenario,
      rawContent,
      parseWarnings: warnings,
      parsedAt: new Date().toISOString(),
    };
  }

  /**
   * Process an uploaded FOLDER containing multiple files
   */
  static async processFolder(
    files: File[],
    folderName: string = 'Uploaded Folder',
    onProgress?: UploadProgressCallback
  ): Promise<ParsedUploadResult> {
    const warnings: string[] = [];
    const supportedExts = ['.json', '.csv', '.log', '.txt'];

    // Filter valid files inside folder
    const validFiles = files.filter(f => {
      const ext = '.' + (f.name.split('.').pop()?.toLowerCase() || '');
      return supportedExts.includes(ext);
    });

    if (validFiles.length === 0) {
      throw new Error(`No supported files (.json, .csv, .log, .txt) found in folder "${folderName}".`);
    }

    onProgress?.({
      stage: 'reading',
      percent: 15,
      message: `Reading ${validFiles.length} file(s) inside "${folderName}"...`
    });

    let totalSizeBytes = 0;
    const aggregatedLogs: string[] = [];
    const allContents: string[] = [];

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      totalSizeBytes += file.size;

      const progressPct = 15 + Math.round(((i + 1) / validFiles.length) * 35);
      onProgress?.({
        stage: 'reading',
        percent: progressPct,
        message: `Reading file ${i + 1}/${validFiles.length}: ${file.name}...`
      });

      try {
        const content = await this.readFileContent(file);
        allContents.push(`--- FILE: ${file.name} ---`);
        allContents.push(content);

        const fType = this.detectFileType(file.name);
        let parsedSingle: Partial<FailureScenario> & { rawLogs: string[] };

        if (fType === 'json') {
          parsedSingle = this.parseJsonFile(content, warnings);
        } else if (fType === 'csv') {
          parsedSingle = this.parseCsvFile(content, warnings);
        } else {
          parsedSingle = this.parseLogFile(content, warnings);
        }

        aggregatedLogs.push(`[FOLDER_ENTRY: ${file.name}]`);
        aggregatedLogs.push(...parsedSingle.rawLogs);
      } catch (err: any) {
        warnings.push(`Failed to read file "${file.name}": ${err.message}`);
      }
    }

    // Stage 3: Classify aggregated folder contents
    onProgress?.({ stage: 'classifying', percent: 70, message: 'Classifying aggregated folder failure pattern...' });
    const fullContent = allContents.join('\n');
    const classification = this.classifyFailure(aggregatedLogs, fullContent);

    const folderDescription = aggregatedLogs.find(l => /\b(ERROR|FATAL|CRITICAL|EXCEPTION)\b/i.test(l))
      || `Pipeline failure detected across ${validFiles.length} files in folder "${folderName}".`;

    const scenario = this.buildScenario(
      `Folder: ${folderName}`,
      {
        pipelineId: `pipe-folder-${Date.now()}`,
        pipelineName: `Folder: ${folderName}`,
        description: folderDescription,
        rawLogs: aggregatedLogs,
      },
      classification
    );

    // Stage 4: Store record
    onProgress?.({ stage: 'storing', percent: 90, message: 'Storing folder record...' });
    await this.storeUploadRecord(`Folder: ${folderName}`, totalSizeBytes, 'folder', scenario);

    onProgress?.({ stage: 'done', percent: 100, message: `Folder "${folderName}" (${validFiles.length} files) processed!` });

    return {
      fileName: `📁 ${folderName} (${validFiles.length} files)`,
      fileType: 'folder',
      fileSizeBytes: totalSizeBytes,
      parsedScenario: scenario,
      rawContent: fullContent.slice(0, 5000), // Cap raw preview
      parseWarnings: warnings,
      parsedAt: new Date().toISOString(),
      containedFileCount: validFiles.length,
    };
  }

  // ----- File Reading -----

  private static readFileContent(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
      reader.readAsText(file);
    });
  }

  // ----- File Type Detection -----

  private static detectFileType(fileName: string): ParsedUploadResult['fileType'] {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'json') return 'json';
    if (ext === 'csv') return 'csv';
    if (ext === 'log') return 'log';
    if (ext === 'txt') return 'txt';
    return 'unknown';
  }

  // ----- JSON Parser -----

  private static parseJsonFile(
    content: string,
    warnings: string[]
  ): Partial<FailureScenario> & { rawLogs: string[] } {
    try {
      const data = JSON.parse(content);

      if (Array.isArray(data)) {
        const logs = data.map((entry: any) => {
          if (typeof entry === 'string') return entry;
          return entry.message || entry.log || entry.msg || JSON.stringify(entry);
        });

        return {
          rawLogs: logs,
          description: logs.find((l: string) => l.toLowerCase().includes('error')) || logs[0] || 'Pipeline failure detected',
        };
      }

      const rawLogs: string[] = data.raw_logs || data.rawLogs || data.logs || [];
      if (rawLogs.length === 0 && data.error_message) {
        rawLogs.push(data.error_message);
      }
      if (rawLogs.length === 0 && data.log) {
        rawLogs.push(data.log);
      }

      return {
        name: data.name || data.pipeline_name || data.pipelineName,
        pipelineId: data.pipeline_id || data.pipelineId || `pipe-upload-${Date.now()}`,
        pipelineName: data.pipeline_name || data.pipelineName || 'Uploaded Pipeline',
        environment: this.parseEnvironment(data.environment),
        category: this.parseCategory(data.category || data.failure_category || data.failureCategory),
        description: data.description || data.error_message || data.errorMessage || 'Pipeline failure detected from uploaded file',
        rawLogs,
        expectedRootCause: data.root_cause || data.rootCause || data.expected_root_cause || '',
      };
    } catch (e) {
      warnings.push('JSON parse error — treating content as raw log lines.');
      return this.parseLogFile(content, warnings);
    }
  }

  // ----- CSV Parser -----

  private static parseCsvFile(
    content: string,
    warnings: string[]
  ): Partial<FailureScenario> & { rawLogs: string[] } {
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length < 2) {
      warnings.push('CSV file has fewer than 2 lines — treating as log.');
      return this.parseLogFile(content, warnings);
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
    const rawLogs: string[] = [];
    let description = '';
    let pipelineId = '';
    let pipelineName = '';
    let environment: Environment = 'production';

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCsvLine(lines[i]);
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || '';
      });

      if (i === 1) {
        pipelineId = row['pipeline_id'] || row['pipelineid'] || '';
        pipelineName = row['pipeline_name'] || row['pipelinename'] || '';
        environment = this.parseEnvironment(row['environment']);
        description = row['error_message'] || row['errormessage'] || row['description'] || '';
      }

      const logParts: string[] = [];
      if (row['timestamp'] || row['time'] || row['ts']) {
        logParts.push(row['timestamp'] || row['time'] || row['ts']);
      }
      if (row['level'] || row['severity']) {
        logParts.push(`[${(row['level'] || row['severity']).toUpperCase()}]`);
      }
      if (row['message'] || row['msg'] || row['log'] || row['error_message']) {
        logParts.push(row['message'] || row['msg'] || row['log'] || row['error_message']);
      }

      if (logParts.length > 0) {
        rawLogs.push(logParts.join(' '));
      } else {
        rawLogs.push(lines[i]);
      }
    }

    return {
      pipelineId: pipelineId || `pipe-csv-${Date.now()}`,
      pipelineName: pipelineName || 'CSV Pipeline Upload',
      environment,
      description: description || rawLogs.find(l => l.toLowerCase().includes('error')) || 'Pipeline failure detected from CSV',
      rawLogs,
    };
  }

  private static parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  // ----- Log/Text Parser -----

  private static parseLogFile(
    content: string,
    warnings: string[]
  ): Partial<FailureScenario> & { rawLogs: string[] } {
    const lines = content.split('\n').filter(l => l.trim());

    if (lines.length === 0) {
      warnings.push('Empty file — no log lines detected.');
      return { rawLogs: ['[EMPTY] No log data found in uploaded file.'] };
    }

    const errorLines = lines.filter(l =>
      /\b(ERROR|FATAL|CRITICAL|EXCEPTION|FAIL)\b/i.test(l)
    );

    const description = errorLines.length > 0
      ? errorLines[0]
      : lines[lines.length - 1];

    return {
      description,
      rawLogs: lines.slice(0, 200),
    };
  }

  // ----- Failure Classification -----

  private static classifyFailure(
    rawLogs: string[],
    fullContent: string
  ): { category: FailureCategory; pattern: ErrorPattern | null } {
    const searchText = [...rawLogs, fullContent].join(' ').toLowerCase();

    for (const pattern of ERROR_PATTERNS) {
      const matchCount = pattern.keywords.filter(kw =>
        searchText.includes(kw.toLowerCase())
      ).length;

      if (matchCount >= 1) {
        return { category: pattern.category, pattern };
      }
    }

    return { category: 'UNKNOWN', pattern: null };
  }

  // ----- Build FailureScenario -----

  private static buildScenario(
    fileName: string,
    parsed: Partial<FailureScenario> & { rawLogs: string[] },
    classification: { category: FailureCategory; pattern: ErrorPattern | null }
  ): FailureScenario {
    const category = parsed.category || classification.category;
    const pattern = classification.pattern;

    const defaultFix: ProposedRemediation = {
      actionType: pattern?.actionType || 'RESTART_POD',
      description: pattern?.defaultFixDescription || 'Automated remediation based on uploaded diagnostics.',
      parameters: { source: fileName, uploadedAt: new Date().toISOString() },
      estimatedDurationSeconds: 30,
      riskTier: pattern?.riskTier || 'MEDIUM',
      confidenceScore: pattern ? 88.0 : 70.0,
      requiresHumanApproval: (pattern?.riskTier || 'MEDIUM') === 'HIGH' || (pattern?.riskTier || 'MEDIUM') === 'CRITICAL',
      justification: pattern
        ? `Auto-classified as ${category} based on ${pattern.keywords.length} keyword matches in uploaded data.`
        : 'Unable to auto-classify with high confidence — human review recommended.',
    };

    return {
      id: `sc-upload-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: parsed.name || `Upload: ${fileName}`,
      pipelineId: parsed.pipelineId || `pipe-upload-${Date.now()}`,
      pipelineName: parsed.pipelineName || fileName.replace(/\.[^.]+$/, ''),
      environment: parsed.environment || 'production',
      category,
      description: parsed.description || 'Pipeline failure detected from uploaded file.',
      rawLogs: parsed.rawLogs,
      expectedRootCause: parsed.expectedRootCause || pattern?.defaultRootCause || 'Root cause to be determined by Diagnosis Agent.',
      expectedFix: defaultFix,
    };
  }

  // ----- Helpers -----

  private static parseEnvironment(val: string | undefined): Environment {
    const env = (val || '').toLowerCase();
    if (env === 'development' || env === 'dev') return 'development';
    if (env === 'staging' || env === 'stg') return 'staging';
    return 'production';
  }

  private static parseCategory(val: string | undefined): FailureCategory | undefined {
    if (!val) return undefined;
    const upper = val.toUpperCase().replace(/ /g, '_');
    const valid: FailureCategory[] = [
      'OUT_OF_MEMORY', 'DATABASE_TIMEOUT', 'SCHEMA_MISMATCH',
      'RATE_LIMIT_EXCEEDED', 'POD_CRASH_LOOP', 'TEST_TIMEOUT', 'UNKNOWN'
    ];
    return valid.includes(upper as FailureCategory) ? (upper as FailureCategory) : undefined;
  }

  // ----- Supabase Storage -----

  private static async storeUploadRecord(
    fileName: string,
    fileSize: number,
    fileType: string,
    scenario: FailureScenario
  ): Promise<void> {
    if (!isSupabaseConfigured) return;

    try {
      await supabase.from('file_uploads').insert([{
        file_name: fileName,
        file_size_bytes: fileSize,
        file_type: fileType,
        detected_category: scenario.category,
        parsed_scenario: scenario,
        log_line_count: scenario.rawLogs.length,
        status: 'PROCESSED',
      }]);
    } catch (err) {
      console.warn('[FileUploadService] Failed to store upload record:', err);
    }
  }
}
