# SafeView EPI — AI Engine
# engine.py — loop principal: câmera → YOLO → WebSocket
#
# Roda como processo filho do Electron.
# Abre câmera, roda inferência, envia frames anotados + violações
# via WebSocket na porta 3002 para o frontend.

import asyncio
import base64
import json
import os
import platform
import sys
import traceback
from pathlib import Path

import cv2
import websockets

from detector import EPIDetector

HOST = '127.0.0.1'
PORT = 3002

# ── Estado global ─────────────────────────────────────────────────────────────
detector   = None
cap        = None
clients    = set()   # WebSocket clients conectados

def log(msg):
    print(f'[AI] {msg}', flush=True)

def init_camera():
    global cap
    configured_idx = os.getenv('SAFEVIEW_CAMERA_INDEX', '').strip()
    camera_indexes = []
    if configured_idx:
        try:
            camera_indexes = [int(configured_idx)]
            log(f'Tentando câmera configurada por SAFEVIEW_CAMERA_INDEX={camera_indexes[0]}')
        except ValueError:
            log(f'Valor inválido em SAFEVIEW_CAMERA_INDEX: {configured_idx}. Ignorando.')
    if not camera_indexes:
        camera_indexes = list(range(6))  # tenta câmera 0..5

    # Backend pode ser forçado via SAFEVIEW_CAMERA_BACKEND (ex.: CAP_DSHOW, CAP_MSMF, CAP_V4L2)
    requested_backend = os.getenv('SAFEVIEW_CAMERA_BACKEND', '').strip().upper()
    backends = []
    if requested_backend:
        if hasattr(cv2, requested_backend):
            backends.append((requested_backend, getattr(cv2, requested_backend)))
            log(f'Backend forçado via SAFEVIEW_CAMERA_BACKEND={requested_backend}')
        else:
            log(f'Backend inválido em SAFEVIEW_CAMERA_BACKEND={requested_backend}. Ignorando.')

    if not backends:
        system = platform.system().lower()
        if system == 'windows':
            for b in ('CAP_DSHOW', 'CAP_MSMF'):
                if hasattr(cv2, b):
                    backends.append((b, getattr(cv2, b)))
        elif system == 'linux' and hasattr(cv2, 'CAP_V4L2'):
            backends.append(('CAP_V4L2', cv2.CAP_V4L2))
        elif system == 'darwin' and hasattr(cv2, 'CAP_AVFOUNDATION'):
            backends.append(('CAP_AVFOUNDATION', cv2.CAP_AVFOUNDATION))
    backends.append(('DEFAULT', None))

    for idx in camera_indexes:
        for backend_name, backend in backends:
            c = cv2.VideoCapture(idx, backend) if backend is not None else cv2.VideoCapture(idx)
            if c.isOpened():
                c.set(cv2.CAP_PROP_FRAME_WIDTH,  640)
                c.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
                c.set(cv2.CAP_PROP_FPS,           30)
                # Alguns drivers marcam opened, mas só começam a entregar frame após alguns reads
                ok = False
                for _ in range(5):
                    ret, _ = c.read()
                    if ret:
                        ok = True
                        break
                if not ok:
                    log(f'Câmera {idx} abriu via {backend_name}, mas não entregou frames no warmup.')
                    c.release()
                    continue
                cap = c
                log(f'Câmera {idx} aberta via backend {backend_name}.')
                return True
            c.release()

    log(f'ERRO: Nenhuma câmera encontrada. Índices testados: {camera_indexes}; backends: {[b[0] for b in backends]}')
    return False

async def broadcast(msg: str):
    if not clients:
        return
    dead = set()
    for ws in clients:
        try:
            await ws.send(msg)
        except Exception:
            dead.add(ws)
    clients.difference_update(dead)

