import {
  Activity, ArrowRight, ArrowUpRight, BarChart3, CheckCircle2, ClipboardCheck,
  HeartPulse, MapPinned, ShieldCheck, Sparkles, Workflow,
} from "lucide-react";
import "./LandingPage.css";

type LandingPageProps = { onExplore: () => void; onSignIn: () => void };

const capabilities = [
  { icon: Activity, number: "01", title: "Spot unusual patterns", description: "Compare aggregated observations with expected baselines to surface signals that may deserve a closer look." },
  { icon: MapPinned, number: "02", title: "Understand the context", description: "Review regional patterns, supporting evidence, data-quality notes and uncertainty in one shared workspace." },
  { icon: ClipboardCheck, number: "03", title: "Coordinate the review", description: "Move an alert through a structured investigation workflow with reviewer assignments and an audit trail." },
];
const workflow = [
  { step: "01", title: "Observe", text: "Compare aggregate health indicators with their expected range." },
  { step: "02", title: "Review", text: "Check the signal, its evidence and limitations before deciding what to investigate." },
  { step: "03", title: "Document", text: "Record the reviewer, investigation status and reasoning behind each action." },
];

export default function LandingPage({ onExplore, onSignIn }: LandingPageProps) {
  return (
    <div className="landing-page">
      <a className="landing-skip-link" href="#landing-main">Skip to content</a>
      <header className="landing-header">
        <a className="landing-brand" href="#top" aria-label="Aarogya Alert home">
          <span className="landing-brand-mark" aria-hidden="true"><HeartPulse size={23} strokeWidth={1.8} /></span>
          <span className="landing-brand-copy"><strong>AAROGYA ALERT</strong><span>PUBLIC HEALTH INTELLIGENCE</span></span>
        </a>
        <nav className="landing-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a><a href="#capabilities">Capabilities</a><a href="#safeguards">Safeguards</a>
        </nav>
        <div className="landing-header-actions">
          <button className="landing-sign-in" type="button" onClick={onSignIn}>Reviewer sign in</button>
          <button className="landing-button landing-button-primary landing-header-cta" type="button" onClick={onExplore}>Explore demo <ArrowUpRight size={16} /></button>
        </div>
      </header>

      <main id="landing-main">
        <section className="landing-hero" id="top" aria-labelledby="landing-title">
          <div className="landing-hero-copy">
            <div className="landing-status-label"><span className="landing-status-dot" /> EARLY SIGNALS. HUMAN JUDGMENT.</div>
            <h1 id="landing-title">See the signal.<br /><span>Understand what</span><br />needs attention.</h1>
            <p className="landing-hero-intro">AAROGYA ALERT helps public-health teams review unusual community health patterns, understand the evidence and coordinate the next step — before a signal gets lost in the noise.</p>
            <div className="landing-hero-actions">
              <button className="landing-button landing-button-primary landing-button-large" type="button" onClick={onExplore}>Explore the demo workspace <ArrowRight size={18} /></button>
              <button className="landing-button landing-button-secondary landing-button-large" type="button" onClick={onSignIn}>Sign in as a reviewer</button>
            </div>
            <div className="landing-reassurance">
              <span><CheckCircle2 size={15} /> Human-led review</span><span><ShieldCheck size={15} /> Privacy-aware by design</span>
            </div>
          </div>

          <div className="landing-hero-visual" aria-label="Illustration of the AAROGYA ALERT signal review workspace">
            <div className="landing-visual-orbit landing-orbit-one" /><div className="landing-visual-orbit landing-orbit-two" /><div className="landing-visual-glow" />
            <div className="landing-preview-card">
              <div className="landing-preview-top">
                <div><span className="landing-micro-label">SIGNAL ROOM / PREVIEW</span><strong>Regional signal overview</strong></div>
                <span className="landing-preview-tag">DEMO</span>
              </div>
              <div className="landing-preview-chart-wrap">
                <div className="landing-chart-copy"><span>Illustrative indicator</span><strong>Respiratory medicine demand</strong></div>
                <div className="landing-chart" aria-hidden="true">
                  <span className="landing-chart-grid landing-grid-a" /><span className="landing-chart-grid landing-grid-b" /><span className="landing-chart-grid landing-grid-c" />
                  <svg viewBox="0 0 440 128" role="img" aria-label="Illustrative indicator rising above a reference baseline">
                    <defs><linearGradient id="landingChartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#b17b9f" stopOpacity=".3" /><stop offset="100%" stopColor="#b17b9f" stopOpacity="0" /></linearGradient></defs>
                    <path d="M0 95 C36 92 45 80 75 84 S123 91 150 71 S194 79 225 64 S267 82 300 47 S357 57 389 28 S419 38 440 19 L440 128 L0 128 Z" fill="url(#landingChartFill)" />
                    <path d="M0 95 C36 92 45 80 75 84 S123 91 150 71 S194 79 225 64 S267 82 300 47 S357 57 389 28 S419 38 440 19" fill="none" stroke="#814e72" strokeWidth="3" strokeLinecap="round" />
                    <path d="M0 101 C55 99 91 94 135 96 S205 91 255 96 S350 91 440 94" fill="none" stroke="#c4b7c1" strokeWidth="2" strokeDasharray="5 5" />
                    <circle cx="389" cy="28" r="5.5" fill="#fffaf4" stroke="#814e72" strokeWidth="3" />
                  </svg>
                </div>
                <div className="landing-chart-legend"><span><i className="landing-legend-observed" /> Observed pattern</span><span><i className="landing-legend-baseline" /> Illustrative baseline</span></div>
              </div>
              <div className="landing-preview-alert">
                <div className="landing-preview-alert-icon"><Activity size={17} /></div>
                <div className="landing-preview-alert-copy"><span>EXAMPLE SIGNAL · REQUIRES REVIEW</span><strong>Observed 61 <em>/</em> baseline 38</strong><small>Illustrative values · not a confirmed event</small></div>
                <span className="landing-alert-change">+61%</span>
              </div>
              <div className="landing-preview-footer"><span><span className="landing-preview-dot" /> Synthetic sample data</span><span>Human verification required</span></div>
            </div>
            <div className="landing-floating-note landing-note-top"><span className="landing-note-icon"><ShieldCheck size={16} /></span><span><strong>Evidence first</strong><small>Context alongside every signal</small></span></div>
            <div className="landing-floating-note landing-note-bottom"><span className="landing-note-icon landing-note-icon-green"><Workflow size={16} /></span><span><strong>Clear next steps</strong><small>From alert to review</small></span></div>
          </div>
        </section>

        <section className="landing-principles" aria-label="Product principles">
          <div><span className="landing-principle-icon"><BarChart3 size={18} /></span><span><strong>Pattern detection</strong><small>Surface changes from baselines</small></span></div>
          <div><span className="landing-principle-icon"><ShieldCheck size={18} /></span><span><strong>Responsible interpretation</strong><small>Evidence, context and uncertainty</small></span></div>
          <div><span className="landing-principle-icon"><ClipboardCheck size={18} /></span><span><strong>Accountable workflow</strong><small>Review actions with traceability</small></span></div>
        </section>

        <section className="landing-section landing-how" id="how-it-works" aria-labelledby="landing-how-title">
          <div className="landing-section-heading">
            <span className="landing-section-kicker">A CLEARER PATH FROM SIGNAL TO ACTION</span>
            <h2 id="landing-how-title">From unusual pattern to informed review.</h2>
            <p>Give teams a shared process for asking the right questions — without treating an anomaly as a diagnosis.</p>
          </div>
          <div className="landing-workflow-grid">{workflow.map(item => <article className="landing-workflow-card" key={item.step}><span className="landing-step-number">{item.step}</span><div className="landing-step-line" /><h3>{item.title}</h3><p>{item.text}</p></article>)}</div>
        </section>

        <section className="landing-section landing-capabilities" id="capabilities" aria-labelledby="landing-capabilities-title">
          <div className="landing-capabilities-heading">
            <div><span className="landing-section-kicker">BUILT AROUND THE REVIEWER</span><h2 id="landing-capabilities-title">Less hunting for context.<br /><span>More structured decisions.</span></h2></div>
            <p>Bring the key details together so teams can review, discuss and document a signal with care.</p>
          </div>
          <div className="landing-capability-grid">{capabilities.map(({ icon: Icon, number, title, description }) => <article className="landing-capability-card" key={number}><div className="landing-capability-card-top"><span className="landing-capability-icon"><Icon size={21} strokeWidth={1.8} /></span><span>{number}</span></div><h3>{title}</h3><p>{description}</p><div className="landing-capability-rule" /></article>)}</div>
        </section>

        <section className="landing-safeguards" id="safeguards" aria-labelledby="landing-safeguards-title">
          <div className="landing-safeguards-icon"><ShieldCheck size={25} /></div>
          <div className="landing-safeguards-copy"><span className="landing-section-kicker">IMPORTANT BY DESIGN</span><h2 id="landing-safeguards-title">A signal is a reason to look closer — not a diagnosis.</h2><p>AAROGYA ALERT supports review prioritisation. It does not diagnose individuals or declare an outbreak. The current demonstration uses synthetic aggregate data and requires human verification.</p></div>
          <button className="landing-button landing-button-secondary landing-safeguards-cta" type="button" onClick={onExplore}>View the demo <ArrowRight size={16} /></button>
        </section>

        <section className="landing-final-cta" aria-labelledby="landing-final-title">
          <div className="landing-final-mark"><Sparkles size={20} /></div>
          <div><span className="landing-section-kicker">A SHARED VIEW FOR PUBLIC-HEALTH TEAMS</span><h2 id="landing-final-title">Make every signal easier to review.</h2><p>Explore the prototype and see how its review workflow fits together.</p></div>
          <button className="landing-button landing-button-light" type="button" onClick={onExplore}>Open demo workspace <ArrowRight size={17} /></button>
        </section>
      </main>

      <footer className="landing-footer">
        <a className="landing-brand landing-brand-footer" href="#top"><span className="landing-brand-mark" aria-hidden="true"><HeartPulse size={20} /></span><span className="landing-brand-copy"><strong>AAROGYA ALERT</strong><span>PUBLIC HEALTH INTELLIGENCE</span></span></a>
        <span>© 2026 AAROGYA ALERT · Hackathon prototype</span><span className="landing-footer-disclaimer"><ShieldCheck size={14} /> Synthetic data · Human review required</span>
      </footer>
    </div>
  );
}
