const express = require('express');
const router = express.Router();
const db = require('../database');

// GET /leads — lista todos com filtros
router.get('/', (req, res) => {
  const { status, origem, do_brasil, search, limit = 100, offset = 0 } = req.query;

  let query = 'SELECT * FROM leads WHERE 1=1';
  const params = [];

  if (status) { query += ' AND status = ?'; params.push(status); }
  if (origem) { query += ' AND origem = ?'; params.push(origem); }
  if (do_brasil) { query += ' AND do_brasil = ?'; params.push(do_brasil); }
  if (search) {
    query += ' AND (nome LIKE ? OR whatsapp LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const raw = db.prepare(query).all(...params);
  const leads = raw.map(l => ({
    ...l,
    courses: (() => { try { return JSON.parse(l.courses || '[]'); } catch { return []; } })(),
  }));
  const total = db.prepare('SELECT COUNT(*) as count FROM leads').get().count;

  res.json({ leads, total });
});

// GET /leads/stats — totais para dashboard
router.get('/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as count FROM leads').get().count;
  const novos = db.prepare("SELECT COUNT(*) as count FROM leads WHERE status = 'Novo'").get().count;
  const reengajamento = db.prepare("SELECT COUNT(*) as count FROM leads WHERE status = 'Reengajamento'").get().count;
  const hoje = db.prepare("SELECT COUNT(*) as count FROM leads WHERE DATE(created_at) = DATE('now')").get().count;
  const brasil = db.prepare("SELECT COUNT(*) as count FROM leads WHERE do_brasil = 'Sim'").get().count;

  res.json({ total, novos, reengajamento, hoje, brasil });
});

// GET /leads/:id
router.get('/:id', (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
  res.json(lead);
});

// PATCH /leads/:id/status
router.patch('/:id/status', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE leads SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.params.id);
  res.json({ success: true });
});

// PATCH /leads/:id/stage — atualiza estágio do kanban
router.patch('/:id/stage', (req, res) => {
  const { stage } = req.body;
  db.prepare('UPDATE leads SET kanban_stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(stage, req.params.id);
  res.json({ success: true });
});

// PATCH /leads/:id/courses — adiciona ou remove curso
router.patch('/:id/courses', (req, res) => {
  const { action, course } = req.body; // action: 'add' | 'remove'
  const lead = db.prepare('SELECT courses FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

  let courses = [];
  try { courses = JSON.parse(lead.courses || '[]'); } catch {}

  if (action === 'add' && !courses.includes(course)) courses.push(course);
  if (action === 'remove') courses = courses.filter(c => c !== course);

  db.prepare('UPDATE leads SET courses = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(JSON.stringify(courses), req.params.id);
  res.json({ success: true, courses });
});

// GET /leads/fila — fila de cartas
router.get('/fila/cartas', (req, res) => {
  const fila = db.prepare("SELECT * FROM fila_cartas WHERE status = 'aguardando' ORDER BY created_at ASC").all();
  res.json(fila);
});

// POST /leads/fila — adiciona na fila
router.post('/fila/cartas', (req, res) => {
  const { nome, arroba, whatsapp, tipo_leitura, observacao } = req.body;
  const result = db.prepare(
    'INSERT INTO fila_cartas (nome, arroba, whatsapp, tipo_leitura, observacao) VALUES (?, ?, ?, ?, ?)'
  ).run(nome, arroba, whatsapp, tipo_leitura || 'Tarot', observacao);
  res.json({ success: true, id: result.lastInsertRowid });
});

// PATCH /leads/fila/:id — atualiza status da fila
router.patch('/fila/cartas/:id', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE fila_cartas SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ success: true });
});

module.exports = router;
