 
// ====== Config de dificuldade ======
const EVENT_COST_SCALE = 1.6; // escala base para custos negativos dos eventos
const NEG_COST_SLOPE = 1.0;   // dobra o custo negativo até o dia 30

// ====== Estado e utilitários ======
const state = {
  day: 1, maxDay: 30,
  eventsToday: 0,
  money: 30,
  energy: 5,
  debts: [],
  currentDebtFilter: 'todas',
  currentEvent: null,
  repairsToday: 0, maxRepairsPerDay: 2,
  dayEndHintShown: false,
};

const debtsCatalog=[
  {title:'Troca de pneus (jogo completo)',amount:320},
  {title:'Revisão de freios',amount:288},
  {title:'Ajuste de aerodinâmica (asas)',amount:400},
  {title:'Substituição de suspensão',amount:480},
  {title:'Reparo no câmbio',amount:560},
  {title:'Software de telemetria',amount:240},
  {title:'Lote de combustível premium',amount:352},
  {title:'Reforço do chassi',amount:640}
];

const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const formatBRL=v=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const randInt=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;
const randomDue=()=>String(randInt(1,30)).padStart(2,'0')+'/09';
const parseDueDay=due=>parseInt(due.split('/')[0],10);
const generateDebts=()=>debtsCatalog.map((it,i)=>(
  {id:i+1,title:it.title,amount:it.amount,due:randomDue(),status:'a_pagar',lastInterestDay:0,becameLateToday:false,interestAppliedToday:false}
));

// ====== Eventos ======
function makeEvent(){
  const pool=[
    {title:'Treino de pit stop',description:'Equipe pratica trocas de pneus em alta velocidade.',
      pay:{money:-30,energy:+2,label:'Patrocinar treino'}, save:{money:0,energy:-1,label:'Pular hoje'}},
    {title:'Mídia & entrevistas',description:'Rodada de entrevistas aumenta exposição e cansa um pouco.',
      pay:{money:-15,energy:+1,label:'Investir em media training'}, save:{money:0,energy:-1,label:'Evitar mídia'}},
    {title:'Bandeira vermelha',description:'Incidente na pista exige preparação extra enquanto espera.',
      pay:{money:-25,energy:+1,label:'Preparar estratégia nova'}, save:{money:0,energy:-2,label:'Esperar parado'}},
    {title:'Clima: pista molhada',description:'Ajuste para chuva melhora estabilidade.',
      pay:{money:-35,energy:+2,label:'Ajustar para molhado'}, save:{money:0,energy:-2,label:'Manter setup seco'}},
    {title:'Clima: pista seca',description:'Refino de downforce reduz esforço nas curvas.',
      pay:{money:-28,energy:+2,label:'Otimizar para seco'}, save:{money:0,energy:-1,label:'Sem ajustes'}},
    {title:'Composto macio (soft)',description:'Mais aderência: menos desgaste do piloto.',
      pay:{money:-32,energy:+2,label:'Comprar macios'}, save:{money:0,energy:-2,label:'Usar compostos usados'}},
    {title:'Composto duro (hard)',description:'Conservação facilita o stint.',
      pay:{money:-24,energy:+1,label:'Comprar duros'}, save:{money:0,energy:-1,label:'Manter estoque'}},
    {title:'Briefing estratégico',description:'Revisão reduz desgaste nas decisões.',
      pay:{money:-18,energy:+1,label:'Sessão completa'}, save:{money:0,energy:-1,label:'Sessão rápida'}},
    {title:'Sessão no túnel de vento',description:'Aprimora eficiência do carro.',
      pay:{money:-45,energy:+3,label:'Reservar túnel'}, save:{money:0,energy:-2,label:'Adiar'}},
    {title:'Análise de telemetria',description:'Dados para economizar energia.',
      pay:{money:-22,energy:+1,label:'Analisar dados'}, save:{money:0,energy:-1,label:'Ir pela experiência'}},
    // Descansos que pulam os eventos do dia
    {title:'Descanso obrigatório',description:'Equipe médica recomenda repouso para recuperar a forma.',
      pay:{money:0, energy:+3, skipDay:true, label:'Tirar um dia de descanso'}, save:{money:0, energy:-2, label:'Ignorar e seguir o plano'}},
    {title:'Calendário apertado',description:'Agenda caótica. Encerrar hoje evita estresse.',
      pay:{money:-10, energy:+2, skipDay:true, label:'Fechar a garagem hoje'}, save:{money:0, energy:-1, label:'Empurrar com a barriga'}},
    {title:'Noite mal dormida',description:'Um dia off ajuda a resetar.',
      pay:{money:0, energy:+2, skipDay:true, label:'Folgar e recuperar'}, save:{money:0, energy:-1, label:'Forçar treino leve'}},
  ];
  return pool[Math.floor(Math.random()*pool.length)];
}

