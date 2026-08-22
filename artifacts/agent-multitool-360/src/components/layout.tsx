import { ReactNode } from "react"
import { useClerk, useUser } from "@clerk/react"
import { Link, useRoute } from "wouter"
import { 
  TerminalSquare, 
  LineChart, 
  Send, 
  Settings, 
  Layers,
  Activity
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useHealthCheck } from "@workspace/api-client-react"

const NavItem = ({ href, icon: Icon, children }: { href: string, icon: any, children: ReactNode }) => {
  const [isActive] = useRoute(href);
  return (
    <Link href={href} className={cn(
      "flex items-center gap-3 px-4 py-3 text-sm font-display font-medium transition-colors border-l-4 uppercase tracking-wider",
      isActive 
        ? "border-primary bg-zinc-900 text-white" 
        : "border-transparent text-zinc-400 hover:text-white hover:bg-zinc-900/50"
    )}>
      <Icon className="h-4 w-4" />
      {children}
    </Link>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const { data: health } = useHealthCheck();
  const { user } = useUser();
  const { signOut } = useClerk();
  const displayName = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Клиент";

  return (
    <div className="flex h-screen bg-background font-sans text-foreground selection:bg-primary selection:text-white overflow-hidden">
      {/* Sidebar */}
      <nav className="w-64 bg-zinc-950 flex flex-col border-r border-zinc-800">
        <div className="h-14 flex items-center px-4 border-b border-zinc-800">
          <div className="flex items-center gap-2 text-white font-display font-bold uppercase tracking-widest text-sm">
            <Activity className="h-4 w-4 text-primary" />
            Multitool 360
          </div>
        </div>
        
        <div className="flex-1 py-4 flex flex-col gap-1">
          <NavItem href="/" icon={TerminalSquare}>Command</NavItem>
          <NavItem href="/analytics" icon={LineChart}>Analytics</NavItem>
          <NavItem href="/content" icon={Send}>Content</NavItem>
          <NavItem href="/builder" icon={Layers}>Builder</NavItem>
        </div>

        <div className="border-t border-zinc-800 py-4 flex flex-col gap-1">
          <NavItem href="/settings" icon={Settings}>Settings</NavItem>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen relative">
        <header className="h-14 border-b bg-white flex items-center justify-between px-6 z-10">
          <h1 className="font-display font-bold uppercase tracking-widest text-sm text-zinc-800">
            Operations Console
          </h1>
          <div className="flex items-center gap-4">
            <span className="font-mono text-xs text-zinc-500 uppercase">SYS_STATUS:</span>
            {health ? (
              <span className="flex items-center gap-1.5 font-mono text-xs font-bold text-emerald-600">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                {health.status}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 font-mono text-xs font-bold text-amber-500">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                PENDING
              </span>
            )}
            <div className="hidden items-center gap-2 border-l pl-4 sm:flex">
              <div className="grid h-7 w-7 place-items-center rounded-full bg-zinc-950 font-mono text-xs font-bold text-primary">
                {displayName.slice(0, 1).toUpperCase()}
              </div>
              <div className="max-w-36">
                <p className="truncate font-display text-xs font-bold uppercase tracking-wide text-zinc-800">{displayName}</p>
                <button
                  type="button"
                  onClick={() => signOut({ redirectUrl: import.meta.env.BASE_URL })}
                  className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 hover:text-primary"
                >
                  Выйти
                </button>
              </div>
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-6 bg-zinc-100/50">
          <div className="max-w-7xl mx-auto space-y-6">
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}
