import { useState, useRef } from "react"
import { 
  useGetDashboardSummary, 
  useGetActivities, 
  useGetAgents, 
  useRunOrchestratorCommand,
  useGetRuns,
  getGetRunsQueryKey,
  getGetActivitiesQueryKey,
  getGetDashboardSummaryQueryKey
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { 
  Card, CardHeader, CardTitle, CardContent, 
  Input, Button, LoadingState, ErrorState,
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
  Badge
} from "@/components/ui"
import { formatDate } from "@/lib/utils"
import { Terminal, ArrowRight, Play, CheckCircle2, XCircle, AlertTriangle, Clock } from "lucide-react"

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [command, setCommand] = useState("");
  
  const { data: summary, isLoading: isLoadingSummary, error: errorSummary } = useGetDashboardSummary();
  const { data: activities, isLoading: isLoadingActivities } = useGetActivities();
  const { data: agents, isLoading: isLoadingAgents } = useGetAgents();
  const { data: runs, isLoading: isLoadingRuns } = useGetRuns();

  const runCommand = useRunOrchestratorCommand();

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;
    
    runCommand.mutate({ data: { command } }, {
      onSuccess: () => {
        setCommand("");
        queryClient.invalidateQueries({ queryKey: getGetRunsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetActivitiesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      }
    });
  }

  const getStatusBadge = (status: string) => {
    switch(status.toLowerCase()) {
      case 'success':
      case 'completed':
      case 'online':
      case 'operational':
        return <Badge variant="success">{status}</Badge>
      case 'running':
      case 'queued':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-200">{status}</Badge>
      case 'failed':
      case 'offline':
        return <Badge variant="destructive">{status}</Badge>
      case 'warning':
      case 'attention':
      case 'degraded':
        return <Badge variant="warning">{status}</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      
      {/* Command Input */}
      <Card className="border-primary/20 shadow-sm overflow-hidden bg-zinc-950 text-white">
        <div className="p-1 px-4 bg-primary text-primary-foreground font-mono text-xs font-bold uppercase tracking-widest flex items-center gap-2">
          <Terminal className="h-3 w-3" />
          Orchestrator Input
        </div>
        <CardContent className="p-4">
          <form onSubmit={handleCommandSubmit} className="flex gap-4 items-center">
            <div className="text-primary font-mono font-bold text-lg">{'>'}</div>
            <input
              autoFocus
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="Deploy analysis on AI tools, assemble report, draft for TG..."
              className="flex-1 bg-transparent border-none outline-none font-mono text-sm placeholder:text-zinc-600 text-white"
              disabled={runCommand.isPending}
            />
            <Button 
              type="submit" 
              disabled={!command.trim() || runCommand.isPending}
              className="font-mono"
            >
              {runCommand.isPending ? "EXECUTING..." : "EXECUTE"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Summary Metrics */}
      {errorSummary ? (
        <ErrorState error={errorSummary} />
      ) : isLoadingSummary ? (
        <LoadingState />
      ) : summary ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <MetricCard title="System Status" value={getStatusBadge(summary.systemStatus)} />
          <MetricCard title="Active Runs" value={summary.activeRuns} />
          <MetricCard title="Insights" value={summary.insights} />
          <MetricCard title="Content Drafts" value={summary.drafts} />
          <MetricCard title="Channels" value={summary.connectedChannels} />
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Col: Agents */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Agent Fleet</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoadingAgents ? <LoadingState /> : (
                <div className="divide-y">
                  {agents?.map(agent => (
                    <div key={agent.id} className="p-4 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="font-display font-bold uppercase tracking-wider text-sm">{agent.name}</span>
                        {getStatusBadge(agent.status)}
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">{agent.role}</span>
                      <div className="mt-2 bg-zinc-50 p-2 border font-mono text-xs">
                        {agent.metric}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Center/Right Col: Activity & Runs */}
        <div className="lg:col-span-2 space-y-6">
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent Runs</CardTitle>
              <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: getGetRunsQueryKey() })}>
                Refresh
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {isLoadingRuns ? <LoadingState /> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Run ID</TableHead>
                      <TableHead>Kind</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Started</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs?.slice(0, 5).map(run => (
                      <TableRow key={run.id}>
                        <TableCell className="font-mono text-xs">{run.id.split('-')[0]}</TableCell>
                        <TableCell className="uppercase text-xs font-bold">{run.kind}</TableCell>
                        <TableCell>{getStatusBadge(run.status)}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{formatDate(run.startedAt)}</TableCell>
                      </TableRow>
                    ))}
                    {!runs?.length && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-6 text-muted-foreground font-mono text-xs">
                          NO RUNS RECORDED
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>System Log</CardTitle>
            </CardHeader>
            <CardContent className="p-0 max-h-[400px] overflow-auto">
              {isLoadingActivities ? <LoadingState /> : (
                <Table>
                  <TableBody>
                    {activities?.map(activity => (
                      <TableRow key={activity.id}>
                        <TableCell className="w-8 pl-4 pr-0">
                          {activity.status === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                          {activity.status === 'failed' && <XCircle className="h-4 w-4 text-red-500" />}
                          {activity.status === 'warning' && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                          {activity.status === 'running' && <Play className="h-4 w-4 text-blue-500" />}
                        </TableCell>
                        <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                          {formatDate(activity.timestamp).split(' ')[1]}
                        </TableCell>
                        <TableCell className="font-bold text-xs uppercase w-32">{activity.agent}</TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">{activity.title}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{activity.detail}</div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  )
}

function MetricCard({ title, value }: { title: string, value: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4 flex flex-col items-start gap-2">
        <span className="font-display text-xs uppercase tracking-widest text-muted-foreground">{title}</span>
        <div className="font-mono text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  )
}
