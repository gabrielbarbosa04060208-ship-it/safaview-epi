// SafeView EPI — v1
// useEpiDetection.ts — conecta ao AI Engine Python via WebSocket
// Recebe frames anotados + estado de violações em tempo real

import { useState, useEffect, useRef, useCallback } from 'react';

export interface Violations {
  noHelmet:  boolean;
  noVest:    boolean;
  noGloves:  boolean;
  noGlasses: boolean;
}

export interface EpiFrame {
  frame:      string;        // base64 JPEG anotado pelo Python
  persons:    number;
  violations: Violations;
  fps:        number;
  mode:       'real' | 'prototipo' | 'roboflow_local' | 'ppe_public' | 'heuristic' | 'carregando';
  riskIndex:  number;        // 0.0 – 1.0
  rfStatus:   'ok' | 'all_models_failed' | 'encoding_failed';
  rfSuccessfulModels: number;
  rfFailedModels: number;
}

const EMPTY_VIOLATIONS: Violations = {
  noHelmet: false, noVest: false, noGloves: false, noGlasses: false,
};

export function useEpiDetection() {
  const [frame,      setFrame]      = useState<string | null>(null);
  const [violations, setViolations] = useState<Violations>(EMPTY_VIOLATIONS);
  const [persons,    setPersons]    = useState(0);
  const [fps,        setFps]        = useState(0);
  const [mode,       setMode]       = useState<'real' | 'prototipo' | 'carregando'>('carregando');
  const [connected,  setConnected]  = useState(false);
  const [riskIndex,  setRiskIndex]  = useState(0);
  const [rfStatus,   setRfStatus]   = useState<'ok' | 'all_models_failed' | 'encoding_failed'>('ok');
  const [rfSuccessfulModels, setRfSuccessfulModels] = useState(0);
  const [rfFailedModels, setRfFailedModels] = useState(0);

  const wsRef    = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Callback para quando os dados de violação chegam — chamado externamente
  // para alimentar o useSessionPersistence
  const lastEpiData = useRef<EpiFrame | null>(null);
  const getLastEpiData = useCallback(() => lastEpiData.current, []);

  useEffect(() => {
    function connect() {
      if (retryRef.current) clearTimeout(retryRef.current);

      const aiWsUrl = (window as any).electronAPI?.aiWsUrl ?? 'ws://127.0.0.1:3002';
      const ws = new WebSocket(aiWsUrl);

      ws.onopen = () => {
        setConnected(true);
        setMode('carregando');
      };

      ws.onclose = () => {
        setConnected(false);
        setFrame(null);
        setPersons(0);
        setViolations(EMPTY_VIOLATIONS);
        setFps(0);
        setRfStatus('ok');
        setRfSuccessfulModels(0);
        setRfFailedModels(0);
        // Reconexão automática a cada 3s — Python pode levar alguns segundos para iniciar
        retryRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        // onclose será chamado logo após — não precisa tratar aqui
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);

          if (data.type === 'STATUS') {
            setMode(data.mode ?? 'carregando');
            return;
          }

          if (data.type === 'ERROR') {
            console.error('[EpiDetection] Erro do AI Engine:', data.message);
            return;
          }

          if (data.type === 'FRAME') {
            setFrame(data.frame);
            setPersons(data.persons ?? 0);
            setViolations(data.violations ?? EMPTY_VIOLATIONS);
            setFps(data.fps ?? 0);
            setMode(data.mode ?? 'prototipo');
            setRiskIndex(data.riskIndex ?? 0);
            setRfStatus(data.rfStatus ?? 'ok');
            setRfSuccessfulModels(data.rfSuccessfulModels ?? 0);
            setRfFailedModels(data.rfFailedModels ?? 0);

            lastEpiData.current = {
              frame:      data.frame,
              persons:    data.persons ?? 0,
              violations: data.violations ?? EMPTY_VIOLATIONS,
              fps:        data.fps ?? 0,
              mode:       data.mode ?? 'prototipo',
              riskIndex:  data.riskIndex ?? 0,
              rfStatus: data.rfStatus ?? 'ok',
              rfSuccessfulModels: data.rfSuccessfulModels ?? 0,
              rfFailedModels: data.rfFailedModels ?? 0,
            };
          }
        } catch {
          // mensagem malformada — ignorar
        }
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
  }, []);

  return {
    frame,
    violations,
    persons,
    fps,
    mode,
    connected,
    riskIndex,
    rfStatus,
    rfSuccessfulModels,
    rfFailedModels,
    getLastEpiData,
  };
}