function costMultiplier(){
  return 1 + ((state.day-1)/Math.max(1,(state.maxDay-1))) * NEG_COST_SLOPE;
}

function adjustDelta(base){
  let m=base.money; if (m<0) m=Math.round(m * EVENT_COST_SCALE * costMultiplier());
  let e=base.energy; if (e>0){ const f=1-(state.energy/20); e=Math.max(0,Math.round(e*f)); }
  const extra={}; if ('skipDay' in base) extra.skipDay=base.skipDay;
  return {money:m,energy:e,label:base.label, ...extra};
}

// ====== HUD ======
function buildEnergyMeter(){ const meter=document.getElementById('energyMeter'); meter.innerHTML=''; for(let i=0;i<10;i++){ const seg=document.createElement('div'); seg.className='energy-seg'; meter.appendChild(seg);} }
function renderEnergyMeter(){ const v=clamp(state.energy,0,10); const meter=document.getElementById('energyMeter'); meter?.setAttribute('aria-valuenow',String(v)); meter?.classList.remove('is-low','is-mid'); if(v<=3) meter?.classList.add('is-low'); else if(v<=7) meter?.classList.add('is-mid'); const segs=meter?.querySelectorAll('.energy-seg') ?? []; segs.forEach((seg,idx)=>seg.classList.toggle('is-on',idx<v)); }
function updateMoneyColor(el,value){ if(!el) return; if(value<0) el.classList.add('money--negative'); else el.classList.remove('money--negative'); }
function updateEnergyValueColor(el,value){ if(!el) return; el.classList.remove('energy-value--low','energy-value--mid','energy-value--high'); const v=clamp(value,0,10); if(v<=3) el.classList.add('energy-value--low'); else if(v<=7) el.classList.add('energy-value--mid'); else el.classList.add('energy-value--high'); }
function renderHUD(){ const moneyEl=document.getElementById('money'); if(moneyEl){ moneyEl.textContent=formatBRL(state.money); updateMoneyColor(moneyEl,state.money);} const energyEl=document.getElementById('energy'); if(energyEl){ energyEl.textContent=String(state.energy); updateEnergyValueColor(energyEl,state.energy);} const dayEl=document.getElementById('day'); if(dayEl) dayEl.textContent=`${state.day}/${state.maxDay}`; renderEnergyMeter(); renderEventsProgress(); }
function renderEventsProgress(){ const el=document.getElementById('eventsProgress'); if(el) el.textContent=`${state.eventsToday}/3`; }

// ====== Dívidas ======
function sortByDueDay(arr){ return arr.slice().sort((a,b)=>parseDueDay(a.due)-parseDueDay(b.due)); }
function renderDebts(){ const list=document.getElementById('debtsList'); if(!list) return; list.innerHTML=''; let filtered=state.debts.filter(d=>{ if(state.currentDebtFilter==='todas') return d.status!=='pagas'; return d.status===state.currentDebtFilter; }); if(filtered.length===0){ const empty=document.createElement('div'); empty.className='empty'; empty.textContent='Nenhuma dívida nesta categoria.'; list.appendChild(empty); return; } filtered=sortByDueDay(filtered); filtered.forEach(d=>{ const item=document.createElement('div'); item.className='debt'+(d.status==='atrasadas'?' debt--late':''); const left=document.createElement('div'); left.className='debt__left'; const title=document.createElement('div'); title.className='debt__title'; title.textContent=d.title; const meta=document.createElement('div'); meta.className='debt__meta'; const dueSpan=document.createElement('span'); dueSpan.textContent=`Venc.: ${d.due}`; meta.appendChild(dueSpan); const tag=document.createElement('span'); tag.className='tag'+(d.status==='atrasadas'?' tag--late':d.status==='pagas'?' tag--paid':''); tag.textContent=d.status==='atrasadas'?'Atrasada':d.status==='pagas'?'Paga':'A pagar'; meta.appendChild(tag); if(d.interestAppliedToday){ const todayTag=document.createElement('span'); todayTag.className='tag tag--today'; todayTag.textContent='+juros aplicados hoje'; meta.appendChild(todayTag); } left.appendChild(title); left.appendChild(meta); const amount=document.createElement('div'); amount.className='debt__amount'; amount.textContent=formatBRL(d.amount); item.appendChild(left); item.appendChild(amount); if(d.status!=='pagas'){ const actions=document.createElement('div'); actions.className='debt__actions'; const payBtn=document.createElement('button'); payBtn.className='btn btn--pay'; payBtn.textContent='Pagar'; const canPay=state.money>=d.amount; payBtn.disabled=!canPay; payBtn.title=canPay?`Pagar ${d.title} (${formatBRL(d.amount)})`:`Saldo insuficiente (${formatBRL(state.money)} < ${formatBRL(d.amount)})`; payBtn.addEventListener('click',()=>payDebt(d.id)); actions.appendChild(payBtn); item.appendChild(actions);} list.appendChild(item); }); }

