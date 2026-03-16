// SafeView EPI — v1
// pages/Index.tsx — tela principal do detector de EPI

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  HardHat, ShieldCheck, ShieldX, Timer, AlertTriangle,
  Wifi, WifiOff, Activity, Eye, Camera
} from 'lucide-react';
import { useEpiDetection } from '@/hooks/useEpiDetection';
import { useSessionPersistence } from '@/hooks/useSessionPersistence';
import { toast } from 'sonner';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function riskColor(risk: number) {
  if (risk < 0.30) return 'text-green-400';
  if (risk < 0.60) return 'text-yellow-400';
  return 'text-red-400';
}

function riskLabel(risk: number) {
  if (risk < 0.30) return 'Baixo';
  if (risk < 0.60) return 'Moderado';
  return 'Alto';
}

function EpiBadge({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
      ok
        ? 'border-green-800/40 bg-green-950/30 text-green-400'
        : 'border-red-800/40 bg-red-950/30 text-red-400 animate-pulse'
    }`}>
      {ok ? <ShieldCheck className="h-4 w-4 shrink-0" /> : <ShieldX className="h-4 w-4 shrink-0" />}
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}

export default function Index() {
  const {
    frame, violations, persons, fps, mode, connected, riskIndex
  } = useEpiDetection();

  const { startSession, updateMetrics, recordAlert, endSession } = useSessionPersistence();

  const [isMonitoring,  setIsMonitoring]  = useState(false);
  const [elapsed,       setElapsed]       = useState(0);
  const [alertCount,    setAlertCount]    = useState(0);

  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevViolRef     = useRef({ noHelmet: false, noVest: false, noGloves: false, noGlasses: false });
  const startingRef     = useRef(false);
  const stoppingRef     = useRef(false);

  // ── Timer de sessão ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (isMonitoring) {
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isMonitoring]);

  // ── Atualiza métricas da sessão ─────────────────────────────────────────────
  useEffect(() => {
    if (!isMonitoring) return;
    updateMetrics({
      riskIndex,
      noHelmet:  violations.noHelmet,
      noVest:    violations.noVest,
      noGloves:  violations.noGloves,
      noGlasses: violations.noGlasses,
    });
    const prev = prevViolRef.current;
    let newAlerts = 0;
    if (violations.noHelmet  && !prev.noHelmet)  newAlerts++;
    if (violations.noVest    && !prev.noVest)    newAlerts++;
    if (violations.noGloves  && !prev.noGloves)  newAlerts++;
    if (violations.noGlasses && !prev.noGlasses) newAlerts++;
    if (newAlerts > 0) { recordAlert(); setAlertCount(c => c + newAlerts); }
    prevViolRef.current = { ...violations };
  }, [violations, riskIndex, isMonitoring, updateMetrics, recordAlert]);

  // ── Inicia monitoramento — NÃO depende do AI Engine estar conectado ─────────
  const handleStart = useCallback(async () => {
    if (startingRef.current || isMonitoring) return;
    startingRef.current = true;
    try {
      await startSession();
      setElapsed(0);
      setAlertCount(0);
      prevViolRef.current = { noHelmet: false, noVest: false, noGloves: false, noGlasses: false };
      setIsMonitoring(true);
      toast.success('Monitoramento iniciado.');
    } catch (err: any) {
      toast.error(`Erro ao iniciar sessão: ${err?.message ?? 'verifique o servidor.'}`);
    } finally {
      startingRef.current = false;
    }
  }, [isMonitoring, startSession]);

  // ── Encerra monitoramento ───────────────────────────────────────────────────
  const handleStop = useCallback(async () => {
    if (!isMonitoring || stoppingRef.current) return;
    stoppingRef.current = true;
    setIsMonitoring(false);
    try {
      await endSession();
      toast.success('Sessão salva no Dashboard.');
    } catch (err: any) {
      toast.error(`Erro ao salvar sessão: ${err?.message ?? ''}`);
    } finally {
      stoppingRef.current = false;
    }
  }, [isMonitoring, endSession]);

  const anyViolation = violations.noHelmet || violations.noVest ||
                       violations.noGloves || violations.noGlasses;

  const modeLabel: Record<string, string> = {
    real:        'Detecção Real',
    ppe_public:  'PPE Público',
    heuristic:   'Protótipo',
    prototipo:   'Protótipo',
    carregando:  'Carregando...',
  };

  return (
    <div className="flex h-full min-h-screen flex-col bg-background text-foreground select-none">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border/50 px-5 py-3">
        <div className="flex items-center gap-2">
          <HardHat className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold tracking-tight">SafeView EPI</span>
          {mode !== 'real' && mode !== 'carregando' && (
            <span className="rounded bg-yellow-500/20 px-2 py-0.5 text-[10px] font-bold text-yellow-400 uppercase tracking-wider">
              {modeLabel[mode] ?? mode}
            </span>
          )}
          {mode === 'real' && (
            <span className="rounded bg-green-500/20 px-2 py-0.5 text-[10px] font-bold text-green-400 uppercase tracking-wider">
              Detecção Real
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {connected && fps > 0 && (
            <span className="flex items-center gap-1">
              <Activity className="h-3 w-3" />
              {fps.toFixed(0)} fps
            </span>
          )}
          <span className={`flex items-center gap-1 ${connected ? 'text-green-400' : 'text-yellow-400'}`}>
            {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {connected ? 'AI conectado' : 'AI desconectado'}
          </span>
        </div>
      </div>

      {/* ── Conteúdo ─────────────────────────────────────────────────────── */}
      <div className="flex flex-1 gap-4 p-4 overflow-hidden">

        {/* ── Feed ──────────────────────────────────────────────────────── */}
        <div className="relative flex-1 overflow-hidden rounded-xl border border-border/50 bg-black">
          {frame ? (
            <img
              src={`data:image/jpeg;base64,${frame}`}
              alt="Feed EPI"
              className="h-full w-full object-contain"
              draggable={false}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              {connected
                ? <><Activity className="h-8 w-8 opacity-30 animate-pulse" /><p className="text-sm">Inicializando câmera...</p></>
                : <><Camera className="h-10 w-10 opacity-20" /><p className="text-sm">AI Engine não conectado</p>
                    <p className="text-xs opacity-50 text-center max-w-xs">
                      O monitoramento funciona mesmo sem câmera.<br/>
                      Inicie a sessão e o feed aparece quando o AI conectar.
                    </p></>
              }
            </div>
          )}

          {/* Banner de violação */}
          {isMonitoring && anyViolation && (
            <div className="absolute top-3 left-3 flex items-center gap-2 rounded-lg bg-red-600/90 px-3 py-2 shadow-lg backdrop-blur-sm">
              <AlertTriangle className="h-4 w-4 text-white" />
              <span className="text-xs font-bold text-white">VIOLAÇÃO DETECTADA</span>
            </div>
          )}

          {connected && persons > 0 && (
            <div className="absolute bottom-3 left-3 rounded-md bg-black/60 px-2 py-1 text-xs text-white backdrop-blur-sm">
              👷 {persons} {persons === 1 ? 'pessoa detectada' : 'pessoas detectadas'}
            </div>
          )}
        </div>

        {/* ── Painel lateral ─────────────────────────────────────────────── */}
        <div className="flex w-52 flex-col gap-3">

          {/* Status EPI */}
          <div className="rounded-xl border border-border/50 bg-card p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Status EPI
            </p>
            <div className="flex flex-col gap-2">
              <EpiBadge label="Capacete"  ok={!violations.noHelmet}  />
              <EpiBadge label="Colete"    ok={!violations.noVest}    />
              <EpiBadge label="Luvas"     ok={!violations.noGloves}  />
              <EpiBadge label="Óculos"    ok={!violations.noGlasses} />
            </div>
          </div>

          {/* Nível de risco */}
          <div className="rounded-xl border border-border/50 bg-card p-3">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Nível de Risco
            </p>
            <p className={`text-2xl font-bold tabular-nums ${riskColor(riskIndex)}`}>
              {(riskIndex * 100).toFixed(0)}%
            </p>
            <p className={`text-xs font-medium ${riskColor(riskIndex)}`}>
              {riskLabel(riskIndex)}
            </p>
            <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
              <div
                className={`h-1.5 rounded-full transition-all duration-500 ${
                  riskIndex < 0.30 ? 'bg-green-500' :
                  riskIndex < 0.60 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${riskIndex * 100}%` }}
              />
            </div>
          </div>

          {/* Timer de sessão */}
          {isMonitoring && (
            <div className="rounded-xl border border-border/50 bg-card p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Sessão Ativa
              </p>
              <div className="flex items-center gap-2 text-sm">
                <Timer className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono font-semibold">{formatDuration(elapsed)}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-orange-400" />
                <span className="text-orange-400 font-semibold">{alertCount} alertas</span>
              </div>
            </div>
          )}

          {/* Botão principal — NÃO é mais desabilitado por !connected */}
          <button
            onClick={isMonitoring ? handleStop : handleStart}
            className={`mt-auto w-full rounded-xl py-3 text-sm font-bold transition-all ${
              isMonitoring
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-primary hover:bg-primary/90 text-primary-foreground'
            }`}
          >
            {isMonitoring ? '⏹ Encerrar Sessão' : '▶ Iniciar Monitoramento'}
          </button>

          {/* Nota sobre o modo */}
          {mode !== 'real' && (
            <p className="text-center text-[10px] text-muted-foreground/50 leading-snug">
              {mode === 'ppe_public'
                ? 'Capacete + colete: detecção real\nLuvas + óculos: estimado'
                : 'Modo demonstração ativo\nSubstitua models/best.pt\npelo modelo do Pilar 1'}
            </p>
          )}
        </div>
      </div>

      <div style={{
        position: 'fixed', bottom: 8, right: 12, fontSize: 10,
        color: 'rgba(148,163,184,0.25)', userSelect: 'none',
        pointerEvents: 'none', letterSpacing: '0.04em', fontFamily: 'monospace',
      }}>
        SafeView EPI • build MD-01
      </div>
    </div>
  );
}
