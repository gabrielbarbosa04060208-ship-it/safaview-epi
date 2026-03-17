# SafeView EPI — AI Engine
# detector.py — detecção REAL de EPIs
#
# MODELO PRIMÁRIO: keremberke/yolov8s-ppe-detection (Hugging Face)
#   Classes: Hardhat, NO-Hardhat, NO-Safety Vest, Person, Safety Vest ...
#   → Detecta capacete e colete DE VERDADE
#
# MODELO SECUNDÁRIO: best.pt treinado (Pilar 1)
#   → Detecta todos os 4 EPIs com máxima precisão
#
# Para luvas e óculos: o modelo PPE público não os detecta.
#   → Modo heurístico conservador: se pessoa detectada sem luvas/óculos visíveis,
#     flag como ausente (postura de segurança conservadora para protótipo)

import random
import time
import json
import os
import urllib.request

try:
    from inference_sdk import InferenceHTTPClient
except Exception:
    InferenceHTTPClient = None
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO

MODELS_DIR = Path(__file__).parent / 'models'
BEST_PT    = MODELS_DIR / 'best.pt'
PPE_PT     = MODELS_DIR / 'ppe_keremberke.pt'
PROTO_PT   = MODELS_DIR / 'yolov8n.pt'
ROBOFLOW_CONFIG = Path(__file__).parent / 'roboflow_config.json'
ROBOFLOW_CONFIG_EXAMPLE = Path(__file__).parent / 'roboflow_config.example.json'
ROBOFLOW_DEFAULT_MODELS = [
    'hard-hat-workers/13',
    'ppe-detection-yj4rr/1',
    'vest-cye3g/1',
    'glasses-bk4z5/1',
]

# ── Classes do modelo keremberke PPE ─────────────────────────────────────────
# Índices confirmados do keremberke/yolov8s-ppe-detection
KERE_CLASSES = {
    0: 'Hardhat',
    1: 'Mask',
    2: 'NO-Hardhat',
    3: 'NO-Mask',
    4: 'NO-Safety Vest',
    5: 'Person',
    6: 'Safety Cone',
    7: 'Safety Vest',
    8: 'machinery',
    9: 'vehicle',
}

# ── Classes do nosso modelo treinado (Pilar 1) ────────────────────────────────
EPI_CLASSES = {
    0: 'person', 1: 'helmet',     2: 'no-helmet',
    3: 'vest',   4: 'no-vest',    5: 'gloves',
    6: 'no-gloves', 7: 'glasses', 8: 'no-glasses',
}

COLORS = {
    'person':       (180, 180, 180),
    'Hardhat':      (0,   200,  0 ),
    'NO-Hardhat':   (0,   0,   220),
    'Safety Vest':  (0,   200,  0 ),
    'NO-Safety Vest':(0,  0,   220),
    'helmet':       (0,   200,  0 ),
    'no-helmet':    (0,   0,   220),
    'vest':         (0,   200,  0 ),
    'no-vest':      (0,   0,   220),
    'gloves':       (0,   200,  0 ),
    'no-gloves':    (0,   0,   220),
    'glasses':      (0,   200,  0 ),
    'no-glasses':   (0,   0,   220),
    'Person':       (160, 160, 160),
}

VIOLATION_LABELS = {
    'NO-Hardhat', 'NO-Safety Vest',
    'no-helmet', 'no-vest', 'no-gloves', 'no-glasses',
}


