import { Link } from "wouter";
import { ArrowRight, Bot, ShieldCheck, Database, LockKeyhole, Sparkles } from "lucide-react";
import { Button } from "@/components/ui";

const benefits = [
  { icon: ShieldCheck, title: "Evidence review", text: "Фиксируйте регистрацию, источники и human-review перед тем, как материал перейдёт к ручной передаче в канал." },
  { icon: Bot, title: "Система из четырех агентов", text: "Аналитик, сборщик досье, продавец и оркестратор работают по единому медицинскому протоколу." },
  { icon: Database, title: "Изолированные данные", text: "Медицинские досье и история запусков полностью изолированы в вашей персональной клинике." },
];

export default function LandingPage() {
  return (
    <main className="min-h-[100dvh] bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex min-h-[100dvh] max-w-6xl flex-col px-6 py-6 lg:px-10 relative z-10">
        <header className="flex items-center justify-between border-b border-white/10 pb-5">
          <div className="flex items-center gap-2 font-display text-sm font-bold tracking-[0.18em] text-cyan-400">
            <Sparkles className="h-4 w-4" />
            ZISHEL MEDICAL
          </div>
          <Button asChild variant="outline" size="sm" className="border-white/20 bg-transparent text-white hover:bg-cyan-400 hover:text-zinc-950 transition-colors">
            <Link href="/sign-in">Вход для операторов</Link>
          </Button>
        </header>

        <section className="flex flex-1 flex-col justify-center py-16 lg:py-24 relative">
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-cyan-400/10 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute left-0 top-1/4 -translate-y-1/2 w-[300px] h-[300px] bg-[#955251]/20 rounded-full blur-[100px] pointer-events-none" />

          <div className="max-w-4xl relative z-10">
            <p className="mb-5 font-mono text-xs uppercase tracking-[0.2em] text-cyan-400 font-semibold">Коммерческий центр управления · Закрытый доступ</p>
            <h1 className="font-display text-5xl font-bold leading-[0.96] tracking-tight sm:text-6xl lg:text-7xl">
              Точность доказательной медицины.<br />
              <span className="text-zinc-400">Скорость AI-агентов.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-zinc-300">
              Единая рабочая среда для медицинских специалистов Казахстана. Управляйте научными досье, контролируйте заявления о продуктах и публикуйте проверенный контент с помощью автономных агентов.
            </p>
            <div className="mt-9 flex flex-wrap gap-4">
              <Button asChild size="lg" className="bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold rounded-none h-14 px-8 text-sm uppercase tracking-wider">
                <Link href="/sign-up">
                  Запросить доступ <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="border-white/20 bg-zinc-900/50 backdrop-blur text-white hover:bg-white hover:text-zinc-950 rounded-none h-14 px-8 text-sm uppercase tracking-wider">
                <Link href="/sign-in">У меня уже есть аккаунт</Link>
              </Button>
            </div>
            <div className="mt-8 flex items-center gap-4">
              <div className="flex -space-x-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="w-8 h-8 rounded-full border-2 border-zinc-950 bg-zinc-800 flex items-center justify-center">
                    <LockKeyhole className="w-3 h-3 text-zinc-500" />
                  </div>
                ))}
              </div>
              <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest max-w-[200px]">Доступно только лицензированным специалистам РК</p>
            </div>
          </div>

          <div className="mt-20 grid gap-px overflow-hidden border border-white/10 bg-white/10 md:grid-cols-3 relative z-10 backdrop-blur-sm">
            {benefits.map(({ icon: Icon, title, text }) => (
              <article key={title} className="bg-zinc-950/80 p-8 transition-colors hover:bg-zinc-900/80">
                <Icon className="mb-7 h-6 w-6 text-cyan-400" />
                <h2 className="font-display text-sm font-bold uppercase tracking-widest text-zinc-100">{title}</h2>
                <p className="mt-4 text-sm leading-6 text-zinc-400">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <footer className="border-t border-white/10 pt-6 flex flex-col md:flex-row justify-between gap-4 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          <p>Zishel Medical AI Hub · Закрытая экосистема</p>
          <p>Все права защищены &copy; {new Date().getFullYear()}</p>
        </footer>
      </div>
    </main>
  );
}