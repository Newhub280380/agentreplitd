import { FormEvent, PointerEvent, CSSProperties, useState } from "react";
import "./AccessCore.css";

type CoreState = "ready" | "typing" | "linking" | "authorized";

const agents = [
  { code: "AN", name: "Analyst", tone: "amber" },
  { code: "BL", name: "Builder", tone: "cyan" },
  { code: "SL", name: "Seller", tone: "violet" },
  { code: "OR", name: "Orchestrator", tone: "lime" },
];

export function AccessCore() {
  const [email, setEmail] = useState("");
  const [secret, setSecret] = useState("");
  const [coreState, setCoreState] = useState<CoreState>("ready");
  const [message, setMessage] = useState("Workspace link is ready");
  const [showSecret, setShowSecret] = useState(false);
  const [coreEngaged, setCoreEngaged] = useState(false);
  const [pointer, setPointer] = useState({ x: 50, y: 50 });

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setPointer({
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email || !secret) {
      setCoreState("ready");
      setMessage("Enter your operator credentials");
      return;
    }
    setCoreState("linking");
    setMessage("Negotiating a private workspace link…");
    window.setTimeout(() => {
      setCoreState("authorized");
      setMessage("Operator link established · fleet standing by");
    }, 1200);
  };

  const isBusy = coreState === "linking";

  return (
    <main
      className="access-core"
      data-state={coreState}
      style={{ "--pointer-x": `${pointer.x}%`, "--pointer-y": `${pointer.y}%` } as CSSProperties}
      onPointerMove={handlePointerMove}
    >
      <div className="access-core__backdrop" aria-hidden="true" />
      <div className="access-core__noise" aria-hidden="true" />
      <header className="access-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span><b>AGENT</b><em>multitool 360</em></span>
        </div>
        <div className="secure-chip"><span /> private operator access</div>
      </header>

      <section className="access-layout" aria-label="Secure workspace access">
        <div className="access-intro">
          <p className="eyebrow"><span className="eyebrow-line" /> CORE / 01</p>
          <h1>Open the<br /><strong>workspace.</strong></h1>
          <p className="intro-copy">One operator. A coordinated fleet. Your next move travels through a room that is already listening.</p>
          <div className="fleet-list" aria-label="Agent fleet readiness">
            {agents.map((agent) => (
              <div className="fleet-agent" key={agent.code}>
                <span className={`agent-node ${agent.tone}`}>{agent.code}</span>
                <span>{agent.name}</span>
                <i className="agent-ready" aria-label={`${agent.name} ready`} />
              </div>
            ))}
          </div>
        </div>

        <div className="core-stage" aria-label={`Access core: ${message}`}>
          <div className="orbit orbit--one" /><div className="orbit orbit--two" />
          <div className="core-ripple ripple--one" /><div className="core-ripple ripple--two" />
          <div
            className="core-orb"
            role="button"
            tabIndex={0}
            aria-label="Preview workspace link"
            onPointerEnter={() => setCoreEngaged(true)}
            onPointerLeave={() => setCoreEngaged(false)}
            onFocus={() => setCoreEngaged(true)}
            onBlur={() => setCoreEngaged(false)}
          >
            <div className="facet facet--a" /><div className="facet facet--b" /><div className="facet facet--c" />
            <div className="facet facet--d" /><div className="facet facet--e" /><div className="facet facet--f" />
            <div className="core-aperture"><span>{coreState === "authorized" ? "✓" : "360"}</span></div>
          </div>
          <div className="core-status-chip" aria-live="polite">{coreEngaged ? "POINTER LINKED" : coreState === "authorized" ? "LINK ESTABLISHED" : "CORE READY"}</div>
          <div className="stage-caption"><span className="signal-pulse" /> {coreEngaged ? "Previewing a private workspace link · release to remain idle" : message}</div>
        </div>

        <div className="access-panel">
          <div className="panel-topline"><span>OPERATOR GATE</span><span>0{coreState === "authorized" ? "2" : "1"} / 02</span></div>
          <h2>Sign in to<br /><span>continue.</span></h2>
          <p className="panel-copy">Your credentials unlock the command layer. Nothing moves until you say so.</p>
          <form onSubmit={handleSubmit}>
            <label className="field">
              <span>Operator email</span>
              <input
                autoComplete="email"
                type="email"
                value={email}
                onChange={(event) => { setEmail(event.target.value); setCoreState("typing"); setMessage("Reading operator signal"); }}
                placeholder="you@operation.space"
                disabled={isBusy}
              />
            </label>
            <label className="field">
              <span>Access key <button type="button" className="reveal-key" onClick={() => setShowSecret(!showSecret)} aria-label={showSecret ? "Hide access key" : "Show access key"}>{showSecret ? "hide" : "show"}</button></span>
              <input
                autoComplete="current-password"
                type={showSecret ? "text" : "password"}
                value={secret}
                onChange={(event) => { setSecret(event.target.value); setCoreState("typing"); setMessage("Reading operator signal"); }}
                placeholder="••••••••••••"
                disabled={isBusy}
              />
            </label>
            <button className="submit-button" type="submit" disabled={isBusy}>
              <span>{isBusy ? "Linking fleet" : coreState === "authorized" ? "Workspace open" : "Enter workspace"}</span>
              <b aria-hidden="true">↗</b>
            </button>
          </form>
          <div className="panel-foot"><span>Local mock · no credentials leave this screen</span><button type="button" onClick={() => setMessage("A recovery signal would be sent here")}>Recover access</button></div>
        </div>
      </section>
      <footer className="access-footer"><span>AM360 / SECURE ACCESS CORE</span><span>LINK LATENCY <b>18ms</b></span><span>BUILD 3.6.0</span></footer>
    </main>
  );
}