function payDebt(id){ const d=state.debts.find(x=>x.id===id); if(!d || d.status==='pagas') return; if(state.money<d.amount){ alert('Saldo insuficiente para pagar esta dívida.'); return; } const ok=confirm(`Confirmar pagamento de "${d.title}" no valor de ${formatBRL(d.amount)}?`); if(!ok) return; state.money-=d.amount; d.status='pagas'; renderHUD(); renderDebts(); if(checkWinCondition()) return; checkImmediateGameOver(); }
function resetDebtDailyFlags(){ state.debts.forEach(d=>{ d.becameLateToday=false; d.interestAppliedToday=false; }); }
function updateDebtsForNewDay(){ const today=state.day; resetDebtDailyFlags(); state.debts.forEach(d=>{ if(d.status==='a_pagar'){ if(parseDueDay(d.due)<today){ d.status='atrasadas'; d.amount=Math.round(d.amount*1.03*100)/100; d.becameLateToday=true; d.interestAppliedToday=true; d.lastInterestDay=today; } } else if(d.status==='atrasadas'){ if((d.lastInterestDay??0)<today){ d.amount=Math.round(d.amount*1.03*100)/100; d.interestAppliedToday=true; d.lastInterestDay=today; } } }); }

// ====== Eventos UI ======
function impactLabel(money,energy){ const ms=money>0?'+':''; const es=energy>0?'+':''; return `Dinheiro ${ms}${formatBRL(money)}, Energia ${es}${energy}`; }
function renderEvent(){ const container=document.getElementById('eventsContainer'); if(!container) return; if(state.eventsToday>=3){ container.innerHTML=`<h3>Eventos do dia concluídos</h3><p>Vá até a <b>porta da garagem</b> e aperte <b>E</b> para <b>finalizar o dia</b>.</p>`; if(!state.dayEndHintShown){ showFinishDayMessage(); state.dayEndHintShown=true; } return; } container.innerHTML=''; const rawEvent=makeEvent(); state.currentEvent=rawEvent; const title=document.createElement('h3'); title.textContent=rawEvent.title; const desc=document.createElement('p'); desc.textContent=rawEvent.description; const adjPay=adjustDelta(rawEvent.pay); const adjSave=adjustDelta(rawEvent.save); const payBtn=document.createElement('button'); payBtn.className='btn btn--choice'; payBtn.innerHTML=`<span>${rawEvent.pay.label}</span><span class="btn__meta">${formatBRL(adjPay.money)} · ${adjPay.energy>=0?'+':''}${adjPay.energy} ⚡</span>`; payBtn.title=impactLabel(adjPay.money,adjPay.energy); payBtn.setAttribute('aria-label',payBtn.title); payBtn.addEventListener('click',()=>chooseOption('pay',adjPay)); const saveBtn=document.createElement('button'); saveBtn.className='btn btn--choice'; saveBtn.innerHTML=`<span>${rawEvent.save.label}</span><span class="btn__meta">${formatBRL(adjSave.money)} · ${adjSave.energy>=0?'+':''}${adjSave.energy} ⚡</span>`; saveBtn.title=impactLabel(adjSave.money,adjSave.energy); saveBtn.setAttribute('aria-label',saveBtn.title); saveBtn.addEventListener('click',()=>chooseOption('save',adjSave)); const choices=document.createElement('div'); choices.className='choices'; choices.appendChild(payBtn); choices.appendChild(saveBtn); container.appendChild(title); container.appendChild(desc); container.appendChild(choices); }

