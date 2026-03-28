const jwt = require('jsonwebtoken');

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ erro: 'Token não fornecido' });
  }
  try {
    const token = header.split(' ')[1];
    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ erro: 'Token inválido ou expirado' });
  }
}

function supervisor(req, res, next) {
  auth(req, res, () => {
    if (req.usuario.role !== 'supervisor' && req.usuario.role !== 'admin') {
      return res.status(403).json({ erro: 'Acesso restrito ao supervisor' });
    }
    next();
  });
}

module.exports = { auth, supervisor };
