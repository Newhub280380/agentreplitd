import { useState } from "react"
import { useGetBuilderJobs, useCreateBuilderJob, useRetryBuilderJob, getGetBuilderJobsQueryKey } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { 
  Card, CardHeader, CardTitle, CardContent, 
  Button, Input, Label, Select, LoadingState, ErrorState, Badge
} from "@/components/ui"
import { Layers, Terminal, RefreshCw, HardDrive } from "lucide-react"
import { formatDate } from "@/lib/utils"

export default function BuilderPage() {
  const queryClient = useQueryClient();
  const { data: jobs, isLoading, error } = useGetBuilderJobs();
  const createJob = useCreateBuilderJob();
  const retryJob = useRetryBuilderJob();

  const [kind, setKind] = useState("install");
  const [instruction, setInstruction] = useState("");
  const [packageManager, setPackageManager] = useState("auto");

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!instruction.trim()) return;
    
    createJob.mutate({ data: { kind: kind as any, instruction, packageManager: packageManager as any } }, {
      onSuccess: () => {
        setInstruction("");
        queryClient.invalidateQueries({ queryKey: getGetBuilderJobsQueryKey() });
      }
    });
  }

  const handleRetry = (id: string) => {
    retryJob.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetBuilderJobsQueryKey() });
      }
    });
  }

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'completed': return 'success';
      case 'running': return 'secondary';
      case 'failed': return 'destructive';
      default: return 'outline';
    }
  }

  return (
    <div className="space-y-6">
      
      <Card className="border-primary/20">
        <CardHeader className="bg-primary/5">
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-primary" />
            Environment Builder
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-2 space-y-2">
              <Label>Action Kind</Label>
              <Select value={kind} onChange={e => setKind(e.target.value)}>
                <option value="install">Install</option>
                <option value="assemble">Assemble</option>
              </Select>
            </div>
            
            <div className="md:col-span-6 space-y-2">
              <Label>Instruction / Packages</Label>
              <Input 
                value={instruction} 
                onChange={e => setInstruction(e.target.value)} 
                placeholder="e.g. framer-motion lucide-react or 'build auth flow'"
                className="font-mono text-sm"
              />
            </div>

            <div className="md:col-span-2 space-y-2">
              <Label>Manager</Label>
              <Select value={packageManager} onChange={e => setPackageManager(e.target.value)}>
                <option value="auto">Auto</option>
                <option value="npm">npm</option>
                <option value="pnpm">pnpm</option>
                <option value="pip">pip</option>
              </Select>
            </div>

            <div className="md:col-span-2">
              <Button 
                type="submit" 
                className="w-full"
                disabled={createJob.isPending || !instruction.trim()}
              >
                {createJob.isPending ? "DISPATCHING..." : "DISPATCH"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 mb-4 mt-8 px-1">
        <Layers className="h-5 w-5 text-zinc-400" />
        <h2 className="font-display font-bold uppercase tracking-widest text-lg">Job Queue & Logs</h2>
      </div>

      {error ? <ErrorState error={error} /> : isLoading ? <LoadingState /> : (
        <div className="space-y-4">
          {jobs?.map(job => (
            <Card key={job.id} className="overflow-hidden">
              <div className="flex items-center justify-between p-4 bg-zinc-50 border-b">
                <div className="flex items-center gap-4">
                  <Badge variant={getStatusColor(job.status)}>{job.status}</Badge>
                  <span className="font-mono text-xs font-bold uppercase">{job.kind}</span>
                  <span className="font-mono text-xs text-muted-foreground">{job.instruction}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-mono text-xs text-muted-foreground">ATTEMPTS: {job.attempts}</span>
                  <span className="font-mono text-xs text-muted-foreground">{formatDate(job.createdAt)}</span>
                  {job.status === 'failed' && (
                    <Button size="sm" variant="outline" onClick={() => handleRetry(job.id)} disabled={retryJob.isPending}>
                      <RefreshCw className="h-3 w-3 mr-2" />
                      Retry
                    </Button>
                  )}
                </div>
              </div>
              {job.logs && job.logs.length > 0 && (
                <div className="p-4 bg-zinc-950 text-zinc-300 font-mono text-xs max-h-64 overflow-auto">
                  {job.logs.map((log, i) => (
                    <div key={i} className="mb-1 opacity-90 hover:opacity-100 flex gap-2">
                      <span className="text-zinc-600 select-none">{'>'}</span>
                      <span className="whitespace-pre-wrap break-all">{log}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
          {!jobs?.length && (
            <div className="py-12 text-center text-muted-foreground font-mono text-xs border border-dashed border-zinc-300 bg-white">
              QUEUE EMPTY
            </div>
          )}
        </div>
      )}
    </div>
  )
}
