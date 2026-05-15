const express = require('express');
const router = express.Router();
const db = require('../database');
const axios = require('axios');

const EVOLUTION_URL = process.env.EVOLUTION_URL;
const EVOLUTION_KEY = process.env.EVOLUTION_KEY;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'Ana';
const PAULA_WHATSAPP = process.env.PAULA_WHATSAPP;
const LINK_GRUPO = process.env.LINK_GRUPO;

const formatarData = (dataStr) => {
  if (!dataStr) return new Date().toISOString();
  try {
    const [dataParte] = dataStr.split(' ');
    const [dia, mes, ano] = dataParte.split('/');
    const hora = dataStr.split(' ')[1] || '00:00:00';
    return `${ano}-${mes}-${dia}T${hora}`;
  } catch {
    return dataStr;
  }
};

const formatarWhatsApp = (whatsapp, ddi) => {
  if (!whatsapp) return null;
  const limpo = whatsapp.replace(/\D/g, '');
  if (limpo.length >= 12) return limpo;
  if (ddi) return ddi.replace(/\D/g, '') + limpo;
  return limpo;
};

const extrairPeriodo = (hora) => {
  if (!hora) return null;
  try {
    const h = parseInt(hora.split(':')[0]);
    if (h >= 6 && h < 12) return 'manhã';
    if (h >= 12 && h < 18) return 'tarde';
    if (h >= 18 && h < 24) return 'noite';
    return 'madrugada';
  } catch {
    return null;
  }
};

