require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares globais
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:3000',
  ],
  credentials: true
}));
app.use(express.json());

// Rotas
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/colaboradores', require('./routes/colaboradores'));
app.use('/api/escalas',       require('./routes/escalas'));

// Health check
app.get('/api/health', (req, res) => res.json({
  status: 'ok',
  versao: '1.0.0',
  hora: new Date().toISOString()
}));

// Erro global
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Servidor Órion rodando em http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log(`   Ambiente: ${process.env.NODE_ENV || 'development'}\n`);
});

// Inicia o agendador de notificações
require('./services/agendador');
