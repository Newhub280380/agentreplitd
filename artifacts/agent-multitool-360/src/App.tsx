import { type ReactNode, useEffect, useRef } from 'react';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
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
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#ff4d00",
    colorForeground: "#18181b",
    colorMutedForeground: "#71717a",
    colorDanger: "#dc2626",
    colorBackground: "#ffffff",
    colorInput: "#fafafa",
    colorInputForeground: "#18181b",
    colorNeutral: "#d4d4d8",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "0px",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "w-[440px] max-w-full overflow-hidden bg-white border border-zinc-200 shadow-2xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "font-display font-bold uppercase tracking-wide text-zinc-950",
    headerSubtitle: "text-zinc-500",
    socialButtonsBlockButtonText: "text-zinc-800",
    formFieldLabel: "font-display uppercase tracking-wider text-zinc-700",
    footerActionLink: "text-primary font-semibold",
    footerActionText: "text-zinc-500",
    dividerText: "text-zinc-500",
    identityPreviewEditButton: "text-primary",
    formFieldSuccessText: "text-emerald-600",
    alertText: "text-zinc-700",
    logoBox: "mb-2",
    logoImage: "h-10 w-auto",
    socialButtonsBlockButton: "border-zinc-200 hover:bg-zinc-50",
    formButtonPrimary: "bg-primary hover:bg-primary/90 font-display uppercase tracking-wider",
    formFieldInput: "border-zinc-300 focus:border-primary",
    footerAction: "bg-zinc-50",
    dividerLine: "bg-zinc-200",
    alert: "border-amber-200 bg-amber-50",
    otpCodeFieldInput: "border-zinc-300",
    formFieldRow: "gap-2",
    main: "gap-4",
  },
};

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-zinc-950 px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-zinc-950 px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function WorkspaceRouter() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) {
    return <div className="grid min-h-[100dvh] place-items-center bg-zinc-950 font-mono text-xs text-primary">INITIALIZING SECURE WORKSPACE</div>;
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
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: "С возвращением", subtitle: "Войдите в рабочее пространство" } },
        signUp: { start: { title: "Создайте пространство", subtitle: "Начните работу с базового тарифа" } },
      }}
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
