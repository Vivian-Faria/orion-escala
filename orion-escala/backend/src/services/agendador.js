const cron = require('node-cron');
const db = require('../models/db');

cron.schedule('* * * * *', () => {
  // Notif1 sem resposta em 12h -> vago
  db.escalas.updateFaseOld('notif1', 'vago', 12);
  // Notif2 sem resposta em 0.5h -> urgente
  db.escalas.updateFaseOld('notif2', 'urgente', 0.5);

  // Notif2: marca colaboradores confirmados cujo turno começa em ~2h
  const confirmados = db.escalas.findByFase('confirmado1');
  const agora = new Date();
  for (const e of confirmados) {
    if (!e.hora) continue;
    const [h,m] = e.hora.split(':').map(Number);
    let diff = (h*60+m) - (agora.getHours()*60+agora.getMinutes());
    if (diff<0) diff+=1440;
    if (diff>=115&&diff<=125) {
      db.escalas.update(e.id, { fase:'notif2', notificado_em:db.agora() });
      console.log('[NOTIF2] Escala',e.id,'— faltam',diff,'min');
    }
  }
});

console.log('Agendador iniciado — verificando a cada minuto');
