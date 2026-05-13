// Orion Escala - Content Script v1.0
const NETLIFY_URL='https://orion-escala.netlify.app';
const DIAS=['Dom','Seg','Ter','Qua','Qui','Sex','Sab'];
function p2(v){return String(v).padStart(2,'0');}
function fmtISO(d){return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate());}
function fmtBR(d){return p2(d.getDate())+'/'+p2(d.getMonth()+1);}
function semanaAnterior(){const h=new Date(),dw=h.getDay(),n=dw===0?7:dw;const da=new Date(h);da.setDate(h.getDate()-n);const ds=new Date(da);ds.setDate(da.getDate()-6);return{segAnt:ds,domAnt:da};}
async function coletarEAbrir(){
  const fab=document.getElementById('orion-escala-fab');
  const lbl=document.getElementById('orion-escala-label');
  if(lbl)lbl.textContent='⏳ Coletando...';
  if(fab){fab.style.background='#fef3c7';fab.style.color='#92400e';fab.style.pointerEvents='none';}
  try{
    const{segAnt,domAnt}=semanaAnterior();
    const r=await fetch('/admin/reports/orders?start_date='+fmtISO(segAnt)+'&start_time=00:00&end_date='+fmtISO(domAnt)+'&end_time=23:59&business=',{credentials:'include'});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const html=await r.text();
    const doc=new DOMParser().parseFromString(html,'text/html');
    const rows=doc.querySelectorAll('table tbody tr');
    const mx={};DIAS.forEach(d=>{mx[d]={};for(let h=0;h<30;h++)mx[d][p2(h)]=0;});
    let tt=0;
    rows.forEach(row=>{
      const cs=row.querySelectorAll('td');if(cs.length<10)return;
      const c=cs[9]?.textContent?.trim();if(!c||!c.includes('/')||!c.includes(' '))return;
      const[dp,tp]=c.split(' ');const[dd,mm,yy]=dp.split('/');
      const h=parseInt(tp.split(':')[0],10);
      const dia=DIAS[new Date(+yy,+mm-1,+dd).getDay()];
      const hk=p2(h);if(mx[dia]&&mx[dia][hk]!==undefined){mx[dia][hk]++;tt++;}
    });
    if(tt===0)throw new Error('Nenhum pedido encontrado.');
    const pl={mx,total:tt,de:fmtISO(segAnt),ate:fmtISO(domAnt),deBR:fmtBR(segAnt),ateBR:fmtBR(domAnt),ts:Date.now()};
    const b64=btoa(unescape(encodeURIComponent(JSON.stringify(pl))));
    window.open(NETLIFY_URL+'#dados='+b64,'_blank');
    if(lbl)lbl.textContent='✅ '+tt.toLocaleString('pt-BR')+' ped.';
    if(fab){fab.style.background='#d1fae5';fab.style.color='#065f46';fab.style.pointerEvents='';}
    setTimeout(()=>{if(lbl)lbl.textContent='📊 Escala';if(fab){fab.style.background='#c8f135';fab.style.color='#0d0d10';}},3000);
  }catch(err){
    if(lbl)lbl.textContent='❌ Erro';
    if(fab){fab.style.background='#fee2e2';fab.style.color='#991b1b';fab.style.pointerEvents='';}
    setTimeout(()=>{if(lbl)lbl.textContent='📊 Escala';if(fab){fab.style.background='#c8f135';fab.style.color='#0d0d10';}},3000);
    alert('[Orion Escala] '+err.message);
  }
}
function criarFAB(){
  if(document.getElementById('orion-escala-fab'))return;
  const fab=document.createElement('div');
  fab.id='orion-escala-fab';
  fab.style.cssText='position:fixed;bottom:24px;right:24px;z-index:999999;background:#c8f135;color:#0d0d10;font-weight:700;font-size:13px;font-family:DM Sans,-apple-system,sans-serif;padding:11px 18px;border-radius:12px;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,.2);transition:.2s;user-select:none;display:flex;align-items:center;gap:8px;';
  const lbl=document.createElement('span');lbl.id='orion-escala-label';lbl.textContent='📊 Escala';
  fab.appendChild(lbl);
  fab.addEventListener('mouseenter',()=>{fab.style.transform='translateY(-2px)';fab.style.boxShadow='0 8px 28px rgba(0,0,0,.25)';});
  fab.addEventListener('mouseleave',()=>{fab.style.transform='';fab.style.boxShadow='0 4px 20px rgba(0,0,0,.2)';});
  fab.addEventListener('click',coletarEAbrir);
  document.body.appendChild(fab);
}
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',criarFAB);}else{criarFAB();}