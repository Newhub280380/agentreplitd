import { type ReactNode, useEffect, useRef, useState } from 'react';
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

  return (
    <div
      className="relative flex min-h-[100dvh] w-full items-center justify-center overflow-x-hidden overflow-y-auto bg-black px-0 py-10 font-sans selection:bg-emerald-500/30 selection:text-emerald-200 sm:py-8"
      onInvalidCapture={() => setShowRequiredFieldsNotice(true)}
      onInputCapture={() => setShowRequiredFieldsNotice(false)}
    >
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-all duration-1000"
        style={{
          backgroundImage: `url(${basePath || ''}/agentic-intelligence-grotto.jpg)`,
          filter: 'saturate(0.72) contrast(1.16) brightness(0.46)'
        }}
      />

      <div className="auth-overlay-grid" />
      <div className="auth-vignette" />

      <div className="auth-scene">
        <div className="auth-particles" />
        <div className="auth-core" />
        <div className="auth-cube-wrapper">
          <div className="auth-cube-face front" />
          <div className="auth-cube-face back" />
          <div className="auth-cube-face right" />
          <div className="auth-cube-face left" />
          <div className="auth-cube-face top" />
          <div className="auth-cube-face bottom" />
        </div>
      </div>

      <div className="auth-scanline" />

      <div className="auth-content relative z-10 w-full max-w-md px-4 sm:px-0">
        {showRequiredFieldsNotice && (
          <div
            aria-live="assertive"
            className="mb-3 border border-amber-400/50 bg-amber-400/10 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.08em] text-amber-100 shadow-[0_0_24px_rgba(251,191,36,0.12)]"
            role="alert"
          >
            Заполните обязательные поля, затем нажмите «Продолжить».
          </div>
        )}
        <div className="animate-in fade-in zoom-in-95 duration-1000 delay-300 fill-mode-both">
          {children}
        </div>
      </div>

      <div className="absolute bottom-6 left-6 z-10 font-mono text-[10px] text-emerald-500/40 uppercase tracking-[0.2em] pointer-events-none hidden sm:block">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="auth-status-indicator h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            СИСТЕМА В СЕТИ
          </div>
          <div>ЯДРО: ЗАЩИЩЕНО</div>
          <div>ВЕРСИЯ: 3.6.0.44</div>
          <div className="mt-2 text-emerald-500/20">АГЕНТ-МУЛЬТИТУЛ 360</div>
        </div>
      </div>
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

  return (
    <Layout>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={DashboardPage} />
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
