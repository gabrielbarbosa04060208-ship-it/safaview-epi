// SafeView EPI — v1 | Feito por Gabriel Madureira
import { useState, useRef, useEffect, useMemo } from "react";
import { MessageCircle, X, Send, Bot, User, Loader2, Settings, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { localApi } from "@/integrations/supabase/client-local";
import type { MonitoringSession } from "./SessionsTable";

type Msg = { role: "user" | "assistant"; content: string };

interface ChatWidgetProps {
  sessions: MonitoringSession[];
}

function normalizeRisk(v: number): number {
  return v > 0 && v <= 1 ? v * 100 : v;
}

function buildSessionsContext(sessions: MonitoringSession[]): string {
  if (sessions.length === 0) return "Nenhuma inspeção registrada.";

  const MAX_SESSIONS_IN_CONTEXT = 200;
  const limited  = sessions.slice(0, MAX_SESSIONS_IN_CONTEXT);
  const truncated = sessions.length > MAX_SESSIONS_IN_CONTEXT;

  const totalAlerts       = sessions.reduce((sum, s) => sum + s.total_alertas, 0);
  const totalSemCapacete  = sessions.reduce((sum, s) => sum + s.eventos_sem_capacete, 0);
  const totalSemColete    = sessions.reduce((sum, s) => sum + s.eventos_sem_colete, 0);
  const totalSemLuvas     = sessions.reduce((sum, s) => sum + s.eventos_sem_luvas, 0);
  const totalSemOculos    = sessions.reduce((sum, s) => sum + s.eventos_sem_oculos, 0);
  const totalDuration     = sessions.reduce((sum, s) => sum + s.duracao_segundos, 0);
  const avgRisk           = sessions.reduce((sum, s) => sum + normalizeRisk(Number(s.nivel_risco)), 0) / sessions.length;
  const maxPeak           = Math.max(...sessions.map((s) => normalizeRisk(Number(s.pico_risco))));
  const sessionsHighRisk  = sessions.filter((s) => normalizeRisk(Number(s.pico_risco)) > 60).length;

  const h = Math.floor(totalDuration / 3600);
  const m = Math.floor((totalDuration % 3600) / 60);
  const durationStr = h > 0 ? `${h}h ${m}min` : `${m}min`;

  const summary = [
    `=== ESTATÍSTICAS PRÉ-CALCULADAS (USE ESTES VALORES, NÃO RECALCULE) ===`,
    `Total de inspeções: ${sessions.length}${truncated ? ` (detalhes das ${MAX_SESSIONS_IN_CONTEXT} mais recentes abaixo)` : ''}`,
    `Duração total: ${totalDuration}s (${durationStr})`,
    `Nível de risco médio: ${avgRisk.toFixed(1)}%`,
    `Pico máximo registrado: ${maxPeak.toFixed(1)}%`,
    `Inspeções com risco alto (>60%): ${sessionsHighRisk}`,
    `Total de alertas: ${totalAlerts}`,
    `Total eventos sem capacete: ${totalSemCapacete}`,
    `Total eventos sem colete: ${totalSemColete}`,
    `Total eventos sem luvas: ${totalSemLuvas}`,
    `Total eventos sem óculos: ${totalSemOculos}`,
    `===================================================================`,
  ].join("\n");

  const lines = limited.map((s) => {
    const extra = s as any;
    const parts = [
      `ID: ${s.id}`,
      `Data: ${s.created_at}`,
      `Duração: ${s.duracao_segundos}s`,
      `Risco Médio: ${normalizeRisk(Number(s.nivel_risco)).toFixed(1)}%`,
      `Pico Risco: ${normalizeRisk(Number(s.pico_risco)).toFixed(1)}%`,
      `Alertas: ${s.total_alertas}`,
      `Sem Capacete: ${s.eventos_sem_capacete}`,
      `Sem Colete: ${s.eventos_sem_colete}`,
      `Sem Luvas: ${s.eventos_sem_luvas}`,
      `Sem Óculos: ${s.eventos_sem_oculos}`,
    ];
    if (extra.nome_funcionario)   parts.push(`Funcionário: ${extra.nome_funcionario}`);
    if (extra.local_trabalho)     parts.push(`Local: ${extra.local_trabalho}`);
    if (extra.trabalho_realizado) parts.push(`Trabalho: ${extra.trabalho_realizado}`);
    return parts.join(" | ");
  });

  return `${summary}\n\nDETALHES POR INSPEÇÃO:\n${lines.join("\n")}`;
}

// ── Tela de configuração do provedor de IA ────────────────────────────────────
function ApiKeySetup({ onSave }: { onSave: () => void }) {
  const [provider, setProvider] = useState<'gemini' | 'groq'>(
    (localStorage.getItem('chat_provider') as 'gemini' | 'groq') || 'groq'
  );
  const [geminiKey, setGeminiKey] = useState(localStorage.getItem('gemini_api_key') || '');
  const [groqKey,   setGroqKey]   = useState(localStorage.getItem('groq_api_key')   || '');

  const handleSave = () => {
    localStorage.setItem('chat_provider', provider);
    if (geminiKey.trim()) localStorage.setItem('gemini_api_key', geminiKey.trim());
    if (groqKey.trim())   localStorage.setItem('groq_api_key',   groqKey.trim());
    onSave();
  };

  const activeKey = provider === 'groq' ? groqKey : geminiKey;
  const canSave   = activeKey.trim().length > 0;

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <KeyRound className="h-4 w-4" />
        Configurar Assistente IA
      </div>

      <div className="flex gap-2">
        {(['groq', 'gemini'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setProvider(p)}
            className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
              provider === p
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-foreground hover:bg-accent'
            }`}
          >
            {p === 'groq' ? 'Groq (recomendado)' : 'Gemini'}
          </button>
        ))}
      </div>

      {provider === 'groq' ? (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Chave Groq</label>
          <input
            type="password"
            value={groqKey}
            onChange={e => setGroqKey(e.target.value)}
            placeholder="gsk_..."
            className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer"
            className="text-xs text-primary hover:underline">Criar chave gratuita →</a>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Chave Gemini</label>
          <input
            type="password"
            value={geminiKey}
            onChange={e => setGeminiKey(e.target.value)}
            placeholder="AIza..."
            className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer"
            className="text-xs text-primary hover:underline">Criar chave gratuita →</a>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={!canSave}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90 transition-colors"
      >
        Salvar
      </button>
    </div>
  );
}

// ── Widget principal ──────────────────────────────────────────────────────────
export function ChatWidget({ sessions }: ChatWidgetProps) {
  const [open,       setOpen]       = useState(false);
  const [showSetup,  setShowSetup]  = useState(false);
  const [messages,   setMessages]   = useState<Msg[]>([]);
  const [input,      setInput]      = useState("");
  const [loading,    setLoading]    = useState(false);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false); // guard síncrono contra double-click

  const sessionsContext = useMemo(() => buildSessionsContext(sessions), [sessions]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const hasKey = () => {
    const provider = localStorage.getItem('chat_provider') || 'groq';
    const key = provider === 'groq'
      ? localStorage.getItem('groq_api_key')
      : localStorage.getItem('gemini_api_key');
    return !!key?.trim();
  };

  const sendMessage = async () => {
    // Guard síncrono — useState é assíncrono e não bloqueia double-click
    if (sendingRef.current || !input.trim() || loading) return;
    sendingRef.current = true;

    if (!hasKey()) { setShowSetup(true); sendingRef.current = false; return; }

    const userMsg: Msg = { role: "user", content: input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const provider    = (localStorage.getItem('chat_provider') || 'groq') as 'groq' | 'gemini';
      const groqApiKey  = localStorage.getItem('groq_api_key')   || '';
      const geminiApiKey = localStorage.getItem('gemini_api_key') || '';

      const allMessages = [...messages, userMsg];
      const text = await localApi.chat.ask({
        messages: allMessages,
        sessionsContext,
        groqApiKey,
        geminiApiKey,
        provider,
      });

      setMessages(prev => [...prev, { role: "assistant", content: text }]);
    } catch (err: any) {
      const errMsg = err?.message || 'Erro ao contatar IA.';
      if (errMsg.includes('não configurada') || errMsg.includes('401')) {
        setShowSetup(true);
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: `Erro: ${errMsg}` }]);
      }
    } finally {
      setLoading(false);
      sendingRef.current = false;
    }
  };

  return (
    <>
      {/* Botão flutuante */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all"
        aria-label="Abrir assistente IA"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {/* Painel do chat */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex w-[360px] flex-col rounded-2xl border border-border bg-background shadow-2xl overflow-hidden"
          style={{ maxHeight: "calc(100vh - 120px)" }}>

          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-muted/50">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              <span className="text-sm font-semibold">Assistente de Segurança EPI</span>
            </div>
            <button onClick={() => setShowSetup(s => !s)} className="rounded-md p-1 hover:bg-accent transition-colors" title="Configurações IA">
              <Settings className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          {/* Setup inline */}
          {showSetup && (
            <div className="border-b border-border bg-muted/30">
              <ApiKeySetup onSave={() => setShowSetup(false)} />
            </div>
          )}

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {messages.length === 0 && (
              <div className="text-center text-xs text-muted-foreground py-8">
                <Bot className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p>Olá! Sou o assistente de segurança EPI.</p>
                <p className="mt-1">Pergunte sobre padrões de violações, horários críticos ou funcionários em risco.</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start")}>
                {msg.role === "assistant" && <Bot className="h-5 w-5 mt-1 shrink-0 text-primary" />}
                <div className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-muted text-foreground rounded-bl-sm"
                )}>
                  {msg.role === "assistant"
                    ? <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-none">{msg.content}</ReactMarkdown>
                    : msg.content
                  }
                </div>
                {msg.role === "user" && <User className="h-5 w-5 mt-1 shrink-0 text-muted-foreground" />}
              </div>
            ))}
            {loading && (
              <div className="flex gap-2 justify-start">
                <Bot className="h-5 w-5 mt-1 shrink-0 text-primary" />
                <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border p-3 flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Pergunte sobre as inspeções..."
              className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={loading}
            />
            <Button size="icon" onClick={sendMessage} disabled={loading || !input.trim()} className="rounded-xl shrink-0">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
