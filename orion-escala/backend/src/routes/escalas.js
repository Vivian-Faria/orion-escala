const express = require('express');
const db = require('../models/db');
const { auth, supervisor } = require('../middleware/auth');

const router = express.Router();

const HORAS = ['10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00','23:00','00:00','01:00'];
const DIAS  = ['dom','seg','ter','qua','qui','sex','sab'];
const META  = 30;

function hIdx(h) { return HORAS.indexOf(h); }

function calcVagas(ped, hora) {
  const pico = hora === '12:00' || hora === '13:00';
  return Math.max(pico ? 2 : 1, Math.ceil(ped / META));
}

function colabDisponivel(colab, dia, horaIdx) {
  if (colab.status !== 'ativo') return false;
  let dias = colab.dias_disponiveis;
  if (typeof dias === 'string') { try { dias = JSON.parse(dias); } catch { dias = DIAS; } }
  if (!dias.includes(dia)) return false;
  const si = hIdx(colab.hora_inicio || '10:00');
  const sf = hIdx(colab.hora_fim || '23:00');
  if (sf < si) return horaIdx >= si || horaIdx <= sf;
  return horaIdx >= si && horaIdx <= sf;
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function gerarEscalaAutomatica(semanaId, demanda, colaboradores, minHoras) {
  const escalas = [];
  for (const dia of DIAS) {
    const peds = demanda[dia] || HORAS.map(() => 0);
    const slots = HORAS.map((h, i) => ({
      hora: h, idx: i, pedidos: peds[i] || 0,
      vagas: peds[i] > 0 ? calcVagas(peds[i], h) : 0, alocados: []
    }));
    const dispDia = colaboradores.filter(c => {
      let dias = c.dias_disponiveis;
      if (typeof dias === 'string') { try { dias = JSON.parse(dias); } catch { dias = DIAS; } }
      return c.status === 'ativo' && dias.includes(dia);
    });
    for (const colab of dispDia) {
      const hDisp = slots.filter(s => s.pedidos > 0 && colabDisponivel(colab, dia, s.idx)).map(s => s.idx);
      if (!hDisp.length) continue;
      const minT = colab.turno_avulso ? 1 : minHoras;
      const blocos = []; let bl = [hDisp[0]];
      for (let k = 1; k < hDisp.length; k++) {
        if (hDisp[k] === hDisp[k-1]+1) bl.push(hDisp[k]); else { blocos.push(bl); bl = [hDisp[k]]; }
      }
      blocos.push(bl);
      let melhor = null, scoreMelhor = -1;
      for (const b of blocos) {
        if (b.length < minT) continue;
        for (let s = 0; s <= b.length - minT; s++) {
          const t = b.slice(s, s + Math.min(8, b.length-s));
          if (t.length < minT) continue;
          const sc = t.reduce((acc, i) => acc + Math.max(0, slots[i].vagas - slots[i].alocados.length), 0);
          if (sc > scoreMelhor) { scoreMelhor = sc; melhor = t; }
        }
      }
      if (!melhor || scoreMelhor === 0) continue;
      for (const i of melhor) if (!slots[i].alocados.includes(colab.id)) slots[i].alocados.push(colab.id);
    }
    for (const slot of slots) {
      if (!slot.pedidos && !slot.alocados.length) continue;
      for (const colabId of slot.alocados) {
        escalas.push({ semana_id: semanaId, dia_semana: dia, hora_idx: slot.idx, hora: slot.hora, colaborador_id: colabId, fase: 'rascunho', vagas: slot.vagas, pedidos: slot.pedidos });
      }
    }
  }
  return escalas;
}

router.get('/semana-atual', auth, (req, res) => {
  const semana = db.semanas.findUltima();
  if (!semana) return res.json({ semana: null, vagas: [], escalas: [] });
  const vagas = db.vagas.findBySemana(semana.id);
  let escalas = db.escalas.findBySemana(semana.id);
  if (req.usuario.role === 'colaborador') escalas = escalas.filter(e => e.colaborador_id === req.usuario.id);
  res.json({ semana, vagas, escalas });
});

router.post('/semana', supervisor, (req, res) => {
  const { data_inicio, data_fim, demanda, min_horas } = req.body;
  if (!data_inicio || !data_fim || !demanda) return res.status(400).json({ erro: 'data_inicio, data_fim e demanda sao obrigatorios' });
  const { id: semanaId } = db.semanas.insert({ data_inicio, data_fim });
  for (const dia of DIAS) {
    const peds = demanda[dia] || HORAS.map(() => 0);
    HORAS.forEach((hora, i) => {
      if (peds[i] > 0) db.vagas.insert({ semana_id: semanaId, dia_semana: dia, hora_idx: i, hora, n_vagas: calcVagas(peds[i], hora), pedidos: peds[i] });
    });
  }
  const colaboradores = db.colaboradores.findAtivos();
  const sugestoes = gerarEscalaAutomatica(semanaId, demanda, colaboradores, min_horas || 3);
  let total = 0;
  for (const e of sugestoes) { db.escalas.insert(e); total++; }
  res.status(201).json({ semana_id: semanaId, total_alocacoes: total, status: 'rascunho', mensagem: 'Escala gerada como rascunho. Valide e publique pelo painel do supervisor.' });
});

router.get('/rascunho/:semana_id', supervisor, (req, res) => {
  const semanaId = Number(req.params.semana_id);
  const semana = db.semanas.findById(semanaId);
  if (!semana) return res.status(404).json({ erro: 'Semana nao encontrada' });
  const escalas = db.escalas.findBySemana(semanaId).map(e => {
    const colab = db.colaboradores.findById(e.colaborador_id);
    return { ...e, nome: colab?.nome, apelido: colab?.apelido, cargo: colab?.cargo };
  });
  const porDia = {};
  for (const dia of DIAS) porDia[dia] = escalas.filter(e => e.dia_semana === dia).sort((a,b) => a.hora_idx - b.hora_idx);
  res.json({ semana, porDia, total: escalas.length });
});

router.post('/publicar/:semana_id', supervisor, (req, res) => {
  const semanaId = Number(req.params.semana_id);
  const semana = db.semanas.findById(semanaId);
  if (!semana) return res.status(404).json({ erro: 'Semana nao encontrada' });
  if (semana.publicada) return res.status(400).json({ erro: 'Ja publicada' });
  const rascunhos = db.escalas.findBySemana(semanaId).filter(e => e.fase === 'rascunho');
  for (const e of rascunhos) {
    db.escalas.update(e.id, { fase: 'notif1', notificado_em: db.agora() });
    db.notificacoes.insert({ escala_id: e.id, tipo: 'notif1' });
  }
  db.semanas.publicar(semanaId);
  res.json({ ok: true, notificacoes_criadas: rascunhos.length, mensagem: 'Escala publicada! ' + rascunhos.length + ' colaboradores notificados.' });
});

router.put('/ajustar', supervisor, (req, res) => {
  const { escala_id, colaborador_id, acao } = req.body;
  const escala = db.escalas.findById(escala_id);
  if (!escala) return res.status(404).json({ erro: 'Escala nao encontrada' });
  const semana = db.semanas.findById(escala.semana_id);
  if (semana?.publicada) return res.status(400).json({ erro: 'Semana ja publicada' });
  if (acao === 'remover') { db.escalas.update(escala_id, { fase: 'removido' }); return res.json({ ok: true }); }
  if (acao === 'substituir' && colaborador_id) { db.escalas.update(escala_id, { colaborador_id, fase: 'rascunho' }); return res.json({ ok: true }); }
  res.status(400).json({ erro: 'Acao invalida' });
});

router.get('/meu-turno', auth, (req, res) => {
  const turnos = db.escalas.findByColaborador(req.usuario.id).filter(e => !['vago','removido','recusado'].includes(e.fase));
  res.json(turnos);
});

router.post('/:id/confirmar', auth, (req, res) => {
  const e = db.escalas.findById(Number(req.params.id));
  if (!e || e.colaborador_id !== req.usuario.id) return res.status(404).json({ erro: 'Nao encontrada' });
  if (e.fase !== 'notif1') return res.status(400).json({ erro: 'Fora do prazo de confirmacao' });
  db.escalas.update(e.id, { fase: 'confirmado1', confirmado_em: db.agora() });
  res.json({ ok: true, mensagem: 'Turno confirmado! Voce recebera um lembrete 2h antes.' });
});

router.post('/:id/recusar', auth, (req, res) => {
  const { motivo } = req.body;
  const e = db.escalas.findById(Number(req.params.id));
  if (!e || e.colaborador_id !== req.usuario.id) return res.status(404).json({ erro: 'Nao encontrada' });
  if (!['notif1','notif2'].includes(e.fase)) return res.status(400).json({ erro: 'Fora do prazo' });
  db.escalas.update(e.id, { fase: 'recusado', motivo_recusa: motivo || '', recusado_em: db.agora() });
  const vaga = db.vagas.findById(e.vaga_id);
  if (vaga) {
    const dia = e.dia_semana || vaga.dia_semana;
    const horaIdx = e.hora_idx ?? vaga.hora_idx;
    const jaEscalados = db.escalas.findByVaga(e.vaga_id).filter(x => !['recusado','vago','removido'].includes(x.fase)).map(x => x.colaborador_id);
    const candidatos = db.colaboradores.findAtivos().filter(c => c.id !== req.usuario.id && !jaEscalados.includes(c.id) && colabDisponivel(c, dia, horaIdx));
    if (candidatos.length > 0) {
      const sub = candidatos[0];
      db.escalas.insert({ vaga_id: e.vaga_id, semana_id: e.semana_id, dia_semana: dia, hora_idx: horaIdx, hora: e.hora || vaga.hora, colaborador_id: sub.id, fase: 'notif1', notificado_em: db.agora() });
      db.notificacoes.insert({ escala_id: e.id, tipo: 'supervisor' });
      return res.json({ ok: true, mensagem: 'Recusa registrada. Um substituto foi alocado.', substituto: sub.apelido });
    }
  }
  db.notificacoes.insert({ escala_id: e.id, tipo: 'urgente' });
  res.json({ ok: true, mensagem: 'Recusa registrada. O supervisor foi notificado.', substituto: null });
});

router.post('/:id/confirmar-presenca', auth, (req, res) => {
  const e = db.escalas.findById(Number(req.params.id));
  if (!e || e.colaborador_id !== req.usuario.id) return res.status(404).json({ erro: 'Nao encontrada' });
  if (e.fase !== 'notif2') return res.status(400).json({ erro: 'Fora do prazo' });
  db.escalas.update(e.id, { fase: 'confirmado2' });
  res.json({ ok: true, mensagem: 'Presenca confirmada! Faca o check-in ao chegar.' });
});

router.post('/:id/checkin', auth, (req, res) => {
  const { lat, lng } = req.body;
  const e = db.escalas.findById(Number(req.params.id));
  if (!e || e.colaborador_id !== req.usuario.id) return res.status(404).json({ erro: 'Nao encontrada' });
  if (!['confirmado1','confirmado2','notif2'].includes(e.fase)) return res.status(400).json({ erro: 'Check-in nao permitido nesta fase' });
  const ELAT = parseFloat(process.env.ESTAB_LAT), ELNG = parseFloat(process.env.ESTAB_LNG), RAIO = parseInt(process.env.ESTAB_RAIO_M || 150);
  const dist = Math.round(haversine(lat, lng, ELAT, ELNG));
  if (dist > RAIO) return res.status(400).json({ erro: 'Voce esta fora do raio permitido', distancia_m: dist, raio_m: RAIO, dica: 'Voce esta ' + (dist-RAIO) + 'm longe do estabelecimento' });
  const vaga = db.vagas.findById(e.vaga_id);
  const agora = new Date(); let atrasoMin = 0;
  if (vaga?.hora) {
    const [h, m] = vaga.hora.split(':').map(Number);
    const turno = new Date(); turno.setHours(h, m, 0, 0);
    atrasoMin = Math.max(0, Math.round((agora - turno) / 60000));
  }
  db.escalas.update(e.id, { fase: 'presente', checkin_em: db.agora(), checkin_lat: lat, checkin_lng: lng, checkin_dist_m: dist, atraso_min: atrasoMin });
  db.notificacoes.insert({ escala_id: e.id, tipo: 'checkin' });
  const msg = atrasoMin > 5 ? 'Check-in com ' + atrasoMin + ' minuto(s) de atraso.' : 'Check-in registrado! Bom turno!';
  res.json({ ok: true, mensagem: msg, distancia_m: dist, atraso_min: atrasoMin });
});

router.get('/alertas', supervisor, (req, res) => { res.json(db.escalas.findAlertas()); });

router.get('/painel-supervisor', supervisor, (req, res) => {
  const semana = db.semanas.findUltima();
  if (!semana) return res.json({ semana: null, resumo: {} });
  const escalas = db.escalas.findBySemana(semana.id);
  const resumo = {
    total: escalas.length,
    confirmados: escalas.filter(e => ['confirmado1','confirmado2','presente'].includes(e.fase)).length,
    pendentes:   escalas.filter(e => e.fase === 'notif1').length,
    recusados:   escalas.filter(e => e.fase === 'recusado').length,
    presentes:   escalas.filter(e => e.fase === 'presente').length,
    urgentes:    escalas.filter(e => e.fase === 'urgente').length,
    rascunhos:   escalas.filter(e => e.fase === 'rascunho').length,
  };
  const porColab = {};
  for (const e of escalas) {
    const c = db.colaboradores.findById(e.colaborador_id);
    if (!c) continue;
    if (!porColab[c.id]) porColab[c.id] = { id: c.id, nome: c.nome, apelido: c.apelido, turnos: [], horas_escaladas: 0 };
    porColab[c.id].turnos.push({ dia: e.dia_semana, hora: e.hora, fase: e.fase });
    porColab[c.id].horas_escaladas++;
  }
  res.json({ semana, resumo, colaboradores: Object.values(porColab) });
});

module.exports = router;
