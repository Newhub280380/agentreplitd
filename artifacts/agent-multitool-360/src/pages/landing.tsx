import { Link } from "wouter";
import { ArrowRight, Bot, ChartNoAxesCombined, LockKeyhole, Sparkles } from "lucide-react";
import { Button } from "@/components/ui";

const benefits = [
  { icon: ChartNoAxesCombined, title: "Рыночные сигналы", text: "Анализ ниши, трендов и контент-возможностей в одной рабочей области." },
  { icon: Bot, title: "Четыре агента", text: "Аналитик, сборщик, продавец и оркестратор работают по единому сценарию." },
  { icon: LockKeyhole, title: "Личные данные", text: "Каждый клиент получает изолированную память, историю запусков и материалы." },
];

export default function LandingPage() {
  return (
    <main className="min-h-[100dvh] bg-zinc-950 text-white">
      <div className="mx-auto flex min-h-[100dvh] max-w-6xl flex-col px-6 py-6 lg:px-10">
        <header className="flex items-center justify-between border-b border-white/10 pb-5">
          <div className="flex items-center gap-2 font-display text-sm font-bold tracking-[0.18em]">
            <Sparkles className="h-4 w-4 text-primary" />
            MULTITOOL 360
          </div>
          <Button asChild variant="outline" size="sm" className="border-white/20 bg-transparent text-white hover:bg-white hover:text-zinc-950">
            <Link href="/sign-in">Войти</Link>
          </Button>
        </header>

        <section className="flex flex-1 flex-col justify-center py-16 lg:py-24">
          <div className="max-w-3xl">
            <p className="mb-5 font-mono text-xs uppercase tracking-[0.2em] text-primary">AI-операционная система для экспертов</p>
            <h1 className="font-display text-5xl font-bold leading-[0.96] tracking-tight sm:text-6xl lg:text-8xl">
              Превращайте сигналы рынка в действия.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-zinc-300">
              Агент-мультитул 360 объединяет исследование ниши, контент, продажи и сборку в личном рабочем пространстве.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/sign-up">
                  Создать рабочее пространство <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="border-white/20 bg-transparent text-white hover:bg-white hover:text-zinc-950">
                <Link href="/sign-in">У меня уже есть аккаунт</Link>
              </Button>
            </div>
            <p className="mt-4 font-mono text-xs text-zinc-500">Базовый тариф · без оплаты на этом этапе</p>
          </div>

          <div className="mt-16 grid gap-px overflow-hidden border border-white/10 bg-white/10 md:grid-cols-3">
            {benefits.map(({ icon: Icon, title, text }) => (
              <article key={title} className="bg-zinc-950 p-6">
                <Icon className="mb-7 h-5 w-5 text-primary" />
                <h2 className="font-display text-lg font-bold uppercase tracking-wide">{title}</h2>
                <p className="mt-3 text-sm leading-6 text-zinc-400">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <footer className="border-t border-white/10 pt-5 font-mono text-[11px] uppercase tracking-wider text-zinc-500">
          Персональная рабочая область · Данные изолированы по аккаунтам
        </footer>
      </div>
    </main>
  );
}