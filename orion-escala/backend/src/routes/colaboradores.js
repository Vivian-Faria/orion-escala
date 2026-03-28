const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../models/db');
const { auth, supervisor } = require('../middleware/auth');
const router = express.Router();

router.get('/', supervisor, (req, res) => {
  res.json(db.colaboradores.findAll().map(({senha_hash,...c})=>c));
});

router.get('/ativos', auth, (req, res) => {
  res.json(db.colaboradores.findAtivos().map(({senha_hash,...c})=>c));
});

router.post('/', supervisor, (req, res) => {
  const { nome, apelido, email, cargo, status, valor_hora, role, turno_avulso } = req.body;
  if (!nome || !email) return res.status(400).json({ erro: 'Nome e email obrigatorios' });
  const existe = db.colaboradores.findByEmail(email.toLowerCase());
  if (existe) return res.status(409).json({ erro: 'Email ja cadastrado' });
  const senhaInicial = (apelido||nome.split(' ')[0]).toLowerCase()+'123';
  const { id } = db.colaboradores.insert({
    nome, apelido:apelido||null, email:email.toLowerCase(),
    senha_hash: bcrypt.hashSync(senhaInicial, 10),
    cargo:cargo||'Operador', status:status||'ativo',
    valor_hora:valor_hora||18, role:role||'colaborador', turno_avulso:turno_avulso?1:0
  });
  res.status(201).json({ id, senha_inicial: senhaInicial });
});

router.put('/:id', supervisor, (req, res) => {
  const { nome, apelido, email, cargo, status, valor_hora, role, turno_avulso } = req.body;
  db.colaboradores.update(Number(req.params.id), { nome, apelido, email:email?.toLowerCase(), cargo, status, valor_hora, role, turno_avulso:turno_avulso?1:0 });
  res.json({ ok: true });
});

router.delete('/:id', supervisor, (req, res) => {
  db.colaboradores.update(Number(req.params.id), { status:'inativo' });
  res.json({ ok: true });
});

router.post('/:id/resetar-senha', supervisor, (req, res) => {
  const u = db.colaboradores.findById(Number(req.params.id));
  if (!u) return res.status(404).json({ erro: 'Nao encontrado' });
  const novaSenha = (u.apelido||u.nome.split(' ')[0]).toLowerCase()+'123';
  db.colaboradores.update(u.id, { senha_hash: bcrypt.hashSync(novaSenha, 10) });
  res.json({ ok:true, nova_senha:novaSenha });
});

module.exports = router;
