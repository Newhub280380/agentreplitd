import { useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Layers, LineChart, Play, Send, Settings, Terminal, TerminalSquare } from "lucide-react";
import "./_group.css";

const agents = [
  ["Аналитик", "Тренды, поиск, инсайты", "online", "4 источника"],
  ["Сборщик", "Установка и упаковка", "online", "2 retry"],
  ["Продавец", "Контент и продажи", "online", "3 канала"],
  ["Оркестратор", "Планирование и память", "running", "pg-память"],
];
const runs = [
  ["a62f91c4-bf0e", "analysis", "completed", "Сегодня, 14:32"],
  ["b81ac050-8bdf", "content", "running", "Сегодня, 14:18"],
  ["c98e731a-e556", "research", "completed", "Сегодня, 13:54"],
  ["d17b94ec-2a70", "build", "completed", "Сегодня, 12:40"],
];
const activities = [
  ["ok", "14:32", "Аналитик", "Сбор трендов завершён", "Найдено 12 новых тем в AI-инструментах"],
  ["play", "14:18", "Оркестратор", "Запущен контент-пайплайн", "Готовится черновик для Telegram"],
  ["ok", "13:54", "Сборщик", "Проверка окружения пройдена", "Зависимости и версии актуальны"],
  ["warn", "13:41", "Продавец", "Требуется внимание", "Ожидается подтверждение канала публикации"],
];

function Badge({ status }: { status: string }) {
  return <span className={`a-badge ${status === "running" ? "a-running" : status === "online" || status === "completed" || status === "operational" ? "a-success" : "a-outline"}`}>{status}</span>;
}

export function Current() {
  const [command, setCommand] = useState("");
  const [executed, setExecuted] = useState(false);
  const submit = (event: React.FormEvent) => { event.preventDefault(); if (command.trim()) { setExecuted(true); setCommand(""); } };
  return (
    <div className="agent360-dashboard">
      <div className="a-shell">
        <nav className="a-sidebar">
          <div className="a-brand a-display"><Activity /> Multitool 360</div>
          <div className="a-nav a-display">
            <a className="a-nav-item active" href="#command"><TerminalSquare /> Command</a>
            <a className="a-nav-item" href="#analytics"><LineChart /> Analytics</a>
            <a className="a-nav-item" href="#content"><Send /> Content</a>
            <a className="a-nav-item" href="#builder"><Layers /> Builder</a>
          </div>
          <div className="a-nav-bottom a-display"><a className="a-nav-item" href="#settings"><Settings /> Settings</a></div>
        </nav>
        <main className="a-main">
          <header className="a-header">
            <h1 className="a-header-title a-display">Operations Console</h1>
            <div className="a-header-right">
              <span className="a-sys-label a-mono">SYS_STATUS:</span><span className="a-system a-mono"><i className="a-dot" /> OPERATIONAL</span>
              <div className="a-user"><span className="a-avatar a-mono">К</span><div><div className="a-user-name a-display">Клиент</div><button className="a-signout a-mono" type="button">Выйти</button></div></div>
            </div>
          </header>
          <div className="a-content"><div className="a-content-inner">
            <section id="command" className="a-command">
              <div className="a-command-label a-mono"><Terminal /> Orchestrator Input</div>
              <form className="a-command-form" onSubmit={submit}><span className="a-command-prompt a-mono">&gt;</span><input className="a-command-input a-mono" autoFocus value={command} onChange={e => setCommand(e.target.value)} placeholder="Deploy analysis on AI tools, assemble report, draft for TG..." /><button className="a-button a-mono" type="submit">{executed ? "QUEUED" : "EXECUTE"}</button></form>
            </section>
            <section className="a-metrics">
              <Metric label="System Status"><Badge status="operational" /></Metric><Metric label="Active Runs">1</Metric><Metric label="Insights">24</Metric><Metric label="Content Drafts">6</Metric><Metric label="Channels">3</Metric>
            </section>
            <section className="a-columns">
              <div className="a-card"><div className="a-card-header"><h2 className="a-card-title">Agent Fleet</h2></div>{agents.map(([name, role, status, metric]) => <div className="a-agent" key={name}><div className="a-agent-top"><span className="a-agent-name">{name}</span><Badge status={status} /></div><span className="a-agent-role a-mono">{role}</span><div className="a-agent-metric a-mono">{metric}</div></div>)}</div>
              <div className="a-right">
                <div className="a-card"><div className="a-card-header"><h2 className="a-card-title">Recent Runs</h2><button type="button" className="a-refresh">Refresh</button></div><table><thead><tr><th>Run ID</th><th>Kind</th><th>Status</th><th>Started</th></tr></thead><tbody>{runs.map(([id, kind, status, date]) => <tr key={id}><td className="a-run-id a-mono">{id}</td><td className="a-kind">{kind}</td><td><Badge status={status} /></td><td className="a-date a-mono">{date}</td></tr>)}</tbody></table></div>
                <div className="a-card"><div className="a-card-header"><h2 className="a-card-title">System Log</h2></div><table><tbody>{activities.map(([icon, time, agent, title, detail]) => <tr key={time + title}><td style={{ width: 40, paddingRight: 0 }}>{icon === "ok" ? <CheckCircle2 className="a-log-icon ok" /> : icon === "warn" ? <AlertTriangle className="a-log-icon warn" /> : <Play className="a-log-icon play" />}</td><td className="a-log-time a-mono">{time}</td><td className="a-log-agent">{agent}</td><td><div className="a-log-title">{title}</div><div className="a-log-detail">{detail}</div></td></tr>)}</tbody></table></div>
              </div>
            </section>
          </div></div>
        </main>
      </div>
    </div>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="a-card a-metric"><span className="a-metric-label a-display">{label}</span><div className="a-metric-value a-mono">{children}</div></div>;
}