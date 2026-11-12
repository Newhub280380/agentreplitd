import { useState } from "react"
import {
  getGetConnectionsQueryKey,
  useCheckChannelConnection,
  useConnectChannel,
  useCreateBillingCheckout,
  useCreateBillingPortal,
  useDisconnectChannel,
  useGetAccountOverview,
  useGetActivities,
  useGetConnections,
  useHealthCheck,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { 
  Card, CardHeader, CardTitle, CardContent, Button,
  LoadingState, ErrorState, Badge, Input, Label,
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ShieldAlert, Network, ServerCrash, CreditCard, Gauge, History, Link2, RefreshCw, Unplug } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: connections, isLoading: isLoadingConnections, error: errorConnections } = useGetConnections();
  const { data: activities } = useGetActivities();
  const { data: health, isLoading: isLoadingHealth } = useHealthCheck();
  const { data: account, isLoading: isLoadingAccount } = useGetAccountOverview();
  const { toast } = useToast();
  const [connectOpen, setConnectOpen] = useState(false);
  const [provider, setProvider] = useState<"telegram" | "vk">("telegram");
  const [target, setTarget] = useState("");
  const [credential, setCredential] = useState("");
  const refreshConnections = () => queryClient.invalidateQueries({ queryKey: getGetConnectionsQueryKey() });
  const connectChannel = useConnectChannel({
    mutation: {
      onSuccess: () => {
        setConnectOpen(false);
        setTarget("");
        setCredential("");
        refreshConnections();
        toast({ title: "Канал подключён", description: "Настройка сохранена в вашей workspace в зашифрованном виде." });
      },
      onError: (mutationError) => toast({
        variant: "destructive",
        title: "Не удалось подключить канал",
        description: mutationError.message,
      }),
    },
  });
  const checkChannel = useCheckChannelConnection({
    mutation: {
      onSuccess: (connection) => {
        refreshConnections();
        toast({
          title: connection.status === "connected" ? "Проверка пройдена" : "Требуется настройка",
          description: connection.detail,
          variant: connection.status === "connected" ? "default" : "destructive",
        });
      },
      onError: (mutationError) => toast({ variant: "destructive", title: "Проверка не выполнена", description: mutationError.message }),
    },
  });
  const disconnectChannel = useDisconnectChannel({
    mutation: {
      onSuccess: () => {
        refreshConnections();
        toast({ title: "Канал отключён", description: "Публикации в эту цель больше не будут отправляться." });
      },
      onError: (mutationError) => toast({ variant: "destructive", title: "Не удалось отключить канал", description: mutationError.message }),
    },
  });
  const checkout = useCreateBillingCheckout({
    mutation: {
      onSuccess: ({ url }) => window.location.assign(url),
      onError: (error) => toast({
        variant: "destructive",
        title: "Не удалось открыть оплату",
        description: error.message,
      }),
    },
  });
  const portal = useCreateBillingPortal({
    mutation: {
      onSuccess: ({ url }) => window.location.assign(url),
      onError: (error) => toast({
        variant: "destructive",
        title: "Не удалось открыть управление подпиской",
        description: error.message,
      }),
    },
  });

  const startCheckout = (planId: string) => {
    if (planId !== "starter" && planId !== "pro") return;
    checkout.mutate({ data: { plan: planId } });
  };

  const openConnect = (channel: "telegram" | "vk" = "telegram") => {
    setProvider(channel);
    setTarget("");
    setCredential("");
    setConnectOpen(true);
  };

  const submitConnection = (event: React.FormEvent) => {
    event.preventDefault();
    if (!target.trim() || !credential.trim()) return;
    connectChannel.mutate({ data: { provider, target: target.trim(), credential: credential.trim() } });
  };

  const publicationHistory = activities
    ?.filter((activity) => activity.agent === "Продавец" && /(канал|публик)/i.test(`${activity.title} ${activity.detail}`))
    .slice(0, 6) ?? [];

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
                    <p className="mt-2 font-mono text-xs text-muted-foreground">
                      Подписка Stripe: <span className="font-bold text-zinc-900">{subscriptionStatusLabel(account.subscription.status)}</span>
                      {account.subscription.cancelAtPeriodEnd ? " · отмена в конце периода" : ""}
                    </p>
                </div>
                  {account.subscription.manageAvailable && (
                    <Button
                      variant="outline"
                      disabled={portal.isPending}
                      onClick={() => portal.mutate()}
                    >
                      {portal.isPending ? "Открываем…" : "Управлять подпиской"}
                    </Button>
                  )}
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
              <div className="space-y-3">
                <div className="font-display text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Выберите тариф
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {account.plans
                    .filter((plan) => plan.id !== "free")
                    .map((plan) => {
                      const isCurrent = account.workspace.plan === plan.id && ["active", "trialing"].includes(account.subscription.status);
                      return (
                        <div key={plan.id} className="border bg-white p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-display text-base font-bold uppercase tracking-wide">{plan.name}</p>
                              <p className="mt-1 font-mono text-xs text-primary">{plan.priceLabel}</p>
                            </div>
                            {isCurrent && <Badge variant="success">текущий</Badge>}
                          </div>
                          <p className="mt-3 min-h-10 text-sm text-muted-foreground">{plan.description}</p>
                          <p className="mt-3 font-mono text-xs text-muted-foreground">
                            {plan.limits.runs} запусков · {plan.limits.content} материалов · {plan.limits.builderJobs} сборок
                          </p>
                          <Button
                            className="mt-4 w-full"
                            disabled={isCurrent || checkout.isPending}
                            onClick={() => startCheckout(plan.id)}
                          >
                            {isCurrent ? "Текущий тариф" : checkout.isPending ? "Открываем оплату…" : `Выбрать «${plan.name}»`}
                          </Button>
                        </div>
                      );
                    })}
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                  Оплата проходит на защищённой странице Stripe. Лимиты изменятся только после подтверждения платежа.
                </p>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5" />
            External Adapters & Publishing Channels
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
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connections?.map(conn => (
                  <TableRow key={conn.id}>
                    <TableCell className="font-bold text-sm uppercase">{conn.provider}</TableCell>
                    <TableCell className="font-mono text-xs">{conn.category}</TableCell>
                    <TableCell><Badge variant={getStatusColor(conn.status)}>{conn.status}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{conn.detail}</TableCell>
                    <TableCell>
                      {conn.category === "channel" && conn.channel ? (
                        <div className="flex flex-wrap gap-2">
                          {conn.canDisconnect ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => checkChannel.mutate({ id: conn.id })}
                                disabled={checkChannel.isPending}
                              >
                                <RefreshCw className="h-3.5 w-3.5" /> Проверить
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  if (window.confirm(`Отключить ${conn.provider}? Публикация в ${conn.target ?? "эту цель"} станет недоступна.`)) {
                                    disconnectChannel.mutate({ id: conn.id });
                                  }
                                }}
                                disabled={disconnectChannel.isPending}
                              >
                                <Unplug className="h-3.5 w-3.5" /> Отключить
                              </Button>
                            </>
                          ) : (
                            conn.channel === "telegram" || conn.channel === "vk" ? (
                              <Button size="sm" onClick={() => openConnect(conn.channel === "vk" ? "vk" : "telegram")}>
                                <Link2 className="h-3.5 w-3.5" /> Подключить
                              </Button>
                            ) : (
                              <span className="font-mono text-[10px] text-muted-foreground">INTEGRATION UNAVAILABLE</span>
                            )
                          )}
                        </div>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {!connections?.length && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground font-mono text-xs">
                      NO ADAPTERS CONFIGURED
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
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Publication History
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {publicationHistory.length ? publicationHistory.map((activity) => (
            <div key={activity.id} className="flex items-start justify-between gap-4 border bg-zinc-50 p-3">
              <div>
                <p className="font-display text-sm font-bold uppercase">{activity.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{activity.detail}</p>
              </div>
              <Badge variant={getStatusColor(activity.status)}>{activity.status}</Badge>
            </div>
          )) : (
            <p className="border border-dashed p-4 text-center font-mono text-xs text-muted-foreground">
              ПУБЛИКАЦИЙ ЕЩЁ НЕ БЫЛО
            </p>
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
            Ключи каналов хранятся только в Replit Secrets. Эта страница никогда не запрашивает и не показывает токены.
          </p>
        </CardContent>
      </Card>

      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Подключить канал публикации</DialogTitle>
            <DialogDescription>
              Укажите цель и доступ этого канала. Доступ отправляется один раз по защищённому соединению, шифруется в вашей workspace и никогда не показывается повторно.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitConnection} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="channel-provider">Канал</Label>
              <select
                id="channel-provider"
                value={provider}
                onChange={(event) => setProvider(event.target.value as typeof provider)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="telegram">Telegram</option>
                <option value="vk">VK</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="channel-target">Цель публикации</Label>
              <Input
                id="channel-target"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                placeholder={provider === "telegram" ? "@my_channel или -100…" : "Числовой ID сообщества"}
                maxLength={200}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="channel-credential">Доступ канала</Label>
              <Input
                id="channel-credential"
                type="password"
                value={credential}
                onChange={(event) => setCredential(event.target.value)}
                placeholder={provider === "telegram" ? "Токен бота" : "Токен сообщества"}
                autoComplete="new-password"
              />
              <p className="font-mono text-xs text-muted-foreground">
                Поле не сохраняется в браузере и не возвращается API после проверки.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConnectOpen(false)}>Отмена</Button>
              <Button type="submit" disabled={connectChannel.isPending || !target.trim() || !credential.trim()}>
                {connectChannel.isPending ? "Подключаем…" : "Подключить"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function subscriptionStatusLabel(status: string) {
  const labels: Record<string, string> = {
    inactive: "не активна",
    incomplete: "ожидает оплаты",
    incomplete_expired: "не завершена",
    trialing: "пробный период",
    active: "активна",
    past_due: "есть задолженность",
    canceled: "отменена",
    unpaid: "не оплачена",
    paused: "приостановлена",
  };
  return labels[status] ?? status;
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
