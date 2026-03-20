// SafeView EPI — useEpiDetector.ts
// Substitui useFaceLandmarker do SafeView original.
// Roda o modelo YOLO11n (best.onnx) via onnxruntime-web no Chromium.
// Porta a lógica de person-PPE association do workplace_safety_monitor.py.

// Bug fix #5: importar RefObject explicitamente para não usar React.RefObject
//             (evita erro de compilação sem 'import React')
import { useRef, useCallback, useEffect, useState, type RefObject } from 'react';

// ── Tipos ────────────────────────────────────────────────────────────────────

interface BBox { x1: number; y1: number; x2: number; y2: number }
interface Detection extends BBox { score: number; cls: number }

export interface PersonStatus {
  bbox: BBox;
  hasHelmet: boolean;
  hasVest: boolean;
  compliant: boolean; // capacete E colete
}

/** Interface análoga ao FatigueData — mantém compatibilidade com useEpiSessionPersistence */
export interface EpiData {
  personDetected: boolean;
  personCount:    number;
  complianceRate: number;   // 0-100: 100 = todos conformes, 0 = nenhum conforme
  violationRate:  number;   // 0-100: inverso — análogo ao fatigueIndex
  hasHelmetAny:   boolean;  // ao menos 1 pessoa tem capacete
  hasVestAny:     boolean;  // ao menos 1 pessoa tem colete
  isAlert:        boolean;  // pessoa detectada SEM EPI obrigatório
  persons:        PersonStatus[];
}

// ── Constantes de inferência ──────────────────────────────────────────────────

const INPUT_SIZE  = 640;
const CONF_THRESH = 0.45;
const NMS_IOU_TH  = 0.45;
const SMOOTH_WIN  = 7;   // frames para suavização temporal

// Índices de classe do modelo best.pt
// 0=Boots 1=Ear-protection 2=Glass 3=Glove 4=Helmet 5=Mask 6=Person 7=Vest
const CLS_HELMET = 4;
const CLS_PERSON = 6;
const CLS_VEST   = 7;
const NUM_CLASSES = 8;

// Thresholds de associação PPE → pessoa (portados do workplace_safety_monitor.py)
const HEAD_IOU_GATE          = 0.08;
const TORSO_IOU_GATE         = 0.12;
const PPE_INSIDE_PERSON_FRAC = 0.30;

// ── Funções geométricas ───────────────────────────────────────────────────────

function iou(a: BBox, b: BBox): number {
  const ix1 = Math.max(a.x1, b.x1), iy1 = Math.max(a.y1, b.y1);
  const ix2 = Math.min(a.x2, b.x2), iy2 = Math.min(a.y2, b.y2);
  const iw = Math.max(0, ix2 - ix1), ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  if (inter <= 0) return 0;
  const aArea = Math.max(1, (a.x2 - a.x1) * (a.y2 - a.y1));
  const bArea = Math.max(1, (b.x2 - b.x1) * (b.y2 - b.y1));
  return inter / (aArea + bArea - inter);
}

function insideFraction(inner: BBox, outer: BBox): number {
  const ix1 = Math.max(inner.x1, outer.x1), iy1 = Math.max(inner.y1, outer.y1);
  const ix2 = Math.min(inner.x2, outer.x2), iy2 = Math.min(inner.y2, outer.y2);
  const iw = Math.max(0, ix2 - ix1), ih = Math.max(0, iy2 - iy1);
  const innerArea = Math.max(1, (inner.x2 - inner.x1) * (inner.y2 - inner.y1));
  return (iw * ih) / innerArea;
}

/** Divide a bbox da pessoa em regiões anatômicas — portado do workplace_safety_monitor.py */
function headTorsoRegions(p: BBox): { head: BBox; torso: BBox } {
  const w = p.x2 - p.x1, h = p.y2 - p.y1;
  const headH  = h * 0.26;
  const torsoH = h * 0.52;
  return {
    head: {
      x1: p.x1 + w * 0.22, y1: p.y1,
      x2: p.x2 - w * 0.22, y2: p.y1 + headH,
    },
    torso: {
      x1: p.x1 + w * 0.10, y1: p.y1 + headH,
      x2: p.x2 - w * 0.10, y2: p.y1 + headH + torsoH,
    },
  };
}

