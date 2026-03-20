// SafeView EPI — useEpiSessionPersistence.ts
// Análogo ao useSessionPersistence.ts do SafeView original.
// Reusa o mesmo schema de banco (mesmas colunas) com semântica adaptada:
//
//  media_fadiga           → taxa de violação média (0-100)
//  pico_fadiga            → pico de violação (0-100)
//  eventos_olhos_fechados → eventos de ausência de capacete (bordas de transição)
//  eventos_bocejos        → eventos de ausência de colete
//  total_alertas          → quadros com pelo menos 1 pessoa sem EPI

import { useRef, useCallback } from 'react';
import { localApi } from '@/integrations/supabase/client-local';
import type { EpiData } from './useEpiDetector';

export function useEpiSessionPersistence() {
  const sessionIdRef      = useRef<string | null>(null);
  const startTimeRef      = useRef<number>(0);
  const isStartingRef     = useRef(false);
  const shouldCancelRef   = useRef(false);
  const isEndingRef       = useRef(false);

  // Métricas acumuladas
  const peakViolationRef  = useRef(0);    // pior taxa de violação observada
  const runningSumRef     = useRef(0);    // soma para média progressiva
  const sampleCountRef    = useRef(0);
  const alertFramesRef    = useRef(0);    // quadros com isAlert=true → total_alertas
  const noHelmetEventsRef = useRef(0);    // bordas de transição sem capacete
  const noVestEventsRef   = useRef(0);    // bordas de transição sem colete

  // Estado anterior (para detecção de borda)
  const prevHasHelmetRef  = useRef(true); // começa true (sem pessoa = conforme)
  const prevHasVestRef    = useRef(true);

  const startSession = useCallback(async () => {
    if (isStartingRef.current) return;
    isStartingRef.current  = true;
    shouldCancelRef.current = false;

    // Zera tudo
    peakViolationRef.current  = 0;
    runningSumRef.current     = 0;
    sampleCountRef.current    = 0;
    alertFramesRef.current    = 0;
    noHelmetEventsRef.current = 0;
    noVestEventsRef.current   = 0;
    prevHasHelmetRef.current  = true;
    prevHasVestRef.current    = true;
    startTimeRef.current      = Date.now();

    try {
      const session = await localApi.sessions.create({
        duracao_segundos:       0,
        media_fadiga:           0,
        pico_fadiga:            0,
        total_alertas:          0,
        eventos_olhos_fechados: 0,
        eventos_bocejos:        0,
      });

      if (shouldCancelRef.current) {
        localApi.sessions.delete(session.id).catch(() => {});
        return;
      }
      sessionIdRef.current = session.id;
    } catch (err) {
      console.error('[EPI] Falha ao criar sessão:', err);
    } finally {
      isStartingRef.current = false;
    }
  }, []);

  /** Chamado a cada frame com o resultado da inferência */
  const updateMetrics = useCallback((epiData: EpiData) => {
    if (!sessionIdRef.current) return;

    const violation = epiData.violationRate; // 0-100

    // Pico
    if (violation > peakViolationRef.current) peakViolationRef.current = violation;

    // Média progressiva
    runningSumRef.current  += violation;
    sampleCountRef.current += 1;

    // Quadros de alerta
    if (epiData.isAlert) alertFramesRef.current++;

    // Bordas de transição → eventos (conta quantas vezes EPI sumiu)
    if (epiData.personDetected) {
      if (!epiData.hasHelmetAny && prevHasHelmetRef.current) noHelmetEventsRef.current++;
      if (!epiData.hasVestAny   && prevHasVestRef.current  ) noVestEventsRef.current++;
    }
    prevHasHelmetRef.current = epiData.hasHelmetAny;
    prevHasVestRef.current   = epiData.hasVestAny;
  }, []);

  /** Registra alerta manual (ex: botão de alerta sonoro na UI) */
  const recordAlert = useCallback(() => {
    alertFramesRef.current++;
  }, []);

  const endSession = useCallback(async () => {
    if (isEndingRef.current) return;
    isEndingRef.current = true;

    if (isStartingRef.current) {
      shouldCancelRef.current = true;
      isEndingRef.current = false;
      return;
    }

    if (!sessionIdRef.current) { isEndingRef.current = false; return; }

    const durationSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);
    const avgViolation = sampleCountRef.current > 0
      ? runningSumRef.current / sampleCountRef.current
      : 0;

    try {
      await localApi.sessions.update(sessionIdRef.current, {
        duracao_segundos:       durationSeconds,
        pico_fadiga:            Math.round(peakViolationRef.current * 100) / 100,
        media_fadiga:           Math.round(avgViolation * 100) / 100,
        total_alertas:          alertFramesRef.current,
        eventos_olhos_fechados: noHelmetEventsRef.current,  // ausência de capacete
        eventos_bocejos:        noVestEventsRef.current,    // ausência de colete
      });
      sessionIdRef.current = null;
    } catch (err) {
      console.error('[EPI] Falha ao finalizar sessão:', err);
    } finally {
      isEndingRef.current = false;
    }
  }, []);

  return { startSession, updateMetrics, recordAlert, endSession };
}