# ── Loop de inferência ────────────────────────────────────────────────────────
async def inference_loop():
    global detector, cap

    if not init_camera():
        # Sem câmera — envia mensagem de erro para o frontend
        while True:
            msg = json.dumps({
                'type': 'ERROR',
                'message': 'Câmera não encontrada. Verifique conexão/permissão e SAFEVIEW_CAMERA_INDEX.',
            })
            await broadcast(msg)
            await asyncio.sleep(2)

    log('Inicializando detector...')
    detector = EPIDetector()
    log(f'Detector pronto. Modo: {detector.mode}')

    import time
    fps_counter  = 0
    fps_timer    = time.time()
    current_fps  = 0.0
    read_failures = 0

    while True:
        if cap is None or not cap.isOpened():
            log('Câmera indisponível no loop. Tentando abrir novamente...')
            if not init_camera():
                await broadcast(json.dumps({
                    'type': 'ERROR',
                    'message': 'Câmera indisponível. Verifique conexão/permissão e índice configurado.',
                }))
                await asyncio.sleep(1.0)
                continue

        ret, frame = cap.read()
        if not ret:
            read_failures += 1
            if read_failures % 30 == 0:
                log(f'Falha ao ler frame ({read_failures} consecutivas).')
            if read_failures >= 120:
                log('Muitas falhas de leitura. Tentando reabrir câmera...')
                try:
                    if cap:
                        cap.release()
                except Exception:
                    pass
                cap = None
                if not init_camera():
                    await broadcast(json.dumps({
                        'type': 'ERROR',
                        'message': 'Falha ao reabrir câmera. Verifique se outro app está usando a webcam.',
                    }))
                    await asyncio.sleep(1.0)
                read_failures = 0
            await asyncio.sleep(0.05)
            continue
        read_failures = 0

        if not clients:
            await asyncio.sleep(0.1)
            continue

        # ── Inferência ────────────────────────────────────────────────────────
        result       = detector.detect(frame)
        annotated    = detector.draw(frame, result)

        # ── Codifica frame como JPEG base64 ───────────────────────────────────
        # Qualidade 65: equilíbrio entre tamanho e qualidade para WebSocket local
        _, buf  = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 65])
        frame64 = base64.b64encode(buf).decode('utf-8')

        # ── FPS ───────────────────────────────────────────────────────────────
        fps_counter += 1
        elapsed = time.time() - fps_timer
        if elapsed >= 1.0:
            current_fps = fps_counter / elapsed
            fps_counter = 0
            fps_timer   = time.time()

        # ── Mensagem para o frontend ──────────────────────────────────────────
        msg = json.dumps({
            'type':       'FRAME',
            'frame':      frame64,
            'persons':    result['persons'],
            'violations': result['violations'],
            'fps':        round(current_fps, 1),
            'mode':       detector.mode,
            'riskIndex':  result.get('riskIndex', 0.0),
            'rfStatus':   result.get('rfStatus', 'ok'),
            'rfSuccessfulModels': result.get('rfSuccessfulModels', 0),
            'rfFailedModels': result.get('rfFailedModels', 0),
        })
        await broadcast(msg)

        # ~15 fps para não sobrecarregar a conexão local
        await asyncio.sleep(1 / 15)

# ── Handler WebSocket ─────────────────────────────────────────────────────────
async def handler(websocket):
    clients.add(websocket)
    log(f'Frontend conectado. Total: {len(clients)}')
    try:
        # Envia status inicial
        await websocket.send(json.dumps({
            'type':    'STATUS',
            'running': True,
            'mode':    detector.mode if detector else 'carregando',
        }))
        # Mantém conexão aberta esperando mensagens do frontend
        async for _ in websocket:
            pass
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        clients.discard(websocket)
        log(f'Frontend desconectado. Total: {len(clients)}')

# ── Entrypoint ────────────────────────────────────────────────────────────────
async def main():
    log(f'Iniciando servidor WebSocket em ws://{HOST}:{PORT}')
    async with websockets.serve(handler, HOST, PORT):
        await inference_loop()

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log('Encerrado pelo usuário.')
    except Exception as e:
        log(f'ERRO FATAL: {e}')
        traceback.print_exc()
        sys.exit(1)
    finally:
        if cap and cap.isOpened():
            cap.release()
        log('AI Engine encerrado.')
