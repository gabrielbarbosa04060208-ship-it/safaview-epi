// SafeView EPI — v1 | Feito por Gabriel Madureira
// database.js — sql.js com locateFile correto para app empacotado
const path = require('path');
const fs   = require('fs');
const { app } = require('electron');

let db        = null;
let dbPath    = null;
let saveTimer = null; // debounce timer para escrita assíncrona

// save() usa debounce de 500ms para evitar múltiplos writeFile consecutivos
// (ex: INSERT seguido de SELECT). A escrita assíncrona não bloqueia o event loop,
// fundamental para não atrasar responses HTTP/SSE durante sessões simultâneas.
function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const data = db.export();
    fs.writeFile(dbPath, Buffer.from(data), (err) => {
      if (err) console.error('[DB] Erro ao salvar banco:', err.message);
      else console.log('[DB] Banco salvo em:', dbPath);
    });
    saveTimer = null;
  }, 500);
}

// saveFlushed: escrita síncrona usada apenas no initDb() e em writes críticos
// (ex: fim de sessão) para garantir persistência imediata.
function saveFlushed() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

async function initDb() {
  // locateFile garante que o WASM é encontrado tanto em dev quanto no app empacotado
  const initSqlJs = require('sql.js');
  const wasmDir   = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist');

  const SQL = await initSqlJs({
    locateFile: file => path.join(wasmDir, file)
  });

  dbPath = path.join(app.getPath('userData'), 'safeview-epi.db');

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS sessoes_de_monitoramento (
      id                     TEXT PRIMARY KEY,
      created_at             TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      duracao_segundos       INTEGER NOT NULL DEFAULT 0,
      eventos_sem_capacete   INTEGER NOT NULL DEFAULT 0,
      eventos_sem_colete     INTEGER NOT NULL DEFAULT 0,
      eventos_sem_luvas      INTEGER NOT NULL DEFAULT 0,
      eventos_sem_oculos     INTEGER NOT NULL DEFAULT 0,
      nivel_risco            REAL NOT NULL DEFAULT 0,
      pico_risco             REAL NOT NULL DEFAULT 0,
      total_alertas          INTEGER NOT NULL DEFAULT 0,
      nome_funcionario       TEXT,
      local_trabalho         TEXT,
      trabalho_realizado     TEXT,
      informacoes_adicionais TEXT
    );
  `);

  // Migração: garante que colunas adicionadas em versões posteriores existam
  // em bancos criados por versões anteriores do app. Sem isso, INSERTs falhariam
  // silenciosamente em instalações existentes.
  const migrations = [
    `ALTER TABLE sessoes_de_monitoramento ADD COLUMN eventos_sem_capacete   INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE sessoes_de_monitoramento ADD COLUMN eventos_sem_colete     INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE sessoes_de_monitoramento ADD COLUMN eventos_sem_luvas      INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE sessoes_de_monitoramento ADD COLUMN eventos_sem_oculos     INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE sessoes_de_monitoramento ADD COLUMN nivel_risco            REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE sessoes_de_monitoramento ADD COLUMN pico_risco             REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE sessoes_de_monitoramento ADD COLUMN nome_funcionario       TEXT`,
    `ALTER TABLE sessoes_de_monitoramento ADD COLUMN local_trabalho         TEXT`,
    `ALTER TABLE sessoes_de_monitoramento ADD COLUMN trabalho_realizado     TEXT`,
    `ALTER TABLE sessoes_de_monitoramento ADD COLUMN informacoes_adicionais TEXT`,
  ];
  let migrationRan = false;
  for (const migration of migrations) {
    try { db.run(migration); migrationRan = true; } catch { /* coluna já existe */ }
  }
  // Usa saveFlushed (síncrono) no init para garantir persistência antes
  // de o servidor HTTP começar a aceitar conexões.
  if (migrationRan) saveFlushed();
  console.log('[DB] Banco inicializado em:', dbPath);
}

function queryAll(sql, params) {
  // stmt declarado fora do try: se db.prepare() lança (SQL inválido),
  // stmt seria undefined no finally → TypeError que mascararia o erro real.
  // Com declaração prévia e stmt?.free(), o erro original propaga corretamente.
  let stmt;
  const rows = [];
  try {
    stmt = db.prepare(sql);
    if (params && params.length) stmt.bind(params);
    while (stmt.step()) rows.push(stmt.getAsObject());
  } finally {
    stmt?.free();
  }
  return rows;
}

function queryOne(sql, params) {
  return queryAll(sql, params)[0] || null;
}

function run(sql, params) {
  db.run(sql, params || []);
  save();
}

module.exports = { initDb, queryAll, queryOne, run, saveFlushed };
