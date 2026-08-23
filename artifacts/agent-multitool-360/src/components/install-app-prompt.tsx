import { useEffect, useState } from "react";
import { Download, Share2, X } from "lucide-react";
import "@/styles/install-app-prompt.css";

interface DeferredInstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function InstallAppPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredInstallPrompt | null>(null);
  const [standalone, setStandalone] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setStandalone(isStandalone());
    setIos(isIos());
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as DeferredInstallPrompt);
    };
    const media = window.matchMedia("(display-mode: standalone)");
    const onDisplayChange = () => setStandalone(isStandalone());
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    media.addEventListener("change", onDisplayChange);
    return () => { window.removeEventListener("beforeinstallprompt", onBeforeInstall); media.removeEventListener("change", onDisplayChange); };
  }, []);

  if (standalone || dismissed || (!deferredPrompt && !ios)) return null;
  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setDismissed(true);
  };
  return <aside className="install-app-prompt" aria-label="Установка приложения">
    <div className="install-app-copy"><Download aria-hidden="true" /><div><b>Агент 360 как приложение</b><span>{ios && !deferredPrompt ? <>Нажмите <Share2 aria-hidden="true" /> Поделиться → На экран Домой</> : "Откройте рабочее пространство в отдельном окне."}</span></div></div>
    <div className="install-app-actions">{deferredPrompt && <button type="button" onClick={install} data-testid="button-install-app">Установить приложение</button>}<button type="button" className="install-app-dismiss" onClick={() => setDismissed(true)} aria-label="Закрыть подсказку об установке" data-testid="button-dismiss-install-prompt"><X /></button></div>
  </aside>;
}