/** NMS greedy por score decrescente */
function nms(dets: Detection[], iouTh: number): Detection[] {
  dets.sort((a, b) => b.score - a.score);
  const keep: Detection[] = [];
  const suppressed = new Uint8Array(dets.length);
  for (let i = 0; i < dets.length; i++) {
    if (suppressed[i]) continue;
    keep.push(dets[i]);
    for (let j = i + 1; j < dets.length; j++) {
      if (!suppressed[j] && dets[i].cls === dets[j].cls && iou(dets[i], dets[j]) > iouTh) {
        suppressed[j] = 1;
      }
    }
  }
  return keep;
}

/** Associa capacetes/coletes a pessoas (greedy 1-para-1) */
function assignPpeToPersons(
  persons: BBox[], helmets: BBox[], vests: BBox[],
): { hMatch: (BBox | null)[]; vMatch: (BBox | null)[] } {
  const hMatch: (BBox | null)[] = new Array(persons.length).fill(null);
  const vMatch: (BBox | null)[] = new Array(persons.length).fill(null);
  const regions = persons.map(headTorsoRegions);

  const usedH = new Set<number>();
  for (let pi = 0; pi < persons.length; pi++) {
    let best = 0, bestHi = -1;
    for (let hi = 0; hi < helmets.length; hi++) {
      if (usedH.has(hi)) continue;
      const score = iou(helmets[hi], regions[pi].head) * 0.7
                  + insideFraction(helmets[hi], persons[pi]) * 0.3;
      if (score > best) { best = score; bestHi = hi; }
    }
    if (bestHi >= 0) {
      const h = helmets[bestHi];
      if (iou(h, regions[pi].head) >= HEAD_IOU_GATE &&
          insideFraction(h, persons[pi]) >= PPE_INSIDE_PERSON_FRAC) {
        hMatch[pi] = h;
        usedH.add(bestHi);
      }
    }
  }

  const usedV = new Set<number>();
  for (let pi = 0; pi < persons.length; pi++) {
    let best = 0, bestVi = -1;
    for (let vi = 0; vi < vests.length; vi++) {
      if (usedV.has(vi)) continue;
      const score = iou(vests[vi], regions[pi].torso) * 0.7
                  + insideFraction(vests[vi], persons[pi]) * 0.3;
      if (score > best) { best = score; bestVi = vi; }
    }
    if (bestVi >= 0) {
      const v = vests[bestVi];
      if (iou(v, regions[pi].torso) >= TORSO_IOU_GATE &&
          insideFraction(v, persons[pi]) >= PPE_INSIDE_PERSON_FRAC) {
        vMatch[pi] = v;
        usedV.add(bestVi);
      }
    }
  }
  return { hMatch, vMatch };
}

/** Suavização temporal por maioria de votos (SMOOTH_WIN frames) */
class PPESmoother {
  private history = new Map<number, { h: boolean; v: boolean }[]>();
  update(idx: number, h: boolean, v: boolean): { h: boolean; v: boolean } {
    const hist = this.history.get(idx) ?? [];
    hist.push({ h, v });
    if (hist.length > SMOOTH_WIN) hist.shift();
    this.history.set(idx, hist);
    const n = hist.length, half = Math.ceil(n / 2);
    return {
      h: hist.filter(x => x.h).length >= half,
      v: hist.filter(x => x.v).length >= half,
    };
  }
  reset() { this.history.clear(); }
}

// ── Pré-processamento ─────────────────────────────────────────────────────────

