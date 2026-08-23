import { useEffect, useMemo, useState } from "react";
import { useGetDashboardSummary, useGetActivities, useGetAgents, useRunOrchestratorCommand, useGetRuns, getGetAgentsQueryKey, getGetRunsQueryKey, getGetActivitiesQueryKey, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { LoadingState, ErrorState, Button } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { useClerk, useUser } from "@clerk/react";
import { Link, useRoute } from "wouter";
import { Activity, ArrowUpRight, Bot, Check, Command, Layers3, LineChart, Menu, Radio, RefreshCw, Send, Settings2, Sparkles, TerminalSquare, X } from "lucide-react";
import "@/styles/dashboard-core.css";

const statusKind = (status: string) => ["failed", "offline"].includes(status.toLowerCase()) ? "bad" : ["running", "queued", "warning", "attention", "degraded"].includes(status.toLowerCase()) ? "active" : "good";
function Status({ status }: { status: string }) { return <span className={`oc-status ${statusKind(status)}`} data-testid={`status-${status}`}><i />{status}</span>; }
function Core({ active, pulse, onPulse, status }: { active: boolean; pulse: number; onPulse: () => void; status?: string }) {
  const facets = useMemo(() => Array.from({ length: 56 }, (_, i) => ({ left: `${8 + ((i * 37) % 84)}%`, top: `${8 + ((i * 61) % 80)}%`, size: 5 + ((i * 17) % 9), rotate: (i * 29) % 90 })), []);
  return <button type="button" className={`oc-core ${active ? "is-active" : ""}`} onClick={onPulse} data-testid="button-pulse-routing" aria-label="Pulse orchestration routing health">
    <span className="oc-core-grid">{facets.map((f, i) => <i key={i} className="oc-facet" style={{ left: f.left, top: f.top, width: f.size, height: f.size, transform: `rotate(${f.rotate}deg)` }} />)}</span><span className="oc-core-rings"><i /><i /><i /></span>{pulse > 0 && <span className="oc-ripple" />}
    <span className="oc-core-chip">POINTER LINKED</span><span className="oc-core-center"><span className="oc-core-kicker">SYSTEM STATUS</span><strong>{active ? "UPDATING" : (status ?? "UNKNOWN").toUpperCase()}</strong><span className="oc-core-hint">{active ? "refresh pulse acknowledged" : "click to refresh readout"}</span></span>
  </button>;
}
const navigation = [
  { href: "/", label: "Command", icon: TerminalSquare },
  { href: "/analytics", label: "Analytics", icon: LineChart },
  { href: "/content", label: "Content", icon: Send },
  { href: "/builder", label: "Builder", icon: Layers3 },
  { href: "/settings", label: "Settings", icon: Settings2 },
];
function DashboardNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useUser(); const { signOut } = useClerk();
  const name = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Operator";
  return <aside className={`oc-sidebar ${open ? "open" : ""}`} aria-label="Operations navigation">
    <div className="oc-brand"><span className="oc-mark"><Activity /></span><span>AGENT <b>360</b></span><button type="button" className="oc-nav-close" onClick={onClose} aria-label="Close navigation" data-testid="button-close-dashboard-navigation"><X /></button></div>
    <div className="oc-side-label">Control plane</div><nav>{navigation.map(({ href, label, icon: Icon }) => <DashboardNavLink key={href} href={href} label={label} icon={Icon} onNavigate={onClose} />)}</nav>
    <div className="oc-sidebar-bottom"><div className="oc-operator"><span>{name.slice(0, 1).toUpperCase()}</span><div><b data-testid="text-operator-name">{name}</b><small>authenticated operator</small></div></div><button type="button" onClick={() => signOut({ redirectUrl: import.meta.env.BASE_URL })} data-testid="button-sign-out">Выйти</button></div>
  </aside>;
}
function DashboardNavLink({ href, label, icon: Icon, onNavigate }: { href: string; label: string; icon: typeof Activity; onNavigate: () => void }) {
  const [active] = useRoute(href);
  return <Link href={href} className={active ? "selected" : ""} onClick={onNavigate} data-testid={`link-dashboard-${label.toLowerCase()}`}><Icon />{label}</Link>;
}
export default function DashboardPage() {
  const queryClient = useQueryClient(); const [command, setCommand] = useState(""); const [active, setActive] = useState(false); const [pulse, setPulse] = useState(0); const [mobileNav, setMobileNav] = useState(false);
  const { data: summary, isLoading: isLoadingSummary, error: errorSummary } = useGetDashboardSummary();
  const { data: activities, isLoading: isLoadingActivities, error: errorActivities } = useGetActivities(); const { data: agents, isLoading: isLoadingAgents, error: errorAgents } = useGetAgents(); const { data: runs, isLoading: isLoadingRuns, error: errorRuns } = useGetRuns(); const runCommand = useRunOrchestratorCommand();
  useEffect(() => { if (!active) return; const timer = window.setTimeout(() => setActive(false), 1200); return () => window.clearTimeout(timer); }, [active]);
  const pulseCore = () => { setActive(true); setPulse(v => v + 1); };
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (!command.trim()) return; pulseCore(); runCommand.mutate({ data: { command } }, { onSuccess: () => { setCommand(""); queryClient.invalidateQueries({ queryKey: getGetRunsQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetActivitiesQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); } }); };
  const refresh = () => { pulseCore(); queryClient.invalidateQueries({ queryKey: getGetAgentsQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetRunsQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetActivitiesQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); };
  return <div className="operations-core">
    <DashboardNav open={mobileNav} onClose={() => setMobileNav(false)} />{mobileNav && <button type="button" className="oc-nav-scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation" data-testid="button-dashboard-navigation-scrim" />}
    <main className="oc-main">
    <header className="oc-header"><div className="oc-title-wrap"><button type="button" className="oc-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation" data-testid="button-open-dashboard-navigation"><Menu /></button><div><div className="oc-eyebrow">Operations command plane</div><h1>Operations <em>Core</em></h1></div></div><div className="oc-header-actions"><div className="oc-live"><i /> LIVE</div><Button variant="ghost" size="icon" onClick={refresh} data-testid="button-refresh-operations" aria-label="Refresh operations"><RefreshCw /></Button></div></header>
    <div className="oc-content">
      <section className="oc-command-panel"><div className="oc-command-top"><div><span className="oc-section-no">01 / DIRECT</span><h2>Give the system<br /><em>a direction.</em></h2></div><div className="oc-command-note"><Radio /> Orchestrator is listening<br /><b>Priority lane · normal</b></div></div>
        <form className="oc-command-form" onSubmit={submit}><Command /><input value={command} onChange={e => setCommand(e.target.value)} disabled={runCommand.isPending} placeholder="Ask your agents to find, build, or move something..." aria-label="Command your agents" data-testid="input-orchestrator-command" /><button type="submit" disabled={!command.trim() || runCommand.isPending} data-testid="button-send-command">{runCommand.isPending ? "SENDING" : "SEND"} <Send /></button></form>{runCommand.isError && <p className="oc-command-error" role="alert" data-testid="status-command-error">Не удалось отправить команду. Проверьте соединение и попробуйте снова.</p>}
      </section>
      {errorSummary ? <ErrorState error={errorSummary} /> : isLoadingSummary ? <LoadingState /> : <section className="oc-overview"><div className="oc-overview-heading"><span className="oc-section-no">02 / SYSTEM FIELD</span><h2>Orchestration <em>health</em></h2><p data-testid="text-system-status">System status: {summary?.systemStatus ?? "unknown"}</p></div><div className="oc-core-wrap"><Core active={active} pulse={pulse} onPulse={refresh} status={summary?.systemStatus} /><div className="oc-axis x" /><div className="oc-axis y" /></div><div className="oc-health-stats"><div><span>ACTIVE RUNS</span><b data-testid="text-active-runs">{summary?.activeRuns ?? 0}</b><small>current workload</small></div><div><span>INSIGHTS</span><b data-testid="text-insights">{summary?.insights ?? 0}</b><small>signals collected</small></div><div><span>DRAFTS</span><b data-testid="text-drafts">{summary?.drafts ?? 0}</b><small>content staged</small></div></div></section>}
      <section className="oc-lower"><div className="oc-panel"><div className="oc-panel-head"><div><span className="oc-section-no">03 / FLEET</span><h2>Agent presence</h2></div><Status status={summary?.systemStatus ?? "unknown"} /></div>{errorAgents ? <ErrorState error={errorAgents} /> : isLoadingAgents ? <LoadingState /> : agents?.length ? agents.map(agent => <div className="oc-agent" key={agent.id} data-testid={`card-agent-${agent.id}`}><span className="oc-agent-orb">{agent.name.slice(0, 2).toUpperCase()}</span><div className="oc-agent-copy"><b>{agent.name}</b><small>{agent.role}</small></div><span className="oc-agent-metric">{agent.metric}</span><Status status={agent.status} /><ArrowUpRight /></div>) : <p className="oc-empty">NO AGENTS RECORDED</p>}</div>
      <div className="oc-panel"><div className="oc-panel-head"><div><span className="oc-section-no">04 / OUTCOMES</span><h2>Live workstream</h2></div><button type="button" className="oc-text-button" onClick={refresh} data-testid="button-refresh-workstream">Refresh <RefreshCw /></button></div>{errorRuns || errorActivities ? <ErrorState error={errorRuns ?? errorActivities!} /> : isLoadingRuns || isLoadingActivities ? <LoadingState /> : <>{runs?.slice(0, 3).map(run => <div className="oc-run" key={run.id}><span>{run.kind}</span><Status status={run.status} /><time>{formatDate(run.startedAt)}</time></div>)}{!runs?.length && <p className="oc-empty">NO RUNS RECORDED</p>}{activities?.slice(0, 4).map(activity => <div className="oc-activity" key={activity.id}><time>{formatDate(activity.timestamp)}</time><span className="oc-activity-dot"><Check /></span><div><b>{activity.title}</b><small>{activity.agent} · {activity.detail}</small></div></div>)}{!activities?.length && <p className="oc-empty">NO ACTIVITY RECORDED</p>}</>}</div></section>
      <footer className="oc-footer"><span><Sparkles /> Intelligence, in motion.</span><span><Activity /> Agent Multitool 360 · session secured</span></footer>
    </div>
    </main></div>;
}