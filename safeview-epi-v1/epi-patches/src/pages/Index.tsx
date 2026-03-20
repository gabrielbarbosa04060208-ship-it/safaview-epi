// SafeView EPI — Index.tsx
// Substitui a Index.tsx do SafeView original (detector de fadiga).
// Mantém o mesmo padrão visual mas adapta métricas e alertas para EPI.

import { useRef, useEffect, useState, useCallback } from "react";
// Bug fix: Vest e HardHat não existem no lucide-react — removidos.
import { ShieldAlert, ShieldCheck, Play, Square, Camera, CameraOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useEpiDetector }          from "@/hooks/useEpiDetector";
import { useEpiSessionPersistence } from "@/hooks/useEpiSessionPersistence";

// ── Helpers visuais ───────────────────────────────────────────────────────────

function ComplianceBadge({ rate }: { rate: number }) {
  if (rate >= 80) return <Badge className="bg-success text-success-foreground border-0 text-sm px-3 py-1">Conforme</Badge>;
  if (rate >= 40) return <Badge className="bg-warning text-warning-foreground border-0 text-sm px-3 py-1">Parcial</Badge>;
  return <Badge className="bg-destructive text-destructive-foreground border-0 text-sm px-3 py-1">Não Conforme</Badge>;
}

function EpiStatusIcon({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-1 rounded-xl px-4 py-3 ${ok ? "bg-success/10 border border-success/30" : "bg-destructive/10 border border-destructive/30"}`}>
      <span className="text-2xl">{ok ? "✅" : "❌"}</span>
      <span className="text-xs font-semibold text-foreground">{label}</span>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

const Index = () => {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  const [isSessionActive, setIsSessionActive] = useState(false);
  const [cameraReady,     setCameraReady]     = useState(false);
  const [cameraError,     setCameraError]     = useState<string | null>(null);

  const { epiData, isModelReady, modelError, startDetection, stopDetection } = useEpiDetector(videoRef);
  const { startSession, updateMetrics, recordAlert, endSession } = useEpiSessionPersistence();

  // ── Câmera ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let stream: MediaStream | null = null;

    async function initCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "environment" },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // Bug fix: sincroniza dimensões do canvas overlay com o vídeo.
          // O canvas HTML tem bitmap 300×150 por padrão — sem isso as bboxes
          // são desenhadas em escala errada independente do CSS w-full/h-full.
          videoRef.current.onloadedmetadata = () => {
            if (overlayRef.current && videoRef.current) {
              overlayRef.current.width  = videoRef.current.videoWidth;
              overlayRef.current.height = videoRef.current.videoHeight;
            }
          };
          await videoRef.current.play();
          setCameraReady(true);
        }
      } catch (err: any) {
        setCameraError(err.message ?? "Sem acesso à câmera");
        toast.error("Câmera indisponível: " + (err.message ?? "Erro desconhecido"));
      }
    }

    initCamera();
    return () => {
      stream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ── Overlay: desenha bounding boxes sobre o vídeo ──────────────────────────
  useEffect(() => {
    const canvas = overlayRef.current;
    const video  = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!isSessionActive || !epiData.personDetected) return;

    const scX = canvas.width  / (video.videoWidth  || 640);
    const scY = canvas.height / (video.videoHeight || 480);

    for (const p of epiData.persons) {
      const x  = p.bbox.x1 * scX, y  = p.bbox.y1 * scY;
      const w  = (p.bbox.x2 - p.bbox.x1) * scX;
      const h  = (p.bbox.y2 - p.bbox.y1) * scY;
      const color = p.compliant ? "#22c55e" : "#ef4444";

      ctx.strokeStyle = color;
      ctx.lineWidth   = 2;
      ctx.strokeRect(x, y, w, h);

      // Label acima da caixa
      const label = `${p.hasHelmet ? "🪖" : "⛔"} ${p.hasVest ? "🦺" : "⛔"}`;
      ctx.fillStyle    = color;
      ctx.font         = "14px sans-serif";
      ctx.fillText(label, x + 4, Math.max(y - 6, 14));
    }
  }, [epiData, isSessionActive]);

  // ── Atualiza métricas a cada frame ─────────────────────────────────────────
  useEffect(() => {
    if (isSessionActive) updateMetrics(epiData);
  }, [epiData, isSessionActive, updateMetrics]);

  // ── Alertas sonoros / toast em alerta ──────────────────────────────────────
  const prevAlertRef = useRef(false);
  useEffect(() => {
    if (!isSessionActive) return;
    if (epiData.isAlert && !prevAlertRef.current) {
      toast.warning("⚠️ EPI ausente detectado!", { duration: 2000 });
      recordAlert();
    }
    prevAlertRef.current = epiData.isAlert;
  }, [epiData.isAlert, isSessionActive, recordAlert]);

  // ── Iniciar / parar sessão ──────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (!isModelReady) {
      toast.error("Modelo ainda carregando, aguarde...");
      return;
    }
    await startSession();
    startDetection();
    setIsSessionActive(true);
  }, [isModelReady, startSession, startDetection]);

  const handleStop = useCallback(async () => {
    stopDetection();
    await endSession();
    setIsSessionActive(false);
    // Limpa overlay
    const ctx = overlayRef.current?.getContext("2d");
    ctx?.clearRect(0, 0, overlayRef.current!.width, overlayRef.current!.height);
  }, [stopDetection, endSession]);

  // ── Estado do modelo ────────────────────────────────────────────────────────
  const modelStatus = modelError
    ? { text: "Erro no modelo", color: "text-destructive" }
    : isModelReady
    ? { text: "Modelo pronto", color: "text-success" }
    : { text: "Carregando modelo...", color: "text-muted-foreground" };

  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* ── Área da câmera ─────────────────────────────────────────────────── */}
      <div className="relative flex-1 bg-black min-h-0" style={{ maxHeight: "calc(100vh - 220px)" }}>

        {cameraError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
            <CameraOff className="h-12 w-12 opacity-50" />
            <p className="text-sm text-muted-foreground">Câmera indisponível</p>
            <p className="text-xs text-destructive">{cameraError}</p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              className="w-full h-full object-contain"
              muted
              playsInline
            />
            <canvas
              ref={overlayRef}
              className="absolute inset-0 w-full h-full"
              style={{ pointerEvents: "none" }}
            />
          </>
        )}

        {/* Badge de status no topo */}
        <div className="absolute top-3 left-3 flex items-center gap-2">
          {isSessionActive && epiData.personDetected ? (
            epiData.isAlert ? (
              <div className="flex items-center gap-2 rounded-full bg-destructive/90 px-3 py-1.5 text-white text-xs font-semibold animate-pulse">
                <ShieldAlert className="h-4 w-4" /> EPI AUSENTE
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-full bg-success/90 px-3 py-1.5 text-white text-xs font-semibold">
                <ShieldCheck className="h-4 w-4" /> CONFORME
              </div>
            )
          ) : isSessionActive ? (
            <div className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-white/70 text-xs">
              <Camera className="h-3.5 w-3.5" /> Aguardando pessoa...
            </div>
          ) : null}
        </div>

        {/* Status do modelo (canto inferior esquerdo) */}
        <div className="absolute bottom-2 left-3">
          <span className={`text-[10px] font-mono ${modelStatus.color}`}>{modelStatus.text}</span>
        </div>
      </div>

      {/* ── Painel inferior ────────────────────────────────────────────────── */}
      <div className="bg-background border-t border-border px-4 py-4 space-y-4">

        {/* Status dos EPIs */}
        <div className="grid grid-cols-2 gap-3">
          <EpiStatusIcon label="Capacete" ok={!isSessionActive || !epiData.personDetected || epiData.hasHelmetAny} />
          <EpiStatusIcon label="Colete"   ok={!isSessionActive || !epiData.personDetected || epiData.hasVestAny}   />
        </div>

        {/* Métricas compactas */}
        {isSessionActive && (
          <div className="grid grid-cols-3 gap-2">
            <Card className="border-border/60 shadow-sm">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">Pessoas</p>
                <p className="text-xl font-bold">{epiData.personCount}</p>
              </CardContent>
            </Card>
            <Card className="border-border/60 shadow-sm">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">Conformidade</p>
                <p className="text-xl font-bold">{epiData.complianceRate}%</p>
              </CardContent>
            </Card>
            <Card className="border-border/60 shadow-sm">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">Status</p>
                <div className="mt-0.5 flex justify-center">
                  <ComplianceBadge rate={epiData.complianceRate} />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Botão principal */}
        <Button
          className="w-full h-12 text-base font-semibold gap-2"
          variant={isSessionActive ? "destructive" : "default"}
          onClick={isSessionActive ? handleStop : handleStart}
          disabled={!cameraReady || !!cameraError}
        >
          {isSessionActive ? (
            <><Square className="h-5 w-5" /> Parar Monitoramento</>
          ) : (
            <><Play className="h-5 w-5" /> Iniciar Monitoramento</>
          )}
        </Button>

        {/* Aviso de modelo não pronto */}
        {modelError && (
          <p className="text-xs text-destructive text-center">
            ⚠️ {modelError}. Verifique se best.onnx está em public/models/.
          </p>
        )}
      </div>
    </div>
  );
};

export default Index;