/** Canvas 640×640 → Float32Array CHW [0,1] */
function preprocessCanvas(canvas: HTMLCanvasElement): Float32Array {
  const ctx  = canvas.getContext('2d')!;
  const data = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data;
  const tensor = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
  const area   = INPUT_SIZE * INPUT_SIZE;
  for (let i = 0; i < area; i++) {
    tensor[i]         = data[i * 4]     / 255;
    tensor[i + area]  = data[i * 4 + 1] / 255;
    tensor[i + area*2]= data[i * 4 + 2] / 255;
  }
  return tensor;
}

/** Pós-processamento YOLO11n: output shape [1, NC+4, 8400] */
function postprocess(output: Float32Array, outShape: number[], origW: number, origH: number): Detection[] {
  // Bug fix: lê N do shape real ao invés de hardcodar 8400,
  // tornando o código robusto a variações de export.
  const N   = outShape[outShape.length - 1]; // 8400 para 640×640
  const NC  = NUM_CLASSES;
  const scX = origW / INPUT_SIZE;
  const scY = origH / INPUT_SIZE;
  const dets: Detection[] = [];

  for (let i = 0; i < N; i++) {
    let maxScore = CONF_THRESH, maxCls = -1;
    for (let c = 0; c < NC; c++) {
      const s = output[i + (4 + c) * N];
      if (s > maxScore) { maxScore = s; maxCls = c; }
    }
    if (maxCls < 0) continue;
    const cx = output[i], cy = output[i + N], w = output[i + 2*N], h = output[i + 3*N];
    dets.push({
      x1: (cx - w/2) * scX, y1: (cy - h/2) * scY,
      x2: (cx + w/2) * scX, y2: (cy + h/2) * scY,
      score: maxScore, cls: maxCls,
    });
  }
  return nms(dets, NMS_IOU_TH);
}

// ── Estado inicial ────────────────────────────────────────────────────────────

const IDLE_DATA: EpiData = {
  personDetected: false, personCount: 0,
  complianceRate: 100,   violationRate: 0,
  hasHelmetAny: false,   hasVestAny: false,
  isAlert: false,        persons: [],
};

// ── Hook principal ────────────────────────────────────────────────────────────

