import { useGetConnections, useHealthCheck } from "@workspace/api-client-react"
import { 
  Card, CardHeader, CardTitle, CardContent, 
  LoadingState, ErrorState, Badge,
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui"
import { ShieldAlert, Network, ServerCrash } from "lucide-react"

export default function SettingsPage() {
  const { data: connections, isLoading: isLoadingConnections, error: errorConnections } = useGetConnections();
  const { data: health, isLoading: isLoadingHealth } = useHealthCheck();

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
