// SafeView 4.0 - v49 | Feito por Gabriel Madureira em 14/03/2026
import { useState, useRef, useEffect, useMemo } from "react";
import { MessageCircle, X, Send, Bot, User, Loader2, Settings, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { localApi } from "@/integrations/supabase/client-local";
import type { MonitoringSession } from "./SessionsTable";

type Msg = { role: "user" | "assistant"; content: string };
interface ChatWidgetProps { sessions: MonitoringSession[]; }
function normalizeFatigue(v: number): number { return v > 0 && v <= 1 ? v * 100 : v; }

function buildSessionsContext(sessions: MonitoringSession[]): string {
  if (sessions.length === 0) return "Nenhuma sessão registrada.";
  const MAX = 200;
  const limited = sessions.length > MAX ? sessions.slice(0, MAX) : sessions;
  const truncated = sessions.length > MAX;
  const totalAlerts     = sessions.reduce((sum, s) => sum + s.total_alertas, 0);
  const totalEyesClosed = sessions.reduce((sum, s) => sum + s.eventos_olhos_fechados, 0);
  const totalYawns      = sessions.reduce((sum, s) => sum + s.eventos_bocejos, 0);
  const totalDuration   = sessions.reduce((sum, s) => sum + s.duracao_segundos, 0);
  const avgFatigue      = sessions.reduce((sum, s) => sum + normalizeFatigue(Number(s.media_fadiga)), 0) / sessions.length;
  const maxPeak         = Math.max(...sessions.map((s) => normalizeFatigue(Number(s.pico_fadiga))));
  const sessionsAbove70 = sessions.filter((s) => normalizeFatigue(Number(s.pico_fadiga)) > 70).length;
  const h = Math.floor(totalDuration / 3600), m = Math.floor((totalDuration % 3600) / 60);
  const durationStr = h > 0 ? `${h}h ${m}min` : `${m}min`;
  const summary = [
    `=== ESTATÍSTICAS PRÉ-CALCULADAS (USE ESTES VALORES, NÃO RECALCULE) ===`,
    `Total de sessões: ${sessions.length}${truncated ? ` (detalhes das ${MAX} mais recentes abaixo)` : ''}`,
    `Duração total: ${totalDuration}s (${durationStr})`,
    `Média de fadiga geral: ${avgFatigue.toFixed(1)}%`,
    `Pico máximo registrado: ${maxPeak.toFixed(1)}%`,
    `Sessões com pico >70%: ${sessionsAbove70}`,
    `Total de alertas: ${totalAlerts}`,
    `Total de eventos olhos fechados: ${totalEyesClosed}`,
    `Total de bocejos: ${totalYawns}`,
    `===================================================================`,
  ].join("\n");
  const lines = limited.map((s) => {
    const extra = s as any;
    const parts = [`ID: ${s.id}`, `Data: ${s.created_at}`, `Duração: ${s.duracao_segundos}s`, `Média Fadiga: ${normalizeFatigue(Number(s.media_fadiga)).toFixed(1)}%`, `Pico Fadiga: ${normalizeFatigue(Number(s.pico_fadiga)).toFixed(1)}%`, `Alertas: ${s.total_alertas}`, `Olhos Fechados: ${s.eventos_olhos_fechados}`, `Bocejos: ${s.eventos_bocejos}`];
    if (extra.nome_funcionario)   parts.push(`Funcionário: ${extra.nome_funcionario}`);
    if (extra.local_trabalho)     parts.push(`Local: ${extra.local_trabalho}`);
    if (extra.trabalho_realizado) parts.push(`Trabalho: ${extra.trabalho_realizado}`);
    return parts.join(" | ");
  });
  return `${summary}\n\nDETALHES POR SESSÃO:\n${lines.join("\n")}`;
}

function ApiKeySetup({ onSave }: { onSave: () => void }) {
  const [provider, setProvider] = useState<'gemini' | 'groq'>((localStorage.getItem('chat_provider') as 'gemini' | 'groq') || 'groq');
  const [geminiKey, setGeminiKey] = useState(localStorage.getItem('gemini_api_key') || '');
  const [groqKey,   setGroqKey]   = useState(localStorage.getItem('groq_api_key')   || '');
  const handleSave = () => {
    localStorage.setItem('chat_provider', provider);
    if (geminiKey.trim()) localStorage.setItem('gemini_api_key', geminiKey.trim());
    if (groqKey.trim())   localStorage.setItem('groq_api_key',   groqKey.trim());
    onSave();
  };
  const activeKey = provider === 'groq' ? groqKey : geminiKey;
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4" />Configurar Assistente IA</div>
      <div className="flex gap-2">
        <button onClick={() => setProvider('groq')} className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${provider === 'groq' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-muted'}`}>🟢 Groq (recomendado)</button>
        <button onClick={() => setProvider('gemini')} className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${provider === 'gemini' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-muted'}`}>🔵 Gemini</button>
      </div>
      {provider === 'groq' ? (
        <>
          <p className="text-xs text-muted-foreground leading-relaxed"><strong>Groq funciona no Brasil</strong> com free tier generoso.{' '}<button onClick={() => (window as any).electronAPI?.openExternal('https://console.groq.com/keys')} className="underline text-primary cursor-pointer bg-transparent border-0 p-0 font-inherit text-inherit">Crie sua chave grátis em console.groq.com</button>{' '}→ "Create API Key"</p>
          <input type="password" value={groqKey} onChange={e => setGroqKey(e.target.value)} placeholder="gsk_..." className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground leading-relaxed">⚠️ Gemini free tier não funciona em todas as regiões.{' '}<button onClick={() => (window as any).electronAPI?.openExternal('https://aistudio.google.com/app/apikey')} className="underline text-primary cursor-pointer bg-transparent border-0 p-0 font-inherit text-inherit">Obter chave no AI Studio</button></p>
          <input type="password" value={geminiKey} onChange={e => setGeminiKey(e.target.value)} placeholder="AIza..." className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </>
      )}
      <Button size="sm" onClick={handleSave} disabled={!activeKey.trim()}>Salvar</Button>
    </div>
  );
}

export function ChatWidget({ sessions }: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const sessionsContext = useMemo(() => buildSessionsContext(sessions), [sessions]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const streamAbortRef = useRef<AbortController | null>(null);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);
  useEffect(() => { if (open) { inputRef.current?.focus(); } else { streamAbortRef.current?.abort('panel_closed'); } }, [open]);
  useEffect(() => { if (!localStorage.getItem('chat_provider')) { localStorage.setItem('chat_provider', 'groq'); } }, []);

  const send = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    const provider = localStorage.getItem('chat_provider') || 'groq';
    const activeKey = provider === 'groq' ? localStorage.getItem('groq_api_key') : localStorage.getItem('gemini_api_key');
    if (!activeKey) { setShowSetup(true); return; }
    const userMsg: Msg = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages); setInput(""); setIsLoading(true);
    let assistantSoFar = "", streamStarted = false;
    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk; streamStarted = true;
      setMessages((prev) => { const last = prev[prev.length - 1]; if (last?.role === "assistant") return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m); return [...prev, { role: "assistant", content: assistantSoFar }]; });
    };
    const showError = (msg: string) => { const errorText = `⚠️ ${msg}`; if (streamStarted && assistantSoFar) upsertAssistant(`\n\n---\n${errorText}`); else upsertAssistant(errorText); };
    try {
      const MAX_HISTORY = 10;
      let windowed = newMessages.slice(-MAX_HISTORY);
      while (windowed.length > 0 && windowed[0].role !== 'user') windowed = windowed.slice(1);
      if (windowed.length === 0) windowed = [{ role: 'user', content: text }];
      const streamAbort = new AbortController(); streamAbortRef.current = streamAbort;
      await localApi.chat.stream(windowed, sessionsContext, upsertAssistant, streamAbort.signal);
      streamAbortRef.current = null;
    } catch (e: any) {
      if ((e as any).message === '__cancelled__') return;
      const msg: string = e.message || "Erro ao processar a mensagem.";
      const lower = msg.toLowerCase();
      if (lower.includes("api key") || lower.includes("chave") || lower.includes("401") || lower.includes("403") || lower.includes("invalid")) setShowSetup(true);
      const isQuota = lower.includes("cota") || lower.includes("429") || lower.includes("quota") || lower.includes("esgotada") || lower.includes("limit: 0");
      showError(isQuota ? `${msg}\n\n👉 Use o provider Groq em ⚙️ — funciona gratuitamente no Brasil.` : msg);
    } finally { setIsLoading(false); }
  };

  return (
    <>
      <button onClick={() => setOpen(!open)} className={cn("fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-200", "bg-primary text-primary-foreground hover:scale-105 active:scale-95", open && "rotate-90")}>
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex w-[380px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl animate-in slide-in-from-bottom-4 fade-in duration-200" style={{ height: "min(520px, calc(100vh - 140px))" }}>
          <div className="flex items-center gap-3 border-b border-border/60 bg-primary px-4 py-3">
            <Bot className="h-5 w-5 text-primary-foreground" />
            <div className="flex-1"><p className="text-sm font-semibold text-primary-foreground">Assistente SafeView</p><p className="text-xs text-primary-foreground/70">{localStorage.getItem('chat_provider') === 'groq' ? '🟢 Groq' : localStorage.getItem('chat_provider') === 'gemini' ? '🔵 Gemini' : '⚠️ Configure a IA em ⚙️'}</p></div>
            <button onClick={() => setShowSetup(!showSetup)} className="text-primary-foreground/70 hover:text-primary-foreground" title="Configurar"><Settings className="h-4 w-4" /></button>
          </div>
          {showSetup ? (
            <ApiKeySetup onSave={() => setShowSetup(false)} />
          ) : (
            <>
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground gap-2 py-8">
                    <Bot className="h-10 w-10 opacity-30" />
                    <p className="text-sm">Olá! Pergunte qualquer coisa sobre as sessões de monitoramento.</p>
                    <div className="mt-2 flex flex-wrap gap-2 justify-center">
                      {["Qual a média de fadiga geral?", "Quantos alertas no total?", "Qual sessão teve maior pico?"].map((q) => (
                        <button key={q} onClick={() => { setInput(q); inputRef.current?.focus(); }} className="rounded-full border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted transition-colors">{q}</button>
                      ))}
                    </div>
                    {!localStorage.getItem('groq_api_key') && !localStorage.getItem('gemini_api_key') && (
                      <button onClick={() => setShowSetup(true)} className="mt-2 text-xs text-primary underline">⚙️ Configurar chave da IA</button>
                    )}
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start")}>
                    {msg.role === "assistant" && <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-0.5"><Bot className="h-4 w-4 text-primary" /></div>}
                    <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm", msg.role === "user" ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted text-foreground rounded-bl-md")}>
                      {msg.role === "assistant" ? <div className="prose prose-sm max-w-none dark:prose-invert [&_p]:m-0 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0"><ReactMarkdown>{msg.content}</ReactMarkdown></div> : <p className="whitespace-pre-wrap">{msg.content}</p>}
                    </div>
                    {msg.role === "user" && <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary mt-0.5"><User className="h-4 w-4 text-primary-foreground" /></div>}
                  </div>
                ))}
                {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
                  <div className="flex gap-2"><div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10"><Bot className="h-4 w-4 text-primary" /></div><div className="rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div></div>
                )}
              </div>
              <div className="border-t border-border/60 p-3">
                <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-center gap-2">
                  <input ref={inputRef} type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Digite sua pergunta..." disabled={isLoading} className="flex-1 rounded-full border border-input bg-background px-4 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" />
                  <Button type="submit" size="icon" disabled={!input.trim() || isLoading} className="h-9 w-9 rounded-full shrink-0"><Send className="h-4 w-4" /></Button>
                </form>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
