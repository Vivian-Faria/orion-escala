const express = require('express');
const bcrypt  = require('bcryptjs');
const db      = require('../models/db');
const { auth, supervisor } = require('../middleware/auth');

const router = express.Router();

// GET / — lista todos
router.get('/', supervisor, (req, res) => {
  const lista = db.colaboradores.findAll().map(({ senha_hash, ...c }) => {
    if (typeof c.dias_disponiveis === 'string') {
      try { c.dias_disponiveis = JSON.parse(c.dias_disponiveis); } catch {}
    }
    return c;
  });
  res.json(lista);
});

// GET /ativos
router.get('/ativos', auth, (req, res) => {
  res.json(db.colaboradores.findAtivos().map(({ senha_hash, ...c }) => c));
});

// GET /:id
router.get('/:id', supervisor, (req, res) => {
  const u = db.colaboradores.findById(Number(req.params.id));
  if (!u) return res.status(404).json({ erro: 'Nao encontrado' });
  const { senha_hash, ...safe } = u;
  if (typeof safe.dias_disponiveis === 'string') {
    try { safe.dias_disponiveis = JSON.parse(safe.dias_disponiveis); } catch {}
  }
  res.json(safe);
});

// GET /:id/custo — custo dinamico baseado em horas reais da escala
router.get('/:id/custo', supervisor, (req, res) => {
  const { semana_id } = req.query;
  const colab = db.colaboradores.findById(Number(req.params.id));
  if (!colab) return res.status(404).json({ erro: 'Nao encontrado' });
  if (semana_id) {
    return res.json(db.colaboradores.calcCustoSemana(req.params.id, semana_id));
  }
  res.json({ valor_hora: colab.valor_hora || 0, mensagem: 'Informe semana_id para calcular custo real' });
});

// POST / — cadastra novo
router.post('/', supervisor, (req, res) => {
  const { nome, apelido, email, senha, cargo, status, valor_hora,
          role, turno_avulso, dias_disponiveis, hora_inicio, hora_fim, obs } = req.body;
  if (!nome || !email) return res.status(400).json({ erro: 'Nome e email obrigatorios' });
  const existe = db.colaboradores.findByEmail(email.toLowerCase());
  if (existe) return res.status(409).json({ erro: 'Email ja cadastrado' });
  const senhaFinal = senha && senha.trim().length >= 4
    ? senha.trim()
    : (apelido || nome.split(' ')[0]).toLowerCase() + '123';
  const { id } = db.colaboradores.insert({
    nome, apelido: apelido || nome.split(' ')[0], email: email.toLowerCase(),
    senha_hash: bcrypt.hashSync(senhaFinal, 10), cargo: cargo || 'Operador',
    status: status || 'ativo', valor_hora: Number(valor_hora) || 18,
    role: role || 'colaborador', turno_avulso: turno_avulso ? 1 : 0,
    dias_disponiveis: JSON.stringify(dias_disponiveis || ['dom','seg','ter','qua','qui','sex','sab']),
    hora_inicio: hora_inicio || '09:00', hora_fim: hora_fim || '23:00', obs: obs || ''
  });
  res.status(201).json({ id, senha_inicial: senhaFinal });
});

