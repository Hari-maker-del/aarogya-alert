import type { BackendAlert } from "./api";

export interface DetectionEvidenceView {
  observed: string;
  baseline: string;
  difference: string;
  percentageChange: string;
  anomalyScore: string;
  threshold: string;
  historyCount: string;
  baselineMethod: string;
  evidenceSufficiency: string;
  detectionStatus: string;
  detectionReason: string;
  dataQuality: string;
}

export function buildDetectionEvidence(alert: BackendAlert): DetectionEvidenceView;