export function useEpiDetector(videoRef: RefObject<HTMLVideoElement>) {
  // Bug fix #4: ortRef armazena o módulo onnxruntime-web carregado UMA VEZ.
  // Antes, import('onnxruntime-web') era chamado a cada frame do loop de inferência.
  const ortRef      = useRef<any>(null);
  const sessionRef  = useRef<any>(null);
  const offCanvasRef= useRef<HTMLCanvasElement | null>(null); // canvas offscreen de inferência
  const smootherRef = useRef(new PPESmoother());
  const rafRef      = useRef<number | null>(null);
  const runningRef  = useRef(false);
  // Bug fix #3: flag que impede re-entrada do loop assíncrono.
  // requestAnimationFrame não awaita a Promise — sem esse guard, cada frame
  // pode disparar uma nova inferência antes da anterior terminar.
  const inferringRef= useRef(false);

  const [isModelReady, setIsModelReady] = useState(false);
  const [modelError,   setModelError]   = useState<string | null>(null);
  const [epiData,      setEpiData]      = useState<EpiData>(IDLE_DATA);

  // ── Carrega ort + modelo (uma única vez na montagem) ────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Bug fix #4: importação feita UMA VEZ e armazenada em ortRef
        const ort = await import('onnxruntime-web');
        ortRef.current = ort;

        ort.env.wasm.wasmPaths = './ort-wasm/';

        // Bug fix #6 (indireto): evita erro se SharedArrayBuffer não estiver
        // disponível (pode acontecer se COOP/COEP não estiverem configurados).
        // Fallback gracioso para single-thread ao invés de lançar exceção.
        const supportsSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
        ort.env.wasm.numThreads = supportsSharedArrayBuffer
          ? (navigator.hardwareConcurrency ?? 4)
          : 1;

        const session = await ort.InferenceSession.create('./models/best.onnx', {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all',
        });

        if (!cancelled) {
          sessionRef.current = session;
          setIsModelReady(true);
          console.log('[EPI] Modelo OK | inputs:', session.inputNames, '| outputs:', session.outputNames);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error('[EPI] Erro ao carregar modelo:', err);
          setModelError(err.message ?? 'Erro ao carregar modelo ONNX');
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Loop de inferência ──────────────────────────────────────────────────────
  const inferLoop = useCallback(() => {
    if (!runningRef.current) return;

    // Agenda o próximo frame ANTES da inferência — garante 30fps mesmo se
    // uma inferência demorar mais que um frame (não bloqueia o agendamento).
    rafRef.current = requestAnimationFrame(inferLoop);

    // Bug fix #3: re-entrada do loop assíncrono.
    // Se a inferência anterior ainda não terminou, pula este frame.
    if (inferringRef.current) return;
    inferringRef.current = true;

    const session = sessionRef.current;
    const ort     = ortRef.current;
    const video   = videoRef.current;
    if (!session || !ort || !video) { inferringRef.current = false; return; }

    // Prepara canvas offscreen
    if (!offCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = INPUT_SIZE; c.height = INPUT_SIZE;
      offCanvasRef.current = c;
    }
    const canvas = offCanvasRef.current;
    const ctx    = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0, INPUT_SIZE, INPUT_SIZE);

    const origW = video.videoWidth  || INPUT_SIZE;
    const origH = video.videoHeight || INPUT_SIZE;

    // Inferência assíncrona — libera inferringRef no finally
    const input  = preprocessCanvas(canvas);
    const tensor = new ort.Tensor('float32', input, [1, 3, INPUT_SIZE, INPUT_SIZE]);
    const feeds  = { [session.inputNames[0]]: tensor };

    session.run(feeds).then((result: any) => {
      if (!runningRef.current) return;
      const outTensor = result[session.outputNames[0]];
      const output    = outTensor.data as Float32Array;
      const outShape  = outTensor.dims as number[];

      const dets    = postprocess(output, outShape, origW, origH);
      const persons = dets.filter((d: Detection) => d.cls === CLS_PERSON).map((d: Detection) => ({ x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2 }));
      const helmets = dets.filter((d: Detection) => d.cls === CLS_HELMET).map((d: Detection) => ({ x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2 }));
      const vests   = dets.filter((d: Detection) => d.cls === CLS_VEST  ).map((d: Detection) => ({ x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2 }));

      const { hMatch, vMatch } = assignPpeToPersons(persons, helmets, vests);

      const personStatuses: PersonStatus[] = persons.map((p, pi) => {
        const { h, v } = smootherRef.current.update(pi, hMatch[pi] !== null, vMatch[pi] !== null);
        return { bbox: p, hasHelmet: h, hasVest: v, compliant: h && v };
      });

      const compliantCount = personStatuses.filter(p => p.compliant).length;
      const complianceRate = persons.length > 0
        ? Math.round((compliantCount / persons.length) * 100)
        : 100;

      setEpiData({
        personDetected: persons.length > 0,
        personCount:    persons.length,
        complianceRate,
        violationRate:  100 - complianceRate,
        hasHelmetAny:   personStatuses.some(p => p.hasHelmet),
        hasVestAny:     personStatuses.some(p => p.hasVest),
        isAlert:        personStatuses.some(p => !p.compliant),
        persons:        personStatuses,
      });
    }).catch((err: any) => {
      console.error('[EPI] Erro na inferência:', err);
    }).finally(() => {
      inferringRef.current = false;
    });
  }, [videoRef]);

  const startDetection = useCallback(() => {
    if (runningRef.current || !sessionRef.current) return;
    runningRef.current  = true;
    inferringRef.current = false;
    smootherRef.current.reset();
    rafRef.current = requestAnimationFrame(inferLoop);
  }, [inferLoop]);

  const stopDetection = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    inferringRef.current = false;
    smootherRef.current.reset();
    setEpiData(IDLE_DATA);
  }, []);

  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return { epiData, isModelReady, modelError, startDetection, stopDetection };
}
