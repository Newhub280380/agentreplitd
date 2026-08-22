import { useGetAccountOverview, useGetConnections, useHealthCheck } from "@workspace/api-client-react"
import { 
  Card, CardHeader, CardTitle, CardContent, Button,
  LoadingState, ErrorState, Badge,
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui"
import { ShieldAlert, Network, ServerCrash, CreditCard, Gauge } from "lucide-react"

export default function SettingsPage() {
  const { data: connections, isLoading: isLoadingConnections, error: errorConnections } = useGetConnections();
  const { data: health, isLoading: isLoadingHealth } = useHealthCheck();
  const { data: account, isLoading: isLoadingAccount } = useGetAccountOverview();

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'connected': return 'success';
      case 'configured': return 'warning';
      case 'unavailable': 
      case 'needs_setup': return 'destructive';
      default: return 'outline';
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ServerCrash className="h-5 w-5" />
            System Diagnostic
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingHealth ? <LoadingState /> : (
            <div className="flex items-center gap-6 p-4 border bg-zinc-50">
              <div className="space-y-1">
                <div className="text-xs font-display uppercase tracking-widest text-muted-foreground">API Server</div>
                <div className="font-mono font-bold text-lg">{health ? 'ONLINE' : 'UNREACHABLE'}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs font-display uppercase tracking-widest text-muted-foreground">Status Code</div>
                <div className="font-mono font-bold text-lg text-primary">{health?.status || 'ERR'}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Plan & Workspace
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingAccount ? <LoadingState /> : account ? (
            <div className="space-y-5">
              <div className="flex flex-col justify-between gap-4 border bg-zinc-50 p-4 sm:flex-row sm:items-center">
                <div>
                  <p className="font-display text-lg font-bold uppercase tracking-wide">{account.workspace.name}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    Тариф: <span className="font-bold text-primary">{account.plan.name}</span> · {account.plan.priceLabel}
                  </p>
                </div>
                <Button disabled title="Оплата будет подключена отдельным этапом">Upgrade soon</Button>
              </div>
              <div>
                <div className="mb-3 flex items-center gap-2 font-display text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <Gauge className="h-3.5 w-3.5" /> Использование в текущем месяце
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <UsageMeter label="Runs" used={account.usage.runs} limit={account.usage.limits.runs} />
                  <UsageMeter label="Content" used={account.usage.content} limit={account.usage.limits.content} />
                  <UsageMeter label="Builder jobs" used={account.usage.builderJobs} limit={account.usage.limits.builderJobs} />
                </div>
              </div>
              <p className="font-mono text-xs text-muted-foreground">
                Для будущего перехода будут доступны тарифы «Старт» и «Профессиональный». Списания и платёжные данные пока не включены.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5" />
            External Adapters & Memory
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {errorConnections ? <ErrorState error={errorConnections} /> : isLoadingConnections ? <LoadingState /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Adapter</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-1/2">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connections?.map(conn => (
                  <TableRow key={conn.id}>
                    <TableCell className="font-bold text-sm uppercase">{conn.provider}</TableCell>
                    <TableCell className="font-mono text-xs">{conn.category}</TableCell>
                    <TableCell><Badge variant={getStatusColor(conn.status)}>{conn.status}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{conn.detail}</TableCell>
                  </TableRow>
                ))}
                {!connections?.length && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground font-mono text-xs">
                      NO ADAPTERS CONFIGURED
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="h-5 w-5" />
            Security & Identity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-mono text-destructive/80 mb-4">
            System credentials and memory anchors are managed via Replit Secrets. Do not expose connection strings in UI.
          </p>
        </CardContent>
      </Card>

    </div>
  )
}

function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const percent = Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  return (
    <div className="border bg-white p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-xs font-bold uppercase tracking-wider">{label}</span>
        <span className="font-mono text-xs text-muted-foreground">{used} / {limit}</span>
      </div>
      <div className="mt-3 h-1.5 bg-zinc-100">
        <div className="h-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
