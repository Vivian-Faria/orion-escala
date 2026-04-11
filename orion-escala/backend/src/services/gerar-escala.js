// gerar-escala.js
// Recebe dados de demanda hora a hora e gera escala respeitando as regras do Orion
const db = require('../models/db');

const HORAS = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00','23:00','00:00','01:00'];
const DIAS  = ['dom','seg','ter','qua','qui','sex','sab'];
const META_PED_PESSOA = 30;
const MIN_HORAS_TURNO = 3;
const MIN_ABERTURA    = 2;

function hIdx(h) { return HORAS.indexOf(h); }

function calcVagas(pedidos, hora) {
  if (pedidos === 0) return 0;
  const pico = hora === '12:00' || hora === '13:00';
  return Math.max(pico ? 2 : 1, Math.ceil(pedidos / META_PED_PESSOA));
}

function colabDisponivel(colab, dia, horaIdx) {
  if (colab.status !== 'ativo') return false;
  let dias = colab.dias_disponiveis;
  if (typeof dias === 'string') { try { dias = JSON.parse(dias); } catch { dias = DIAS; } }
  if (!Array.isArray(dias) || !dias.includes(dia)) return false;
  const si = hIdx(colab.hora_inicio || '09:00');
  const sf = hIdx(colab.hora_fim    || '23:00');
  if (sf < si) return horaIdx >= si || horaIdx <= sf;
  return horaIdx >= si && horaIdx <= sf;
}

async function gerarEscala(dadosDemanda) {
  const { demanda, semana_projecao } = dadosDemanda;
  if (!demanda || !semana_projecao) throw new Error('Dados invalidos');
  const colaboradores = db.colaboradores.findAtivos();
  if (!colaboradores.length) throw new Error('Sem colaboradores ativos');
  const { id: semanaId } = db.semanas.insert({
    data_inicio: semana_projecao.inicio,
    data_fim: semana_projecao.fim,
    origem: 'scraper_automatico'
  });
  let totalEscalas = 0;
  for (const dia of DIAS) {
    const peds  = demanda[dia] || HORAS.map(() => 0);
    const slots = HORAS.map((h, i) => {
      let vagas = calcVagas(peds[i] || 0, h);
      if (h === '09:00' && vagas < MIN_ABERTURA) vagas = MIN_ABERTURA;
      return { hora: h, idx: i, pedidos: peds[i] || 0, vagas, alocados: [] };
    });
    const dispDia = colaboradores.filter(c => {
      let dias = c.dias_disponiveis;
      if (typeof dias === 'string') { try { dias = JSON.parse(dias); } catch { dias = DIAS; } }
      return Array.isArray(dias) && dias.includes(dia);
    });
    for (const colab of dispDia) {
      const hDisp = slots.filter(s => s.pedidos > 0 && colabDisponivel(colab, dia, s.idx)).map(s => s.idx);
      if (!hDisp.length) continue;
      const minT = colab.turno_avulso ? 1 : MIN_HORAS_TURNO;
      const blocos = []; let bl = [hDisp[0]];
      for (let k = 1; k < hDisp.length; k++) {
        if (hDisp[k] === hDisp[k-1]+1) bl.push(hDisp[k]); else { blocos.push(bl); bl=[hDisp[k]]; }
      }
      blocos.push(bl);
      let melhor=null, scoreMelhor=-1;
      for (const b of blocos) {
        if (b.length < minT) continue;
        for (let s=0; s<=b.length-minT; s++) {
          const t = b.slice(s, Math.min(b.length, s+8));
          if (t.length < minT) continue;
          const score = t.reduce((acc,i) => acc + Math.max(0, slots[i].vagas - slots[i].alocados.length), 0);
          if (score > scoreMelhor) { scoreMelhor=score; melhor=t; }
        }
      }
      if (!melhor || scoreMelhor===0) continue;
      for (const i of melhor) {
        if (!slots[i].alocados.includes(colab.id)) slots[i].alocados.push(colab.id);
      }
    }
    for (const slot of slots) {
      if (slot.pedidos <= 0 && slot.vagas <= 0) continue;
      const { id: vagaId } = db.vagas.insert({
        semana_id: semanaId, dia_semana: dia,
        hora_idx: slot.idx, hora: slot.hora,
        n_vagas: slot.vagas, pedidos: slot.pedidos
      });
      for (const colabId of slot.alocados) {
        db.escalas.insert({
          vaga_id: vagaId, semana_id: semanaId, dia_semana: dia,
          hora_idx: slot.idx, hora: slot.hora,
          colaborador_id: colabId, fase: 'rascunho',
          pedidos: slot.pedidos, vagas: slot.vagas
        });
        totalEscalas++;
      }
    }
  }
  return { semana_id: semanaId, total: totalEscalas };
}

module.exports = gerarEscala;
