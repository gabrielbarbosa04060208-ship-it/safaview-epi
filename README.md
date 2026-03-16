# SafeView EPI — Protótipo Desktop

> Sistema de detecção de EPI em tempo real  
> Feito por **Gabriel Madureira**

---

## Como rodar (2 passos)

### Pré-requisitos
- [Node.js 20 LTS](https://nodejs.org)
- [Git](https://git-scm.com)
- [Python 3.9+](https://www.python.org/downloads/) ← marque **"Add Python to PATH"**

### Passo 1 — Setup (terminal normal)
```
setup.bat
```

### Passo 2 — Build (terminal como **Administrador**)
```
npm run build
```

Instalador gerado em `dist-electron\SafeView EPI Setup 1.0.0.exe`

---

## Modo Protótipo vs Modo Real

| | Modo Protótipo | Modo Real |
|---|---|---|
| **Modelo** | yolov8n.pt (COCO) | best.pt (treinado no Pilar 1) |
| **Pessoas** | ✅ Detecta de verdade | ✅ Detecta de verdade |
| **EPI** | ⚠️ Simulado para demo | ✅ Detecta de verdade |
| **Ativar** | Automático (padrão) | Colocar `best.pt` em `ai_engine/models/` |

Para ativar o modo real após treinar no Pilar 1:
```
copy model_training\runs\safeview_epi_best.pt ai_engine\models\best.pt
```

---

## Arquitetura

```
Electron (main.js)
├── Express + SQLite (porta 3001) — sessões e dashboard
├── Python AI Engine (porta 3002) — câmera + YOLO + WebSocket
├── Janela 1: App Detector (React) — feed ao vivo + controles
└── Janela 2: Dashboard (React) — histórico + gráficos + IA
```

---

## Estrutura de arquivos

```
safeview-epi-prototype/
├── setup.bat                   ← PASSO 1
├── package.json
├── electron/
│   ├── main.js                 ← inicia Python + Express + janelas
│   ├── server.js               ← API REST + WebSocket (sessões)
│   ├── database.js             ← SQLite local (sql.js)
│   └── preload.js              ← bridge renderer ↔ main
├── ai_engine/
│   ├── engine.py               ← loop principal: câmera → YOLO → WS
│   ├── detector.py             ← wrapper YOLO (modo real/protótipo)
│   ├── download_model.py       ← baixa yolov8n.pt automaticamente
│   ├── requirements.txt        ← ultralytics, opencv, websockets
│   └── models/
│       └── best.pt             ← coloque aqui após o Pilar 1
├── safeview-patches/           ← patches do app detector
└── dashboard-patches/          ← patches do dashboard
```

---

*SafeView EPI • build MD-01 • Protótipo*
