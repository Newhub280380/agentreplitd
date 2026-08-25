import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  getGetContentQueryKey,
  getGetMedicalDossiersQueryKey,
  useCreateMedicalDossier,
  useGenerateContent,
  useGetContent,
  useGetMedicalDossiers,
  useReviewContent,
  useUpdateMedicalDossier,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BadgeCheck, BookOpenCheck, CheckCircle2, FilePenLine, LockKeyhole, Plus, Save, ShieldAlert, Sparkles } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, ErrorState, Input, Label, LoadingState, Textarea } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";

const contentFormats = [
  ["expert_post", "Экспертный пост"],
  ["product_card", "Карточка продукта"],
  ["reels_brief", "Reels brief"],
  ["sales_message", "Sales message"],
] as const;

const reviewStates = [
  ["needs_evidence", "Нужны доказательства"],
  ["in_review", "На review"],
  ["approved", "Утверждён"],
  ["changes_requested", "Нужны правки"],
] as const;

type Format = (typeof contentFormats)[number][0];
type DossierReviewState = (typeof reviewStates)[number][0];

function lines(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function DossierState({ state }: { state: string }) {
  const tone = state === "approved"
    ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200"
    : state === "changes_requested"
      ? "border-red-400/30 bg-red-400/10 text-red-200"
      : "border-amber-300/30 bg-amber-300/10 text-amber-100";
  return <span className={`inline-flex border px-2 py-1 font-mono text-[10px] uppercase tracking-wider ${tone}`} data-testid={`status-dossier-${state}`}>{state.replaceAll("_", " ")}</span>;
}

function ContentState({ state }: { state: string }) {
  const tone = state === "approved"
    ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200"
    : state === "changes_requested"
      ? "border-red-400/30 bg-red-400/10 text-red-200"
      : "border-amber-300/30 bg-amber-300/10 text-amber-100";
  return <Badge className={`rounded-none border font-mono text-[10px] uppercase tracking-wider ${tone}`} variant="outline">{state.replaceAll("_", " ")}</Badge>;
}

export default function MedicalStudio() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: dossiers, isLoading: dossiersLoading, error: dossiersError } = useGetMedicalDossiers();
  const { data: content, isLoading: contentLoading, error: contentError } = useGetContent();
  const createDossier = useCreateMedicalDossier();
  const updateDossier = useUpdateMedicalDossier();
  const generateContent = useGenerateContent();
  const reviewContent = useReviewContent();

  const [selectedDossierId, setSelectedDossierId] = useState("");
  const selectedDossier = useMemo(
    () => dossiers?.find((dossier) => dossier.id === selectedDossierId) ?? null,
    [dossiers, selectedDossierId],
  );
  const [name, setName] = useState("Zishell Rose Glam");
  const [volume, setVolume] = useState("10 ml");
  const [sourceLinks, setSourceLinks] = useState("");
  const [registrationSafety, setRegistrationSafety] = useState("Добавьте ссылку на регистрацию, инструкцию и подтверждённые safety-факты. Не используйте материал до review лицензированным специалистом.");
  const [approvedClaims, setApprovedClaims] = useState("");
  const [audiences, setAudiences] = useState("Лицензированные специалисты эстетической медицины");
  const [dossierReviewState, setDossierReviewState] = useState<DossierReviewState>("needs_evidence");
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("Уверенный, доброжелательный, профессиональный");
  const [format, setFormat] = useState<Format>("expert_post");
  const [reviewer, setReviewer] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewAttested, setReviewAttested] = useState(false);

  useEffect(() => {
    if (!selectedDossierId && dossiers?.[0]) setSelectedDossierId(dossiers[0].id);
  }, [dossiers, selectedDossierId]);

  useEffect(() => {
    if (!selectedDossier) return;
    setName(selectedDossier.name);
    setVolume(selectedDossier.volume);
    setSourceLinks(selectedDossier.sourceLinks.join("\n"));
    setRegistrationSafety(selectedDossier.registrationSafety);
    setApprovedClaims(selectedDossier.approvedClaims.join("\n"));
    setAudiences(selectedDossier.audiences.join("\n"));
    setDossierReviewState(selectedDossier.reviewState as DossierReviewState);
  }, [selectedDossier]);

  const invalidateDossiers = () => queryClient.invalidateQueries({ queryKey: getGetMedicalDossiersQueryKey() });
  const invalidateContent = () => queryClient.invalidateQueries({ queryKey: getGetContentQueryKey() });

  const saveDossier = (event: FormEvent) => {
    event.preventDefault();
    const data = {
      name,
      volume,
      sourceLinks: lines(sourceLinks),
      registrationSafety,
      approvedClaims: lines(approvedClaims),
      audiences: lines(audiences),
      reviewState: dossierReviewState,
    };
    const onSuccess = (dossier: { id: string }) => {
      setSelectedDossierId(dossier.id);
      void invalidateDossiers();
      toast({ title: "Dossier сохранён", description: "Источники, claims и review-state записаны в изолированное workspace." });
    };
    if (selectedDossier) {
      updateDossier.mutate({ id: selectedDossier.id, data }, {
        onSuccess,
        onError: (error) => toast({ title: "Dossier не сохранён", description: error.message, variant: "destructive" }),
      });
      return;
    }
    createDossier.mutate({ data }, {
      onSuccess,
      onError: (error) => toast({ title: "Dossier не создан", description: error.message, variant: "destructive" }),
    });
  };

  const newDossier = () => {
    setSelectedDossierId("");
    setName("Zishell Rose Glam");
    setVolume("10 ml");
    setSourceLinks("");
    setRegistrationSafety("Добавьте ссылку на регистрацию, инструкцию и подтверждённые safety-факты. Не используйте материал до review лицензированным специалистом.");
    setApprovedClaims("");
    setAudiences("Лицензированные специалисты эстетической медицины");
    setDossierReviewState("needs_evidence");
  };

  const createDraft = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedDossierId) {
      toast({ title: "Сначала выберите dossier", description: "Черновик обязан опираться на workspace-owned product knowledge.", variant: "destructive" });
      return;
    }
    generateContent.mutate({
      data: { topic, tone, dossierId: selectedDossierId, format, channels: ["telegram"] },
    }, {
      onSuccess: () => {
        setTopic("");
        void invalidateContent();
        toast({ title: "Черновик создан", description: "Материал ожидает человеческого review и не будет отправлен в канал автоматически." });
      },
      onError: (error) => toast({ title: "Не удалось создать черновик", description: error.message, variant: "destructive" }),
    });
  };

  const setReviewDecision = (id: string, decision: "in_review" | "changes_requested" | "approved") => {
    if (!reviewer.trim() || !reviewAttested) {
      toast({ title: "Нужно подтверждение reviewer", description: "Укажите имя reviewer и подтвердите, что проверили dossier, claims и предупреждения.", variant: "destructive" });
      return;
    }
    reviewContent.mutate({
      id,
      data: {
        decision,
        reviewer,
        notes: reviewNotes,
        confirmed: reviewAttested,
      },
    }, {
      onSuccess: () => {
        setReviewNotes("");
        setReviewAttested(false);
        void invalidateContent();
        toast({
          title: decision === "approved" ? "Материал одобрен" : "Review-state обновлён",
          description: decision === "approved" ? "Одобрена конкретная версия; канал остаётся на ручном handoff до подключения интеграции." : "Решение и комментарий сохранены в audit trail.",
        });
      },
      onError: (error) => toast({ title: "Review не сохранён", description: error.message, variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-6 pb-8">
      <section className="border border-cyan-400/20 bg-[linear-gradient(120deg,rgba(0,229,255,0.08),transparent_38%,rgba(116,34,46,0.20))] p-5 sm:p-7">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-cyan-300">Zishel / governed commercial intelligence</p>
            <h2 className="mt-2 font-display text-3xl font-bold uppercase tracking-tight text-white sm:text-4xl">Medical studio</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">Собирайте product knowledge, создавайте только профессиональные материалы и фиксируйте решение человека до любой передачи в канал.</p>
          </div>
          <div className="max-w-sm border border-amber-300/25 bg-amber-300/10 p-3 text-xs leading-5 text-amber-50">
            <ShieldAlert className="mr-2 inline h-4 w-4 text-amber-300" />
            AI не диагностирует, не назначает лечение и не обещает клинический результат.
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_1fr]">
        <Card className="rounded-none border-white/10 bg-zinc-900/90 text-zinc-100 shadow-none">
          <CardHeader className="border-b border-white/10 pb-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-300">01 / evidence repository</p>
                <CardTitle className="mt-2 flex items-center gap-2 text-xl uppercase tracking-wide"><BookOpenCheck className="h-5 w-5 text-cyan-300" /> Product dossier</CardTitle>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={newDossier} data-testid="button-new-medical-dossier" className="rounded-none border-white/15 bg-transparent text-white hover:bg-cyan-400 hover:text-zinc-950"><Plus className="mr-2 h-4 w-4" /> New</Button>
            </div>
            {dossiersLoading ? <p className="font-mono text-xs text-zinc-500">ЗАГРУЗКА DOSSIER…</p> : dossiersError ? <ErrorState error={dossiersError} /> : (
              <div className="mt-4 flex flex-wrap gap-2">
                {dossiers?.map((dossier) => (
                  <button type="button" key={dossier.id} onClick={() => setSelectedDossierId(dossier.id)} data-testid={`button-select-dossier-${dossier.id}`} className={`border px-3 py-2 text-left text-xs transition-colors ${selectedDossierId === dossier.id ? "border-cyan-400 bg-cyan-400/10 text-cyan-100" : "border-white/10 bg-zinc-950 text-zinc-400 hover:border-white/30"}`}>
                    <span className="block font-semibold">{dossier.name} · {dossier.volume}</span><span className="mt-1 block font-mono text-[9px] uppercase">{dossier.reviewState.replaceAll("_", " ")}</span>
                  </button>
                ))}
                {!dossiers?.length && <span className="font-mono text-xs text-zinc-500">Пока нет dossier — создайте первый ниже.</span>}
              </div>
            )}
          </CardHeader>
          <CardContent className="p-5 sm:p-6">
            <form onSubmit={saveDossier} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                <div className="space-y-2"><Label htmlFor="dossier-name">Название продукта</Label><Input id="dossier-name" value={name} onChange={(event) => setName(event.target.value)} data-testid="input-dossier-name" className="rounded-none border-white/15 bg-zinc-950 text-white" /></div>
                <div className="space-y-2"><Label htmlFor="dossier-volume">Объём</Label><Input id="dossier-volume" value={volume} onChange={(event) => setVolume(event.target.value)} data-testid="input-dossier-volume" className="rounded-none border-white/15 bg-zinc-950 text-white" /></div>
              </div>
              <div className="space-y-2"><Label htmlFor="dossier-sources">Source links — по одной ссылке на строку</Label><Textarea id="dossier-sources" value={sourceLinks} onChange={(event) => setSourceLinks(event.target.value)} data-testid="input-dossier-sources" placeholder="https://…" className="min-h-20 rounded-none border-white/15 bg-zinc-950 font-mono text-xs text-white" /></div>
              <div className="space-y-2"><Label htmlFor="dossier-safety">Регистрация и safety-факты</Label><Textarea id="dossier-safety" value={registrationSafety} onChange={(event) => setRegistrationSafety(event.target.value)} data-testid="input-dossier-safety" className="min-h-24 rounded-none border-white/15 bg-zinc-950 text-white" /></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="dossier-claims">Утверждённые claims</Label><Textarea id="dossier-claims" value={approvedClaims} onChange={(event) => setApprovedClaims(event.target.value)} data-testid="input-dossier-claims" placeholder="По одному на строку" className="min-h-24 rounded-none border-white/15 bg-zinc-950 text-white" /></div>
                <div className="space-y-2"><Label htmlFor="dossier-audiences">Аудитории</Label><Textarea id="dossier-audiences" value={audiences} onChange={(event) => setAudiences(event.target.value)} data-testid="input-dossier-audiences" placeholder="По одной на строку" className="min-h-24 rounded-none border-white/15 bg-zinc-950 text-white" /></div>
              </div>
              <div className="flex flex-col justify-between gap-4 border-t border-white/10 pt-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3"><Label htmlFor="dossier-review-state">Review state</Label><select id="dossier-review-state" value={dossierReviewState} onChange={(event) => setDossierReviewState(event.target.value as DossierReviewState)} data-testid="select-dossier-review-state" className="h-10 border border-white/15 bg-zinc-950 px-3 text-sm text-white">{reviewStates.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{selectedDossier && <DossierState state={selectedDossier.reviewState} />}</div>
                <Button type="submit" disabled={createDossier.isPending || updateDossier.isPending || name.trim().length < 2 || registrationSafety.trim().length < 10} data-testid="button-save-medical-dossier" className="rounded-none bg-cyan-400 text-zinc-950 hover:bg-cyan-300"><Save className="mr-2 h-4 w-4" /> {selectedDossier ? "Сохранить версию" : "Создать dossier"}</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="rounded-none border-white/10 bg-zinc-900/90 text-zinc-100 shadow-none">
          <CardHeader className="border-b border-white/10 pb-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-200">02 / review-ready creation</p>
            <CardTitle className="mt-2 flex items-center gap-2 text-xl uppercase tracking-wide"><FilePenLine className="h-5 w-5 text-amber-200" /> Content protocol</CardTitle>
          </CardHeader>
          <CardContent className="p-5 sm:p-6">
            <form onSubmit={createDraft} className="space-y-5">
              <div className="space-y-2"><Label htmlFor="content-dossier">Основание / dossier</Label><select id="content-dossier" value={selectedDossierId} onChange={(event) => setSelectedDossierId(event.target.value)} data-testid="select-content-dossier" className="h-11 w-full border border-white/15 bg-zinc-950 px-3 text-sm text-white"><option value="">Выберите dossier</option>{dossiers?.map((dossier) => <option key={dossier.id} value={dossier.id}>{dossier.name} · {dossier.volume}</option>)}</select>{selectedDossier && <p className="text-xs text-zinc-500">v{selectedDossier.version} · <span className="text-cyan-300">{selectedDossier.approvedClaims.length} approved claims</span> · {selectedDossier.sourceLinks.length} sources</p>}</div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="content-format">Формат</Label><select id="content-format" value={format} onChange={(event) => setFormat(event.target.value as Format)} data-testid="select-content-format" className="h-11 w-full border border-white/15 bg-zinc-950 px-3 text-sm text-white">{contentFormats.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                <div className="space-y-2"><Label htmlFor="content-tone">Tone</Label><Input id="content-tone" value={tone} onChange={(event) => setTone(event.target.value)} data-testid="input-content-tone" className="rounded-none border-white/15 bg-zinc-950 text-white" /></div>
              </div>
              <div className="space-y-2"><Label htmlFor="content-topic">Тема или профессиональный brief</Label><Textarea id="content-topic" value={topic} onChange={(event) => setTopic(event.target.value)} data-testid="input-medical-content-topic" placeholder="Например: как организовать evidence-backed материал для профессионального сообщества" className="min-h-32 rounded-none border-white/15 bg-zinc-950 text-white" /></div>
              <div className="border border-red-400/20 bg-red-400/5 p-3 text-xs leading-5 text-red-100"><LockKeyhole className="mr-2 inline h-4 w-4 text-red-300" />Ни один draft не публикуется автоматически. Каналы и Meta/Instagram delivery появятся только после отдельного подключения.</div>
              <Button type="submit" disabled={generateContent.isPending || !topic.trim() || !selectedDossierId} data-testid="button-generate-medical-content" className="h-12 w-full rounded-none bg-white font-display font-bold uppercase tracking-wider text-zinc-950 hover:bg-amber-200"><Sparkles className="mr-2 h-4 w-4" />{generateContent.isPending ? "Создание…" : "Создать review-ready draft"}</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="content-repository-heading">
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-300">03 / approval ledger</p><h2 id="content-repository-heading" className="mt-1 font-display text-2xl font-bold uppercase tracking-wide text-white">Review queue</h2></div>
          <div className="flex flex-wrap items-center gap-2"><Label htmlFor="reviewer">Reviewer</Label><Input id="reviewer" value={reviewer} onChange={(event) => setReviewer(event.target.value)} data-testid="input-content-reviewer" placeholder="Имя и роль" className="h-9 w-48 rounded-none border-white/15 bg-zinc-950 text-sm text-white" /></div>
        </div>
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto]"><Textarea value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} data-testid="input-content-review-notes" placeholder="Комментарий reviewer для audit trail (опционально)" className="min-h-16 rounded-none border-white/15 bg-zinc-950 text-sm text-white" /><label className="flex max-w-sm items-center border border-cyan-400/20 bg-cyan-400/5 px-3 text-xs text-cyan-100"><input type="checkbox" checked={reviewAttested} onChange={(event) => setReviewAttested(event.target.checked)} data-testid="checkbox-review-attestation" className="mr-2 h-4 w-4 accent-cyan-400" />Я проверил(а) dossier, claims и предупреждения для этой версии.</label></div>
        {contentError ? <ErrorState error={contentError} /> : contentLoading ? <LoadingState /> : (
          <div className="grid gap-4 lg:grid-cols-2">
            {content?.map((item) => (
              <Card key={item.id} data-testid={`card-medical-content-${item.id}`} className="rounded-none border-white/10 bg-zinc-900 text-zinc-100 shadow-none">
                <CardHeader className="border-b border-white/10 pb-4">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-500">{item.format.replaceAll("_", " ")} · v{item.contentVersion}</p><CardTitle className="mt-2 text-base leading-6 text-white">{item.title}</CardTitle></div><ContentState state={item.reviewState} /></div>
                </CardHeader>
                <CardContent className="space-y-4 p-5">
                  <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-300">{item.body}</p>
                  {item.claimWarnings.length > 0 && <div className="border border-amber-300/25 bg-amber-300/10 p-3 text-xs leading-5 text-amber-50" data-testid={`status-content-warnings-${item.id}`}><AlertTriangle className="mr-2 inline h-4 w-4 text-amber-300" />{item.claimWarnings.map((warning) => <span key={warning}>{warning} </span>)}</div>}
                  <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
                    {item.reviewState === "pending" && <Button type="button" variant="outline" onClick={() => setReviewDecision(item.id, "in_review")} disabled={reviewContent.isPending} data-testid={`button-content-review-${item.id}`} className="rounded-none border-amber-300/30 bg-transparent text-amber-100 hover:bg-amber-300 hover:text-zinc-950">Начать review</Button>}
                    {(item.reviewState === "pending" || item.reviewState === "in_review" || item.reviewState === "changes_requested") && <><Button type="button" onClick={() => setReviewDecision(item.id, "approved")} disabled={reviewContent.isPending || !reviewer.trim() || !reviewAttested || item.claimWarnings.length > 0} data-testid={`button-approve-content-${item.id}`} className="rounded-none bg-cyan-400 text-zinc-950 hover:bg-cyan-300"><CheckCircle2 className="mr-2 h-4 w-4" />Approve v{item.contentVersion}</Button><Button type="button" variant="outline" onClick={() => setReviewDecision(item.id, "changes_requested")} disabled={reviewContent.isPending || !reviewer.trim() || !reviewAttested} data-testid={`button-request-content-changes-${item.id}`} className="rounded-none border-red-400/30 bg-transparent text-red-100 hover:bg-red-400 hover:text-white">Запросить правки</Button></>}
                    {item.reviewState === "approved" && <span className="inline-flex items-center border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-100" data-testid={`status-content-handoff-${item.id}`}><CheckCircle2 className="mr-2 h-4 w-4" />Ready for manual channel handoff</span>}
                  </div>
                  {item.reviewTrail.length > 0 && <p className="font-mono text-[10px] text-zinc-500">Последнее решение: {item.reviewTrail.at(-1)?.reviewer} · {item.reviewTrail.at(-1)?.decision.replaceAll("_", " ")}</p>}
                </CardContent>
              </Card>
            ))}
            {!content?.length && <div className="col-span-full border border-dashed border-white/15 bg-zinc-900/50 py-12 text-center font-mono text-xs tracking-wider text-zinc-500">NO GOVERNED DRAFTS YET</div>}
          </div>
        )}
      </section>
    </div>
  );
}