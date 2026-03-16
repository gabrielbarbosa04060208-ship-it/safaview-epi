# SafeView EPI — AI Engine
# download_model.py — baixa modelos para detecção real de EPIs
#
# Prioridade:
#   1. best.pt         (modelo treinado Pilar 1 — detecção completa)
#   2. ppe_keremberke.pt  (modelo público — capacete + colete REAIS)
#   3. yolov8n.pt      (fallback — pessoas + heurístico)

import shutil
import sys
import urllib.request
from pathlib import Path

MODELS_DIR = Path(__file__).parent / 'models'
BEST_PT    = MODELS_DIR / 'best.pt'
PPE_PT     = MODELS_DIR / 'ppe_keremberke.pt'
PROTO_PT   = MODELS_DIR / 'yolov8n.pt'

# URL direta do modelo keremberke no Hugging Face
PPE_URL = 'https://huggingface.co/keremberke/yolov8s-ppe-detection/resolve/main/best.pt'

def download_ppe_model() -> bool:
    """Tenta baixar o modelo PPE público do Hugging Face."""
    MODELS_DIR.mkdir(exist_ok=True)

    if BEST_PT.exists():
        print('[Model] best.pt (treinado) encontrado — usando modelo completo.', flush=True)
        return True

    if PPE_PT.exists():
        print('[Model] ppe_keremberke.pt já existe.', flush=True)
        return True

    print('[Model] Baixando modelo PPE público (keremberke yolov8s ~22MB)...', flush=True)
    print(f'[Model] URL: {PPE_URL}', flush=True)

    # Método 1: urllib direto
    try:
        def progress(block_num, block_size, total_size):
            downloaded = block_num * block_size
            if total_size > 0:
                pct = min(100, downloaded * 100 // total_size)
                if pct % 20 == 0:
                    print(f'[Model] Download: {pct}%...', flush=True)

        urllib.request.urlretrieve(PPE_URL, str(PPE_PT), reporthook=progress)
        if PPE_PT.exists() and PPE_PT.stat().st_size > 1_000_000:
            print(f'[Model] ppe_keremberke.pt baixado ({PPE_PT.stat().st_size/1e6:.1f}MB).', flush=True)
            return True
        else:
            print('[Model] Download incompleto.', flush=True)
            PPE_PT.unlink(missing_ok=True)
    except Exception as e:
        print(f'[Model] urllib falhou: {e}', flush=True)
        PPE_PT.unlink(missing_ok=True)

    # Método 2: ultralytics hub (tenta carregar direto do HF)
    try:
        print('[Model] Tentando via ultralytics...', flush=True)
        from ultralytics import YOLO
        model = YOLO('keremberke/yolov8s-ppe-detection')
        # Salva em models/
        model.save(str(PPE_PT))
        if PPE_PT.exists() and PPE_PT.stat().st_size > 1_000_000:
            print(f'[Model] Salvo via ultralytics.', flush=True)
            return True
    except Exception as e:
        print(f'[Model] ultralytics HF falhou: {e}', flush=True)

    # Fallback: yolov8n.pt (COCO — modo heurístico)
    print('[Model] Usando yolov8n.pt como fallback (modo heurístico)...', flush=True)
    return download_proto_fallback()


def download_proto_fallback() -> bool:
    """Baixa yolov8n.pt como fallback."""
    if PROTO_PT.exists():
        print('[Model] yolov8n.pt já existe.', flush=True)
        return True
    try:
        proto_url = 'https://github.com/ultralytics/assets/releases/download/v8.2.0/yolov8n.pt'
        urllib.request.urlretrieve(proto_url, str(PROTO_PT))
        print(f'[Model] yolov8n.pt baixado ({PROTO_PT.stat().st_size/1e6:.1f}MB).', flush=True)
        return PROTO_PT.exists()
    except Exception as e:
        print(f'[Model] Falha no fallback: {e}', flush=True)
        # Última tentativa via ultralytics
        try:
            from ultralytics import YOLO
            YOLO('yolov8n.pt')
            import glob, os
            caches = glob.glob(os.path.expanduser('~/.cache/ultralytics/**/*.pt'), recursive=True)
            for c in caches:
                if 'yolov8n' in c:
                    shutil.copy2(c, PROTO_PT)
                    return True
        except:
            pass
        return False


if __name__ == '__main__':
    ok = download_ppe_model()
    if ok:
        print('\n[Model] ✅ Modelo pronto para uso.', flush=True)
        if BEST_PT.exists():
            print('[Model] Modo: REAL COMPLETO (best.pt)', flush=True)
        elif PPE_PT.exists():
            print('[Model] Modo: PPE PÚBLICO — capacete + colete reais', flush=True)
        else:
            print('[Model] Modo: heurístico (yolov8n)', flush=True)
    else:
        print('\n[Model] ⚠️  Nenhum modelo baixado. Verifique internet.', flush=True)
    sys.exit(0 if ok else 1)
