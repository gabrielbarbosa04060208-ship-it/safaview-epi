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


## Integração com Roboflow (servidor local, 4-5 modelos)

Agora o `ai_engine/detector.py` suporta usar múltiplos modelos do Roboflow Inference Server antes do fallback para YOLO local.

### 1) Suba o servidor local do Roboflow
Com o servidor local rodando, o app usa a API HTTP local (`http://localhost:9001`) e o mesmo padrão recomendado pela documentação oficial do Roboflow Inference Server.

### 2) Configure os modelos
Copie o arquivo de exemplo e preencha com seus model IDs:
```
copy ai_engine\roboflow_config.example.json ai_engine\roboflow_config.json
```

Edite `ai_engine/roboflow_config.json`:
- `enabled: true`
- `server_url`: URL do servidor local do Roboflow (ex.: `http://127.0.0.1:9001`)
- `models`: lista com os IDs dos modelos (você pode trocar/adicionar no futuro).
- `api_key`: opcional (se seu servidor exigir)

> Se `roboflow_config.json` não existir, o app cria automaticamente a partir do `roboflow_config.example.json`.

### Modelos padrão integrados nesta versão
- `hard-hat-workers/13`
- `ppe-detection-yj4rr/1`
- `vest-cye3g/1`
- `glasses-bk4z5/1`

> Esses IDs já estão no `roboflow_config.example.json` e também são usados como fallback quando `enabled=true` e `models` estiver vazio.

### 3) Execute o app
Com `enabled: true`, o engine passa a operar em `mode = roboflow_local` e:
- usa `inference-sdk` (Python) para chamar o servidor local
- envia cada frame para os modelos configurados
- agrega as detecções para a interface já existente
- marca violações por classe (`no-helmet`, `no-vest`, `no-gloves`, `no-glasses`)

Se todos os modelos do Roboflow falharem em sequência, a interface mostra aviso de diagnóstico sem derrubar a sessão.

### 3.1) Seleção de webcam (opcional)
Se sua webcam não estiver no índice padrão, configure:

```bash
SAFEVIEW_CAMERA_INDEX=1
```

Sem essa variável, o engine testa índices `0..5` e tenta backend `CAP_DSHOW` + backend padrão do OpenCV.

### 4) Convenção recomendada de labels nos modelos
Para funcionar "plug and play", use classes com nomes próximos a:
- `person`
- `no-helmet`
- `no-vest`
- `no-gloves`
- `no-glasses`

O detector também aceita aliases comuns (`without-helmet`, `sem-capacete`, etc.).

> Se `roboflow_config.json` não existir (ou `enabled=false`), o comportamento antigo continua: `best.pt` → `ppe_keremberke.pt` → `yolov8n.pt`.

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
