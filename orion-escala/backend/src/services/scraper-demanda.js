// scraper-demanda.js
// Roda todo domingo as 10h pelo agendador (node-cron)
// Pode ser chamado manualmente: node src/services/scraper-demanda.js

const fs   = require('fs');
const path = require('path');

let chromium;
try {
  chromium = require('playwright').chromium;
} catch {
  console.error('Playwright nao instalado. Rode: npm install playwright && npx playwright install chromium');
  process.exit(1);
}

const URL_BASE   = process.env.AWFOOD_URL   || 'https://admin.orion.awfood.com.br';
const LOGIN_USER = process.env.AWFOOD_EMAIL || 'orion';
const LOGIN_PASS = process.env.AWFOOD_SENHA || 'orion@2021';

const HORAS = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00','23:00','00:00','01:00'];
const DIAS  = ['dom','seg','ter','qua','qui','sex','sab'];

const OUTPUT_PATH = path.resolve(process.env.DEMANDA_PATH || './data/demanda.json');

function semanaAnterior() {
  const hoje = new Date();
  const dom  = new Date(hoje);
  dom.setDate(hoje.getDate() - hoje.getDay() - 7);
  const sab  = new Date(dom); sab.setDate(dom.getDate() + 6);
  const fmt  = d => d.toISOString().slice(0,10);
  return { inicio: fmt(dom), fim: fmt(sab) };
}

function semanaAtual() {
  const hoje = new Date();
  const dom  = new Date(hoje); dom.setDate(hoje.getDate() - hoje.getDay());
  const sab  = new Date(dom);  sab.setDate(dom.getDate() + 6);
  const fmt  = d => d.toISOString().slice(0,10);
  return { inicio: fmt(dom), fim: fmt(sab) };
}

function diaSemana(dateStr) {
  return DIAS[new Date(dateStr + 'T12:00:00').getDay()];
}

function hParaBloco(hStr) {
  const [h] = hStr.split(':');
  return h.padStart(2,'0') + ':00';
}

