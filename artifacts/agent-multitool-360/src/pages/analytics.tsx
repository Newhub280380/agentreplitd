import { useState } from "react"
import { useGetInsights, useStartAnalysis, getGetInsightsQueryKey } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { 
  Card, CardHeader, CardTitle, CardContent, 
  Button, Input, Label, LoadingState, ErrorState,
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell, Badge
} from "@/components/ui"
import { Activity, Target, Zap } from "lucide-react"
import { formatDate } from "@/lib/utils"

export default function AnalyticsPage() {
  const queryClient = useQueryClient();
  const { data: insights, isLoading, error } = useGetInsights();
  const startAnalysis = useStartAnalysis();

  const [niche, setNiche] = useState("");
  const [sources, setSources] = useState<string[]>(['youtube', 'telegram']);

  const toggleSource = (source: string) => {
    setSources(prev => 
      prev.includes(source) ? prev.filter(s => s !== source) : [...prev, source]
    );
  }

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!niche.trim() || sources.length === 0) return;
    
    // cast to any to bypass exact item enum type mismatch in this generic array
    startAnalysis.mutate({ data: { niche, sources: sources as any } }, {
      onSuccess: () => {
        setNiche("");
        queryClient.invalidateQueries({ queryKey: getGetInsightsQueryKey() });
      }
    });
  }

  return (
    <div className="space-y-6">
      
      <Card className="border-primary/20">
        <CardHeader className="bg-primary/5">
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Launch Market Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleStart} className="flex flex-col md:flex-row gap-6 items-end">
            <div className="flex-1 w-full space-y-2">
              <Label>Target Niche / Topic</Label>
              <Input 
                value={niche} 
                onChange={e => setNiche(e.target.value)} 
                placeholder="e.g. AI tools for video editing, B2B SaaS marketing..."
                className="font-mono text-sm"
              />
            </div>
            
            <div className="flex-1 w-full space-y-2">
              <Label>Data Sources</Label>
              <div className="flex flex-wrap gap-2">
                {['youtube', 'telegram', 'tiktok', 'google'].map(src => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => toggleSource(src)}
                    className={`px-3 py-2 text-xs font-display font-bold uppercase tracking-wider border transition-colors ${
                      sources.includes(src) 
                        ? 'bg-zinc-900 text-white border-zinc-900' 
                        : 'bg-white text-zinc-500 border-zinc-300 hover:border-zinc-500'
                    }`}
                  >
                    {src}
                  </button>
                ))}
              </div>
            </div>

            <Button 
              type="submit" 
              size="lg" 
              disabled={startAnalysis.isPending || !niche.trim() || sources.length === 0}
              className="w-full md:w-auto"
            >
              <Activity className="h-4 w-4 mr-2" />
              {startAnalysis.isPending ? "INITIALIZING..." : "START SCAN"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Discovered Insights</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {error ? <ErrorState error={error} /> : isLoading ? <LoadingState /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Score</TableHead>
                  <TableHead>Trend & Conclusion</TableHead>
                  <TableHead>Metrics</TableHead>
                  <TableHead className="w-32 text-right">Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {insights?.map(insight => (
                  <TableRow key={insight.id}>
                    <TableCell>
                      <div className="flex flex-col items-center justify-center h-12 w-12 bg-zinc-100 border font-mono font-bold text-lg text-primary">
                        {insight.score}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-bold text-sm mb-1">{insight.trend}</div>
                      <div className="text-xs text-muted-foreground">{insight.conclusion}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-xs">
                        <span className="flex items-center gap-1"><Zap className="h-3 w-3 text-amber-500" /> {insight.reach}</span>
                        <span className="font-mono text-zinc-500 uppercase">EMO: {insight.emotion}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline">{insight.source}</Badge>
                      {insight.createdAt && (
                        <div className="font-mono text-[10px] text-muted-foreground mt-2">
                          {formatDate(insight.createdAt).split(' ')[0]}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!insights?.length && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground font-mono text-xs">
                      NO INSIGHTS IN DATABASE
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

    </div>
  )
}
