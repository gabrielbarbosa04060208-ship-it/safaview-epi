// SafeView EPI — v1 | Feito por Gabriel Madureira
// client-local.ts — substitui o cliente Supabase nos dois apps.
// Aponta para o servidor Express local embutido no Electron.

const API_URL = (window as any).electronAPI?.apiUrl ?? 'http://127.0.0.1:3001';
const WS_URL  = (window as any).electronAPI?.wsUrl  ?? 'ws://127.0.0.1:3001';

// ── Types ──────────────────────────────────────────────────────────────────────
export interface Session {
  id:                     string;
  created_at:             string;
  duracao_segundos:       number;
  eventos_sem_capacete:   number;
  eventos_sem_colete:     number;
  eventos_sem_luvas:      number;
  eventos_sem_oculos:     number;
  nivel_risco:            number;
  pico_risco:             number;
  total_alertas:          number;
  nome_funcionario:       string | null;
  local_trabalho:         string | null;
  trabalho_realizado:     string | null;
  informacoes_adicionais: string | null;
}

export type SessionInsert = Partial<Omit<Session, 'id' | 'created_at'>>;

// Helper: fetch com timeout automático de 10s para chamadas ao servidor local.
// Previne que o UI fique em loading eterno se o Express travar (ex: disco lento).
function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 10_000): Promise<Response> {
  const ctrl = new AbortController();
  const t    = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

// ── Sessions ───────────────────────────────────────────────────────────────────
export const localApi = {
  sessions: {
    async list(limit = 200, offset = 0): Promise<{ data: Session[]; count: number }> {
      const res = await fetchWithTimeout(`${API_URL}/sessions?limit=${limit}&offset=${offset}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },

    async get(id: string): Promise<Session> {
      const res = await fetchWithTimeout(`${API_URL}/sessions/${id}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },

    async create(data: SessionInsert & { id?: string }): Promise<Session> {
      const res = await fetchWithTimeout(`${API_URL}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },

    async update(id: string, data: SessionInsert): Promise<Session> {
      const res = await fetchWithTimeout(`${API_URL}/sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },

    async delete(id: string): Promise<void> {
      const res = await fetchWithTimeout(`${API_URL}/sessions/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
    },
  },

  // ── Chat IA (Groq / Gemini) ──────────────────────────────────────────────────
  // CRÍTICO: usa ipcRenderer.invoke('chat:ask') → main process → fetch Groq/Gemini.
  // O renderer NUNCA faz fetch externo — o Chromium intercepta SSE e corrompe streaming.
  chat: {
    async ask(payload: {
      messages: { role: string; content: string }[];
      sessionsContext: string;
      groqApiKey?: string;
      geminiApiKey?: string;
      provider: 'groq' | 'gemini';
    }): Promise<string> {
      const api = (window as any).electronAPI;
      if (!api?.chatAsk) throw new Error('electronAPI não disponível');
      return api.chatAsk(payload);
    },
  },

  // ── WebSocket realtime ─────────────────────────────────────────────────────
  realtime: {
    connect(onEvent: (event: { type: string; session?: Session; id?: string }) => void): WebSocket {
      const ws = new WebSocket(WS_URL);
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          onEvent(data);
        } catch {
          // mensagem malformada — ignorar silenciosamente
        }
      };
      return ws;
    },
  },
};
