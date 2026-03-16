// SafeView EPI — v1 | Feito por Gabriel Madureira
// useSessionPersistence.ts — rastreia eventos de EPI e persiste sessões no backend local
import { useRef, useCallback } from "react";
import { localApi } from "@/integrations/supabase/client-local";

export interface EpiData {
  riskIndex:    number;   // 0.0–1.0: índice de risco da inspeção atual
  noHelmet:     boolean;  // worker sem capacete detectado neste frame
  noVest:       boolean;  // worker sem colete detectado neste frame
  noGloves:     boolean;  // worker sem luvas detectado neste frame
  noGlasses:    boolean;  // worker sem óculos de proteção detectado neste frame
}

export function useSessionPersistence() {
  // Guards de race condition — useRef é síncrono, useState não é
  // Evita duplo disparo de startSession/endSession por clique rápido
  const isStartingRef     = useRef(false);
  const isEndingRef       = useRef(false);
  const shouldCancelRef   = useRef(false);
  const sessionIdRef      = useRef<string | null>(null);
  const startTimeRef      = useRef<number>(0);

  // Contadores de eventos — padrão de média progressiva O(1)
  // Evita crescimento ilimitado do array (30fps × 8h = 864k entradas)
  const runningSumRef        = useRef(0);
  const sampleCountRef       = useRef(0);
  const peakRiskRef          = useRef(0);
  const alertCountRef        = useRef(0);

  // Contadores de EPI — incrementados apenas na borda de subida
  // (transição false→true) para contar eventos únicos, não frames contínuos
  const noHelmetCountRef     = useRef(0);
  const noVestCountRef       = useRef(0);
  const noGlovesCountRef     = useRef(0);
  const noGlassesCountRef    = useRef(0);

  // Refs de estado anterior para detecção de borda de subida
  const prevNoHelmetRef      = useRef(false);
  const prevNoVestRef        = useRef(false);
  const prevNoGlovesRef      = useRef(false);
  const prevNoGlassesRef     = useRef(false);

  const startSession = useCallback(async (metadata?: {
    nome_funcionario?: string;
    local_trabalho?: string;
    trabalho_realizado?: string;
    informacoes_adicionais?: string;
  }) => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;

    // Reset de todos os contadores antes de cada nova sessão
    runningSumRef.current     = 0;
    sampleCountRef.current    = 0;
    peakRiskRef.current       = 0;
    alertCountRef.current     = 0;
    noHelmetCountRef.current  = 0;
    noVestCountRef.current    = 0;
    noGlovesCountRef.current  = 0;
    noGlassesCountRef.current = 0;
    prevNoHelmetRef.current   = false;
    prevNoVestRef.current     = false;
    prevNoGlovesRef.current   = false;
    prevNoGlassesRef.current  = false;
    shouldCancelRef.current   = false;
    startTimeRef.current      = Date.now();

    try {
      const session = await localApi.sessions.create(metadata || {});
      // Se endSession foi chamado enquanto startSession estava em voo,
      // deleta a sessão imediatamente sem persistir dados parciais
      if (shouldCancelRef.current) {
        localApi.sessions.delete(session.id).catch(() => {});
        return;
      }
      sessionIdRef.current = session.id;
    } finally {
      isStartingRef.current = false;
    }
  }, []);

  const updateMetrics = useCallback((epiData: EpiData) => {
    // Média progressiva — não acumula array, usa soma e contagem
    runningSumRef.current  += epiData.riskIndex;
    sampleCountRef.current += 1;

    if (epiData.riskIndex > peakRiskRef.current) {
      peakRiskRef.current = epiData.riskIndex;
    }

    // Contagem por borda de subida (false→true = novo evento)
    if (epiData.noHelmet  && !prevNoHelmetRef.current)  noHelmetCountRef.current++;
    if (epiData.noVest    && !prevNoVestRef.current)    noVestCountRef.current++;
    if (epiData.noGloves  && !prevNoGlovesRef.current)  noGlovesCountRef.current++;
    if (epiData.noGlasses && !prevNoGlassesRef.current) noGlassesCountRef.current++;

    prevNoHelmetRef.current  = epiData.noHelmet;
    prevNoVestRef.current    = epiData.noVest;
    prevNoGlovesRef.current  = epiData.noGloves;
    prevNoGlassesRef.current = epiData.noGlasses;
  }, []);

  const recordAlert = useCallback(() => {
    alertCountRef.current++;
  }, []);

  const endSession = useCallback(async () => {
    // Guard contra dupla chamada (ex: botão Parar + desmontagem simultânea)
    if (isEndingRef.current) return;
    isEndingRef.current = true;

    // Se startSession ainda está em voo (create pendente), marca para cancelar
    // em vez de tentar finalizar uma sessão que ainda não tem ID.
    // CRÍTICO: isEndingRef deve ser resetado aqui (finally nunca é alcançado
    // neste caminho de saída antecipado). Sem este reset, qualquer sessão
    // futura nunca poderia ser encerrada — isEndingRef ficaria travado em true.
    if (isStartingRef.current) {
      shouldCancelRef.current = true;
      isEndingRef.current = false; // libera o guard para sessões futuras
      return;
    }

    if (!sessionIdRef.current) return;

    const durationSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);
    const avgRisk = sampleCountRef.current > 0
      ? runningSumRef.current / sampleCountRef.current
      : 0;

    try {
      await localApi.sessions.update(sessionIdRef.current, {
        duracao_segundos:     durationSeconds,
        pico_risco:           peakRiskRef.current,
        nivel_risco:          Math.round(avgRisk * 100) / 100,
        total_alertas:        alertCountRef.current,
        eventos_sem_capacete: noHelmetCountRef.current,
        eventos_sem_colete:   noVestCountRef.current,
        eventos_sem_luvas:    noGlovesCountRef.current,
        eventos_sem_oculos:   noGlassesCountRef.current,
      });
      // Só anula o ID após confirmação de gravação bem-sucedida.
      sessionIdRef.current = null;
    } catch (err) {
      console.error('Falha ao finalizar sessão — dados preservados para retry:', err);
      // sessionIdRef.current permanece com o ID: o chamador pode tentar endSession novamente
    } finally {
      isEndingRef.current = false; // libera o guard para permitir retry após falha
    }
  }, []);

  return { startSession, updateMetrics, recordAlert, endSession };
}
