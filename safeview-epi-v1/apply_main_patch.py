#!/usr/bin/env python3
"""
apply_main_patch.py — SafeView EPI
Verifica se o electron/main.js já contém o SafeView EPI integrado.
Nesta versão o main.js já vem completo no zip — este script serve
apenas como verificação de integridade.
"""
import sys
from pathlib import Path

MAIN_JS = Path("electron/main.js")

if not MAIN_JS.exists():
    print("[ERRO] electron/main.js não encontrado.", file=sys.stderr)
    sys.exit(1)

src = MAIN_JS.read_text(encoding="utf-8")
checks = {
    "safeviewEpiWindow":      "variável da janela EPI",
    "createSafeviewEpiWindow":"função de criação da janela EPI",
    "persist:safeview-epi":   "partition isolada para onnxruntime-web",
    "safeview-epi":           "path do app EPI",
}

all_ok = True
for key, desc in checks.items():
    if key in src:
        print(f"[OK] {desc}")
    else:
        print(f"[AVISO] Não encontrado: {desc} ('{key}')")
        all_ok = False

if all_ok:
    print("\n[OK] electron/main.js está completo com SafeView EPI integrado.")
    sys.exit(0)
else:
    print("\n[AVISO] electron/main.js pode estar desatualizado.")
    print("        Substitua pelo arquivo electron/main.js incluso no zip.")
    sys.exit(1)