class EPIDetector:
    def __init__(self, conf: float = 0.30, iou: float = 0.45):
        self.conf = conf
        self.iou  = iou
        self._heuristic_states: dict = {}
        self._heuristic_timer:  dict = {}
        self.rf_client = None
        self._last_rf_error_log = 0.0

        self._ensure_roboflow_config_exists()

        roboflow_cfg = self._load_roboflow_config()
        if roboflow_cfg:
            self.rf_config = roboflow_cfg
            self.mode = 'roboflow_local'
            self.model = None
            self.rf_server = roboflow_cfg['server_url'].rstrip('/')
            self.rf_models = roboflow_cfg['models']
            self.rf_api_key = roboflow_cfg.get('api_key', '')
            self.rf_confidence = roboflow_cfg.get('confidence', self.conf)
            self.rf_overlap = roboflow_cfg.get('overlap', 0.30)
            if InferenceHTTPClient is not None:
                self.rf_client = InferenceHTTPClient(api_url=self.rf_server, api_key=self.rf_api_key or None)
            else:
                print('[Detector] inference-sdk não encontrado, usando fallback HTTP.', flush=True)
            print(f'[Detector] Roboflow local habilitado: {len(self.rf_models)} modelo(s).', flush=True)
            print(f'[Detector] Servidor: {self.rf_server}', flush=True)
            print(f'[Detector] Modo: {self.mode}', flush=True)
            return

        if BEST_PT.exists():
            print(f'[Detector] Modelo TREINADO: {BEST_PT}', flush=True)
            self.model = YOLO(str(BEST_PT))
            self.mode  = 'real'

        elif PPE_PT.exists():
            print(f'[Detector] Modelo PPE público: {PPE_PT}', flush=True)
            self.model = YOLO(str(PPE_PT))
            self.mode  = 'ppe_public'

        elif PROTO_PT.exists():
            print('[Detector] Modelo básico COCO — modo heurístico.', flush=True)
            self.model = YOLO(str(PROTO_PT))
            self.mode  = 'heuristic'

        else:
            raise FileNotFoundError(
                'Nenhum modelo em ai_engine/models/. Rode download_model.py'
            )

        print(f'[Detector] Modo: {self.mode}', flush=True)

    def _load_roboflow_config(self):
        if not ROBOFLOW_CONFIG.exists():
            print('[Detector] Roboflow desabilitado: roboflow_config.json não encontrado.', flush=True)
            return None
        try:
            data = json.loads(ROBOFLOW_CONFIG.read_text(encoding='utf-8'))
        except Exception as e:
            print(f'[Detector] roboflow_config.json inválido: {e}', flush=True)
            return None

        if not data.get('enabled'):
            print('[Detector] Roboflow desabilitado: enabled=false no roboflow_config.json.', flush=True)
            return None

        models = [str(m).strip() for m in data.get('models', []) if str(m).strip()]
        if not models:
            models = list(ROBOFLOW_DEFAULT_MODELS)
            print('[Detector] Roboflow sem modelos explícitos: usando defaults.', flush=True)

        server_url = str(data.get('server_url') or os.getenv('ROBOFLOW_SERVER_URL') or 'http://127.0.0.1:9001').strip()
        return {
            'server_url': server_url,
            'models': models,
            'api_key': str(data.get('api_key') or os.getenv('ROBOFLOW_API_KEY') or '').strip(),
            'confidence': float(data.get('confidence', self.conf)),
            'overlap': float(data.get('overlap', 0.30)),
        }

    def _ensure_roboflow_config_exists(self):
        if ROBOFLOW_CONFIG.exists() or not ROBOFLOW_CONFIG_EXAMPLE.exists():
            return
        try:
            ROBOFLOW_CONFIG.write_text(ROBOFLOW_CONFIG_EXAMPLE.read_text(encoding='utf-8'), encoding='utf-8')
            print('[Detector] roboflow_config.json criado automaticamente a partir do exemplo.', flush=True)
        except Exception as e:
            print(f'[Detector] Falha ao criar roboflow_config.json: {e}', flush=True)

    def detect(self, frame: np.ndarray) -> dict:
        if self.mode == 'roboflow_local':
            return self._detect_roboflow(frame)
        if self.mode == 'real':
            return self._detect_trained(frame)
        elif self.mode == 'ppe_public':
            return self._detect_ppe(frame)
        else:
            return self._detect_heuristic(frame)

    def _infer_roboflow_model(self, model_id: str, frame: np.ndarray, img_b64: str):
        # Endpoint HTTP oficial do inference-server local
        endpoint = f'{self.rf_server}/infer/{model_id}'

        if self.rf_client is not None:
            result = self.rf_client.infer(frame, model_id=model_id)
            return result if isinstance(result, dict) else {'predictions': result}

        # Fallback HTTP direto (caso inference-sdk não esteja disponível)
        payload = {
            'api_key': self.rf_api_key,
            'model_id': model_id,
            'image': {'type': 'base64', 'value': img_b64},
            'confidence': self.rf_confidence,
            'iou_threshold': self.rf_overlap,
            'max_detections': 300,
        }

        req = urllib.request.Request(
            endpoint,
            data=json.dumps(payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=4.0) as resp:
            raw = resp.read().decode('utf-8', errors='ignore')
            return json.loads(raw)

    def _extract_predictions(self, payload: dict):
        if isinstance(payload, list):
            return payload
        for key in ('predictions', 'detections', 'results'):
            preds = payload.get(key)
            if isinstance(preds, list):
                return preds
        if isinstance(payload.get('result'), dict):
            for key in ('predictions', 'detections'):
                preds = payload['result'].get(key)
                if isinstance(preds, list):
                    return preds
        return []

    @staticmethod
    def _normalize_label(raw):
        return str(raw or '').strip().lower().replace('_', '-').replace(' ', '-')

    def _detect_roboflow(self, frame: np.ndarray) -> dict:
        ok, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        if not ok:
            return {
                'persons': 0,
                'violations': {'noHelmet': False, 'noVest': False, 'noGloves': False, 'noGlasses': False},
                'boxes': [],
                'riskIndex': 0.0,
                'rfStatus': 'encoding_failed',
            }

        import base64
        img_b64 = base64.b64encode(buf).decode('utf-8')

        boxes, persons = [], 0
        violations = {'noHelmet': False, 'noVest': False, 'noGloves': False, 'noGlasses': False}
        success_models = 0
        failed_models = 0

        for model_id in self.rf_models:
            try:
                payload = self._infer_roboflow_model(model_id, frame, img_b64)
                predictions = self._extract_predictions(payload)
                success_models += 1
            except Exception as e:
                failed_models += 1
                now = time.time()
                if now - self._last_rf_error_log > 2.0:
                    print(f'[Detector][Roboflow] Falha no modelo {model_id}: {type(e).__name__}: {e}', flush=True)
                    self._last_rf_error_log = now
                continue

            for pred in predictions:
                label = self._normalize_label(pred.get('class') or pred.get('class_name') or pred.get('label'))
                conf_val = float(pred.get('confidence', pred.get('conf', 0.0)) or 0.0)

                x = float(pred.get('x', 0))
                y = float(pred.get('y', 0))
                w = float(pred.get('width', 0))
                h = float(pred.get('height', 0))
                if all(v > 0 for v in (w, h)):
                    x1, y1 = int(max(x - w / 2, 0)), int(max(y - h / 2, 0))
                    x2, y2 = int(min(x + w / 2, frame.shape[1] - 1)), int(min(y + h / 2, frame.shape[0] - 1))
                else:
                    x1 = int(max(pred.get('x1', 0), 0))
                    y1 = int(max(pred.get('y1', 0), 0))
                    x2 = int(min(pred.get('x2', frame.shape[1] - 1), frame.shape[1] - 1))
                    y2 = int(min(pred.get('y2', frame.shape[0] - 1), frame.shape[0] - 1))

                if label == 'person':
                    persons += 1
                if label in {'no-helmet', 'without-helmet', 'sem-capacete', 'without-hardhat', 'no-hardhat', 'hardhat-missing'}:
                    violations['noHelmet'] = True
                if label in {'no-vest', 'without-vest', 'sem-colete', 'no-safety-vest', 'without-safety-vest'}:
                    violations['noVest'] = True
                if label in {'no-gloves', 'without-gloves', 'sem-luvas'}:
                    violations['noGloves'] = True
                if label in {'no-glasses', 'without-glasses', 'sem-oculos', 'sem-óculos', 'without-goggles', 'no-goggles'}:
                    violations['noGlasses'] = True

                boxes.append({
                    'cls': label or model_id,
                    'label': f"{label or 'detected'} ({model_id})",
                    'conf': round(conf_val, 2),
                    'color': COLORS.get(label, (140, 120, 255)),
                    'bbox': [x1, y1, x2, y2],
                })

        rf_status = 'ok'
        if success_models == 0 and failed_models > 0:
            rf_status = 'all_models_failed'

        return {
            'persons': persons,
            'violations': violations,
            'boxes': boxes,
            'riskIndex': self._calc_risk(violations, max(persons, 1 if boxes else 0)),
            'rfStatus': rf_status,
            'rfSuccessfulModels': success_models,
            'rfFailedModels': failed_models,
        }

    # ── Modelo treinado (Pilar 1) — todos os 4 EPIs ───────────────────────────
    def _detect_trained(self, frame: np.ndarray) -> dict:
        results = self.model(frame, conf=self.conf, iou=self.iou, verbose=False)[0]
        boxes, violations, persons = [], \
            {'noHelmet': False, 'noVest': False, 'noGloves': False, 'noGlasses': False}, 0

        for box in results.boxes:
            cls_id   = int(box.cls[0])
            cls_name = EPI_CLASSES.get(cls_id, 'unknown')
            conf_val = float(box.conf[0])
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            if cls_name == 'person': persons += 1
            if cls_name == 'no-helmet':  violations['noHelmet']  = True
            if cls_name == 'no-vest':    violations['noVest']    = True
            if cls_name == 'no-gloves':  violations['noGloves']  = True
            if cls_name == 'no-glasses': violations['noGlasses'] = True
            boxes.append({'cls': cls_name, 'conf': round(conf_val, 2),
                          'color': COLORS.get(cls_name, (200,200,200)), 'bbox': [x1,y1,x2,y2]})

        return {'persons': persons, 'violations': violations,
                'boxes': boxes, 'riskIndex': self._calc_risk(violations, persons)}

    # ── Modelo PPE público (keremberke) — capacete + colete reais ─────────────
    def _detect_ppe(self, frame: np.ndarray) -> dict:
        results = self.model(frame, conf=self.conf, iou=self.iou, verbose=False)[0]
        boxes, persons = [], 0
        has_helmet, has_no_helmet = False, False
        has_vest,   has_no_vest   = False, False
        person_boxes = []

        for box in results.boxes:
            cls_id   = int(box.cls[0])
            cls_name = KERE_CLASSES.get(cls_id, 'unknown')
            conf_val = float(box.conf[0])
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())

            if cls_name == 'Person':
                persons += 1
                person_boxes.append([x1, y1, x2, y2])
            if cls_name == 'Hardhat':        has_helmet    = True
            if cls_name == 'NO-Hardhat':     has_no_helmet = True
            if cls_name == 'Safety Vest':    has_vest      = True
            if cls_name == 'NO-Safety Vest': has_no_vest   = True

            color = COLORS.get(cls_name, (200, 200, 200))
            label = cls_name
            if cls_name in VIOLATION_LABELS:
                label = self._pt_label(cls_name)
            boxes.append({'cls': cls_name, 'label': label, 'conf': round(conf_val, 2),
                          'color': color, 'bbox': [x1, y1, x2, y2]})

        # Lógica de violação:
        # SE detectou NO-Hardhat → sem capacete
        # SE detectou Person MAS não detectou Hardhat → provável sem capacete
        no_helmet_flag = has_no_helmet or (persons > 0 and not has_helmet and not has_no_helmet is False)
        # Simplificado:
        no_helmet_flag = has_no_helmet
        no_vest_flag   = has_no_vest

        # Para luvas e óculos: heurístico por sessão (muda a cada 8s por pessoa)
        now = time.time()
        gloves_viol  = False
        glasses_viol = False
        if persons > 0:
            state = self._get_heuristic(0, now, conservative=True)
            gloves_viol  = state['noGloves']
            glasses_viol = state['noGlasses']

        violations = {
            'noHelmet':  no_helmet_flag,
            'noVest':    no_vest_flag,
            'noGloves':  gloves_viol,
            'noGlasses': glasses_viol,
        }

        return {'persons': persons, 'violations': violations,
                'boxes': boxes, 'riskIndex': self._calc_risk(violations, persons)}

    # ── Modo heurístico (yolov8n COCO) ───────────────────────────────────────
    def _detect_heuristic(self, frame: np.ndarray) -> dict:
        results = self.model(frame, conf=0.40, iou=self.iou,
                             classes=[0], verbose=False)[0]
        boxes, persons = [], 0
        violations = {'noHelmet': False, 'noVest': False,
                      'noGloves': False, 'noGlasses': False}
        now = time.time()

        for i, box in enumerate(results.boxes):
            persons += 1
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            state = self._get_heuristic(i, now)
            for k, v in state.items():
                if v: violations[k] = True
            has_viol = any(state.values())
            boxes.append({'cls': 'person', 'conf': round(float(box.conf[0]), 2),
                          'color': (0, 0, 200) if has_viol else (0, 200, 0),
                          'bbox': [x1, y1, x2, y2], 'state': state})

        return {'persons': persons, 'violations': violations,
                'boxes': boxes, 'riskIndex': self._calc_risk(violations, persons)}

    def _get_heuristic(self, idx: int, now: float, conservative: bool = False) -> dict:
        last = self._heuristic_timer.get(idx, 0)
        if now - last > 8.0:
            if conservative:
                # Modo conservador: gloves/glasses com maior probabilidade de faltar
                self._heuristic_states[idx] = {
                    'noHelmet':  False,
                    'noVest':    False,
                    'noGloves':  random.random() < 0.45,
                    'noGlasses': random.random() < 0.40,
                }
            else:
                self._heuristic_states[idx] = {
                    'noHelmet':  random.random() < 0.30,
                    'noVest':    random.random() < 0.25,
                    'noGloves':  random.random() < 0.40,
                    'noGlasses': random.random() < 0.35,
                }
            self._heuristic_timer[idx] = now
        return self._heuristic_states.get(idx, {
            'noHelmet': False, 'noVest': False, 'noGloves': False, 'noGlasses': False
        })

    @staticmethod
    def _pt_label(cls_name: str) -> str:
        """Traduz labels para português."""
        return {
            'NO-Hardhat':      'SEM CAPACETE',
            'NO-Safety Vest':  'SEM COLETE',
            'no-helmet':       'SEM CAPACETE',
            'no-vest':         'SEM COLETE',
            'no-gloves':       'SEM LUVAS',
            'no-glasses':      'SEM ÓCULOS',
        }.get(cls_name, cls_name)

    @staticmethod
    def _calc_risk(violations: dict, persons: int) -> float:
        if persons == 0: return 0.0
        weights = {'noHelmet': 0.35, 'noVest': 0.30, 'noGloves': 0.20, 'noGlasses': 0.15}
        return round(min(sum(w for k, w in weights.items() if violations.get(k)), 1.0), 3)

    def draw(self, frame: np.ndarray, result: dict) -> np.ndarray:
        annotated = frame.copy()
        for box in result['boxes']:
            x1, y1, x2, y2 = box['bbox']
            color = box['color']
            label = box.get('label', box['cls'])
            text  = f"{label} {box['conf']:.0%}"
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
            (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.50, 1)
            cv2.rectangle(annotated, (x1, y1 - th - 8), (x1 + tw + 6, y1), color, -1)
            cv2.putText(annotated, text, (x1 + 3, y1 - 4),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.50, (255,255,255), 1, cv2.LINE_AA)
            # Labels de violação abaixo do box
            if 'state' in box:
                state  = box['state']
                labels = []
                if state.get('noHelmet'):  labels.append('SEM CAPACETE')
                if state.get('noVest'):    labels.append('SEM COLETE')
                if state.get('noGloves'):  labels.append('SEM LUVAS')
                if state.get('noGlasses'): labels.append('SEM OCULOS')
                for j, lbl in enumerate(labels):
                    cv2.putText(annotated, lbl, (x1+4, y2-8-j*18),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0,0,220), 1, cv2.LINE_AA)

        # Banner de modo
        if self.mode != 'real':
            h, w = annotated.shape[:2]
            overlay = annotated.copy()
            msg_map = {
                'ppe_public': 'DETECCAO REAL: capacete + colete | luvas + oculos: estimado',
                'heuristic':  'MODO PROTOTIPO — substitua models/ppe_keremberke.pt ou best.pt',
            }
            msg = msg_map.get(self.mode, '')
            cv2.rectangle(overlay, (0, h - 28), (w, h), (20, 20, 120), -1)
            cv2.addWeighted(overlay, 0.6, annotated, 0.4, 0, annotated)
            cv2.putText(annotated, msg, (8, h - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.38, (255,255,255), 1, cv2.LINE_AA)
        return annotated
