const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../models/db');
const { auth, supervisor } = require('../middleware/auth');

const router = express.Router();

router.get('/', supervisor, (req, res) => {
  res.json(db.colaboradores.findAll().map(({ senha_hash, ...c }) => c));
});

router.get('/ativos', auth, (req, res) => {
  res.json(db.colaboradores.findAtivos().map(({ senha_hash, ...c }) => c));
});

router.get('/:id', supervisor, (req, res) => {
  const u = db.colaboradores.findById(Number(req.params.id));
  if (!u) return res.status(404).json({ erro: 'Nao encontrado' });
  const { senha_hash, ...safe } = u;
  if (typeof safe.dias_disponiveis === 'string') {
    try { safe.dias_disponiveis = JSON.parse(safe.dias_disponiveis); } catch {}
  }
  res.json(safe);
});

router.post('/', supervisor, (req, res) => {
  const { nome, apelido, email, cargo, status, valor_hora, role, turno_avulso, dias_disponiveis, hora_inicio, hora_fim, obs } = req.body;
  if (!nome || !email) return res.status(400).json({ erro: 'Nome e email obrigatorios' });
  const existe = db.colaboradores.findByEmail(email.toLowerCase());
  if (existe) return res.status(409).json({ erro: 'Email ja cadastrado' });
  const senhaInicial = (apelido || nome.split(' ')[0]).toLowerCase() + '123';
  const { id } = db.colaboradores.insert({
    nome, apelido: apelido || nome.split(' ')[0], email: email.toLowerCase(),
    senha_hash: bcrypt.hashSync(senhaInicial, 10), cargo: cargo || 'Operador',
    status: status || 'ativo', valor_hora: valor_hora || 18,
    role: role || 'colaborador', turno_avulso: turno_avulso ? 1 : 0,
    dias_disponiveis: JSON.stringify(dias_disponiveis || ['dom','seg','ter','qua','qui','sex','sab']),
    hora_inicio: hora_inicio || '10:00', hora_fim: hora_fim || '23:00', obs: obs || ''
  });
  res.status(201).json({ id, senha_inicial: senhaInicial });
});

router.put('/:id', supervisor, (req, res) => {
  const id = Number(req.params.id);
  const atual = db.colaboradores.findById(id);
  if (!atual) return res.status(404).json({ erro: 'Colaborador nao encontrado' });
  const { nome, apelido, email, cargo, status, valor_hora, role, turno_avulso, dias_disponiveis, hora_inicio, hora_fim, obs } = req.body;
  db.colaboradores.update(id, {
    nome: nome != null ? nome : atual.nome,
    apelido: apelido != null ? apelido : atual.apelido,
    email: email != null ? email.toLowerCase() : atual.email,
    cargo: cargo != null ? cargo : atual.cargo,
    status: status != null ? status : atual.status,
    valor_hora: valor_hora != null ? valor_hora : atual.valor_hora,
    role: role != null ? role : atual.role,
    turno_avulso: turno_avulso != null ? (turno_avulso ? 1 : 0) : atual.turno_avulso,
    dias_disponiveis: dias_disponiveis != null ? JSON.stringify(dias_disponiveis) : atual.dias_disponiveis,
    hora_inicio: hora_inicio != null ? hora_inicio : atual.hora_inicio,
    hora_fim: hora_fim != null ? hora_fim : atual.hora_fim,
    obs: obs != null ? obs : atual.obs,
  });
  res.json({ ok: true });
});

router.delete('/:id', supervisor, (req, res) => {
  const id = Number(req.params.id);
  const atual = db.colaboradores.findById(id);
  if (!atual) return res.status(404).json({ erro: 'Colaborador nao encontrado' });
  db.colaboradores.update(id, { status: 'inativo' });
  res.json({ ok: true, mensagem: atual.nome + ' foi inativado.' });
});

router.post('/:id/resetar-senha', supervisor, (req, res) => {
  const id = Number(req.params.id);
  const u = db.colaboradores.findById(id);
  if (!u) return res.status(404).json({ erro: 'Nao encontrado' });
  const novaSenha = (u.apelido || u.nome.split(' ')[0]).toLowerCase() + '123';
  db.colaboradores.update(id, { senha_hash: bcrypt.hashSync(novaSenha, 10) });
  res.json({ ok: true, nova_senha: novaSenha });
});

module.exports = router;
