import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { dark } from '@clerk/themes';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

import { Layout } from "@/components/layout";
import DashboardPage from "@/pages/dashboard";
import AnalyticsPage from "@/pages/analytics";
import ContentPage from "@/pages/content";
import BuilderPage from "@/pages/builder";
import SettingsPage from "@/pages/settings";
import LandingPage from "@/pages/landing";
import "@/styles/auth-core.css";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const clerkAppearance = {
  theme: dark,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#10b981",
    colorForeground: "#f4f4f5",
    colorMutedForeground: "#a1a1aa",
    colorDanger: "#ef4444",
    colorBackground: "rgba(9, 9, 11, 0.4)",
    colorInput: "rgba(9, 9, 11, 0.8)",
    colorInputForeground: "#f4f4f5",
    colorNeutral: "#3f3f46",
    fontFamily: "'Space Grotesk', sans-serif",
    borderRadius: "0px",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "w-[440px] max-w-full overflow-hidden border border-emerald-500/20 bg-zinc-950/60 backdrop-blur-xl shadow-[0_0_60px_rgba(0,0,0,0.8)] relative before:absolute before:inset-0 before:bg-[linear-gradient(rgba(16,185,129,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.02)_1px,transparent_1px)] before:bg-[size:2rem_2rem] before:pointer-events-none before:z-[-1]",
    card: "!shadow-none !border-0 !bg-transparent p-6 sm:p-10 relative z-10",
    headerTitle: "font-display font-medium text-2xl tracking-widest text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.5)] uppercase",
    headerSubtitle: "text-emerald-500/50 font-mono text-xs uppercase tracking-[0.1em] mt-3",
    socialButtonsBlockButtonText: "text-zinc-300 font-mono text-xs uppercase tracking-widest font-semibold",
    socialButtonsBlockButton: "border-emerald-500/20 bg-zinc-950/80 hover:bg-emerald-500/10 hover:border-emerald-500/40 transition-all duration-300 rounded-none h-12 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]",
    socialButtonsProviderIcon: "filter brightness-0 invert opacity-70",
    formFieldLabel: "font-mono uppercase text-[10px] tracking-[0.2em] text-emerald-500/70 mb-2 font-semibold",
    formFieldInput: "border-emerald-500/20 bg-zinc-950/80 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/50 text-emerald-50 rounded-none font-mono text-sm h-12 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] transition-all",
    footerActionLink: "text-emerald-400 font-mono text-xs uppercase tracking-[0.1em] hover:text-emerald-300 hover:drop-shadow-[0_0_8px_rgba(16,185,129,0.8)] transition-all",
    footerActionText: "text-emerald-500/40 font-mono text-xs uppercase tracking-[0.1em]",
    dividerText: "text-emerald-500/30 font-mono text-xs uppercase tracking-[0.3em]",
    dividerLine: "bg-emerald-500/10",
    formButtonPrimary: "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/50 hover:border-emerald-400 font-mono text-xs uppercase tracking-[0.2em] font-bold rounded-none h-12 transition-all duration-300 shadow-[0_0_20px_rgba(16,185,129,0.15)] hover:shadow-[0_0_30px_rgba(16,185,129,0.3)] mt-2",
    logoBox: "mb-10 flex justify-start items-center",
    logoImage: "h-10 w-auto filter drop-shadow-[0_0_15px_rgba(16,185,129,0.8)]",
    alert: "border-red-500/30 bg-red-500/10 rounded-none text-red-200 font-mono text-xs",
    alertText: "text-red-200",
    otpCodeFieldInput: "border-emerald-500/20 bg-zinc-950/80 focus:border-emerald-400 text-emerald-50 rounded-none h-12 font-mono text-xl",
    formFieldRow: "gap-5",
    main: "gap-6",
    footer: "mt-8",
  },
};

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

