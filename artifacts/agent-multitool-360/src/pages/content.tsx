import { useState } from "react"
import {
  useGetConnections,
  useGetContent,
  useGenerateContent,
  usePublishContent,
  getGetContentQueryKey,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { 
  Card, CardHeader, CardTitle, CardContent, 
  Button, Input, Label, Textarea, LoadingState, ErrorState, Badge,
} from "@/components/ui"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Send, PenTool, LayoutGrid, ShieldCheck } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

const channelOptions = ["telegram", "vk", "instagram"] as const
type Channel = (typeof channelOptions)[number]

export default function ContentPage() {
  const queryClient = useQueryClient();
  const { data: contents, isLoading, error } = useGetContent();
  const { data: connections } = useGetConnections();
  const generateContent = useGenerateContent();
  const publishContent = usePublishContent();
  const { toast } = useToast();

  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("Professional, authoritative");
  const [channels, setChannels] = useState<Channel[]>(['telegram']);
  const [publication, setPublication] = useState<{
    id: string;
    title: string;
    availableChannels: Channel[];
    channels: Channel[];
  } | null>(null);

  const connectedChannels = new Set(
    connections
      ?.filter((connection) => connection.category === "channel" && connection.status === "connected" && connection.channel)
      .map((connection) => connection.channel as Channel) ?? [],
  );

  const toggleChannel = (channel: Channel) => {
    setChannels(prev => 
      prev.includes(channel) ? prev.filter(c => c !== channel) : [...prev, channel]
    );
  }

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || channels.length === 0) return;
    
    generateContent.mutate({ data: { topic, channels, tone } }, {
      onSuccess: () => {
        setTopic("");
        queryClient.invalidateQueries({ queryKey: getGetContentQueryKey() });
      },
      onError: (mutationError) => toast({
        variant: "destructive",
        title: "Не удалось создать черновик",
        description: mutationError.message,
      }),
    });
  }

  const openPublication = (id: string, title: string, itemChannels: string[]) => {
    const available = itemChannels.filter((channel): channel is Channel =>
      channelOptions.includes(channel as Channel) && connectedChannels.has(channel as Channel),
    );
    setPublication({ id, title, availableChannels: available, channels: available });
  };

  const togglePublicationChannel = (channel: Channel) => {
    setPublication((current) => current
      ? { ...current, channels: current.channels.includes(channel)
        ? current.channels.filter((value) => value !== channel)
        : [...current.channels, channel] }
      : null);
  };

  const confirmPublication = () => {
    if (!publication || publication.channels.length === 0) return;
    publishContent.mutate({ id: publication.id, data: { channels: publication.channels, confirmed: true } }, {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: getGetContentQueryKey() });
        setPublication(null);
        const failed = result.deliveries?.filter((delivery) => delivery.status === "failed") ?? [];
        toast({
          variant: failed.length ? "destructive" : "default",
          title: failed.length ? "Публикация завершена с ошибками" : "Публикация завершена",
          description: failed.length
            ? `Не доставлено: ${failed.map((delivery) => delivery.channel).join(", ")}. Подробности сохранены в журнале.`
            : "Результаты доставки сохранены в журнале workspace.",
        });
      },
      onError: (mutationError) => toast({
        variant: "destructive",
        title: "Публикация не отправлена",
        description: mutationError.message,
      }),
    });
  }

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'published': return 'success';
      case 'scheduled':
      case 'publishing':
      case 'partial': return 'warning';
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
                  {channelOptions.map(ch => (
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
                      onClick={() => openPublication(item.id, item.title, item.channels)}
                      disabled={publishContent.isPending || !item.channels.some((channel) => connectedChannels.has(channel as Channel))}
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
      <AlertDialog open={Boolean(publication)} onOpenChange={(open) => !open && setPublication(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Подтвердить публикацию
            </AlertDialogTitle>
            <AlertDialogDescription>
              Материал «{publication?.title}» будет отправлен в выбранные каналы. Это действие нельзя отменить после приёма каналом.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 border-y py-4">
            <p className="font-mono text-xs text-muted-foreground">ДОСТУПНЫЕ ПОДКЛЮЧЁННЫЕ КАНАЛЫ</p>
            {publication?.availableChannels.length === 0 ? (
              <p className="text-sm text-destructive">Нет подключённых каналов из целей этого черновика. Подключите канал в настройках.</p>
            ) : (
              publication?.availableChannels.map((channel) => (
                <label key={channel} className="flex cursor-pointer items-center justify-between border bg-zinc-50 p-3">
                  <span className="font-display text-sm font-bold uppercase">{channel}</span>
                  <input
                    type="checkbox"
                    checked={publication.channels.includes(channel)}
                    onChange={() => togglePublicationChannel(channel)}
                    className="h-4 w-4 accent-primary"
                  />
                </label>
              ))
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmPublication}
              disabled={publishContent.isPending || !publication?.channels.length}
            >
              {publishContent.isPending ? "Отправляем…" : "Подтверждаю отправку"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
