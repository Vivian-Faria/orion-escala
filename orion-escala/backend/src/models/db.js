// Banco de dados em JSON puro — sem dependências nativas
// Funciona em qualquer sistema operacional sem compilação
require('dotenv').config();
const fs   = require('fs');
const path = require('path');

const DB_PATH = path.resolve(process.env.DB_PATH || './data/orion.json');
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

// Estrutura inicial do banco
const ESTRUTURA = {
  colaboradores: [],
  semanas: [],
  vagas: [],
  escalas: [],
  notificacoes: [],
  _seq: { colaboradores:0, semanas:0, vagas:0, escalas:0, notificacoes:0 }
};

function carregar() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return JSON.parse(JSON.stringify(ESTRUTURA));
  }
}

function salvar(dados) {
  fs.writeFileSync(DB_PATH, JSON.stringify(dados, null, 2));
}

function agora() {
  return new Date().toISOString().replace('T',' ').slice(0,19);
}

function nextId(dados, tabela) {
  dados._seq[tabela] = (dados._seq[tabela] || 0) + 1;
  return dados._seq[tabela];
}

// API compatível com o código existente
const db = {
  // Colaboradores
  colaboradores: {
    findByEmail: (email) => {
      const d = carregar();
      return d.colaboradores.find(c => c.email === email && c.status !== 'inativo') || null;
    },
    findById: (id) => {
      const d = carregar();
      return d.colaboradores.find(c => c.id === id) || null;
    },
    findAll: () => carregar().colaboradores,
    findAtivos: () => carregar().colaboradores.filter(c => c.status === 'ativo'),
    insert: (obj) => {
      const d = carregar();
      const id = nextId(d, 'colaboradores');
      const novo = { id, criado_em: agora(), atualizado_em: agora(), ...obj };
      d.colaboradores.push(novo);
      salvar(d);
      return { id, lastInsertRowid: id };
    },
    update: (id, campos) => {
      const d = carregar();
      const idx = d.colaboradores.findIndex(c => c.id === id);
      if (idx < 0) return;
      d.colaboradores[idx] = { ...d.colaboradores[idx], ...campos, atualizado_em: agora() };
      salvar(d);
    }
  },

  // Semanas
  semanas: {
    findUltima: () => {
      const d = carregar();
      return d.semanas[d.semanas.length - 1] || null;
    },
    findById: (id) => {
      const d = carregar();
      return d.semanas.find(s => s.id === id) || null;
    },
    insert: (obj) => {
      const d = carregar();
      const id = nextId(d, 'semanas');
      d.semanas.push({ id, publicada: 0, criado_em: agora(), ...obj });
      salvar(d);
      return { id };
    },
    publicar: (id) => {
      const d = carregar();
      const s = d.semanas.find(x => x.id === id);
      if (s) s.publicada = 1;
      salvar(d);
    }
  },

  // Vagas
  vagas: {
    findBySemana: (semana_id) => {
      const d = carregar();
      return d.vagas.filter(v => v.semana_id === semana_id);
    },
    findByDia: (semana_id, dia) => {
      const d = carregar();
      return d.vagas.filter(v => v.semana_id === semana_id && v.dia_semana === dia);
    },
    findById: (id) => {
      const d = carregar();
      return d.vagas.find(v => v.id === id) || null;
    },
    insert: (obj) => {
      const d = carregar();
      const id = nextId(d, 'vagas');
      d.vagas.push({ id, criado_em: agora(), ...obj });
      salvar(d);
      return { id };
    }
  },

  // Escalas
  escalas: {
    findById: (id) => {
      const d = carregar();
      return d.escalas.find(e => e.id === id) || null;
    },
    findByColaborador: (colaborador_id) => {
      const d = carregar();
      const es = d.escalas.filter(e => e.colaborador_id === colaborador_id);
      // Junta com vagas e semanas
      return es.map(e => {
        const v = d.vagas.find(x => x.id === e.vaga_id) || {};
        const s = d.semanas.find(x => x.id === v.semana_id) || {};
        return { ...e, ...v, semana_id: v.semana_id, data_inicio: s.data_inicio, publicada: s.publicada };
      }).filter(e => e.publicada);
    },
    findByVaga: (vaga_id) => {
      const d = carregar();
      return d.escalas.filter(e => e.vaga_id === vaga_id);
    },
    findBySemana: (semana_id) => {
      const d = carregar();
      const vagaIds = d.vagas.filter(v => v.semana_id === semana_id).map(v => v.id);
      return d.escalas
        .filter(e => vagaIds.includes(e.vaga_id))
        .map(e => {
          const c = d.colaboradores.find(x => x.id === e.colaborador_id) || {};
          const v = d.vagas.find(x => x.id === e.vaga_id) || {};
          return { ...e, nome: c.nome, apelido: c.apelido, turno_avulso: c.turno_avulso,
                   dia_semana: v.dia_semana, hora: v.hora, hora_idx: v.hora_idx };
        });
    },
    findAlertas: () => {
      const d = carregar();
      return d.escalas
        .filter(e => e.fase === 'vago' || e.fase === 'urgente')
        .map(e => {
          const c = d.colaboradores.find(x => x.id === e.colaborador_id) || {};
          const v = d.vagas.find(x => x.id === e.vaga_id) || {};
          const s = d.semanas.find(x => x.id === v.semana_id) || {};
          return s.publicada ? { ...e, nome: c.nome, apelido: c.apelido, dia_semana: v.dia_semana, hora: v.hora } : null;
        }).filter(Boolean);
    },
    insert: (obj) => {
      const d = carregar();
      const id = nextId(d, 'escalas');
      d.escalas.push({ id, criado_em: agora(), atualizado_em: agora(), ...obj });
      salvar(d);
      return { id };
    },
    update: (id, campos) => {
      const d = carregar();
      const idx = d.escalas.findIndex(e => e.id === id);
      if (idx < 0) return;
      d.escalas[idx] = { ...d.escalas[idx], ...campos, atualizado_em: agora() };
      salvar(d);
    },
    removeByVagaColaborador: (vaga_ids, colaborador_id) => {
      const d = carregar();
      d.escalas = d.escalas.filter(e => !(vaga_ids.includes(e.vaga_id) && e.colaborador_id === colaborador_id));
      salvar(d);
    },
    // Para o agendador
    findByFase: (fase) => {
      const d = carregar();
      return d.escalas
        .filter(e => e.fase === fase)
        .map(e => {
          const v = d.vagas.find(x => x.id === e.vaga_id) || {};
          return { ...e, hora: v.hora };
        });
    },
    updateFaseOld: (fase_atual, nova_fase, horas_atras) => {
      const d = carregar();
      const cutoff = new Date(Date.now() - horas_atras * 3600000).toISOString();
      d.escalas.forEach((e, i) => {
        if (e.fase === fase_atual && e.notificado_em && e.notificado_em < cutoff) {
          d.escalas[i].fase = nova_fase;
          d.escalas[i].atualizado_em = agora();
        }
      });
      salvar(d);
    }
  },

  // Notificações
  notificacoes: {
    insert: (obj) => {
      const d = carregar();
      const id = nextId(d, 'notificacoes');
      d.notificacoes.push({ id, enviado_em: agora(), lido_em: null, ...obj });
      salvar(d);
      return { id };
    },
    findPendentes: (tipo) => {
      const d = carregar();
      return d.notificacoes.filter(n => n.tipo === tipo && !n.lido_em);
    },
    marcarLido: (escala_id, tipo) => {
      const d = carregar();
      d.notificacoes.forEach((n, i) => {
        if (n.escala_id === escala_id && n.tipo === tipo && !n.lido_em) {
          d.notificacoes[i].lido_em = agora();
        }
      });
      salvar(d);
    }
  },

  agora
};

module.exports = db;