// ====== Fluxo ======
let isGameOver=false;
function chooseOption(kind,adjusted){ if(isGameOver) return; state.money += adjusted.money; state.energy = clamp(state.energy + adjusted.energy, 0, 10); if(adjusted.skipDay){ state.eventsToday=3; } else { state.eventsToday=Math.min(3,state.eventsToday+1);} renderHUD(); renderDebts(); if(checkWinCondition()) return; if(checkImmediateGameOver()) return; renderEvent(); }
function showDayToast(prev,curr){ const el=document.getElementById('dayToast'); if(!el) return; el.textContent=`Dia ${prev} → ${curr}`; el.hidden=false; el.classList.remove('is-show'); void el.offsetWidth; el.classList.add('is-show'); setTimeout(()=>{ el.hidden=true; },1500); }
function showFinishDayMessage(){ const el=document.getElementById('dayToast'); if(!el) return; el.textContent='Eventos concluídos. Finalize o dia na porta (E).'; el.hidden=false; el.classList.remove('is-show'); void el.offsetWidth; el.classList.add('is-show'); setTimeout(()=>{ el.hidden=true; },1500); }
function pulseDayHud(){ const dayEl=document.querySelector('.stat--day .stat__value'); if(!dayEl) return; dayEl.classList.remove('day-pulse'); void dayEl.offsetWidth; dayEl.classList.add('day-pulse'); }
function advanceDay(){ const prev=state.day; state.day+=1; state.eventsToday=0; state.repairsToday=0; showDayToast(prev,state.day); pulseDayHud(); updateDebtsForNewDay(); renderHUD(); renderDebts(); }
function checkImmediateGameOver(){ if(state.energy<=0){ endGame('Energia esgotada',`Sua energia chegou a 0 no dia ${state.day}.`); return true;} if(state.money<=-500){ endGame('Saldo crítico',`Seu dinheiro chegou a ${formatBRL(state.money)} no dia ${state.day}.`); return true;} return false; }
function endGame(title,message){ isGameOver=true; const modal=document.getElementById('endModal'); document.getElementById('endTitle').textContent=title; document.getElementById('endBody').innerHTML=`<p>${message}</p>`; modal?.showModal?.(); }
function resetGame(){ isGameOver=false; state.day=1; state.eventsToday=0; state.money=30; state.energy=5; state.repairsToday=0; state.dayEndHintShown=false; state.debts=generateDebts(); renderHUD(); renderDebts(); renderEvent(); garage?.resetPlayer?.(); }

function bindUI(){
  document.querySelectorAll('.tab').forEach(btn=>{
    btn.addEventListener('click',()=>{ state.currentDebtFilter=btn.dataset.filter; setActiveTab(state.currentDebtFilter); renderDebts(); });
  });
  function setActiveTab(filter){ document.querySelectorAll('.tab').forEach(btn=>{ const isActive=btn.dataset.filter===filter; btn.classList.toggle('is-active',isActive); btn.setAttribute('aria-selected',isActive?'true':'false'); }); }
  setActiveTab(state.currentDebtFilter);
  const rulesBtn=document.getElementById('rulesBtn'); const rulesModal=document.getElementById('rulesModal');
  rulesBtn?.addEventListener('click',()=>rulesModal?.showModal?.());
  rulesModal?.addEventListener?.('click',(e)=>{ const rect=rulesModal.querySelector('.modal__content')?.getBoundingClientRect?.(); if(!rect) return; const inDialog=(rect.top<=e.clientY && e.clientY<=rect.top+rect.height && rect.left<=e.clientX && e.clientX<=rect.left+rect.width); if(!inDialog) rulesModal.close(); });
  document.getElementById('newGameBtn')?.addEventListener('click',()=>{ if(confirm('Iniciar um novo jogo? As dívidas e vencimentos serão sorteados novamente.')) resetGame(); });
  document.getElementById('restartBtn')?.addEventListener('click',()=>{ document.getElementById('endModal')?.close?.(); resetGame(); });
}

function checkWinCondition(){ const allPaid=state.debts.length>0 && state.debts.every(d=>d.status==='pagas'); if(allPaid){ endGame('Vitória! 🏆',`Você pagou todas as melhorias até o dia ${state.day}. Dinheiro: ${formatBRL(state.money)} · Energia: ${state.energy}/10.`); return true;} return false; }

