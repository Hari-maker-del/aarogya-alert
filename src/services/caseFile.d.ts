import type { BackendAlert, AuditEventRecord } from "./api";

export interface InvestigationCaseFileOptions {
  alert: BackendAlert;
  auditEvents: AuditEventRecord[];
  backendConnected: boolean;
  generatedAt: string;
  historyCoverage: string;
  formatIndicator: (value: string) => string;
  priorityLabel: (value: string) => string;
  statusLabel: (value: string) => string;
  percentText: (value?: number | null) => string;
}

export function buildInvestigationCaseFile(options: InvestigationCaseFileOptions): string;
