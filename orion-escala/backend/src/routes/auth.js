const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../models/db');
const { auth } = require('../middleware/auth');
const router = express.Router();

router.post('/login', (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ erro: 'Email e senha obrigatorios' });
  const u = db.colaboradores.findByEmail(email.toLowerCase().trim());
  if (!u || !bcrypt.compareSync(senha, u.senha_hash)) {
    return res.status(401).json({ erro: 'Email ou senha incorretos' });
  }
  const token = jwt.sign(
    { id: u.id, nome: u.nome, role: u.role, turno_avulso: u.turno_avulso },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );
  res.json({ token, usuario: { id:u.id, nome:u.nome, apelido:u.apelido, email:u.email, cargo:u.cargo, role:u.role, turno_avulso:u.turno_avulso===1 } });
});

router.post('/trocar-senha', auth, (req, res) => {
  const { senha_atual, nova_senha } = req.body;
  if (!senha_atual || !nova_senha) return res.status(400).json({ erro: 'Preencha todos os campos' });
  if (nova_senha.length < 6) return res.status(400).json({ erro: 'Nova senha deve ter pelo menos 6 caracteres' });
  const u = db.colaboradores.findById(req.usuario.id);
  if (!bcrypt.compareSync(senha_atual, u.senha_hash)) return res.status(401).json({ erro: 'Senha atual incorreta' });
  db.colaboradores.update(req.usuario.id, { senha_hash: bcrypt.hashSync(nova_senha, 10) });
  res.json({ ok: true });
});

router.get('/me', auth, (req, res) => {
  const u = db.colaboradores.findById(req.usuario.id);
  const { senha_hash, ...safe } = u;
  res.json(safe);
});

module.exports = router;