// ====== Garagem (Canvas) ======
let garage=null;
function createGarage(canvas){
  const ctx=canvas.getContext('2d'); ctx.imageSmoothingEnabled=false; const TILE=16, COLS=32, ROWS=18;
  const carTiles = { tx: 12, ty: 7, tw: 8, th: 4 }; const carRect = { x: carTiles.tx*TILE, y: carTiles.ty*TILE, w: carTiles.tw*TILE, h: carTiles.th*TILE };
  const doorTiles = { tx: 1, ty: 6, tw: 2, th: 6 }; const doorRect = { x: doorTiles.tx*TILE, y: doorTiles.ty*TILE, w: doorTiles.tw*TILE, h: doorTiles.th*TILE };
  const map=(()=>{ const m=Array.from({length:ROWS},()=>Array.from({length:COLS},()=>'.')); for(let x=0;x<COLS;x++){ m[0][x]='#'; m[ROWS-1][x]='#'; } for(let y=0;y<ROWS;y++){ m[y][0]='#'; m[y][COLS-1]='#'; } const stamp=(tx,ty,w,h,ch)=>{ for(let yy=0;yy<h;yy++){ for(let xx=0;xx<w;xx++){ m[ty+yy][tx+xx]=ch; } } }; stamp(3,2,2,2,'T'); stamp(6,2,2,2,'T'); stamp(12,2,4,1,'W'); stamp(6,9,1,3,'O'); stamp(8,9,1,3,'O'); stamp(26,3,1,1,'P'); stamp(26,7,1,1,'P'); stamp(26,11,1,1,'P'); stamp(28,2,1,6,'#'); stamp(carTiles.tx, carTiles.ty, carTiles.tw, carTiles.th, 'C'); stamp(doorTiles.tx, doorTiles.ty, doorTiles.tw, doorTiles.th, 'D'); return m; })();
  const SOLID=new Set(['#','W','T','O','C','P','D']);
  const player={ x:TILE*20, y:TILE*10, w:18, h:24, speed:2.2, dir:'down', walkFrame:0, walkTimer:0, bob:0 };
  const keys={ArrowUp:false,ArrowDown:false,ArrowLeft:false,ArrowRight:false};
  const tileAtPixel=(px,py)=>{ const tx=clamp(Math.floor(px/TILE),0,COLS-1); const ty=clamp(Math.floor(py/TILE),0,ROWS-1); return {tx,ty,ch:map[ty][tx]}; };
  const isSolidAt=(px,py)=>{ const t=tileAtPixel(px,py).ch; return SOLID.has(t); };
  const collideRect=(nx,ny,w,h)=> isSolidAt(nx,ny) || isSolidAt(nx+w,ny) || isSolidAt(nx,ny+h) || isSolidAt(nx+w,ny+h);

  function updateMovement(dt){ let dx=0,dy=0; if(keys.ArrowUp) dy-=1; else if(keys.ArrowDown) dy+=1; else if(keys.ArrowLeft) dx-=1; else if(keys.ArrowRight) dx+=1; if(dx!==0 || dy!==0){ if(dx<0) player.dir='left'; else if(dx>0) player.dir='right'; else if(dy<0) player.dir='up'; else if(dy>0) player.dir='down'; } const sp=player.speed*dt; if(dx!==0){ const nx=player.x+Math.sign(dx)*sp; if(!collideRect(nx,player.y,player.w,player.h)) player.x=nx; } if(dy!==0){ const ny=player.y+Math.sign(dy)*sp; if(!collideRect(player.x,ny,player.w,player.h)) player.y=ny; } if(dx!==0 || dy!==0){ player.walkTimer+=dt; if(player.walkTimer>=6){ player.walkTimer=0; player.walkFrame=(player.walkFrame+1)&1; player.bob = player.walkFrame?1:0; } } else { player.walkFrame=0; player.walkTimer=0; player.bob=0; } }

  function drawFloor(){ for(let y=0;y<ROWS;y++){ for(let x=0;x<COLS;x++){ const px=x*TILE,py=y*TILE; const c=(x+y)%2===0?'#12162b':'#0f1428'; const ctx2=ctx; ctx2.fillStyle=c; ctx2.fillRect(px,py,TILE,TILE); } } }
  function drawWallsAndObjects(){ for(let y=0;y<ROWS;y++){ for(let x=0;x<COLS;x++){ const ch=map[y][x]; const px=x*TILE,py=y*TILE; if(ch=='#'){ ctx.fillStyle='#2a2f4d'; ctx.fillRect(px,py,TILE,TILE); ctx.fillStyle='#3b4270'; ctx.fillRect(px,py,TILE,3); } else if(ch=='W'){ ctx.fillStyle='#5b3b1a'; ctx.fillRect(px,py,TILE,TILE); ctx.fillStyle='#7a4f24'; ctx.fillRect(px,py,TILE,5); ctx.fillStyle='#2e2e2e'; ctx.fillRect(px+2,py+6,TILE-4,TILE-8); } else if(ch=='T'){ ctx.fillStyle='#8e1616'; ctx.fillRect(px+1,py+2,TILE-2,TILE-3); ctx.fillStyle='#680d0d'; ctx.fillRect(px+1,py+TILE-7,TILE-2,5); ctx.fillStyle='#c0c0c0'; ctx.fillRect(px+2,py+6,TILE-4,2); } else if(ch=='O'){ ctx.fillStyle='#0c0c0c'; ctx.beginPath(); ctx.arc(px+8,py+8,6,0,Math.PI*2); ctx.fill(); ctx.fillStyle='#1a1a1a'; ctx.beginPath(); ctx.arc(px+8,py+8,4,0,Math.PI*2); ctx.fill(); } else if(ch=='P'){ ctx.fillStyle='#3b3f5a'; ctx.fillRect(px+2,py+2,TILE-4,TILE-4); ctx.strokeStyle='#4b5072'; ctx.strokeRect(px+2.5,py+2.5,TILE-5,TILE-5); } else if(ch=='D'){ ctx.fillStyle='#3b4270'; ctx.fillRect(px,py,TILE,TILE); ctx.fillStyle='#4b5388'; for(let ly=2; ly<TILE; ly+=3){ ctx.fillRect(px+1, py+ly, TILE-2, 1); } } } } }

  // Carro F1
  function drawCar(){ const x=carRect.x, y=carRect.y, w=carRect.w, h=carRect.h; const grd=ctx.createLinearGradient(0,y,0,y+h); grd.addColorStop(0,'#111730'); grd.addColorStop(1,'#0d1226'); ctx.fillStyle=grd; ctx.fillRect(x,y,w,h); ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x + w/2, y + h/2 + 8, w*0.42, h*0.26, 0, 0, Math.PI*2); ctx.fill(); ctx.fillStyle='#2e3a5a'; ctx.fillRect(x + w*0.12, y + h*0.02, w*0.76, h*0.07); ctx.fillStyle='#b71c1c'; ctx.fillRect(x + w*0.47, y + h*0.02, w*0.06, h*0.28); ctx.fillStyle='#d32f2f'; ctx.fillRect(x + w*0.28, y + h*0.16, w*0.44, h*0.62); ctx.fillStyle='#0d111f'; ctx.fillRect(x + w*0.42, y + h*0.30, w*0.16, h*0.18); ctx.strokeStyle='#1a2238'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(x + w/2, y + h*0.38, w*0.12, Math.PI, 0); ctx.stroke(); ctx.fillStyle='#c62828'; ctx.fillRect(x + w*0.20, y + h*0.26, w*0.12, h*0.34); ctx.fillRect(x + w*0.68, y + h*0.26, w*0.12, h*0.34); ctx.fillStyle='#aa2424'; ctx.fillRect(x + w*0.38, y + h*0.50, w*0.24, h*0.24); ctx.fillStyle='#2e3a5a'; ctx.fillRect(x + w*0.20, y + h*0.80, w*0.60, h*0.08); ctx.fillStyle='#0b0d12'; const rw=w*0.095, rh=h*0.22; ctx.fillRect(x + w*0.10, y + h*0.14, rw, rh); ctx.fillRect(x + w*0.80, y + h*0.14, rw, rh); ctx.fillRect(x + w*0.10, y + h*0.62, rw, rh); ctx.fillRect(x + w*0.80, y + h*0.62, rw, rh); ctx.fillStyle='#ffd84d'; ctx.fillRect(x + w*0.49, y + h*0.22, w*0.02, h*0.05); ctx.fillRect(x + w*0.49, y + h*0.64, w*0.02, h*0.05); }

  // Proximidade
  let showInteractCar=false; let showInteractDoor=false;
  function nearRect(rect,pad=6,rad=26){ const px=player.x + player.w/2, py=player.y + player.h/2; const nx=clamp(px, rect.x - pad, rect.x + rect.w + pad); const ny=clamp(py, rect.y - pad, rect.y + rect.h + pad); const dx=px-nx, dy=py-ny; return (dx*dx+dy*dy) < (rad*rad); }
  const nearCar = () => nearRect(carRect, 6, 26);
  const nearDoor = () => nearRect(doorRect, 6, 26);

  // Driver (sprite)
  function drawDriver(){ const x=Math.round(player.x), y=Math.round(player.y - player.bob), w=player.w, h=player.h; const ctx2=ctx; ctx2.fillStyle='rgba(0,0,0,0.35)'; ctx2.beginPath(); ctx2.ellipse(x + w/2, y + h, w*0.7, 4, 0, 0, Math.PI*2); ctx2.fill(); const suit='#8e1616', suitDark='#6e1010', suitLight='#c02828', outline='#0b0e1a'; ctx2.fillStyle=suit; ctx2.fillRect(x+3, y+7, w-6, h-10); ctx2.fillStyle=suitLight; ctx2.fillRect(x+4, y+10, w-8, 2); ctx2.fillStyle='#aa1e1e'; ctx2.fillRect(x+4, y+14, w-8, 2); ctx2.fillStyle=suitDark; ctx2.fillRect(x+2, y+8, 3, 3); ctx2.fillRect(x+w-5, y+8, 3, 3); const armA=player.walkFrame?1:0, armB=player.walkFrame?0:1; ctx2.fillStyle=suit; ctx2.fillRect(x+1, y+12, 3, 6 - armA); ctx2.fillRect(x+w-4, y+12, 3, 6 - armB); ctx2.fillStyle='#f2f2f2'; ctx2.fillRect(x+1, y+16 - armA, 3, 2); ctx2.fillRect(x+w-4, y+16 - armB, 3, 2); const legA=player.walkFrame?2:0, legB=player.walkFrame?0:2; ctx2.fillStyle=suitDark; ctx2.fillRect(x+4, y+h-9, 4, 7 - legA); ctx2.fillRect(x+w-8, y+h-9, 4, 7 - legB); ctx2.fillStyle=suitLight; ctx2.fillRect(x+4, y+h-11, 4, 2); ctx2.fillRect(x+w-8, y+h-11, 4, 2); ctx2.fillStyle='#1c2236'; ctx2.fillRect(x+4, y+h-2, 4, 2); ctx2.fillRect(x+w-8, y+h-2, 4, 2); ctx2.fillStyle='#ffd84d'; ctx2.beginPath(); ctx2.ellipse(x + w/2, y+6, 8, 6, 0, 0, Math.PI*2); ctx2.fill(); ctx2.fillStyle='#0f1220'; if (player.dir==='down'){ ctx2.fillRect(x+4, y+5, w-8, 3); ctx2.fillStyle='rgba(255,255,255,0.15)'; ctx2.fillRect(x+5, y+5, w-10, 1);} else if (player.dir==='up'){ ctx2.fillRect(x+5, y+3, w-10, 2);} else if (player.dir==='left'){ ctx2.fillRect(x+2, y+4, 6, 3);} else if (player.dir==='right'){ ctx2.fillRect(x+w-8, y+4, 6, 3);} ctx2.fillStyle='rgba(255,255,255,0.45)'; ctx2.fillRect(x+5, y+2, 2, 1); ctx2.fillRect(x+6, y+3, 2, 1); ctx2.strokeStyle=outline; ctx2.lineWidth=1; ctx2.strokeRect(x+3.5, y+7.5, w-7, h-11); ctx2.beginPath(); ctx2.ellipse(x + w/2, y+6, 8, 6, 0, 0, Math.PI*2); ctx2.stroke(); }

  // ====== Loop ======
  let raf=null,last=performance.now();
  function frame(now){ const dt=Math.min(16, now-last); last=now; updateMovement(dt*0.1); drawFloor(); drawWallsAndObjects(); drawCar(); drawDriver(); showInteractCar = nearCar() && !isGameOver; showInteractDoor = nearDoor() && !isGameOver; updateDomTip(); raf=requestAnimationFrame(frame); }

  function updateDomTip(){ const tipCar = document.getElementById('interactTip'); const tipDoor = document.getElementById('interactTipDoor'); if(!canvas) return; const rect = canvas.getBoundingClientRect(); const sx = rect.width / canvas.width; const sy = rect.height / canvas.height; if (tipCar){ if (!showInteractCar){ tipCar.hidden=true; } else { tipCar.hidden=false; const tx = rect.left + (carRect.x + carRect.w/2)*sx; const ty = rect.top + (carRect.y - 10)*sy; tipCar.style.left = tx + 'px'; tipCar.style.top = ty + 'px'; }} if (tipDoor){ if (!showInteractDoor){ tipDoor.hidden=true; } else { tipDoor.hidden=false; const tx = rect.left + (doorRect.x + doorRect.w/2)*sx; const ty = rect.top + (doorRect.y - 10)*sy; tipDoor.style.left = tx + 'px'; tipDoor.style.top = ty + 'px'; }} }

  function onKey(e,down){ if(e.key in keys){ keys[e.key]=down; if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault(); }
    // WASD alias
    if (e.key==='w' || e.key==='W') { keys.ArrowUp = down; e.preventDefault(); }
    if (e.key==='s' || e.key==='S') { keys.ArrowDown = down; e.preventDefault(); }
    if (e.key==='a' || e.key==='A') { keys.ArrowLeft = down; e.preventDefault(); }
    if (e.key==='d' || e.key==='D') { keys.ArrowRight = down; e.preventDefault(); }
    if(down && (e.key==='e' || e.key==='E')){ if(showInteractDoor){ openDoorModal(); e.preventDefault(); return; } if(showInteractCar){ openCarModal(); e.preventDefault(); return; } } }

  function start(){ window.addEventListener('keydown',e=>onKey(e,true)); window.addEventListener('keyup',e=>onKey(e,false)); window.addEventListener('resize', updateDomTip); window.addEventListener('scroll', updateDomTip, true); raf=requestAnimationFrame(frame); }
  function stop(){ if(raf) cancelAnimationFrame(raf); raf=null; window.removeEventListener('resize', updateDomTip); window.removeEventListener('scroll', updateDomTip, true); }
  function resetPlayer(){ player.x=TILE*20; player.y=TILE*10; player.dir='down'; player.walkFrame=0; player.walkTimer=0; player.bob=0; }

  // ====== Interação Carro (Modal) ======
  const carModal=document.getElementById('carModal');
  const carInspectBtn=document.getElementById('carInspectBtn');
  const carRepairBtn=document.getElementById('carRepairBtn');
  const carCloseBtn=document.getElementById('carCloseBtn');
  const repairsInfo=document.getElementById('repairsInfo');
  function refreshRepairsUI(){ if(repairsInfo) repairsInfo.textContent = `Reparos usados hoje: ${state.repairsToday}/${state.maxRepairsPerDay}`; const limitReached = state.repairsToday >= state.maxRepairsPerDay; if(carInspectBtn){ carInspectBtn.disabled = limitReached || state.energy < 1; carInspectBtn.title = limitReached ? 'Limite diário de reparos atingido' : (state.energy < 1 ? 'Energia insuficiente' : 'Inspeção rápida'); } if(carRepairBtn){ carRepairBtn.disabled = limitReached || state.energy < 2; carRepairBtn.title = limitReached ? 'Limite diário de reparos atingido' : (state.energy < 2 ? 'Energia insuficiente' : 'Reparo geral'); } }
  function openCarModal(){ if(isGameOver) return; refreshRepairsUI(); carModal?.showModal?.(); }
  function closeCarModal(){ carModal?.close?.(); }
  function applyRepair(delta){ if (isGameOver) return; if (state.repairsToday >= state.maxRepairsPerDay){ alert('Limite diário de 2 reparos atingido.'); return; } if (state.energy < Math.abs(delta.energy)){ alert('Energia insuficiente para este reparo.'); return; } state.money += delta.money; state.energy = clamp(state.energy + delta.energy, 0, 10); state.repairsToday += 1; renderHUD(); if (checkImmediateGameOver()) return; refreshRepairsUI(); }
  carInspectBtn?.addEventListener('click',()=>{ applyRepair({ money:+90, energy:-1 }); });
  carRepairBtn?.addEventListener('click',()=>{ applyRepair({ money:+140, energy:-2 }); });
  carCloseBtn?.addEventListener('click',closeCarModal);
  carModal?.addEventListener('click',(e)=>{ const rect=carModal.querySelector('.modal__content')?.getBoundingClientRect?.(); if(!rect) return; const inDialog=(rect.top<=e.clientY && e.clientY<=rect.top+rect.height && rect.left<=e.clientX && e.clientX<=rect.left+rect.width); if(!inDialog) carModal.close(); });

  // ====== Porta (Modal) ======
  const doorModal = document.getElementById('doorModal');
  const doorConfirmBtn = document.getElementById('doorConfirmBtn');
  const doorCloseBtn = document.getElementById('doorCloseBtn');
  const doorBody = document.getElementById('doorBody');
  function refreshDoorUI(){ if(!doorBody) return; if(state.eventsToday < 3){ const rest=3-state.eventsToday; doorBody.innerHTML = `<p>Faltam <b>${rest}</b> evento(s) para finalizar o dia.</p>`; doorConfirmBtn.disabled=true; doorConfirmBtn.title='Conclua os eventos do dia para finalizar.'; } else { doorBody.innerHTML = `<p>Deseja finalizar o dia <b>${state.day}</b>?</p>`; doorConfirmBtn.disabled=false; doorConfirmBtn.title='Finalizar dia'; } }
  function openDoorModal(){ if(isGameOver) return; refreshDoorUI(); doorModal?.showModal?.(); }
  function closeDoorModal(){ doorModal?.close?.(); }
  function finalizeDay(){ if(state.eventsToday<3){ refreshDoorUI(); return; } if(state.day === state.maxDay){ const allPaid = state.debts.length>0 && state.debts.every(d=>d.status==='pagas'); if(allPaid){ endGame('Vitória! 🏆', `Você pagou todas as melhorias dentro de ${state.maxDay} dias. Dinheiro: ${formatBRL(state.money)} · Energia: ${state.energy}/10.`); } else { endGame('Prazo encerrado', `Você chegou ao dia ${state.maxDay} sem quitar todas as melhorias. Dinheiro: ${formatBRL(state.money)} · Energia: ${state.energy}/10.`); } closeDoorModal(); return; } advanceDay(); state.dayEndHintShown=false; closeDoorModal(); renderEvent(); }
  doorConfirmBtn?.addEventListener('click', finalizeDay);
  doorCloseBtn?.addEventListener('click', closeDoorModal);
  doorModal?.addEventListener('click',(e)=>{ const rect=doorModal.querySelector('.modal__content')?.getBoundingClientRect?.(); if(!rect) return; const inDialog=(rect.top<=e.clientY && e.clientY<=rect.top+rect.height && rect.left<=e.clientX && e.clientX<=rect.left+rect.width); if(!inDialog) doorModal.close(); });

  return { start, stop, resetPlayer };
}

// ====== Boot ======
let canvas;
window.addEventListener('DOMContentLoaded',()=>{
  buildEnergyMeter();
  canvas=document.getElementById('scene');
  garage=createGarage(canvas);
  garage.start();
  resetGame();
  bindUI();
  // Mostrar regras ao iniciar o jogo
  document.getElementById('rulesModal')?.showModal?.();
});