// PUT /:id — edita colaborador (bug de tipo corrigido)
router.put('/:id', supervisor, (req, res) => {
  const id = Number(req.params.id);
  const atual = db.colaboradores.findById(id);
  if (!atual) return res.status(404).json({ erro: 'Colaborador nao encontrado' });

  const { nome, apelido, email, senha, cargo, status, valor_hora,
          role, turno_avulso, dias_disponiveis, hora_inicio, hora_fim, obs } = req.body;

  const updates = {};
  if (nome         !== undefined) updates.nome         = nome;
  if (apelido      !== undefined) updates.apelido      = apelido;
  if (email        !== undefined) updates.email        = email.toLowerCase();
  if (cargo        !== undefined) updates.cargo        = cargo;
  if (status       !== undefined) updates.status       = status;
  if (valor_hora   !== undefined) updates.valor_hora   = Number(valor_hora);
  if (role         !== undefined) updates.role         = role;
  if (turno_avulso !== undefined) updates.turno_avulso = turno_avulso ? 1 : 0;
  if (hora_inicio  !== undefined) updates.hora_inicio  = hora_inicio;
  if (hora_fim     !== undefined) updates.hora_fim     = hora_fim;
  if (obs          !== undefined) updates.obs          = obs;
  if (dias_disponiveis !== undefined)
    updates.dias_disponiveis = Array.isArray(dias_disponiveis)
      ? JSON.stringify(dias_disponiveis) : dias_disponiveis;
  if (senha && senha.trim().length >= 4)
    updates.senha_hash = bcrypt.hashSync(senha.trim(), 10);

  const ok = db.colaboradores.update(id, updates);
  if (!ok) return res.status(500).json({ erro: 'Falha ao salvar — id nao encontrado no banco' });

  res.json({ ok: true, campos_atualizados: Object.keys(updates).filter(k => k !== 'senha_hash') });
});

// DELETE /:id — inativa
router.delete('/:id', supervisor, (req, res) => {
  const id = Number(req.params.id);
  const atual = db.colaboradores.findById(id);
  if (!atual) return res.status(404).json({ erro: 'Colaborador nao encontrado' });
  db.colaboradores.update(id, { status: 'inativo' });
  res.json({ ok: true, mensagem: atual.nome + ' foi inativado.' });
});

// POST /:id/resetar-senha
router.post('/:id/resetar-senha', supervisor, (req, res) => {
  const id = Number(req.params.id);
  const u = db.colaboradores.findById(id);
  if (!u) return res.status(404).json({ erro: 'Nao encontrado' });
  const novaSenha = (u.apelido || u.nome.split(' ')[0]).toLowerCase() + '123';
  db.colaboradores.update(id, { senha_hash: bcrypt.hashSync(novaSenha, 10) });
  res.json({ ok: true, nova_senha: novaSenha });
});

// GET /:id/advertencias
router.get('/:id/advertencias', supervisor, (req, res) => {
  res.json(db.advertencias.findByColaborador(Number(req.params.id)));
});

// POST /:id/advertencias — lanca advertencia
router.post('/:id/advertencias', supervisor, (req, res) => {
  const colaborador_id = Number(req.params.id);
  const colab = db.colaboradores.findById(colaborador_id);
  if (!colab) return res.status(404).json({ erro: 'Colaborador nao encontrado' });
  const { tipo, descricao, escala_id } = req.body;
  if (!tipo || !descricao) return res.status(400).json({ erro: 'tipo e descricao sao obrigatorios' });
  const { id } = db.advertencias.insert({
    colaborador_id, tipo, descricao,
    escala_id: escala_id || null,
    lancado_por: req.usuario.id, status: 'ativa'
  });
  const total = db.advertencias.findByColaborador(colaborador_id).filter(a => a.status === 'ativa').length;
  res.status(201).json({
    id, ok: true,
    mensagem: 'Advertencia ' + tipo + ' registrada para ' + colab.nome + '.',
    total_advertencias_ativas: total,
    alerta: total >= 3 ? 'Este colaborador tem 3 ou mais advertencias ativas.' : null
  });
});

// PUT /:id/advertencias/:adv_id
router.put('/:id/advertencias/:adv_id', supervisor, (req, res) => {
  const ok = db.advertencias.update(Number(req.params.adv_id), req.body);
  if (!ok) return res.status(404).json({ erro: 'Advertencia nao encontrada' });
  res.json({ ok: true });
});

// DELETE /:id/advertencias/:adv_id
router.delete('/:id/advertencias/:adv_id', supervisor, (req, res) => {
  db.advertencias.delete(Number(req.params.adv_id));
  res.json({ ok: true });
});

module.exports = router;
