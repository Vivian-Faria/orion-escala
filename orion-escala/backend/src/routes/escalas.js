const express = require('express');
const db = require('../models/db');
const { auth, supervisor } = require('../middleware/auth');
const router = express.Router();

const HORAS = ['10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00','23:00','00:00','01:00'];
const META = 30;

function calcPessoas(ped, hora) {
  const pico = hora==='12:00'||hora==='13:00';
  return Math.max(pico?2:1, Math.ceil(ped/META));
}

function haversine(lat1,lng1,lat2,lng2) {
  const R=6371000, dLat=(lat2-lat1)*Math.PI/180, dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

router.get('/semana-atual', auth, (req, res) => {
  const semana = db.semanas.findUltima();
  if (!semana) return res.json({ semana:null, vagas:[], escalas:[] });
  const vagas = db.vagas.findBySemana(semana.id);
  let escalas = db.escalas.findBySemana(semana.id);
  if (req.usuario.role==='colaborador') {
    escalas = escalas.filter(e=>e.colaborador_id===req.usuario.id);
  }
  res.json({ semana, vagas, escalas });
});

router.post('/semana', supervisor, (req, res) => {
  const { data_inicio, data_fim, demanda } = req.body;
  if (!data_inicio||!data_fim||!demanda) return res.status(400).json({ erro:'Dados incompletos' });
  const { id:semanaId } = db.semanas.insert({ data_inicio, data_fim });
  const dias = ['dom','seg','ter','qua','qui','sex','sab'];
  for (const dia of dias) {
    const peds = demanda[dia]||HORAS.map(()=>0);
    HORAS.forEach((hora,i)=>{
      db.vagas.insert({ semana_id:semanaId, dia_semana:dia, hora_idx:i, hora, n_vagas:calcPessoas(peds[i]||0,hora) });
    });
  }
  res.status(201).json({ semana_id:semanaId });
});

router.post('/publicar/:semana_id', supervisor, (req, res) => {
  const semana = db.semanas.findById(Number(req.params.semana_id));
  if (!semana) return res.status(404).json({ erro:'Nao encontrada' });
  if (semana.publicada) return res.status(400).json({ erro:'Ja publicada' });
  db.semanas.publicar(semana.id);
  const escalasAguardando = db.escalas.findBySemana(semana.id).filter(e=>e.fase==='aguardando');
  for (const e of escalasAguardando) {
    db.notificacoes.insert({ escala_id:e.id, tipo:'notif1' });
    db.escalas.update(e.id, { fase:'notif1', notificado_em:db.agora() });
  }
  res.json({ ok:true, notificacoes_criadas:escalasAguardando.length });
});

router.put('/designar', supervisor, (req, res) => {
  const { semana_id, dia, hora_idxs, colaborador_id } = req.body;
  if (!semana_id||!dia||!hora_idxs?.length||!colaborador_id) return res.status(400).json({ erro:'Dados incompletos' });
  const semana = db.semanas.findById(semana_id);
  if (semana?.publicada) return res.status(400).json({ erro:'Semana ja publicada' });
  const vagasDia = db.vagas.findByDia(semana_id, dia);
  const vagasDiaIds = vagasDia.map(v=>v.id);
  db.escalas.removeByVagaColaborador(vagasDiaIds, colaborador_id);
  for (const idx of hora_idxs) {
    const vaga = vagasDia.find(v=>v.hora_idx===idx);
    if (!vaga) continue;
    const ocupadas = db.escalas.findByVaga(vaga.id).length;
    if (ocupadas < vaga.n_vagas) {
      db.escalas.insert({ vaga_id:vaga.id, colaborador_id, fase:'aguardando' });
    }
  }
  res.json({ ok:true });
});

router.get('/meu-turno', auth, (req, res) => {
  const turnos = db.escalas.findByColaborador(req.usuario.id)
    .filter(e=>!['vago','urgente'].includes(e.fase));
  res.json(turnos);
});

router.post('/:id/confirmar', auth, (req, res) => {
  const e = db.escalas.findById(Number(req.params.id));
  if (!e||e.colaborador_id!==req.usuario.id) return res.status(404).json({ erro:'Nao encontrada' });
  if (e.fase!=='notif1') return res.status(400).json({ erro:'Fora do prazo de confirmacao' });
  db.escalas.update(e.id, { fase:'confirmado1', confirmado_em:db.agora() });
  res.json({ ok:true, mensagem:'Turno confirmado! Voce recebera um lembrete 2h antes.' });
});

router.post('/:id/recusar', auth, (req, res) => {
  const e = db.escalas.findById(Number(req.params.id));
  if (!e||e.colaborador_id!==req.usuario.id) return res.status(404).json({ erro:'Nao encontrada' });
  if (!['notif1','notif2'].includes(e.fase)) return res.status(400).json({ erro:'Fora do prazo' });
  db.escalas.update(e.id, { fase:'vago' });
  db.notificacoes.insert({ escala_id:e.id, tipo:'supervisor' });
  res.json({ ok:true, mensagem:'Recusa registrada. O supervisor foi notificado.' });
});

router.post('/:id/confirmar-presenca', auth, (req, res) => {
  const e = db.escalas.findById(Number(req.params.id));
  if (!e||e.colaborador_id!==req.usuario.id) return res.status(404).json({ erro:'Nao encontrada' });
  if (e.fase!=='notif2') return res.status(400).json({ erro:'Fora do prazo' });
  db.escalas.update(e.id, { fase:'confirmado1' });
  res.json({ ok:true, mensagem:'Presenca confirmada! Faca o check-in ao chegar.' });
});

router.post('/:id/checkin', auth, (req, res) => {
  const { lat, lng } = req.body;
  const e = db.escalas.findById(Number(req.params.id));
  if (!e||e.colaborador_id!==req.usuario.id) return res.status(404).json({ erro:'Nao encontrada' });
  if (!['confirmado1','notif2'].includes(e.fase)) return res.status(400).json({ erro:'Check-in nao permitido nesta fase' });

  const ELAT=parseFloat(process.env.ESTAB_LAT), ELNG=parseFloat(process.env.ESTAB_LNG), RAIO=parseInt(process.env.ESTAB_RAIO_M||100);
  const dist=Math.round(haversine(lat,lng,ELAT,ELNG));
  if (dist>RAIO) return res.status(400).json({ erro:'Fora do raio permitido', distancia_m:dist, raio_m:RAIO, excesso_m:dist-RAIO });

  const vaga = db.vagas.findById(e.vaga_id);
  const [h,m] = vaga.hora.split(':').map(Number);
  const agora = new Date(), turnoT = new Date(); turnoT.setHours(h,m,0,0);
  const atrasoMin = Math.max(0, Math.round((agora-turnoT)/60000));

  db.escalas.update(e.id, { fase:'presente', checkin_em:db.agora(), checkin_lat:lat, checkin_lng:lng, checkin_dist_m:dist, atraso_min:atrasoMin });
  const msg = atrasoMin>0 ? `Check-in com ${atrasoMin} minuto(s) de atraso.` : 'Check-in registrado! Bom turno!';
  res.json({ ok:true, mensagem:msg, distancia_m:dist, atraso_min:atrasoMin });
});

router.get('/alertas', supervisor, (req, res) => {
  res.json(db.escalas.findAlertas());
});

module.exports = router;
