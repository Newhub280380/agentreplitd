import { useMemo, useState } from "react";
import {
  Activity, ArrowUpRight, Bot, Check, ChevronRight, CircleDot, Command,
  Gauge, Layers3, Menu, Radio, RefreshCw, Send, Settings2, Sparkles,
  TerminalSquare, TrendingUp, X, Zap,
} from "lucide-react";
import "./OperationsCore.css";

type Agent = { name: string; key: string; role: string; state: string; metric: string; color: string };

const agents: Agent[] = [
  { name: "Analyst", key: "AN", role: "Signal intelligence", state: "listening", metric: "12 sources · 3 signals", color: "mint" },
  { name: "Builder", key: "BU", role: "Systems & delivery", state: "ready", metric: "2 packages staged", color: "lime" },
  { name: "Seller", key: "SE", role: "Distribution & growth", state: "ready", metric: "3 channels connected", color: "gold" },
  { name: "Orchestrator", key: "OR", role: "Routing & memory", state: "directing", metric: "4 active routes", color: "violet" },
];

const activities = [
  ["14:32", "Analyst", "Signal cluster resolved", "12 new topics mapped from AI tooling"],
  ["14:18", "Orchestrator", "Content pipeline routed", "Draft brief handed to Seller"],
  ["13:54", "Builder", "Environment verified", "Dependencies and versions current"],
];

function Status({ children, kind = "good" }: { children: string; kind?: "good" | "active" | "quiet" }) {
  return <span className={`oc-status ${kind}`}><i />{children}</span>;
}

function FacetField({ active, pulse, onPulse }: { active: boolean; pulse: number; onPulse: () => void }) {
  const facets = useMemo(() => Array.from({ length: 76 }, (_, i) => ({
    left: `${8 + ((i * 37) % 84)}%`,
    top: `${8 + ((i * 61) % 80)}%`,
    size: 5 + ((i * 17) % 9),
    rotate: (i * 29) % 90,
    delay: `${(i % 11) * -0.42}s`,
    tone: i % 7 === 0 ? "bright" : i % 4 === 0 ? "deep" : "base",
  })), []);
  return (
    <button className={`oc-core ${active ? "is-active" : ""}`} aria-label="Orchestration health core. Click to pulse routing." onClick={onPulse} onPointerMove={(event) => { const rect = event.currentTarget.getBoundingClientRect(); event.currentTarget.style.setProperty("--mx", `${((event.clientX - rect.left) / rect.width) * 100}%`); event.currentTarget.style.setProperty("--my", `${((event.clientY - rect.top) / rect.height) * 100}%`); }} onPointerLeave={(event) => { event.currentTarget.style.setProperty("--mx", "50%"); event.currentTarget.style.setProperty("--my", "50%"); }}>
      <span className="oc-core-grid" aria-hidden="true">
        {facets.map((facet, i) => <i key={i} className={`oc-facet ${facet.tone}`} style={{ left: facet.left, top: facet.top, width: facet.size, height: facet.size, transform: `rotate(${facet.rotate}deg)`, animationDelay: facet.delay }} />)}
      </span>
      <span className="oc-core-rings" aria-hidden="true"><i /><i /><i /></span>
      {pulse > 0 && <span key={pulse} className="oc-ripple" aria-hidden="true" />}
      <span className="oc-core-chip">POINTER LINKED</span>
      <span className="oc-core-center"><span className="oc-core-kicker">ROUTING HEALTH</span><strong>{active ? "DIRECTING" : "98.4%"}</strong><span className="oc-core-hint"><span className="oc-hint-normal">{active ? "pulse acknowledged" : "click to re-route"}</span><span className="oc-hint-hover">route preview linked</span></span></span>
    </button>
  );
}

