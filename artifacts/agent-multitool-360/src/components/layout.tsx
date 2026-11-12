import { ReactNode, useEffect, useRef, useState } from "react"
import { useClerk, useUser } from "@clerk/react"
import { Link, useLocation, useRoute } from "wouter"
import { Activity, BarChart3, Layers3, Menu, Send, Settings2, TerminalSquare, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useHealthCheck } from "@workspace/api-client-react"
import "@/styles/workspace-shell.css"
import "@/styles/workspace-theme-overrides.css"
import "@/styles/workspace-accessibility.css"

const navigation = [
  { href: "/", label: "Command", icon: TerminalSquare },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/content", label: "Studio & Dossiers", icon: Send },
  { href: "/builder", label: "Builder", icon: Layers3 },
  { href: "/settings", label: "Settings", icon: Settings2 },
]
const pageLabels: Record<string, { eyebrow: string; title: string }> = {
  "/analytics": { eyebrow: "02 / CLINICAL INTELLIGENCE", title: "Analytics Field" },
  "/content": { eyebrow: "03 / GOVERNANCE", title: "Medical Studio" },
  "/builder": { eyebrow: "04 / SYSTEMS", title: "Protocol Builder" },
  "/settings": { eyebrow: "05 / CONTROL PLANE", title: "Workspace Settings" },
}

function NavItem({ href, icon: Icon, children, onNavigate }: { href: string; icon: typeof Activity; children: ReactNode; onNavigate: () => void }) {
  const [isActive] = useRoute(href)
  return <Link href={href} onClick={onNavigate} data-testid={`link-workspace-${href === "/" ? "command" : href.slice(1)}`} className={cn("workspace-nav-link", isActive && "is-active")}><Icon /> <span>{children}</span></Link>
}

export function Layout({ children }: { children: ReactNode }) {
  const { data: health, isLoading: isHealthLoading, isError: isHealthError } = useHealthCheck()
  const { user } = useUser()
  const { signOut } = useClerk()
  const [location] = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const railRef = useRef<HTMLElement>(null)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)
  const wasMobileOpen = useRef(false)
  const displayName = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Operator"
  const page = pageLabels[location] ?? { eyebrow: "CONTROL PLANE", title: "Workspace" }
  const close = () => setMobileOpen(false)
  const isModalNav = isMobile && mobileOpen
  const healthState = isHealthLoading ? { label: "PENDING", className: "is-pending", description: "Health check is loading" } : isHealthError ? { label: "OFFLINE", className: "is-offline", description: "Health check failed" } : health ? { label: health.status, className: "is-online", description: `System status: ${health.status}` } : { label: "UNKNOWN", className: "is-unknown", description: "System health has not reported a status" }

  useEffect(() => {
    const query = window.matchMedia("(max-width: 680px)")
    const update = () => {
      setIsMobile(query.matches)
      if (!query.matches) setMobileOpen(false)
    }
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])

  useEffect(() => {
    if (!isModalNav) {
      if (wasMobileOpen.current) menuTriggerRef.current?.focus()
      wasMobileOpen.current = false
      return
    }
    wasMobileOpen.current = true
    const rail = railRef.current
    const focusable = () => Array.from(rail?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []).filter(element => !element.hasAttribute("aria-hidden"))
    const closeButton = rail?.querySelector<HTMLElement>(".workspace-close")
    closeButton?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); return }
      if (event.key !== "Tab") return
      const items = focusable()
      if (!items.length) return
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [isModalNav])

  return <div className="workspace-shell">
    <aside ref={railRef} className={cn("workspace-rail", mobileOpen && "is-open")} aria-label="Workspace navigation" aria-hidden={isMobile && !mobileOpen}>
      <div className="workspace-brand"><span className="workspace-mark text-cyan-400"><Activity /></span><span className="font-display tracking-widest text-sm">ZISHEL <b>MED</b></span><button type="button" className="workspace-close" onClick={close} aria-label="Close navigation" data-testid="button-close-workspace-navigation"><X /></button></div>
      <p className="workspace-nav-label text-cyan-400">Command Plane</p>
      <nav>{navigation.map(({ href, label, icon }) => <NavItem key={href} href={href} icon={icon} onNavigate={close}>{label}</NavItem>)}</nav>
      <div className="workspace-account"><div className="workspace-identity"><span className="bg-zinc-800 text-cyan-400 font-bold">{displayName.slice(0, 1).toUpperCase()}</span><div><b data-testid="text-workspace-operator" className="text-zinc-200">{displayName}</b><small className="text-zinc-500">licensed operator</small></div></div><button type="button" onClick={() => signOut({ redirectUrl: import.meta.env.BASE_URL })} data-testid="button-workspace-sign-out" className="hover:text-cyan-400 transition-colors">Выйти</button></div>
    </aside>
    {mobileOpen && <button type="button" className="workspace-scrim" onClick={close} aria-label="Close navigation" data-testid="button-workspace-navigation-scrim" />}
    <main className="workspace-main" inert={isModalNav}>
      <header className="workspace-header"><div className="workspace-title"><button ref={menuTriggerRef} type="button" className="workspace-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation" data-testid="button-open-workspace-navigation"><Menu /></button><div><p className="text-cyan-400 font-bold tracking-widest">{page.eyebrow}</p><h1 className="font-display uppercase tracking-wider">{page.title}</h1></div></div><div className="workspace-health" role="status" aria-label={healthState.description} data-testid="status-workspace-health"><span className={healthState.className} style={{backgroundColor: "var(--color-primary)"}} /> <b>{healthState.label}</b><small>medical link</small></div></header>
      <div className="workspace-scroll"><div className="workspace-content">{children}</div></div>
    </main>
  </div>
}