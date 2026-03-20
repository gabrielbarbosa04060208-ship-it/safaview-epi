// SafeView 4.0 - v49 | Feito por Gabriel Madureira em 14/03/2026
// client-local.ts — substitui o cliente Supabase nos dois apps.
const API_URL = (window as any).electronAPI?.apiUrl ?? 'http://127.0.0.1:3001';
const WS_URL  = (window as any).electronAPI?.wsUrl  ?? 'ws://127.0.0.1:3001';

export interface Session {
  id: string;
  created_at: string;
  duracao_segundos: number;
  eventos_bocejos: number;
  eventos_olhos_fechados: number;
  media_fadiga: number;
  pico_fadiga: number;
  total_alertas: number;
  nome_funcionario: string | null;
  local_trabalho: string | null;
  trabalho_realizado: string | null;
  informacoes_adicionais: string | null;
}

export type SessionInsert = Partial<Omit<Session, 'id' | 'created_at'>>;

function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 10_000): Promise<Response> {
  const ctrl = new AbortController();
  const t    = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

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
  chat: {
    async stream(
      messages: { role: string; content: string }[],
      sessionsContext: string,
      onChunk: (text: string) => void,
      cancelSignal?: AbortSignal,
    ): Promise<void> {
      const provider     = localStorage.getItem('chat_provider') || 'groq';
      const groqApiKey   = localStorage.getItem('groq_api_key')   || '';
      const geminiApiKey = localStorage.getItem('gemini_api_key') || '';
      if (cancelSignal?.aborted) throw new Error('__cancelled__');
      const api = (window as any).electronAPI;
      if (!api?.chatAsk) {
        const res = await fetch(`${API_URL}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages, sessionsContext, groqApiKey, geminiApiKey, provider }),
          signal: cancelSignal,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(body.error || 'Erro ' + res.status);
        }
        const body = await res.json();
        if (body.text) onChunk(body.text);
        return;
      }
      let text: string;
      try {
        text = await api.chatAsk({ messages, sessionsContext, groqApiKey, geminiApiKey, provider });
      } catch (err: any) {
        if (err.message === '__cancelled__') throw err;
        throw new Error(err.message || 'Erro ao chamar IA.');
      }
      if (cancelSignal?.aborted) throw new Error('__cancelled__');
      if (text) onChunk(text);
    },
  },
  realtime: {
    connect(onEvent: (e: { type: string; session?: Session; id?: string }) => void): WebSocket {
      const ws = new WebSocket(WS_URL);
      ws.onmessage = (e) => { try { onEvent(JSON.parse(e.data)); } catch {} };
      ws.onerror   = (e) => console.error('[WS] erro:', e);
      return ws;
    },
  },
};
