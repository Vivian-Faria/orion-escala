// agendador.js — tarefas agendadas do Orion Escala
const cron = require('node-cron');
const db   = require('../models/db');

// CRON 1: TODO DOMINGO AS 10:00 (America/Sao_Paulo)
// Raspa demanda da semana anterior + gera escala da proxima semana
cron.schedule('0 10 * * 0', async () => {
  console.log('\n[CRON] Domingo 10:00 — iniciando raspagem de demanda...');
  try {
    const raspar = require('./scraper-demanda');
    const resultado = await raspar();
    console.log('[CRON] Demanda raspada: ' + resultado.total_pedidos + ' pedidos | Escala gerada como rascunho');
  } catch (err) {
    console.error('[CRON] Erro na raspagem:', err.message);
  }
}, { timezone: 'America/Sao_Paulo' });

// CRON 2: A CADA HORA — atualiza fases por tempo
// notif1 sem resposta em 12h → vago | notif2 sem resposta em 30min → urgente
cron.schedule('0 * * * *', () => {
  try { db.escalas.atualizarFasesPorTempo(); }
  catch (err) { console.error('[CRON] atualizarFasesPorTempo:', err.message); }
}, { timezone: 'America/Sao_Paulo' });

// CRON 3: A CADA 5 MIN — lembrete 2h antes do turno
cron.schedule('*/5 * * * *', () => {
  try {
    const agora  = new Date();
    const em2h   = new Date(agora.getTime() + 2 * 3600000);
    const h2h    = String(em2h.getHours()).padStart(2,'0') + ':00';
    const diaSem = ['dom','seg','ter','qua','qui','sex','sab'][em2h.getDay()];
    const semana = db.semanas.findUltima();
    if (!semana || !semana.publicada) return;
    const escalas = db.escalas.findBySemana(semana.id).filter(e =>
      e.fase === 'confirmado1' && e.dia_semana === diaSem && e.hora === h2h
    );
    for (const e of escalas) {
      db.escalas.update(e.id, { fase: 'notif2', notificado_em: db.agora() });
      db.notificacoes.insert({ escala_id: e.id, tipo: 'notif2' });
    }
    if (escalas.length > 0)
      console.log('[CRON] Lembrete 2h: ' + escalas.length + ' colaboradores notificados para ' + diaSem + ' ' + h2h);
  } catch (err) {
    console.error('[CRON] lembrete 2h:', err.message);
  }
}, { timezone: 'America/Sao_Paulo' });

console.log('Agendador iniciado');
console.log('  -> Scraping automatico: todo domingo as 10:00 (America/Sao_Paulo)');
console.log('  -> Atualizacao de fases: a cada hora');
console.log('  -> Lembretes 2h antes:  a cada 5 minutos');
