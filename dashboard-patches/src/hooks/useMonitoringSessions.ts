// SafeView EPI — v1 | Feito por Gabriel Madureira
// useMonitoringSessions.ts — versão local com reconexão WebSocket
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { localApi } from "@/integrations/supabase/client-local";
import type { MonitoringSession } from "@/components/dashboard/SessionsTable";

export function useMonitoringSessions() {
  const queryClient = useQueryClient();
  const wsRef       = useRef<WebSocket | null>(null);
  const retryRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function connect() {
      if (retryRef.current) clearTimeout(retryRef.current);

      const ws = localApi.realtime.connect((event) => {
        if (
          event.type === 'SESSION_CREATED' ||
          event.type === 'SESSION_UPDATED' ||
          event.type === 'SESSION_DELETED'
        ) {
          queryClient.invalidateQueries({ queryKey: ["sessoes_de_monitoramento"] });
        }
      });

      ws.onclose = () => {
        console.warn('[WS] Conexão encerrada, reconectando em 3s...');
        retryRef.current = setTimeout(connect, 3000);
      };

      wsRef.current = ws;
    }

    connect();

    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // evita reconexão ao desmontar
        wsRef.current.close();
      }
    };
  }, [queryClient]);

  return useQuery<MonitoringSession[]>({
    queryKey: ["sessoes_de_monitoramento"],
    queryFn: async () => {
      const { data } = await localApi.sessions.list(200, 0);
      return data.map((s) => ({
        id:                     s.id,
        created_at:             s.created_at,
        duracao_segundos:       s.duracao_segundos,
        pico_risco:             s.pico_risco,
        nivel_risco:            s.nivel_risco,
        total_alertas:          s.total_alertas,
        eventos_sem_capacete:   s.eventos_sem_capacete,
        eventos_sem_colete:     s.eventos_sem_colete,
        eventos_sem_luvas:      s.eventos_sem_luvas,
        eventos_sem_oculos:     s.eventos_sem_oculos,
        nome_funcionario:       s.nome_funcionario,
        local_trabalho:         s.local_trabalho,
        trabalho_realizado:     s.trabalho_realizado,
        informacoes_adicionais: s.informacoes_adicionais,
      })) as MonitoringSession[];
    },
    staleTime: 10_000,
  });
}
