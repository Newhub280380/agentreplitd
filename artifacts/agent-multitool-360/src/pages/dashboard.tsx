import { useEffect, useMemo, useState } from "react";
import { useGetDashboardSummary, useGetActivities, useGetAgents, useRunOrchestratorCommand, useGetRuns, useGetContent, useGetMedicalDossiers, getGetAgentsQueryKey, getGetRunsQueryKey, getGetActivitiesQueryKey, getGetDashboardSummaryQueryKey, getGetContentQueryKey, getGetMedicalDossiersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { LoadingState, ErrorState, Button } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { useClerk, useUser } from "@clerk/react";
import { Link, useRoute } from "wouter";
import { Activity, ArrowUpRight, Check, Command, Layers3, LineChart, Menu, Radio, RefreshCw, Send, Settings2, Sparkles, TerminalSquare, X, ShieldAlert } from "lucide-react";
import "@/styles/dashboard-core.css";

const statusKind = (status: string) => ["failed", "offline"].includes(status.toLowerCase()) ? "bad" : ["running", "queued", "warning", "attention", "degraded"].includes(status.toLowerCase()) ? "active" : "good";

function Status({ status }: { status: string }) { 
  return <span className={`oc-status ${statusKind(status)}`} data-testid={`status-${status}`}><i />{status}</span>; 
}

function Core({ active, pulse, onPulse, status }: { active: boolean; pulse: number; onPulse: () => void; status?: string }) {
  const facets = useMemo(() => Array.from({ length: 56 }, (_, i) => ({ left: `${8 + ((i * 37) % 84)}%`, top: `${8 + ((i * 61) % 80)}%`, size: 5 + ((i * 17) % 9), rotate: (i * 29) % 90 })), []);
  return <button type="button" className={`oc-core ${active ? "is-active" : ""}`} onClick={onPulse} data-testid="button-pulse-routing" aria-label="Pulse orchestration routing health">
    <span className="oc-core-grid">{facets.map((f, i) => <i key={i} className="oc-facet" style={{ left: f.left, top: f.top, width: f.size, height: f.size, transform: `rotate(${f.rotate}deg)` }} />)}</span><span className="oc-core-rings"><i /><i /><i /></span>{pulse > 0 && <span className="oc-ripple" />}
    <span className="oc-core-chip">ZISHEL SECURE LINK</span><span className="oc-core-center"><span className="oc-core-kicker">MEDICAL AI STATUS</span><strong>{active ? "UPDATING" : (status ?? "UNKNOWN").toUpperCase()}</strong><span className="oc-core-hint">{active ? "syncing with core" : "click to verify link"}</span></span>
  </button>;
}

const navigation = [
  { href: "/", label: "Command", icon: TerminalSquare },
  { href: "/analytics", label: "Analytics", icon: LineChart },
  { href: "/content", label: "Studio & Dossiers", icon: Send },
  { href: "/builder", label: "Builder", icon: Layers3 },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

function DashboardNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useUser(); const { signOut } = useClerk();
  const name = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Operator";
  return <aside className={`oc-sidebar ${open ? "open" : ""}`} aria-label="Operations navigation">
    <div className="oc-brand"><span className="oc-mark"><Activity /></span><span>ZISHEL <b>MED</b></span><button type="button" className="oc-nav-close" onClick={onClose} aria-label="Close navigation" data-testid="button-close-dashboard-navigation"><X /></button></div>
    <div className="oc-side-label">Zishel Command Plane</div>
    <nav>{navigation.map(({ href, label, icon: Icon }) => <DashboardNavLink key={href} href={href} label={label} icon={Icon} onNavigate={onClose} />)}</nav>
    <div className="oc-sidebar-bottom"><div className="oc-operator"><span>{name.slice(0, 1).toUpperCase()}</span><div><b data-testid="text-operator-name">{name}</b><small>licensed operator</small></div></div><button type="button" onClick={() => signOut({ redirectUrl: import.meta.env.BASE_URL })} data-testid="button-sign-out">Выйти</button></div>
  </aside>;
}

function DashboardNavLink({ href, label, icon: Icon, onNavigate }: { href: string; label: string; icon: typeof Activity; onNavigate: () => void }) {
  const [active] = useRoute(href);
  return <Link href={href} className={active ? "selected" : ""} onClick={onNavigate} data-testid={`link-dashboard-${label.toLowerCase()}`}><Icon />{label}</Link>;
}

export default function DashboardPage() {
  const queryClient = useQueryClient(); const [command, setCommand] = useState(""); const [active, setActive] = useState(false); const [pulse, setPulse] = useState(0); const [mobileNav, setMobileNav] = useState(false);
  const { data: summary, isLoading: isLoadingSummary, error: errorSummary } = useGetDashboardSummary();
  const { data: activities, isLoading: isLoadingActivities, error: errorActivities } = useGetActivities(); 
  const { data: agents, isLoading: isLoadingAgents, error: errorAgents } = useGetAgents(); 
  const { data: runs, isLoading: isLoadingRuns, error: errorRuns } = useGetRuns(); 
  const { data: content, isLoading: isLoadingContent } = useGetContent();
  const { data: dossiers, isLoading: isLoadingDossiers } = useGetMedicalDossiers();
  const runCommand = useRunOrchestratorCommand();
  
  useEffect(() => { if (!active) return; const timer = window.setTimeout(() => setActive(false), 1200); return () => window.clearTimeout(timer); }, [active]);
  const pulseCore = () => { setActive(true); setPulse(v => v + 1); };
  
  const submit = (e: React.FormEvent) => { 
    e.preventDefault(); 
    if (!command.trim()) return; 
    pulseCore(); 
    runCommand.mutate({ data: { command } }, { 
      onSuccess: () => { 
        setCommand(""); 
        queryClient.invalidateQueries({ queryKey: getGetRunsQueryKey() }); 
        queryClient.invalidateQueries({ queryKey: getGetActivitiesQueryKey() }); 
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); 
      } 
    }); 
  };
  
  const refresh = () => { 
    pulseCore(); 
    queryClient.invalidateQueries({ queryKey: getGetAgentsQueryKey() }); 
    queryClient.invalidateQueries({ queryKey: getGetRunsQueryKey() }); 
    queryClient.invalidateQueries({ queryKey: getGetActivitiesQueryKey() }); 
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); 
    queryClient.invalidateQueries({ queryKey: getGetContentQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetMedicalDossiersQueryKey() });
  };
  
  return <div className="operations-core bg-zinc-950 text-zinc-100 min-h-[100dvh]">
    <DashboardNav open={mobileNav} onClose={() => setMobileNav(false)} />
    {mobileNav && <button type="button" className="oc-nav-scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation" data-testid="button-dashboard-navigation-scrim" />}
    <main className="oc-main">
    <header className="oc-header border-b border-white/5 bg-zinc-900/50 backdrop-blur">
      <div className="oc-title-wrap">
        <button type="button" className="oc-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation" data-testid="button-open-dashboard-navigation"><Menu /></button>
        <div>
          <div className="oc-eyebrow text-cyan-400 font-bold tracking-widest uppercase text-[10px]">Medical Command Plane</div>
          <h1 className="font-display font-bold text-2xl tracking-wide uppercase">Operations <em>Core</em></h1>
        </div>
      </div>
      <div className="oc-header-actions">
        <div className="oc-live font-mono text-[10px] tracking-widest text-cyan-400 bg-cyan-400/10 px-3 py-1.5 border border-cyan-400/20"><i className="bg-cyan-400" /> SECURE</div>
        <Button variant="outline" size="icon" onClick={refresh} className="border-white/10 hover:bg-white/10 text-zinc-400 hover:text-white rounded-none" data-testid="button-refresh-operations" aria-label="Refresh operations">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
    </header>
    <div className="oc-content p-6 max-w-7xl mx-auto">
      
      {/* Overview & Agents row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
        
        {/* Main Status */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {errorSummary ? <ErrorState error={errorSummary} /> : isLoadingSummary ? <LoadingState /> : (
            <section className="bg-zinc-900 border border-white/5 p-6 h-full flex flex-col">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">01 / ZISHEL READINESS</span>
                  <h2 className="font-display text-xl font-bold uppercase tracking-wider mt-1">System Health</h2>
                </div>
                <Status status={summary?.systemStatus ?? "unknown"} />
              </div>
              <div className="flex-1 flex items-center justify-center py-4">
                <Core active={active} pulse={pulse} onPulse={refresh} status={summary?.systemStatus} />
              </div>
              <div className="grid grid-cols-3 gap-4 border-t border-white/5 pt-6 mt-6">
                <div>
                  <span className="block font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-1">ACTIVE RUNS</span>
                  <b className="text-3xl font-display text-white">{summary?.activeRuns ?? 0}</b>
                </div>
                <div>
                  <span className="block font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-1">CLINICAL SIGNALS</span>
                  <b className="text-3xl font-display text-white">{summary?.insights ?? 0}</b>
                </div>
                <div>
                  <span className="block font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-1">DRAFTS IN REVIEW</span>
                  <b className="text-3xl font-display text-cyan-400">{summary?.drafts ?? 0}</b>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Fleet Presence */}
        <div className="lg:col-span-4 flex flex-col">
          <section className="bg-zinc-900 border border-white/5 p-6 h-full flex flex-col">
            <div className="mb-6">
              <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">02 / FLEET PRESENCE</span>
              <h2 className="font-display text-lg font-bold uppercase tracking-wider mt-1">Medical Agents</h2>
            </div>
            
            <div className="flex-1 flex flex-col gap-3">
              {errorAgents ? <ErrorState error={errorAgents} /> : isLoadingAgents ? <LoadingState /> : agents?.length ? agents.map(agent => (
                <div className="flex items-center gap-3 p-3 bg-zinc-950 border border-white/5 transition-colors hover:border-cyan-500/30" key={agent.id} data-testid={`card-agent-${agent.id}`}>
                  <span className="w-10 h-10 flex items-center justify-center bg-zinc-800 text-cyan-400 font-display font-bold text-sm">{agent.name.slice(0, 2).toUpperCase()}</span>
                  <div className="flex-1 min-w-0">
                    <b className="block text-sm font-bold text-white truncate">{agent.name}</b>
                    <small className="block text-[10px] font-mono text-zinc-500 truncate">{agent.role}</small>
                  </div>
                  <Status status={agent.status} />
                </div>
              )) : <p className="text-center font-mono text-xs text-zinc-600 py-10 border border-dashed border-white/10">NO AGENTS ACTIVE</p>}
            </div>
          </section>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Command Input */}
        <div className="lg:col-span-5 flex flex-col">
          <section className="bg-[hsl(359,30%,20%)] border border-[hsl(359,30%,35%)] p-6 relative overflow-hidden h-full">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[hsl(359,50%,40%)] rounded-full blur-[80px] opacity-20 pointer-events-none" />
            <div className="relative z-10 flex flex-col h-full">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <span className="font-mono text-[10px] text-[hsl(359,30%,70%)] uppercase tracking-widest">03 / DIRECT INSTRUCTION</span>
                  <h2 className="font-display text-xl font-bold uppercase tracking-wider mt-1 text-white">Issue Protocol</h2>
                </div>
                <ShieldAlert className="text-[hsl(359,50%,60%)] w-5 h-5 opacity-50" />
              </div>
              
              <div className="flex-1 flex flex-col justify-end">
                <form className="relative mt-auto" onSubmit={submit}>
                  <Command className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 w-5 h-5" />
                  <input 
                    value={command} 
                    onChange={e => setCommand(e.target.value)} 
                    disabled={runCommand.isPending} 
                    className="w-full bg-zinc-950/80 border border-white/10 text-white placeholder-white/30 h-14 pl-12 pr-24 font-mono text-sm focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all rounded-none"
                    placeholder="Instruct medical orchestration..." 
                    aria-label="Command your agents" 
                    data-testid="input-orchestrator-command" 
                  />
                  <button 
                    type="submit" 
                    disabled={!command.trim() || runCommand.isPending} 
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-white text-zinc-950 hover:bg-cyan-400 text-[10px] font-bold uppercase tracking-wider px-3 h-10 flex items-center gap-1 transition-colors disabled:opacity-50"
                    data-testid="button-send-command"
                  >
                    {runCommand.isPending ? "SENDING" : "EXECUTE"}
                  </button>
                </form>
                {runCommand.isError && <p className="mt-3 text-[10px] font-mono text-red-400" role="alert" data-testid="status-command-error">Instruction failed. Verify connection.</p>}
              </div>
            </div>
          </section>
        </div>

        {/* Live Workstream */}
        <div className="lg:col-span-7 flex flex-col">
          <section className="bg-zinc-900 border border-white/5 p-6 h-full flex flex-col">
            <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
              <div>
                <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">04 / AUDIT TRAIL</span>
                <h2 className="font-display text-lg font-bold uppercase tracking-wider mt-1 text-white">Live Workstream</h2>
              </div>
            </div>
            
            <div className="flex-1 overflow-auto">
              {errorRuns || errorActivities ? <ErrorState error={errorRuns ?? errorActivities!} /> : isLoadingRuns || isLoadingActivities ? <LoadingState /> : (
                <div className="space-y-4">
                  {runs?.slice(0, 2).map(run => (
                    <div className="flex items-center gap-4 p-3 bg-zinc-950 border border-white/5" key={run.id}>
                      <span className="text-xs font-mono text-zinc-400 w-24 truncate">{run.kind}</span>
                      <Status status={run.status} />
                      <time className="text-[10px] font-mono text-zinc-600 ml-auto">{formatDate(run.startedAt)}</time>
                    </div>
                  ))}
                  
                  {activities?.slice(0, 4).map(activity => (
                    <div className="flex items-start gap-4 p-3 hover:bg-zinc-800/50 transition-colors" key={activity.id}>
                      <span className="mt-1 w-5 h-5 flex items-center justify-center rounded-full bg-cyan-400/10 text-cyan-400 border border-cyan-400/20">
                        <Check className="w-3 h-3" />
                      </span>
                      <div className="flex-1">
                        <b className="block text-sm text-white mb-0.5">{activity.title}</b>
                        <small className="block text-xs font-mono text-zinc-500">{activity.agent} · {activity.detail}</small>
                      </div>
                      <time className="text-[10px] font-mono text-zinc-600">{formatDate(activity.timestamp)}</time>
                    </div>
                  ))}
                  
                  {!runs?.length && !activities?.length && (
                    <p className="text-center font-mono text-xs text-zinc-600 py-10 border border-dashed border-white/10">NO AUDIT RECORDS FOUND</p>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>

      </div>
      
      <section className="mt-6 border border-white/5 bg-zinc-900 p-6" data-testid="section-medical-governance-overview">
        <div className="flex flex-col justify-between gap-4 border-b border-white/5 pb-5 sm:flex-row sm:items-end">
          <div><span className="font-mono text-[10px] uppercase tracking-widest text-amber-200">05 / medical governance</span><h2 className="mt-1 font-display text-xl font-bold uppercase tracking-wider">Dossier & review readiness</h2></div>
          <Link href="/content" className="font-mono text-[10px] uppercase tracking-widest text-cyan-300 hover:text-cyan-100">Open studio <ArrowUpRight className="ml-1 inline h-3 w-3" /></Link>
        </div>
        <div className="mt-5 grid gap-px border border-white/5 bg-white/5 sm:grid-cols-3">
          <div className="bg-zinc-950 p-4"><span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Approved dossiers</span><strong className="mt-2 block font-display text-3xl text-cyan-300">{isLoadingDossiers ? "—" : dossiers?.filter((dossier) => dossier.reviewState === "approved").length ?? 0}</strong><small className="mt-1 block text-xs text-zinc-500">of {dossiers?.length ?? 0} workspace dossiers</small></div>
          <div className="bg-zinc-950 p-4"><span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Human review queue</span><strong className="mt-2 block font-display text-3xl text-amber-200">{isLoadingContent ? "—" : content?.filter((item) => item.reviewState !== "approved").length ?? 0}</strong><small className="mt-1 block text-xs text-zinc-500">drafts that require a decision</small></div>
          <div className="bg-zinc-950 p-4"><span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Channel handoff</span><strong className="mt-2 block font-display text-3xl text-white">{isLoadingContent ? "—" : content?.filter((item) => item.reviewState === "approved").length ?? 0}</strong><small className="mt-1 block text-xs text-zinc-500">approved versions; manual only</small></div>
        </div>
      </section>

      <footer className="mt-8 flex justify-between items-center border-t border-white/10 pt-6 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        <span className="flex items-center gap-2"><Sparkles className="w-3 h-3 text-cyan-400" /> Evidence-based precision</span>
        <span className="flex items-center gap-2"><Activity className="w-3 h-3" /> Zishel Medical AI Hub</span>
      </footer>
    </div>
    </main>
  </div>;
}