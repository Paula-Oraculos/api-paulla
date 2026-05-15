const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data', 'paulla.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_unico TEXT UNIQUE,
    nome TEXT,
    whatsapp TEXT UNIQUE,
    whatsapp_evolution TEXT,
    pais TEXT DEFAULT 'Brasil',
    data TEXT,
    dia_semana TEXT,
    status TEXT DEFAULT 'Novo',
    tag TEXT,
    origem TEXT,
    grupo TEXT,
    url TEXT,
    utm_source TEXT,
    utm_campaign TEXT,
    utm_medium TEXT,
    dispositivo TEXT,
    hora_periodo TEXT,
    numero_valido INTEGER DEFAULT 1,
    do_brasil TEXT DEFAULT 'Sim',
    ultima_interacao TEXT,
    tipo_lead TEXT DEFAULT 'novo',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS fila_cartas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    arroba TEXT,
    whatsapp TEXT,
    tipo_leitura TEXT DEFAULT 'Tarot',
    status TEXT DEFAULT 'aguardando',
    observacao TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migração: adiciona colunas novas sem quebrar banco existente
const migrations = [
  "ALTER TABLE leads ADD COLUMN courses TEXT DEFAULT '[]'",
  "ALTER TABLE leads ADD COLUMN kanban_stage TEXT DEFAULT 'novos'",
];
migrations.forEach(sql => {
  try { db.exec(sql); } catch {}
});

module.exports = db;