export function OperationsCore() {
  const [command, setCommand] = useState("");
  const [queued, setQueued] = useState(false);
  const [active, setActive] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [mobileNav, setMobileNav] = useState(false);
  const trigger = () => { setActive(true); setPulse((v) => v + 1); window.setTimeout(() => setActive(false), 1200); };
  const submit = (event: React.FormEvent) => { event.preventDefault(); if (!command.trim()) return; setQueued(true); trigger(); setCommand(""); };
  return (
    <div className="operations-core">
      <aside className={`oc-sidebar ${mobileNav ? "open" : ""}`}>
        <div className="oc-brand"><span className="oc-mark"><Activity /></span><span>AGENT <b>360</b></span></div>
        <div className="oc-side-label">Control plane</div>
        <nav>
          <a className="selected" href="#command"><TerminalSquare /> Command <span>01</span></a>
          <a href="#signals"><TrendingUp /> Signals <span>24</span></a>
          <a href="#work"><Layers3 /> Workstream <span>03</span></a>
          <a href="#fleet"><Bot /> Agent fleet</a>
        </nav>
        <div className="oc-sidebar-bottom"><a href="#settings"><Settings2 /> Settings</a><div className="oc-operator"><span>KM</span><div><b>Kira M.</b><small>solo operator</small></div><ChevronRight /></div></div>
      </aside>
      {mobileNav && <button className="oc-nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
      <main className="oc-main">
        <header className="oc-header"><button className="oc-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu /></button><div><div className="oc-eyebrow">Wednesday · 06 March 2024</div><h1>Operations <em>Core</em></h1></div><div className="oc-header-actions"><div className="oc-live"><i /> LIVE <span>08:47:12</span></div><button className="oc-icon-button" aria-label="Refresh operations" onClick={trigger}><RefreshCw /></button></div></header>
        <div className="oc-content">
          <section className="oc-command-panel" id="command">
            <div className="oc-command-top"><div><span className="oc-section-no">01 / DIRECT</span><h2>Give the system<br /><em>a direction.</em></h2></div><div className="oc-command-note"><Radio /> <span>Orchestrator is listening<br /><b>Priority lane · normal</b></span></div></div>
            <form className="oc-command-form" onSubmit={submit}><Command /><input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="Ask your agents to find, build, or move something..." aria-label="Command your agents" /><button type="submit" disabled={!command.trim()}>{queued ? "QUEUED" : "SEND"} <Send /></button></form>
            <div className="oc-suggestions"><span>Try:</span><button type="button" onClick={() => setCommand("Map emerging AI tools for a founder audience")}>map emerging tools</button><button type="button" onClick={() => setCommand("Package the latest insight into a Telegram brief")}>package an insight</button><kbd>⌘ ↵</kbd></div>
          </section>
          <section className="oc-overview"><div className="oc-overview-heading"><span className="oc-section-no">02 / SYSTEM FIELD</span><h2>Orchestration <em>health</em></h2><p>Routing is clear. Four agents are holding the line.</p></div><div className="oc-core-wrap"><FacetField active={active} pulse={pulse} onPulse={trigger} /><div className="oc-axis x" /><div className="oc-axis y" /><div className="oc-core-legend"><span><i className="mint" /> signal intake</span><span><i className="gold" /> execution</span><span><i className="violet" /> memory</span></div></div><div className="oc-health-stats"><div><span>ROUTES OPEN</span><b>04</b><small>+1 this hour</small></div><div><span>THROUGHPUT</span><b>87.6<span>%</span></b><small>within target</small></div><div><span>LAST DECISION</span><b>2<span>m</span></b><small>Analyst → Seller</small></div></div></section>
          <section className="oc-lower"><div className="oc-panel" id="fleet"><div className="oc-panel-head"><div><span className="oc-section-no">03 / FLEET</span><h2>Agent presence</h2></div><Status>all systems nominal</Status></div>{agents.map((agent) => <div className="oc-agent" key={agent.name}><span className={`oc-agent-orb ${agent.color}`}>{agent.key}</span><div className="oc-agent-copy"><b>{agent.name}</b><small>{agent.role}</small></div><span className="oc-agent-metric">{agent.metric}</span><Status kind={agent.state === "directing" || agent.state === "listening" ? "active" : "quiet"}>{agent.state}</Status><ArrowUpRight /></div>)}</div><div className="oc-panel" id="work"><div className="oc-panel-head"><div><span className="oc-section-no">04 / OUTCOMES</span><h2>Live workstream</h2></div><button className="oc-text-button" onClick={trigger}>View all <ArrowUpRight /></button></div><div className="oc-progress"><div><span><b>AI tools landscape</b> · analysis</span><strong>78%</strong></div><div className="oc-progress-track"><i /></div><small>Analyst is clustering source material</small></div>{activities.map(([time, agent, title, detail]) => <div className="oc-activity" key={time}><time>{time}</time><span className="oc-activity-dot"><Check /></span><div><b>{title}</b><small>{agent} · {detail}</small></div></div>)}</div></section>
          <footer><span><Sparkles /> Intelligence, in motion.</span><span>Agent Multitool 360 <b>·</b> session secured <CircleDot /></span></footer>
        </div>
      </main>
    </div>
  );
}