const enviarWhatsApp = async (numero, texto) => {
  try {
    await axios.post(
      `${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
      {
        number: numero,
        text: texto,
        options: { delay: 1200, presence: 'composing' }
      },
      { headers: { apikey: EVOLUTION_KEY } }
    );
  } catch (err) {
    console.error('Erro Evolution:', err.message);
  }
};

// POST /webhook/paulaoraculos
router.post('/paulaoraculos', (req, res) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    const whatsapp = formatarWhatsApp(body.Whatsapp || body.whatsapp, body.DDI || body.ddi);

    const lead = {
      id_unico: body.id_unico || body.ID_unico || `eb-${Date.now()}`,
      nome: body.Nome || body.nome || null,
      whatsapp,
      whatsapp_evolution: whatsapp ? `${whatsapp}@s.whatsapp.net` : null,
      pais: body.Pais || body.pais || 'Brasil',
      data: formatarData(body.Data || body.data),
      dia_semana: body.Dia_Semana || body.dia_semana || null,
      status: body.Status || body.status || 'Novo',
      tag: body.Tag || body.tag || null,
      origem: body.Origem || body.origem || 'Página de captura',
      grupo: body.Grupo || body.grupo || null,
      url: body.URL || body.url || null,
      utm_source: body.UTM_Source || body.utm_source || null,
      utm_campaign: body.UTM_Campaign || body.utm_campaign || null,
      utm_medium: body.UTM_Medium || body.utm_medium || null,
      dispositivo: body.Dispositivo || body.dispositivo || null,
      hora_periodo: extrairPeriodo(body.Hora || body.hora),
      numero_valido: whatsapp !== null ? 1 : 0,
      do_brasil: (body.Pais || body.pais || 'Brasil') === 'Brasil' ? 'Sim' : 'Não',
    };

    // Verifica se lead já existe
    const existente = db.prepare('SELECT * FROM leads WHERE whatsapp = ?').get(lead.whatsapp);

    if (!existente) {
      // Novo lead
      db.prepare(`
        INSERT INTO leads (id_unico, nome, whatsapp, whatsapp_evolution, pais, data, dia_semana, status, tag, origem, grupo, url, utm_source, utm_campaign, utm_medium, dispositivo, hora_periodo, numero_valido, do_brasil, tipo_lead)
        VALUES (@id_unico, @nome, @whatsapp, @whatsapp_evolution, @pais, @data, @dia_semana, @status, @tag, @origem, @grupo, @url, @utm_source, @utm_campaign, @utm_medium, @dispositivo, @hora_periodo, @numero_valido, @do_brasil, 'novo')
      `).run(lead);

      // Boas-vindas para o lead
      if (whatsapp) {
        enviarWhatsApp(
          lead.whatsapp_evolution,
          `🌟 *Olá ${lead.nome}!* 🌟\n\nBem-vindo(a) ao grupo! ✨\n\nVocê acaba de dar o primeiro passo para uma jornada de autoconhecimento.\n\n🔮 Aqui você encontrará direcionamento e conhecimento útil para sua evolução pessoal!\n\n🙏 Com carinho,\n*Paula Oráculos*\n\n${LINK_GRUPO}`
        );
      }

      // Notifica Paula
      enviarWhatsApp(
        `${PAULA_WHATSAPP}@s.whatsapp.net`,
        `⚡ *NOVO LEAD*\n\n👤 *Nome:* ${lead.nome}\n📱 *Whats:* ${lead.whatsapp}\n🌍 *País:* ${lead.pais}\n📍 *Origem:* ${lead.origem}\n\n🚀 *Entrou agora!*`
      );
    } else {
      // Reengajamento
      db.prepare(`
        UPDATE leads SET status = 'Reengajamento', ultima_interacao = CURRENT_TIMESTAMP, tipo_lead = 'reengajamento', updated_at = CURRENT_TIMESTAMP
        WHERE whatsapp = ?
      `).run(lead.whatsapp);

      enviarWhatsApp(
        `${PAULA_WHATSAPP}@s.whatsapp.net`,
        `🔥 *LEAD RE-ENGAJADO*\n\n👤 *Nome:* ${lead.nome}\n📱 *Whats:* ${lead.whatsapp}\n🏷️ *Origem:* ${lead.origem}\n\n💡 Este lead se cadastrou novamente!`
      );
    }

    res.json({ success: true, tipo: existente ? 'reengajamento' : 'novo' });
  } catch (err) {
    console.error('Erro webhook:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /webhook/greenn — compra aprovada na Greenn
router.post('/greenn', (req, res) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    console.log('[Greenn webhook recebido]', JSON.stringify(body, null, 2));

    // Extrai nome do produto (tenta várias estruturas possíveis da Greenn)
    const nomeProduto =
      body.product?.name ||
      body.product_name ||
      body.data?.product?.name ||
      body.plan?.name ||
      body.offer?.name ||
      body.item?.name ||
      'Produto Greenn';

    // Extrai telefone do comprador
    const rawPhone =
      body.customer?.phone ||
      body.customer?.cellphone ||
      body.subscriber?.phone ||
      body.data?.subscriber?.phone ||
      body.data?.customer?.phone ||
      body.phone ||
      body.customer_phone;

    if (!rawPhone) {
      console.warn('[Greenn] Telefone não encontrado no payload');
      return res.json({ success: false, error: 'Telefone não encontrado no payload' });
    }

    const phone = String(rawPhone).replace(/\D/g, '');

    // Busca lead pelos últimos 8 dígitos do telefone (tolerante a DDI)
    const suffix = phone.slice(-8);
    const lead = db.prepare("SELECT * FROM leads WHERE whatsapp LIKE ?").get(`%${suffix}`);

    if (!lead) {
      console.warn(`[Greenn] Lead não encontrado para telefone: ${phone}`);
      return res.json({ success: false, error: 'Lead não encontrado', phone });
    }

    // Adiciona o produto/curso à lista
    let courses = [];
    try { courses = JSON.parse(lead.courses || '[]'); } catch {}
    if (!courses.includes(nomeProduto)) courses.push(nomeProduto);

    // Salva no banco: cursos + move para convertidos
    db.prepare(`
      UPDATE leads
      SET courses = ?, kanban_stage = 'convertidos', status = 'Convertido', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(JSON.stringify(courses), lead.id);

    // Notifica Paula
    if (PAULA_WHATSAPP) {
      enviarWhatsApp(
        `${PAULA_WHATSAPP}@s.whatsapp.net`,
        `💰 *VENDA CONFIRMADA — Greenn*\n\n👤 *Lead:* ${lead.nome}\n📱 *Whats:* ${lead.whatsapp}\n🎓 *Produto:* ${nomeProduto}\n\n✅ Lead movido automaticamente para *Convertidos*!`
      );
    }

    res.json({ success: true, lead_id: lead.id, produto: nomeProduto, courses });
  } catch (err) {
    console.error('[Greenn webhook erro]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
