require('dotenv').config();
const fs   = require('fs');
const path = require('path');

const DB_PATH = path.resolve(process.env.DB_PATH || './data/orion.json');
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const ESTRUTURA = {
  colaboradores: [], semanas: [], vagas: [], escalas: [],
  notificacoes: [], advertencias: [],
  _seq: { colaboradores:0, semanas:0, vagas:0, escalas:0, notificacoes:0, advertencias:0 }
};

function carregar() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch { return JSON.parse(JSON.stringify(ESTRUTURA)); }
}
function salvar(d) { fs.writeFileSync(DB_PATH, JSON.stringify(d, null, 2)); }
function agora()   { return new Date().toISOString().replace('T',' ').slice(0,19); }
function nextId(d, t) { d._seq[t] = (d._seq[t] || 0) + 1; return d._seq[t]; }

const db = {
  agora,
  colaboradores: {
    findByEmail: (email) => { const d = carregar(); return d.colaboradores.find(c => c.email === email) || null; },
    findById: (id) => { const d = carregar(); return d.colaboradores.find(c => Number(c.id) === Number(id)) || null; },
    findAll: () => carregar().colaboradores,
    findAtivos: () => carregar().colaboradores.filter(c => c.status === 'ativo'),
    insert: (obj) => {
      const d = carregar(); const id = nextId(d, 'colaboradores');
      d.colaboradores.push({ id, criado_em: agora(), atualizado_em: agora(),
        dias_disponiveis: JSON.stringify(['dom','seg','ter','qua','qui','sex','sab']),
        hora_inicio: '09:00', hora_fim: '23:00', obs: '', ...obj });
      salvar(d); return { id };
    },
    update: (id, campos) => {
      const d = carregar();
      const i = d.colaboradores.findIndex(c => Number(c.id) === Number(id));
      if (i < 0) return false;
      d.colaboradores[i] = { ...d.colaboradores[i], ...campos, atualizado_em: agora() };
      salvar(d); return true;
    },
    calcCustoSemana: (colaborador_id, semana_id) => {
      const d = carregar();
      const colab = d.colaboradores.find(c => Number(c.id) === Number(colaborador_id));
      if (!colab) return { horas: 0, custo: 0 };
      const escalas = d.escalas.filter(e =>
        Number(e.colaborador_id) === Number(colaborador_id) &&
        Number(e.semana_id) === Number(semana_id) &&
        !['recusado','removido','vago'].includes(e.fase));
      const horas = escalas.length;
      const custo = parseFloat((horas * (colab.valor_hora || 0)).toFixed(2));
      return { horas, custo, valor_hora: colab.valor_hora || 0 };
    }
  },
  semanas: {
    findUltima: () => { const d = carregar(); return d.semanas[d.semanas.length-1] || null; },
    findById: (id) => { const d = carregar(); return d.semanas.find(s => Number(s.id) === Number(id)) || null; },
    insert: (obj) => { const d = carregar(); const id = nextId(d, 'semanas'); d.semanas.push({ id, publicada:0, criado_em: agora(), ...obj }); salvar(d); return { id }; },
    publicar: (id) => { const d = carregar(); const s = d.semanas.find(x => Number(x.id) === Number(id)); if (s) { s.publicada = 1; s.publicado_em = agora(); } salvar(d); }
  },
  vagas: {
    findBySemana: (semana_id) => carregar().vagas.filter(v => Number(v.semana_id) === Number(semana_id)),
    findByDia: (semana_id, dia) => carregar().vagas.filter(v => Number(v.semana_id) === Number(semana_id) && v.dia_semana === dia),
    findById: (id) => carregar().vagas.find(v => Number(v.id) === Number(id)) || null,
    insert: (obj) => { const d = carregar(); const id = nextId(d, 'vagas'); d.vagas.push({ id, criado_em: agora(), ...obj }); salvar(d); return { id }; }
  },
  escalas: {
    findById: (id) => carregar().escalas.find(e => Number(e.id) === Number(id)) || null,
    findByColaborador: (colaborador_id) => {
      const d = carregar();
      return d.escalas.filter(e => Number(e.colaborador_id) === Number(colaborador_id)).map(e => {
        const v = d.vagas.find(x => Number(x.id) === Number(e.vaga_id)) || {};
        const s = d.semanas.find(x => Number(x.id) === Number(e.semana_id || v.semana_id)) || {};
        return { ...v, ...e, id: e.id, semana_id: e.semana_id || v.semana_id, data_inicio: s.data_inicio, data_fim: s.data_fim, publicada: s.publicada };
      }).filter(e => e.publicada);
    },
    findByVaga: (vaga_id) => carregar().escalas.filter(e => Number(e.vaga_id) === Number(vaga_id)),
    findBySemana: (semana_id) => {
      const d = carregar();
      return d.escalas.filter(e => Number(e.semana_id) === Number(semana_id)).map(e => {
        const v = d.vagas.find(x => Number(x.id) === Number(e.vaga_id)) || {};
        const c = d.colaboradores.find(x => Number(x.id) === Number(e.colaborador_id)) || {};
        return { ...e, dia_semana: e.dia_semana || v.dia_semana, hora: e.hora || v.hora, hora_idx: e.hora_idx ?? v.hora_idx, nome: c.nome, apelido: c.apelido, cargo: c.cargo, turno_avulso: c.turno_avulso };
      });
    },
    findAlertas: () => {
      const d = carregar();
      return d.escalas.filter(e => ['vago','urgente','recusado'].includes(e.fase)).map(e => {
        const c = d.colaboradores.find(x => Number(x.id) === Number(e.colaborador_id)) || {};
        const v = d.vagas.find(x => Number(x.id) === Number(e.vaga_id)) || {};
        const s = d.semanas.find(x => Number(x.id) === Number(e.semana_id || v.semana_id)) || {};
        return s.publicada ? { ...e, nome: c.nome, apelido: c.apelido, dia_semana: e.dia_semana || v.dia_semana, hora: e.hora || v.hora } : null;
      }).filter(Boolean);
    },
    findByFase: (fase) => { const d = carregar(); return d.escalas.filter(e => e.fase === fase).map(e => { const v = d.vagas.find(x => Number(x.id) === Number(e.vaga_id)) || {}; return { ...e, hora: e.hora || v.hora }; }); },
    insert: (obj) => { const d = carregar(); const id = nextId(d, 'escalas'); d.escalas.push({ id, criado_em: agora(), atualizado_em: agora(), ...obj }); salvar(d); return { id }; },
    update: (id, campos) => { const d = carregar(); const i = d.escalas.findIndex(e => Number(e.id) === Number(id)); if (i < 0) return false; d.escalas[i] = { ...d.escalas[i], ...campos, atualizado_em: agora() }; salvar(d); return true; },
    removeByVagaColaborador: (vaga_ids, colaborador_id) => { const d = carregar(); d.escalas = d.escalas.filter(e => !(vaga_ids.map(Number).includes(Number(e.vaga_id)) && Number(e.colaborador_id) === Number(colaborador_id))); salvar(d); },
    atualizarFasesPorTempo: () => {
      const agora = new Date(); const d = carregar(); let alterou = false;
      d.escalas.forEach((e, i) => {
        if (e.fase === 'notif1' && e.notificado_em) { const t = new Date(e.notificado_em.replace(' ','T')+'Z'); if ((agora-t)/3600000 >= 12) { d.escalas[i].fase='vago'; d.escalas[i].atualizado_em=agora.toISOString().replace('T',' ').slice(0,19); alterou=true; } }
        if (e.fase === 'notif2' && e.notificado_em) { const t = new Date(e.notificado_em.replace(' ','T')+'Z'); if ((agora-t)/60000 >= 30) { d.escalas[i].fase='urgente'; d.escalas[i].atualizado_em=agora.toISOString().replace('T',' ').slice(0,19); alterou=true; } }
      });
      if (alterou) salvar(d);
    }
  },
  notificacoes: {
    insert: (obj) => { const d = carregar(); const id = nextId(d, 'notificacoes'); d.notificacoes.push({ id, enviado_em: agora(), lido_em: null, ...obj }); salvar(d); return { id }; },
    findPendentes: (tipo) => carregar().notificacoes.filter(n => n.tipo === tipo && !n.lido_em),
    findPorColaborador: (colaborador_id) => { const d = carregar(); const ids = d.escalas.filter(e => Number(e.colaborador_id) === Number(colaborador_id)).map(e => e.id); return d.notificacoes.filter(n => ids.includes(n.escala_id) && !n.lido_em); },
    marcarLido: (escala_id, tipo) => { const d = carregar(); d.notificacoes.forEach((n, i) => { if (Number(n.escala_id) === Number(escala_id) && n.tipo === tipo && !n.lido_em) d.notificacoes[i].lido_em = agora(); }); salvar(d); }
  },
  advertencias: {
    findByColaborador: (colaborador_id) => carregar().advertencias?.filter(a => Number(a.colaborador_id) === Number(colaborador_id)) || [],
    findAll: () => carregar().advertencias || [],
    insert: (obj) => { const d = carregar(); if (!d.advertencias) d.advertencias = []; if (!d._seq.advertencias) d._seq.advertencias = 0; const id = nextId(d, 'advertencias'); d.advertencias.push({ id, criado_em: agora(), ...obj }); salvar(d); return { id }; },
    update: (id, campos) => { const d = carregar(); if (!d.advertencias) return false; const i = d.advertencias.findIndex(a => Number(a.id) === Number(id)); if (i < 0) return false; d.advertencias[i] = { ...d.advertencias[i], ...campos, atualizado_em: agora() }; salvar(d); return true; },
    delete: (id) => { const d = carregar(); if (!d.advertencias) return; d.advertencias = d.advertencias.filter(a => Number(a.id) !== Number(id)); salvar(d); }
  }
};

module.exports = db;