async function raspar() {
  const { inicio, fim } = semanaAnterior();
  const semProx = semanaAtual();

  console.log('Raspando demanda: ' + inicio + ' a ' + fim);

  // Contadores hora a hora por dia
  const contadores = {};
  DIAS.forEach(d => { contadores[d] = {}; HORAS.forEach(h => contadores[d][h] = 0); });

  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();

  try {
    // 1. LOGIN
    await page.goto(URL_BASE, { waitUntil: 'networkidle', timeout: 30000 });
    const user = await page.$('input[type="text"], input[name="email"], input[name="username"]');
    const pass = await page.$('input[type="password"]');
    if (!user || !pass) throw new Error('Campos de login nao encontrados');
    await user.fill(LOGIN_USER);
    await pass.fill(LOGIN_PASS);
    const btnLogin = await page.$('button[type="submit"], button:has-text("Entrar"), button:has-text("Login")');
    if (btnLogin) await btnLogin.click(); else await pass.press('Enter');
    await page.waitForLoadState('networkidle', { timeout: 15000 });
    console.log('Login OK');

    // 2. RELATORIOS -> VENDAS
    const nav = await page.$('a:has-text("Relatorio"), a:has-text("Relatorios")');
    if (nav) { await nav.click(); await page.waitForLoadState('networkidle'); }
    const vendas = await page.$('a:has-text("Vendas"), a:has-text("Venda")');
    if (vendas) { await vendas.click(); await page.waitForLoadState('networkidle'); }
    else { await page.goto(URL_BASE + '/relatorios/vendas', { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {}); }
    console.log('Em Relatorios/Vendas');

    // 3. FILTRAR PERIODO
    await page.waitForSelector('input[type="date"]', { timeout: 8000 }).catch(() => {});
    const datas = await page.$$('input[type="date"]');
    if (datas.length >= 2) {
      await datas[0].fill(inicio); await datas[0].press('Tab');
      await datas[1].fill(fim);    await datas[1].press('Tab');
    }
    const btnFiltrar = await page.$('button:has-text("Filtrar"), button:has-text("Buscar"), button:has-text("Aplicar")');
    if (btnFiltrar) await btnFiltrar.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    console.log('Filtro aplicado: ' + inicio + ' -> ' + fim);

    // 4. INTERCEPTA RESPOSTAS JSON
    let pedidosExtraidos = 0;
    page.on('response', async (resp) => {
      const ct = resp.headers()['content-type'] || '';
      const url = resp.url();
      if (!ct.includes('json')) return;
      if (!url.includes('pedido') && !url.includes('order') && !url.includes('venda') && !url.includes('report')) return;
      try {
        const json = await resp.json();
        const items = Array.isArray(json) ? json : (json.data || json.items || json.pedidos || json.orders || []);
        for (const item of items) {
          const dataStr = item.created_at || item.data || item.date || item.criado_em || '';
          if (!dataStr) continue;
          const dataISO = dataStr.slice(0,10);
          if (dataISO < inicio || dataISO > fim) continue;
          const horaRaw = dataStr.slice(11,16) || '';
          if (!horaRaw) continue;
          const bloco = hParaBloco(horaRaw);
          const dia   = diaSemana(dataISO);
          if (contadores[dia] && contadores[dia][bloco] !== undefined) {
            contadores[dia][bloco]++;
            pedidosExtraidos++;
          }
        }
      } catch {}
    });

    // Reaplica filtro para capturar as respostas
    if (btnFiltrar) { await btnFiltrar.click(); await page.waitForLoadState('networkidle'); await page.waitForTimeout(3000); }

    // 5. FALLBACK: extrai da tabela HTML
    if (pedidosExtraidos === 0) {
      const linhas = await page.evaluate(() => {
        const rows = [];
        document.querySelectorAll('table tr').forEach(tr => {
          const cols = [...tr.querySelectorAll('td,th')].map(td => td.textContent.trim());
          if (cols.length) rows.push(cols);
        });
        return rows;
      });
      for (const linha of linhas) {
        const txt = linha.join(' ');
        const mData = txt.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        const mHora = txt.match(/(\d{1,2}):(\d{2})/);
        if (!mData || !mHora) continue;
        const dataISO = mData[3] + '-' + mData[2] + '-' + mData[1];
        if (dataISO < inicio || dataISO > fim) continue;
        const bloco = hParaBloco(mHora[1].padStart(2,'0') + ':' + mHora[2]);
        const dia   = diaSemana(dataISO);
        if (contadores[dia] && contadores[dia][bloco] !== undefined) {
          contadores[dia][bloco]++;
          pedidosExtraidos++;
        }
      }
    }

    console.log('Pedidos extraidos: ' + pedidosExtraidos);

    // 6. MONTA RESULTADO
    const demanda = {};
    DIAS.forEach(d => { demanda[d] = HORAS.map(h => contadores[d][h] || 0); });

    const resultado = {
      gerado_em: new Date().toISOString(),
      fonte: URL_BASE,
      semana_raspada: { inicio, fim },
      semana_projecao: semProx,
      total_pedidos: pedidosExtraidos,
      demanda
    };

    const dir = path.dirname(OUTPUT_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(resultado, null, 2));
    console.log('Demanda salva em: ' + OUTPUT_PATH);

    // 7. GERA ESCALA AUTOMATICAMENTE
    try {
      const gerarEscala = require('./gerar-escala');
      await gerarEscala(resultado);
      console.log('Escala gerada como rascunho');
    } catch(e) {
      console.log('Geracao automatica indisponivel:', e.message);
    }

    return resultado;

  } catch (err) {
    console.error('Erro na raspagem:', err.message);
    await page.screenshot({ path: '/tmp/orion-erro-scraper.png' });
    throw err;
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  raspar().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = raspar;