function AuthLayout({ children }: { children: ReactNode }) {
  const [showRequiredFieldsNotice, setShowRequiredFieldsNotice] = useState(false);
  const [pointer, setPointer] = useState({ x: 50, y: 50 });
  const [coreEngaged, setCoreEngaged] = useState(false);

  return (
    <div
      className="access-core"
      style={{ "--pointer-x": `${pointer.x}%`, "--pointer-y": `${pointer.y}%` } as CSSProperties}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setPointer({ x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100 });
      }}
      onInvalidCapture={() => setShowRequiredFieldsNotice(true)}
      onInputCapture={() => setShowRequiredFieldsNotice(false)}
    >
      <div className="access-core__backdrop" aria-hidden="true" />
      <div className="access-core__noise" aria-hidden="true" />
      <header className="access-header">
        <div className="brand-lockup"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span><b>AGENT</b><em>multitool 360</em></span></div>
        <div className="secure-chip"><span /> private operator access</div>
      </header>
      <section className="access-layout" aria-label="Secure workspace access">
        <div className="access-intro">
          <p className="eyebrow"><span className="eyebrow-line" /> CORE / 01</p><h1>Open the<br /><strong>workspace.</strong></h1>
          <p className="intro-copy">One operator. A coordinated fleet. Your next move travels through a room that is already listening.</p>
          <div className="fleet-list" aria-label="Agent fleet readiness">
            {["Analyst", "Builder", "Seller", "Orchestrator"].map((agent, index) => <div className="fleet-agent" key={agent}><span className={`agent-node agent-${index}`}>{agent.slice(0, 2).toUpperCase()}</span><span>{agent}</span><i className="agent-ready" aria-label={`${agent} ready`} /></div>)}
          </div>
        </div>
        <div className="core-stage" aria-label={coreEngaged ? "Pointer linked to access core" : "Access core ready"}>
          <div className="orbit orbit--one" /><div className="orbit orbit--two" /><div className="core-ripple ripple--one" /><div className="core-ripple ripple--two" />
          <div className="core-orb" role="button" tabIndex={0} aria-label="Preview secure access core" onPointerEnter={() => setCoreEngaged(true)} onPointerLeave={() => setCoreEngaged(false)} onFocus={() => setCoreEngaged(true)} onBlur={() => setCoreEngaged(false)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setCoreEngaged(value => !value); } }}>
            <div className="facet facet--a" /><div className="facet facet--b" /><div className="facet facet--c" /><div className="facet facet--d" /><div className="facet facet--e" /><div className="facet facet--f" /><div className="core-aperture"><span>360</span></div>
          </div>
          <div className="core-status-chip" aria-live="polite">{coreEngaged ? "POINTER LINKED" : "CORE READY"}</div>
          <div className="stage-caption"><span className="signal-pulse" /> {coreEngaged ? "Previewing a private workspace link" : "Workspace link is ready"}</div>
        </div>
        <div className="access-panel">
          <div className="panel-topline"><span>OPERATOR GATE</span><span>01 / 02</span></div><h2>Sign in to<br /><span>continue.</span></h2><p className="panel-copy">Your credentials unlock the command layer. Nothing moves until you say so.</p>
          {showRequiredFieldsNotice && <div aria-live="assertive" className="auth-required-notice" role="alert">Заполните обязательные поля, затем нажмите «Продолжить».</div>}
          <div className="auth-clerk-panel">{children}</div>
        </div>
      </section>
      <footer className="access-footer"><span>AM360 / SECURE ACCESS CORE</span><span>LINK LATENCY <b>18ms</b></span><span>BUILD 3.6.0</span></footer>
    </div>
  );
}

function SignInPage() {
  return (
    <AuthLayout>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </AuthLayout>
  );
}

function SignUpPage() {
  return (
    <AuthLayout>
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </AuthLayout>
  );
}

function WorkspaceRouter() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) {
    return <div className="grid min-h-[100dvh] place-items-center bg-zinc-950 font-mono text-xs text-emerald-500 tracking-widest uppercase">ИНИЦИАЛИЗАЦИЯ ЗАЩИЩЁННОГО ПРОСТРАНСТВА</div>;
  }
  if (!isSignedIn) return <LandingPage />;

  return <Switch>
    <Route path="/" component={DashboardWorkspace} />
    <Route component={LegacyWorkspace} />
  </Switch>;
}

function DashboardWorkspace() {
  return <RoutedErrorBoundary><DashboardPage /></RoutedErrorBoundary>;
}

function LegacyWorkspace() {
  return (
    <Layout>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/analytics" component={AnalyticsPage} />
          <Route path="/content" component={ContentPage} />
          <Route path="/builder" component={BuilderPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </Layout>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== userId) {
        queryClient.clear();
      }
      previousUserId.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);
  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  const ruLocalization = {
    signIn: {
      start: {
        title: "АВТОРИЗАЦИЯ",
        subtitle: "Установите защищенное соединение",
        actionText: "Новый агент?",
        actionLink: "Создать профиль"
      }
    },
    signUp: {
      start: {
        title: "ИНИЦИАЛИЗАЦИЯ",
        subtitle: "Создайте профиль автономного агента",
        actionText: "Уже есть профиль?",
        actionLink: "Войти в систему"
      }
    },
    socialButtonsBlockButton: "Продолжить через {{provider|titleize}}",
    dividerText: "ИЛИ",
    formFieldLabel__emailAddress: "Электронная почта",
    formFieldLabel__password: "Пароль",
    formButtonPrimary: "ПРОДОЛЖИТЬ",
    formFieldInputPlaceholder__emailAddress: "sys.admin@domain.com",
    formFieldInputPlaceholder__password: "••••••••",
    formFieldError__required: "Это поле обязательно для заполнения.",
    formFieldError__invalidEmail: "Неверный формат электронной почты.",
    footerActionLink__signIn: "Войти",
    footerActionLink__signUp: "Создать профиль",
    footerActionText__signIn: "Уже есть профиль?",
    footerActionText__signUp: "Нет профиля?",
    backButton: "Назад",
    formFieldLabel__firstName: "Имя",
    formFieldLabel__lastName: "Фамилия",
    formFieldInputPlaceholder__firstName: "Иван",
    formFieldInputPlaceholder__lastName: "Иванов",
    formFieldLabel__emailAddress_code: "Код подтверждения",
    formFieldInputPlaceholder__emailAddress_code: "••••••",
    formButtonPrimary__continue: "Продолжить",
    formButtonPrimary__verify: "Подтвердить",
    untrusted__title: "Ненадежное устройство",
    userButton: {
      action__manageAccount: "Управление профилем",
      action__signOut: "Выйти",
    }
  };

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={ruLocalization}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Switch>
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route component={WorkspaceRouter} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
