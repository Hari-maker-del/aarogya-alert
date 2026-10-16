import { Activity, AlertCircle, CheckCircle2, Info } from "lucide-react";
import type { BackendAlert } from "../services/api";
import { buildDetectionEvidence } from "../services/detectionEvidence.js";

export default function DetectionEvidence({ alert }: { alert: BackendAlert }) {
  const evidence = buildDetectionEvidence(alert);
  const sufficiencyClass = evidence.evidenceSufficiency.toLowerCase().startsWith("adequate")
    ? "detection-evidence-positive"
    : evidence.evidenceSufficiency.toLowerCase().startsWith("limited")
      ? "detection-evidence-caution"
      : "detection-evidence-neutral";

  return (
    <section className="dossier-section detection-evidence-section" id="dossier-detection-evidence" aria-labelledby="detection-evidence-title">
      <div className="section-label"><span>01</span> DETECTION EVIDENCE</div>
      <div className="detection-evidence-heading">
        <div className="detection-evidence-icon"><Activity size={17} aria-hidden="true" /></div>
        <div>
          <h3 id="detection-evidence-title">Why this signal was raised</h3>
          <p>Transparent context from the detector. This is a review signal, not a diagnosis or confirmed outbreak.</p>
        </div>
      </div>

      <div className="detection-evidence-status-row">
        <span>Detection status</span>
        <strong>{evidence.detectionStatus}</strong>
      </div>
      <p className="detection-evidence-reason">{evidence.detectionReason}</p>

      <div className="detection-evidence-metrics">
        <div><span>Observed count</span><strong>{evidence.observed}</strong></div>
        <div><span>Expected baseline</span><strong>{evidence.baseline}</strong></div>
        <div><span>Absolute difference</span><strong>{evidence.difference}</strong></div>
        <div><span>Percentage change</span><strong className="detection-evidence-long-value">{evidence.percentageChange}</strong></div>
        <div><span>Anomaly score</span><strong>{evidence.anomalyScore}</strong></div>
        <div><span>Configured threshold</span><strong>{evidence.threshold}</strong></div>
      </div>

      <div className="detection-evidence-meta">
        <div><span>Baseline method</span><strong>{evidence.baselineMethod}</strong></div>
        <div><span>Historical observations</span><strong>{evidence.historyCount}</strong></div>
        <div><span>Evidence sufficiency</span><strong className={sufficiencyClass}>{evidence.evidenceSufficiency}</strong></div>
        <div><span>Data quality</span><strong>{evidence.dataQuality}</strong></div>
      </div>

      <div className="detection-evidence-caveat">
        <Info size={15} aria-hidden="true" />
        <p>Percentage change is shown only when the baseline is available and at least 1. Historical counts and evidence sufficiency describe the data used by the detector, not the certainty of a public-health event.</p>
      </div>

      {alert.recommended_verification_steps?.length ? (
        <div className="detection-evidence-verification">
          <div className="detection-evidence-verification-title"><CheckCircle2 size={15} aria-hidden="true" /> Suggested verification</div>
          <ul>{alert.recommended_verification_steps.map((step, index) => <li key={index}>{step}</li>)}</ul>
        </div>
      ) : (
        <div className="detection-evidence-caveat">
          <AlertCircle size={15} aria-hidden="true" />
          <p>No verification steps were recorded for this alert. Review the source data and seek independent corroboration before drawing conclusions.</p>
        </div>
      )}
    </section>
  );
}
