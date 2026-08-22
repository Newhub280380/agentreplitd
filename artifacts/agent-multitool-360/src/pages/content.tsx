import { useState } from "react"
import { useGetContent, useGenerateContent, usePublishContent, getGetContentQueryKey } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { 
  Card, CardHeader, CardTitle, CardContent, 
  Button, Input, Label, Textarea, LoadingState, ErrorState,
  Badge, Select
} from "@/components/ui"
import { Send, PenTool, LayoutGrid } from "lucide-react"
import { formatDate } from "@/lib/utils"

export default function ContentPage() {
  const queryClient = useQueryClient();
  const { data: contents, isLoading, error } = useGetContent();
  const generateContent = useGenerateContent();
  const publishContent = usePublishContent();

  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("Professional, authoritative");
  const [channels, setChannels] = useState<string[]>(['telegram']);

  const toggleChannel = (channel: string) => {
    setChannels(prev => 
      prev.includes(channel) ? prev.filter(c => c !== channel) : [...prev, channel]
    );
  }

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || channels.length === 0) return;
    
    generateContent.mutate({ data: { topic, channels: channels as any, tone } }, {
      onSuccess: () => {
        setTopic("");
        queryClient.invalidateQueries({ queryKey: getGetContentQueryKey() });
      }
    });
  }

  const handlePublish = (id: string, itemChannels: string[]) => {
    publishContent.mutate({ id, data: { channels: itemChannels as any } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetContentQueryKey() });
      }
    });
  }

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'published': return 'success';
      case 'scheduled': return 'warning';
      case 'failed': return 'destructive';
      default: return 'outline';
    }
  }

  return (
    <div className="space-y-6">
      
      <Card className="border-primary/20">
        <CardHeader className="bg-primary/5">
          <CardTitle className="flex items-center gap-2">
            <PenTool className="h-5 w-5 text-primary" />
            Content Assembly
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleGenerate} className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <div className="md:col-span-6 space-y-2">
              <Label>Source Topic / Brief</Label>
              <Textarea 
                value={topic} 
                onChange={e => setTopic(e.target.value)} 
                placeholder="Paste insights or describe the topic to generate..."
                className="h-24 font-mono text-sm"
              />
            </div>
            
            <div className="md:col-span-4 space-y-6">
              <div className="space-y-2">
                <Label>Output Tone</Label>
                <Input 
                  value={tone} 
                  onChange={e => setTone(e.target.value)} 
                  placeholder="e.g. Provocative, analytical..."
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Target Channels</Label>
                <div className="flex flex-wrap gap-2">
                  {['telegram', 'vk', 'instagram'].map(ch => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => toggleChannel(ch)}
                      className={`px-3 py-1.5 text-xs font-display font-bold uppercase tracking-wider border transition-colors ${
                        channels.includes(ch) 
                          ? 'bg-zinc-900 text-white border-zinc-900' 
                          : 'bg-white text-zinc-500 border-zinc-300 hover:border-zinc-500'
                      }`}
                    >
                      {ch}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="md:col-span-2 flex items-end">
              <Button 
                type="submit" 
                size="lg" 
                disabled={generateContent.isPending || !topic.trim() || channels.length === 0}
                className="w-full h-[68px]" // match height of other stacked elements
              >
                {generateContent.isPending ? "GENERATING..." : "GENERATE"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 mb-4 mt-8 px-1">
        <LayoutGrid className="h-5 w-5 text-zinc-400" />
        <h2 className="font-display font-bold uppercase tracking-widest text-lg">Content Repository</h2>
      </div>

      {error ? <ErrorState error={error} /> : isLoading ? <LoadingState /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {contents?.map(item => (
            <Card key={item.id} className="flex flex-col border-zinc-300">
              <CardHeader className="py-3 border-b-zinc-200 bg-white">
                <div className="flex justify-between items-start gap-2">
                  <Badge variant={getStatusColor(item.status)}>{item.status}</Badge>
                  <div className="font-mono text-[10px] text-muted-foreground text-right leading-tight">
                    {formatDate(item.createdAt)}
                  </div>
                </div>
                <CardTitle className="text-base mt-2 line-clamp-2">{item.title}</CardTitle>
              </CardHeader>
              <CardContent className="p-4 flex-1 flex flex-col bg-zinc-50/50">
                <div className="flex-1 overflow-auto relative">
                  {item.imageUrl && (
                    <img src={item.imageUrl} alt="Generated visual" className="w-full h-32 object-cover mb-4 border" />
                  )}
                  <p className="text-sm text-zinc-700 whitespace-pre-wrap font-mono line-clamp-6">
                    {item.body}
                  </p>
                </div>
                <div className="mt-4 pt-4 border-t flex items-center justify-between">
                  <div className="flex gap-1">
                    {item.channels.map(c => (
                      <span key={c} className="text-[10px] font-bold uppercase bg-zinc-200 text-zinc-600 px-1.5 py-0.5">
                        {c}
                      </span>
                    ))}
                  </div>
                  {item.status === 'draft' && (
                    <Button 
                      size="sm" 
                      onClick={() => handlePublish(item.id, item.channels)}
                      disabled={publishContent.isPending}
                    >
                      <Send className="h-3 w-3 mr-2" />
                      Publish
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {!contents?.length && (
            <div className="col-span-full py-12 text-center text-muted-foreground font-mono text-xs border border-dashed border-zinc-300 bg-white">
              NO CONTENT ITEMS
            </div>
          )}
        </div>
      )}
    </div>
  )
}
