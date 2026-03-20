// SafeView 4.0 - v49 | Feito por Gabriel Madureira em 14/03/2026
import { useRef, useCallback } from 'react';
import { localApi } from '@/integrations/supabase/client-local';
import type { FatigueData } from './useFaceLandmarker';

export function useSessionPersistence() {
  const sessionIdRef            = useRef<string | null>(null);
  const startTimeRef            = useRef<number>(0);
  const isStartingRef           = useRef(false);
  const shouldCancelRef         = useRef(false);
  const peakFatigueRef          = useRef(0);
  const runningSumRef           = useRef(0);
  const sampleCountRef          = useRef(0);
  const alertCountRef           = useRef(0);
  const eyeClosureCountRef      = useRef(0);
  const yawnCountRef            = useRef(0);
  const prevEyesClosedRef       = useRef(false);
  const prevMouthOpenRef        = useRef(false);
  const isEndingRef             = useRef(false);

  const startSession = useCallback(async () => {
    if (isStartingRef.current) return;
    isStartingRef.current  = true;
    shouldCancelRef.current = false;
    peakFatigueRef.current    = 0;
    runningSumRef.current     = 0;
    sampleCountRef.current    = 0;
    alertCountRef.current     = 0;
    eyeClosureCountRef.current = 0;
    yawnCountRef.current      = 0;
    prevEyesClosedRef.current = false;
    prevMouthOpenRef.current  = false;
    startTimeRef.current      = Date.now();
    try {
      const session = await localApi.sessions.create({
        duracao_segundos: 0, media_fadiga: 0, pico_fadiga: 0,
        total_alertas: 0, eventos_olhos_fechados: 0, eventos_bocejos: 0,
      });
      if (shouldCancelRef.current) {
        localApi.sessions.delete(session.id).catch(() => {});
        return;
      }
      sessionIdRef.current = session.id;
    } catch (err) {
      console.error('Falha ao criar sessão:', err);
    } finally {
      isStartingRef.current = false;
    }
  }, []);

  const updateMetrics = useCallback((fatigueData: FatigueData) => {
    if (!sessionIdRef.current) return;
    if (fatigueData.fatigueIndex > peakFatigueRef.current) peakFatigueRef.current = fatigueData.fatigueIndex;
    runningSumRef.current += fatigueData.fatigueIndex;
    sampleCountRef.current++;
    if (fatigueData.isEyesClosed && !prevEyesClosedRef.current) eyeClosureCountRef.current++;
    prevEyesClosedRef.current = fatigueData.isEyesClosed;
    if (fatigueData.isMouthOpen && !prevMouthOpenRef.current) yawnCountRef.current++;
    prevMouthOpenRef.current = fatigueData.isMouthOpen;
  }, []);

  const recordAlert = useCallback(() => { alertCountRef.current++; }, []);

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
    const avgFatigue = sampleCountRef.current > 0 ? runningSumRef.current / sampleCountRef.current : 0;
    try {
      await localApi.sessions.update(sessionIdRef.current, {
        duracao_segundos: durationSeconds,
        pico_fadiga: peakFatigueRef.current,
        media_fadiga: Math.round(avgFatigue * 100) / 100,
        total_alertas: alertCountRef.current,
        eventos_olhos_fechados: eyeClosureCountRef.current,
        eventos_bocejos: yawnCountRef.current,
      });
      sessionIdRef.current = null;
    } catch (err) {
      console.error('Falha ao finalizar sessão:', err);
    } finally {
      isEndingRef.current = false;
    }
  }, []);

  return { startSession, updateMetrics, recordAlert, endSession };
}
