const cron = require('node-cron');
const db = require('../models/db');

cron.schedule('* * * * *', () => {
  const agora = new Date();
  const fs = require('fs');
  const DB_PATH = process.env.DB_PATH || './data/orion.json';

  if (!fs.existsSync(DB_PATH)) return;
  const d = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  let alterou = false;

  d.escalas.forEach((e, i) => {
    if (e.fase === 'notif1' && e.notificado_em) {
      const notifTime = new Date(e.notificado_em.replace(' ', 'T') + 'Z');
      const diffHoras = (agora - notifTime) / 3600000;
      if (diffHoras >= 12) {
        d.escalas[i].fase = 'vago';
        alterou = true;
        console.log('[AGENDADOR] Escala', e.id, '-> vago (12h sem resposta)');
      }
    }
    if (e.fase === 'notif2' && e.notificado_em) {
      const notifTime = new Date(e.notificado_em.replace(' ', 'T') + 'Z');
      const diffMin = (agora - notifTime) / 60000;
      if (diffMin >= 30) {
        d.escalas[i].fase = 'urgente';
        alterou = true;
        console.log('[AGENDADOR] Escala', e.id, '-> urgente (30min sem confirmacao)');
      }
    }
  });

  if (alterou) fs.writeFileSync(DB_PATH, JSON.stringify(d, null, 2));

  // Notif2: 2h antes do turno
  const confirmados = db.escalas.findByFase('confirmado1');
  for (const e of confirmados) {
    if (!e.hora) continue;
    const [h, m] = e.hora.split(':').map(Number);
    let diff = (h * 60 + m) - (agora.getHours() * 60 + agora.getMinutes());
    if (diff < 0) diff += 1440;
    if (diff >= 115 && diff <= 125) {
      db.escalas.update(e.id, { fase: 'notif2', notificado_em: db.agora() });
      console.log('[NOTIF2] Escala', e.id, '— faltam', diff, 'min');
    }
  }
});

console.log('Agendador iniciado — verificando a cada minuto');