// v19: Animations + more detailed apartment (no layout change)
// Builds on v18.2 (robust boot, detailed character, white HUD date)
const $ = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));
function qAny(...sels){ for(const s of sels){ const el=document.querySelector(s); if(el) return el; } return null; }
const brl = (n) => (typeof n==='number'? n: Number(n)||0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

window.addEventListener('error', (e)=>{ const box=$('#messages'); if(box){ box.textContent = '⚠️ Erro: ' + (e.message||'desconhecido'); box.style.color='var(--danger)'; } });

const DEFAULT_STATE = {
  started:true, day:1, monthDays:30, energia:5, money:50,
  dayEvents:[], eventsCompleted:0, calendarLog:{},
  lastCoffeeDay:-999, coffeeCooldown:2, shiftsToday:0, maxShiftsPerDay:2,
  jobTakenToday:false, jobOpportunityLostToday:false,
  player:{x:4,y:6},
  bills:[
    { id:'aluguel', name:'Aluguel', amount:800, dueDay:5, paid:false, lateDays:0, interestRate:0.03 },
    { id:'internet', name:'Internet', amount:120, dueDay:10, paid:false, lateDays:0, interestRate:0.03 },
    { id:'luz', name:'Luz', amount:150, dueDay:15, paid:false, lateDays:0, interestRate:0.03 },
    { id:'agua', name:'Água', amount:90, dueDay:20, paid:false, lateDays:0, interestRate:0.03 },
  ],
  ui:{ billFilter:'all', soundEnabled:true }
};
let state = {};
function migrateState(){ let changed=false; if(!state||typeof state!=='object'){ state=JSON.parse(JSON.stringify(DEFAULT_STATE)); return true; }
  if(!state.ui||typeof state.ui!=='object'){ state.ui={billFilter:'all', soundEnabled:true}; changed=true; }
  if(typeof state.ui.soundEnabled!=='boolean'){ state.ui.soundEnabled=true; changed=true; }
  if(!Array.isArray(state.bills)){ state.bills = JSON.parse(JSON.stringify(DEFAULT_STATE.bills)); changed=true; }
  return changed; }
// move old 'humor'
try { if (typeof state.energia !== 'number' && typeof state.humor === 'number') { state.energia = state.humor; delete state.humor; changed = true; } } catch(_){}


// ===== Canvas & Map =====
const MAP_W=15, MAP_H=10, TILE=64; const canvas=document.getElementById('game');
const ctx=canvas.getContext('2d'); ctx.imageSmoothingEnabled=false; canvas.width=MAP_W*TILE; canvas.height=MAP_H*TILE;
const map=[[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],[1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],[1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],[1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],[1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],[1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],[1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],[1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]];

// Apartment objects (decor + interactive). Added: window, rug, lamp, sink.
const objects={bed:{ name:'Box (Encerrar Dia)', x:3,y:6,w:3,h:2, icon:'[BOX]', iconScale:1.0, iconAt:{x:3,y:6}, type:'interactive' },computer:{ name:'Telemetria', x:10,y:6,w:3,h:2, icon:'[PC]', iconScale:1.0, iconAt:{x:10,y:6}, type:'interactive' },coffee:{ name:'Geladeira/Energetico', x:5,y:3,w:1,h:1, icon:'[DRINK]', iconScale:0.65, iconAt:{x:5,y:3}, type:'interactive' },calendar:{ name:'Quadro de Estrategia', x:13,y:1,w:1,h:1, icon:'[CAL]', iconScale:0.65, iconAt:{x:13,y:1}, type:'interactive' },book:{ name:'Regras', x:6,y:7,w:1,h:1, icon:'[BOOK]', iconScale:0.75, iconAt:{x:6,y:7}, type:'interactive' },window:{ name:'Porta de Garagem', x:1,y:1,w:3,h:3, style:'shutter', type:'decor' },rug:{ name:'Marcacoes de Box', x:6,y:5,w:3,h:2, style:'pitMark', type:'decor' },lamp:{ name:'Luz do Box', x:7,y:1,w:1,h:1, style:'pitLight', type:'decor' },sink:{ name:'Bancada', x:2,y:3,w:2,h:1, style:'workbench', type:'decor' },fridge:{ name:'Ferramentas', x:2,y:2,w:1,h:1, style:'toolChest', type:'decor' },stove:{ name:'Compressor', x:4,y:2,w:1,h:1, style:'compressor', type:'decor' },counter:{ name:'Monitores', x:9,y:2,w:4,h:2, style:'pitMonitors', type:'decor' },plant1:{ name:'Pilha de Pneus', x:12,y:5,w:1,h:2, style:'tireStack', type:'decor' },plant2:{ name:'Pilha de Pneus', x:13,y:5,w:1,h:2, style:'tireStack', type:'decor' },shelf:{ name:'Armario', x:12,y:4,w:2,h:1, style:'cabinetInd', type:'decor' },side:{ name:'Cones', x:7,y:7,w:1,h:1, style:'cones', type:'decor' },};

function isBlocked(nx,ny){ if(nx<0||ny<0||nx>=MAP_W||ny>=MAP_H) return true; if(map[ny][nx]===1) return true; for(const k of Object.keys(objects)){ const o=objects[k]; if(o.type==='interactive' && o.iconAt && o.iconAt.x===nx && o.iconAt.y===ny) return true; } return false; }

// ===== Visual palette =====
const C={ wall0:'#0e1420', wall1:'#101627', floorA:'#5f4c39', floorB:'#6c5340', floorC:'#7a5d46' };

// ===== Ambient particles (dust) with slight parallax by mouse =====
let mouse={x:0,y:0};
document.addEventListener('mousemove', (e)=>{ const r=canvas.getBoundingClientRect(); mouse.x=(e.clientX-r.left)/r.width-0.5; mouse.y=(e.clientY-r.top)/r.height-0.5; });
const MOTES=Array.from({length:32},()=>({ x:Math.random()*canvas.width, y:Math.random()*canvas.height, r:1+Math.random()*1.8, a:.05+.1*Math.random(), s:.1+.25*Math.random(), z:Math.random()*0.8+0.2 }));
function drawMotes(t){ const prev=ctx.globalCompositeOperation; ctx.globalCompositeOperation='lighter'; MOTES.forEach(m=>{ const parX = mouse.x*10*m.z; const parY = mouse.y*6*m.z; ctx.fillStyle=`rgba(160,190,255,${m.a})`; ctx.beginPath(); ctx.arc(m.x+parX,m.y+parY,m.r,0,Math.PI*2); ctx.fill(); m.x += m.s*(Math.sin((m.y+t*0.06)*0.002)); m.y += 0.05+m.s*0.08; if(m.y>canvas.height+8){ m.y=-8; m.x=Math.random()*canvas.width; } }); ctx.globalCompositeOperation=prev; }

// ===== Helpers =====
function drawWall(x,y){ctx.fillStyle='#0e141c';ctx.fillRect(x,y,TILE,TILE);ctx.fillStyle='#162030';ctx.fillRect(x+4,y+4,TILE-8,TILE-8);ctx.fillStyle='rgba(255,255,255,0.05)';for(let i=8;i<TILE;i+=10)ctx.fillRect(x+6,y+i,TILE-12,1);}
function drawWoodFloor(x,y){const g=ctx.createLinearGradient(x,y,x+TILE,y+TILE);g.addColorStop(0,'#3b3f48');g.addColorStop(1,'#2f343d');ctx.fillStyle=g;ctx.fillRect(x,y,TILE,TILE);ctx.fillStyle='rgba(255,255,255,0.05)';for(let i=0;i<4;i++){ctx.fillRect(x+8+i*12,y+6+i*10,1,1);}ctx.fillStyle='rgba(0,0,0,0.12)';ctx.fillRect(x,y+TILE-1,TILE,1);}
function haloAt(tx,ty,r=22){ const cx=tx*TILE+TILE/2, cy=ty*TILE+TILE/2; const g=ctx.createRadialGradient(cx,cy,6,cx,cy,r); g.addColorStop(0,'rgba(124,156,255,0.22)'); g.addColorStop(1,'rgba(124,156,255,0)'); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill(); }

// ===== Animated props =====
// Coffee steam particles near cafeteira
const STEAM=[]; function spawnSteam(){ const baseX=objects.coffee.x*TILE+TILE*0.5; const baseY=objects.coffee.y*TILE+TILE*0.2; for(let i=0;i<1;i++){ STEAM.push({x:baseX+(Math.random()-0.5)*10, y:baseY, vx:(Math.random()-0.5)*0.2, vy:-0.4-Math.random()*0.3, a:0.8, r:1+Math.random()*1.5}); } }
function drawSteam(){ for(let i=STEAM.length-1;i>=0;i--){ const p=STEAM[i]; ctx.fillStyle=`rgba(230,230,230,${p.a})`; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill(); p.x+=p.vx; p.y+=p.vy; p.a*=0.97; p.r+=0.02; if(p.a<0.05) STEAM.splice(i,1); } }

// Window: moving clouds
const CLOUDS=Array.from({length:4},(_,i)=>({x: (i*150)% (TILE*2), y: 8+Math.random()*20, w:30+Math.random()*30, h:10+Math.random()*8, s:0.25+Math.random()*0.3 }));
function drawWindow(px,py,w,h){ // frame
  ctx.fillStyle='#243149'; ctx.fillRect(px+6,py+6,w-12,h-12); ctx.fillStyle='#0d1018'; ctx.fillRect(px+10,py+10,w-20,h-20); // sky
  const skyGrad=ctx.createLinearGradient(px,py,px,py+h); skyGrad.addColorStop(0,'#1d2b45'); skyGrad.addColorStop(1,'#0f1930'); ctx.fillStyle=skyGrad; ctx.fillRect(px+12,py+12,w-24,h-24);
  // clouds
  ctx.save(); ctx.beginPath(); ctx.rect(px+12,py+12,w-24,h-24); ctx.clip();
  CLOUDS.forEach(c=>{ ctx.fillStyle='rgba(255,255,255,0.85)'; ctx.fillRect(px+12+c.x, py+12+c.y, c.w, c.h); c.x += c.s; if(px+12+c.x > px+12+(w-24)+40){ c.x = -40; c.y = 8+Math.random()*20; } });
  ctx.restore();
}

// Rug
function drawRug(px,py,w,h){ const g=ctx.createLinearGradient(px,py,px+w,py+h); g.addColorStop(0,'#2a3a4f'); g.addColorStop(1,'#1e2a3b'); ctx.fillStyle=g; ctx.fillRect(px,py,w,h); ctx.strokeStyle='#0a0f16'; ctx.lineWidth=2; ctx.strokeRect(px+4,py+4,w-8,h-8); }

// Lamp with soft light pulsation
function drawLamp(px,py){ // body
  ctx.fillStyle='#3a3a48'; ctx.fillRect(px+TILE*0.45,py+2,4,20); ctx.fillStyle='#cfc57a'; ctx.fillRect(px+TILE*0.42,py+22,10,6);
}
function drawLampLight(tx,ty,t){ const cx=tx*TILE+TILE*0.5, cy=ty*TILE+TILE*0.8; const pulse=0.85+Math.sin(t*0.003)*0.15; const g=ctx.createRadialGradient(cx,cy,6,cx,cy,120); g.addColorStop(0,`rgba(255,245,180,${0.16*pulse})`); g.addColorStop(1,'rgba(255,245,180,0)'); ctx.fillStyle=g; ctx.fillRect(cx-140,cy-40,280,220); }

// Sink (pia) extra detail
function drawSink(px,py){ ctx.fillStyle='#9aa3ad'; ctx.fillRect(px+10,py+12,TILE-20,TILE-24); ctx.fillStyle='#c6ccd3'; ctx.fillRect(px+14,py+16,TILE-28,TILE-32); ctx.fillStyle='#6a7a8a'; ctx.fillRect(px+TILE-28,py+18,6,10); }

// Plant sway
function drawPlant(px,py,t){ const sway = Math.sin(t*0.004 + (px+py))*2; ctx.fillStyle='#2b5337'; ctx.fillRect(px+14,py+TILE-18,TILE-28,12); ctx.fillStyle='#3f7a4f'; ctx.save(); ctx.translate(sway,0); ctx.fillRect(px+12,py+12,TILE-24,TILE-26); ctx.restore(); }
function drawPlantSm(px,py,t){ const sway = Math.sin(t*0.004 + (px+py))*1.5; ctx.fillStyle='#2b5337'; ctx.fillRect(px+18,py+TILE-16,TILE-36,10); ctx.fillStyle='#4e9a5f'; ctx.save(); ctx.translate(sway,0); ctx.fillRect(px+18,py+18,TILE-36,TILE-36); ctx.restore(); }

// Existing simple draw fns
function drawApplianceA(px,py){ ctx.fillStyle='#c6ccd3'; ctx.fillRect(px+6,py+6,TILE-12,TILE-14); ctx.fillStyle='#9aa3ad'; ctx.fillRect(px+10,py+10,TILE-20,TILE-24); }
function drawApplianceB(px,py){ ctx.fillStyle='#8fa4b6'; ctx.fillRect(px+8,py+10,TILE-16,TILE-20); ctx.fillStyle='#6a7a8a'; ctx.fillRect(px+12,py+14,TILE-24,TILE-28); }
function drawCounter(px,py,w,h){ ctx.fillStyle='#7a5a3e'; ctx.fillRect(px,py,w,h); ctx.fillStyle='#5a422f'; ctx.fillRect(px+6,py+6,w-12,h-12); }
function drawCabinet(px,py,w,h){ ctx.fillStyle='#9b7958'; ctx.fillRect(px,py,w,h); ctx.fillStyle='#5a422f'; ctx.fillRect(px+6,py+6,w-12,h-12); }
function drawSide(px,py){ ctx.fillStyle='#7a5a3e'; ctx.fillRect(px+12,py+12,TILE-24,TILE-24); }

// PC with subtle flicker
function drawPC(px,py,w,h,t){ctx.fillStyle='#1d2736';ctx.fillRect(px,py,w,h);const sw=(w-24)/2;for(let i=0;i<2;i++){const sx=px+8+i*(sw+8);ctx.fillStyle='#2a3a56';ctx.fillRect(sx,py+8,sw,h-22);const flick=0.08+(Math.sin(t*0.02+i)+1)*0.04;ctx.fillStyle=`rgba(124,156,255,${flick})`;ctx.fillRect(sx+2,py+10,sw-4,h-26);}ctx.fillStyle='#0b0e13';ctx.fillRect(px+10,py+h-12,w-20,8);}

// Bed, Coffee, Calendar as before
function drawBed(px,py,w,h){ctx.fillStyle='#39414c';ctx.fillRect(px,py,w,h);ctx.fillStyle='rgba(255,213,0,0.8)';ctx.fillRect(px+4,py+4,w-8,3);ctx.fillRect(px+4,py+h-7,w-8,3);}
function drawCoffee(px,py){ctx.fillStyle:'#2f98d4';ctx.fillRect(px+10,py+10,TILE-20,TILE-20);ctx.fillStyle='#ffffff';ctx.fillRect(px+14,py+14,TILE-28,TILE-28);}
function drawCalendar(px,py){ctx.fillStyle:'#dfe7ef';ctx.fillRect(px+10,py+6,TILE-20,TILE-22);ctx.fillStyle:'#3b3b3b';ctx.fillRect(px+12,py+8,TILE-24,2);}

// Icons
function drawIconScaled(o){ if(!o.icon) return; ctx.textBaseline='top'; const scale=o.iconScale??1.0; ctx.font=`${Math.floor(TILE*scale)}px serif`; const offY = scale>=1 ? -TILE*0.05 : 0; ctx.fillText(o.icon, o.x*TILE, o.y*TILE + offY); haloAt(o.x+o.w/2, o.y+o.h/2, 26); }

// ===== Character (with subtle breathing animation) =====
function playerSprite(px,py,t){const S=TILE;const breathe=Math.sin(t*0.004)*1.5;py+=breathe;const helmet='#f2c200',visor='#1f2d3d',visorHi='rgba(180,220,255,0.25)',suitP='#d32f2f',suitS='#ffffff',glove='#f0f0f0',boot='#202838',shade='rgba(0,0,0,0.25)';ctx.fillStyle=shade;ctx.beginPath();ctx.ellipse(px+S*.5,py+S*.88,S*.24,S*.10,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=suitP;ctx.fillRect(px+S*.38,py+S*.58,S*.10,S*.20);ctx.fillRect(px+S*.52,py+S*.58,S*.10,S*.20);ctx.fillStyle=boot;ctx.fillRect(px+S*.38,py+S*.76,S*.10,S*.10);ctx.fillRect(px+S*.52,py+S*.76,S*.10,S*.10);ctx.fillStyle=suitP;ctx.fillRect(px+S*.28,py+S*.34,S*.44,S*.28);ctx.fillStyle=suitS;ctx.fillRect(px+S*.28,py+S*.48,S*.44,S*.06);ctx.fillStyle:'#111827';ctx.fillRect(px+S*.28,py+S*.56,S*.44,S*.04);ctx.fillStyle:'#c7b37a';ctx.fillRect(px+S*.46,py+S*.56,S*.06,S*.04);ctx.fillStyle:'#ffffff';ctx.fillRect(px+S*.31,py+S*.38,S*.08,S*.06);ctx.fillStyle:'#000000';ctx.fillRect(px+S*.31,py+S*.38,S*.04,S*.03);ctx.fillRect(px+S*.35,py+S*.41,S*.04,S*.03);ctx.fillStyle=suitP;ctx.fillRect(px+S*.22,py+S*.40,S*.06,S*.14);ctx.fillRect(px+S*.72,py+S*.40,S*.06,S*.14);ctx.fillStyle=glove;ctx.fillRect(px+S*.22,py+S*.52,S*.06,S*.06);ctx.fillRect(px+S*.72,py+S*.52,S*.06,S*.06);ctx.fillStyle=helmet;ctx.fillRect(px+S*.30,py+S*.10,S*.40,S*.26);ctx.fillStyle:'#caa400';ctx.fillRect(px+S*.30,py+S*.32,S*.40,S*.04);ctx.fillStyle=visor;ctx.fillRect(px+S*.34,py+S*.18,S*.28,S*.12);const gl=0.06+(Math.sin(t*0.01)+1)*0.04;ctx.fillStyle=`rgba(200,230,255,${gl})`;ctx.fillRect(px+S*.36,py+S*.18,S*.04,S*.12);ctx.fillStyle=visorHi;ctx.fillRect(px+S*.44,py+S*.18,S*.10,S*.02);}

// ===== Draw world =====
function drawShutter(px,py,w,h){ctx.fillStyle='#6d737c';ctx.fillRect(px,py,w,h);ctx.fillStyle='#4b5058';for(let yy=py+6;yy<py+h-4;yy+=10){ctx.fillRect(px+4,yy,w-8,6);}ctx.fillStyle='rgba(0,0,0,0.25)';ctx.fillRect(px,py,w,3);}
function drawPitMark(px,py,w,h){ctx.fillStyle='rgba(255,213,0,0.9)';ctx.fillRect(px+4,py+4,w-8,2);ctx.fillRect(px+4,py+h-6,w-8,2);ctx.fillRect(px+4,py+4,2,h-8);ctx.fillRect(px+w-6,py+4,2,h-8);}
function drawToolChest(px,py){ctx.fillStyle='#c0392b';ctx.fillRect(px+8,py+12,TILE-16,TILE-20);ctx.fillStyle='#9b2e22';for(let i=0;i<4;i++){ctx.fillRect(px+10,py+14+i*10,TILE-20,6);}ctx.fillStyle='#111';ctx.fillRect(px+10,py+TILE-12,TILE-20,6);}
function drawWorkbench(px,py){ctx.fillStyle='#7a5a3e';ctx.fillRect(px,py,TILE*2,TILE-20);ctx.fillStyle='#42301f';ctx.fillRect(px+6,py+6,TILE*2-12,TILE-32);}
function drawCompressor(px,py){ctx.fillStyle='#2d6cdf';ctx.fillRect(px+12,py+16,TILE-24,TILE-28);ctx.fillStyle='#0f2c66';ctx.fillRect(px+16,py+20,TILE-32,TILE-36);}
function drawPitMonitors(px,py,w,h){ctx.fillStyle='#1d2736';ctx.fillRect(px,py,w,h);for(let i=0;i<3;i++){const sw=(w-20)/3;const sx=px+8+i*(sw+2);ctx.fillStyle='#2a3a56';ctx.fillRect(sx,py+8,sw,h-22);const flick=0.08+(Math.sin(Date.now()*0.002+i)+1)*0.04;ctx.fillStyle=`rgba(124,156,255,${flick})`;ctx.fillRect(sx+2,py+10,sw-4,h-26);}}
function drawTireStack(px,py){ctx.fillStyle='#121212';for(let i=0;i<3;i++){ctx.fillRect(px+10,py+TILE-16-(i*10),TILE-20,8);}}
function drawCabinetInd(px,py,w,h){ctx.fillStyle='#5d6a75';ctx.fillRect(px,py,w,h);ctx.fillStyle='#2c343c';ctx.fillRect(px+6,py+6,w-12,h-12);}
function drawCones(px,py){ctx.fillStyle='#ff6b00';ctx.fillRect(px+TILE*0.45,py+12,8,18);ctx.fillStyle='#fff';ctx.fillRect(px+TILE*0.45,py+24,8,3);}
function drawPitLight(px,py){ctx.fillStyle='#3a3a48';ctx.fillRect(px+TILE*0.45,py+2,4,16);}
function drawPitLightGlow(tx,ty,t){const cx=tx*TILE+TILE*0.5,cy=ty*TILE+TILE*0.7;const pulse=0.9+Math.sin(t*0.003)*0.18;const g=ctx.createRadialGradient(cx,cy,6,cx,cy,140);g.addColorStop(0,`rgba(255,245,200,${0.14*pulse})`);g.addColorStop(1,'rgba(255,245,200,0)');ctx.fillStyle=g;ctx.fillRect(cx-160,cy-60,320,260);}
function drawScene(t){ for(let y=0;y<MAP_H;y++) for(let x=0;x<MAP_W;x++){ const px=x*TILE,py=y*TILE; if(map[y][x]===1) drawWall(px,py); else drawWoodFloor(px,py);} // decor
  for(const k of Object.keys(objects)){
    const o=objects[k]; if(o.type!=='decor') continue; const px=o.x*TILE,py=o.y*TILE,w=o.w*TILE,h=o.h*TILE;
    switch(o.style){
      case 'window': drawShutter(px,py,w,h); break;
      case 'rug': drawPitMark(px,py,w,h); break;
      case 'lamp': drawPitLight(px,py); break;
      case 'sink': drawWorkbench(px,py); break;
      case 'applianceA': drawToolChest(px,py); break;
      case 'applianceB': drawCompressor(px,py); break;
      case 'counter': drawPitMonitors(px,py,w,h); break;
      case 'plant': drawTireStack(px,py); break;
      case 'plantSm': drawTireStack(px,py); break;
      case 'cabinet': drawCabinetInd(px,py,w,h); break;
      case 'side': drawCones(px,py); break;
    }
  }
  // interactive
  for(const k of Object.keys(objects)){
    const o=objects[k]; if(o.type!=='interactive') continue; const px=o.x*TILE,py=o.y*TILE,w=o.w*TILE,h=o.h*TILE;
    if(k==='bed') drawBed(px,py,w,h); else if(k==='computer') drawPC(px,py,w,h,t); else if(k==='coffee') drawCoffee(px,py); else if(k==='calendar') drawCalendar(px,py); drawIconScaled(o);
  }
  // lamp light overlay
  drawPitLightGlow(objects.lamp.x, objects.lamp.y, t);
}

// ===== Main loop =====
let last=performance.now(); let tAccum=0; let steamTimer=0;
const keys={ArrowLeft:false,ArrowRight:false,ArrowUp:false,ArrowDown:false}; let moveCooldown=0;
function tryMove(dx,dy){ const nx=state.player.x+dx,ny=state.player.y+dy; if(!isBlocked(nx,ny)){ state.player.x=nx; state.player.y=ny; save(); }}
function update(dt){ if(moveCooldown>0) moveCooldown--; if(moveCooldown===0){ if(keys.ArrowLeft){tryMove(-1,0);moveCooldown=5;} else if(keys.ArrowRight){tryMove(1,0);moveCooldown=5;} else if(keys.ArrowUp){tryMove(0,-1);moveCooldown=5;} else if(keys.ArrowDown){tryMove(0,1);moveCooldown=5;} } const info=$('#floatingInfo'); const progress=`${state.eventsCompleted}/${state.dayEvents.length||3}`; if(info) info.textContent=`Dia ${state.day}/${state.monthDays} • Eventos: ${progress}`; const ec=$('#eventsChip'); if(ec) ec.textContent=progress; // steam spawn
  steamTimer += dt; if(steamTimer>450){ spawnSteam(); steamTimer=0; } }
function loop(now){ const dt = now-last; last=now; tAccum += dt; update(dt); ctx.clearRect(0,0,canvas.width,canvas.height); drawScene(tAccum); drawMotes(tAccum); drawSteam(); const px=state.player.x*TILE,py=state.player.y*TILE; playerSprite(px,py,tAccum); const g=ctx.createLinearGradient(0,0,0,canvas.height); g.addColorStop(0,'rgba(0,0,0,0.05)'); g.addColorStop(1,'rgba(0,0,0,0.08)'); ctx.fillStyle=g; ctx.fillRect(0,0,canvas.width,canvas.height); positionBubble(); requestAnimationFrame(loop); }
window.addEventListener('keydown',(e)=>{ if(e.key in keys){ keys[e.key]=true; e.preventDefault(); } if(e.key.toLowerCase()==='e'){ interact(); } }); window.addEventListener('keyup',(e)=>{ if(e.key in keys){ keys[e.key]=false; e.preventDefault(); } });

// ===== Audio =====
let audioCtx=null; function ensureAudio(){ if(!audioCtx){ try{ audioCtx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ audioCtx=null; } } return audioCtx; }
function playTone(freq=440,type='sine',dur=0.08,gain=0.03){ if(!state.ui?.soundEnabled) return; const ac=ensureAudio(); if(!ac) return; const o=ac.createOscillator(); const g=ac.createGain(); o.type=type; o.frequency.value=freq; g.gain.value=gain; o.connect(g); g.connect(ac.destination); const now=ac.currentTime; o.start(now); o.stop(now+dur); }
function sweep(from=220,to=520,dur=0.5,type='sine',gain=0.02){ if(!state.ui?.soundEnabled) return; const ac=ensureAudio(); if(!ac) return; const o=ac.createOscillator(); const g=ac.createGain(); o.type=type; o.frequency.setValueAtTime(from, ac.currentTime); o.frequency.linearRampToValueAtTime(to, ac.currentTime+dur); g.gain.value=gain; o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime+dur); }
function sfxInteract(){ playTone(680,'triangle',0.06,0.04); } function sfxDay(){ sweep(240,520,0.55,'sine',0.03); }
['click','keydown'].forEach(evt=>document.addEventListener(evt,()=>{ if(audioCtx && audioCtx.state==='suspended') audioCtx.resume(); },{ once:true }));

// ===== FX / UI helpers =====
function tileToCanvasPos(tx,ty){ return {x:tx*TILE+TILE/2, y:ty*TILE+8}; }
function canvasToClient(x,y){ const r=canvas.getBoundingClientRect(); return { left:r.left + x*(r.width/canvas.width), top:r.top + y*(r.height/canvas.height) }; }
function playInteractFX(tx,ty){ const fx=$('#fx'); if(!fx) return; const p=tileToCanvasPos(tx,ty); const pos=canvasToClient(p.x,p.y); fx.style.left=pos.left+'px'; fx.style.top=pos.top+'px'; fx.classList.remove('hidden'); fx.classList.remove('play'); void fx.offsetWidth; fx.classList.add('play'); setTimeout(()=>{ fx.classList.add('hidden'); }, 620); sfxInteract(); }

// ===== Legends =====
const LEGENDS={ bed:'[BOX] Encerrar dia <strong>(E)</strong>', coffee:'[DRINK] Energetico +1 Energia <strong>(E)</strong>', computer:'[PC] Telemetria <strong>(E)</strong>', calendar:'[CAL] Estrategia / Calendario <strong>(E)</strong>', book:'[BOOK] Regras <strong>(E)</strong>' };
function findNearbyInteractive(){ const px=state.player.x,py=state.player.y; for(const k of Object.keys(objects)){ const o=objects[k]; if(o.type!=='interactive') continue; const icon=o.iconAt||{x:o.x,y:o.y}; const dx=Math.abs(px-icon.x),dy=Math.abs(py-icon.y); if(dx+dy<=1) return { key:k, iconX:icon.x, iconY:icon.y, ...o }; } return null; }
function positionBubble(){ const near=findNearbyInteractive(); const bubble=$('#bubble'); if(!bubble) return; if(!near){ bubble.classList.add('hidden'); return; } const p=tileToCanvasPos(near.iconX,near.iconY); const pos=canvasToClient(p.x,p.y); bubble.style.left=pos.left+'px'; bubble.style.top=pos.top+'px'; bubble.innerHTML=LEGENDS[near.key]||'Interagir <strong>(E)</strong>'; bubble.classList.remove('hidden'); }
function interact(){ const near=findNearbyInteractive(); if(!near) return; playInteractFX(near.iconX, near.iconY); if(near.key==='bed'){ if(state.dayEvents && state.eventsCompleted < state.dayEvents.length){ flash('Finalize os eventos do dia antes de dormir.','warn'); return; } nextDay(); } else if(near.key==='calendar'){ renderCalendar(); openModal('#modalCalendar'); } else if(near.key==='coffee'){ drinkCoffee(); } else if(near.key==='computer'){ openModal('#modalComputer'); } else if(near.key==='book'){ openModal('#modalRules'); } }

// ===== Events (same pool as v18.2) =====
const EVENT_POOL=[
  { id:'market', text:'Promoção relâmpago no mercado. Estocar comida?', choices:[ { t:'Comprar (−R$ 80, +1 Humor)', dm:-80, dh:+1, log:'Fez compra no mercado.' }, { t:'Deixar pra lá (+0, −1 Humor)', dm:0, dh:-1, log:'Ignorou promoção.' } ] },
  { id:'friend', text:'Amigo chamou para sair.', choices:[ { t:'Ir (−R$ 60, +2 Humor, consome 1 turno, perde a vaga do dia)', dm:-60, dh:+2, log:'Saiu com amigo.', useShift:1, loseDailyJob:true }, { t:'Ficar (±R$ 0, −1 Humor)', dm:0, dh:-1, log:'Ficou em casa.' } ] },
  { id:'volunteer', text:'Voluntariado em ONG local.', choices:[ { t:'Aceitar (+0, +2 Humor, consome 1 turno)', dm:0, dh:+2, log:'Fez voluntariado.', useShift:1 }, { t:'Recusar (+0, −1 Humor)', dm:0, dh:-1, log:'Recusou voluntariado.' } ] },
  { id:'delivery', text:'Vontade de pedir delivery.', choices:[ { t:'Pedir (−R$ 45, +1 Humor)', dm:-45, dh:+1, log:'Pediu delivery.' }, { t:'Cozinhar (+0, −1 Humor)', dm:0, dh:-1, log:'Cozinhou em casa.' } ] },
  { id:'cardShock', text:'Conta surpresa do cartão.', choices:[ { t:'Pagar (−R$ 90, +0)', dm:-90, dh:0, log:'Pagou conta surpresa.' }, { t:'Parcelar (−R$ 20 hoje, −1 Humor)', dm:-20, dh:-1, log:'Parcelou o cartão — gerou parcelamento em atraso (10%/dia).', addCardDebt:true } ] },
  { id:'leak', text:'Vazamento na pia.', choices:[ { t:'Chamar encanador (−R$ 120, +1 Humor)', dm:-120, dh:+1, log:'Resolveu vazamento com encanador.' }, { t:'Dar um jeito (−R$ 20, −1 Humor)', dm:-20, dh:-1, log:'Tentou resolver sozinho.' } ] },
  { id:'sellStuff', text:'Você encontrou itens antigos para vender online.', choices:[ { t:'Vender (+R$ 130, +0 Humor)', dm:+130, dh:0, log:'Vendeu itens usados.' }, { t:'Guardar (±0, +0 Humor)', dm:0, dh:0, log:'Guardou para depois.' } ] },
  { id:'scam', text:'Mensagem suspeita pedindo dados bancários.', choices:[ { t:'Ignorar (±0, +0)', dm:0, dh:0, log:'Ignorou um golpe.' }, { t:'Quase caiu (−R$ 40, −1 Humor)', dm:-40, dh:-1, log:'Quase caiu em um golpe.' } ] },
  { id:'exercise', text:'Treino rápido em casa.', choices:[ { t:'Fazer (+0, +1 Humor)', dm:0, dh:+1, log:'Fez exercício.' }, { t:'Pular (+0, −1 Humor)', dm:0, dh:-1, log:'Ficou sedentário hoje.' } ] },
  { id:'rain', text:'Chuva forte lá fora.', choices:[ { t:'Café especial (−R$ 15, +1 Humor)', dm:-15, dh:+1, log:'Se presenteou num dia chuvoso.' }, { t:'Nada (+0, −1 Humor)', dm:0, dh:-1, log:'O clima afetou seu humor.' } ] },
  { id:'found', text:'Achou dinheiro no bolso do casaco!', choices:[ { t:'Guardar (+R$ 20, +1 Humor)', dm:+20, dh:+1, log:'Achou R$ 20 no bolso.' }, { t:'Gastar em doce (±0, +1 Humor)', dm:0, dh:+1, log:'Comprou um doce.' } ] },
  { id:'streaming', text:'Promoção de streaming por 1 mês.', choices:[ { t:'Assinar (−R$ 30, +1 Humor)', dm:-30, dh:+1, log:'Assinou streaming promocional.' }, { t:'Deixar pra depois (+0, +0)', dm:0, dh:0, log:'Ignorou a promoção.' } ] },
  { id:'bonusShift', text:'Um conhecido ofereceu uma hora extra rápida.', choices:[ { t:'Aceitar (+R$ 60, −1 Humor, consome 1 turno)', dm:+60, dh:-1, log:'Fez hora extra.', useShift:1 }, { t:'Recusar (+0, +0)', dm:0, dh:0, log:'Recusou hora extra.' } ] },
  { id:'pet', text:'Visita rápida a um abrigo de animais.', choices:[ { t:'Acariciar bichinhos (+0, +2 Humor)', dm:0, dh:+2, log:'Passou um tempo com animais.' }, { t:'Não ir (+0, −1 Humor)', dm:0, dh:-1, log:'Deixou para outro dia.' } ] },
  { id:'bookFair', text:'Feira de livros no bairro.', choices:[ { t:'Comprar um livro (−R$ 35, +1 Humor)', dm:-35, dh:+1, log:'Comprou um livro novo.' }, { t:'Apenas visitar (+0, +0)', dm:0, dh:0, log:'Deu uma olhada na feira.' } ] },
  { id:'repairPhone', text:'Celular com tela trincada.', choices:[ { t:'Trocar a película (−R$ 25, +0)', dm:-25, dh:0, log:'Protegeu a tela.' }, { t:'Ignorar (+0, −1 Humor)', dm:0, dh:-1, log:'A tela trincada incomoda.' } ] },
  { id:'neighborNoise', text:'Vizinho fazendo barulho à noite.', choices:[ { t:'Falar com educação (+0, +0)', dm:0, dh:0, log:'Conversou com o vizinho.' }, { t:'Ignorar (+0, −1 Humor)', dm:0, dh:-1, log:'Dormiu mal por causa do barulho.' } ] },
];
function pickRandomEvents(n=3){ const pool=[...EVENT_POOL]; const res=[]; for(let i=0;i<n && pool.length;i++){ const idx=Math.floor(Math.random()*pool.length); res.push(pool.splice(idx,1)[0]); } return res; }
function renderEvents(){ const text=$('#eventText'); const choices=$('#choices'); const prog=$('#eventsProgress'); const progress=`${state.eventsCompleted}/${state.dayEvents.length||3}`; if(prog) prog.textContent=`Progresso: ${progress}`; if(!text||!choices) return; if(state.dayEvents.length===0){ text.textContent='Gerando eventos...'; choices.innerHTML=''; return; } if(state.eventsCompleted>=state.dayEvents.length){ text.innerHTML='Eventos concluídos! Use o computador se quiser e depois <strong>durma</strong> para passar o dia.'; choices.innerHTML=''; return; } const ev=state.dayEvents[state.eventsCompleted]; text.textContent=ev.text; choices.innerHTML=''; ev.choices.forEach((c)=>{ const btn=document.createElement('button'); btn.className='btn'; btn.textContent=c.t; const wouldUseShift = !!c.useShift; const outOfShifts = state.shiftsToday >= state.maxShiftsPerDay; if (wouldUseShift && outOfShifts){ btn.disabled = true; btn.title = 'Você já utilizou todos os turnos hoje.'; } btn.addEventListener('click', ()=>{ if (wouldUseShift && outOfShifts){ flash('Você já utilizou todos os turnos de hoje.', 'warn'); return; } state.money += c.dm; const prevHum = state.energia; state.energia = clamp(state.energia + c.dh, 0, 10); if (c.useShift){ state.shiftsToday = Math.min(state.maxShiftsPerDay, state.shiftsToday + c.useShift); } if (c.loseDailyJob){ state.jobOpportunityLostToday = true; } if (c.addCardDebt){ addCardParcelDebt(); renderBills(); renderBillsSide(); } logDay(`${c.log} (${c.dm>=0?'+':''}${brl(c.dm)}; Humor ${c.dh>=0?'+':''}${c.dh}${c.useShift?'; consumiu 1 turno':''}${c.loseDailyJob?'; perdeu a vaga':''}).`); state.eventsCompleted++; renderHUD(prevHum); renderEvents(); genJobForToday(); save(); checkEnd(); }); choices.appendChild(btn); }); }
function generateEventsForToday(){ state.dayEvents=pickRandomEvents(3); state.eventsCompleted=0; renderEvents(); }
function startOfDay(){ generateEventsForToday(); genJobForToday(); renderBills(); renderBillsSide(); }

function addCardParcelDebt(){ const id = `cartao_${state.day}_${Math.floor(Math.random()*1e6)}`; const amount = Math.max(0, 90 - 20); const bill = { id, name:'Cartão (Parcelamento) 4b3', amount, dueDay: state.day-1, paid:false, lateDays:0, interestRate:0.10, card:true }; state.bills.push(bill); logDay(`Criou ${bill.name} (10%/dia): ${brl(bill.amount)} — já em atraso.`); }

// ===== Bills / Calendar / Jobs =====
function renderBills(){ const list=$('#billsList'); if(!list) return; list.innerHTML=''; state.bills.forEach(b=>{ const overdue = state.day > b.dueDay && !b.paid; const div=document.createElement('div'); div.className='bill'+(b.card?' card':''); const rateLabel = b.interestRate===0.10?'10%/dia':'3%/dia'; const typeBadge = b.card?'<span class="badge card">💳 Cartão 10%/dia</span>':''; const badge=b.paid?'<span class="badge paid">Paga</span>':overdue?'<span class="badge late">Em atraso</span>':'<span class="badge due">A pagar</span>'; div.title = billProjectionTooltip(b); div.innerHTML = `<div><strong>${b.name}</strong><br>Valor: ${brl(b.amount)} — Venc.: dia ${b.dueDay} — Juros: ${rateLabel} ${typeBadge}</div><div>${badge} <button class="btn small" ${b.paid?'disabled':''} data-pay="${b.id}">Pagar</button></div>`; list.appendChild(div); }); $$('#billsList [data-pay]').forEach(btn=>btn.addEventListener('click',e=>payBill(e.currentTarget.getAttribute('data-pay')))); }
function renderBillsSide(){ const list=$('#billsListSide'); if(!list) return; list.innerHTML=''; const filter=(state.ui && typeof state.ui.billFilter==='string')? state.ui.billFilter : 'all'; const arr=state.bills.filter(b=>!b.paid).filter(b=>{ const overdue = state.day > b.dueDay; return filter==='all' ? true : filter==='late' ? overdue : !overdue; }); if (arr.length===0){ list.innerHTML='<p class="small">Não há contas neste filtro.</p>'; return; } arr.sort((a,b)=>a.dueDay-b.dueDay); arr.forEach(b=>{ const overdue=state.day>b.dueDay; const rateLabel=b.interestRate===0.10?'10%/dia':'3%/dia'; const typeBadge=b.card?'<span class="badge card">💳 Cartão 10%/dia</span>':''; const div=document.createElement('div'); div.className='bill'+(b.card?' card':''); const badge=overdue?'<span class="badge late">Em atraso</span>':'<span class="badge due">A pagar</span>'; div.title=billProjectionTooltip(b); div.innerHTML = `<div><strong>${b.name}</strong><br>${overdue?'Atraso: '+(state.day-b.dueDay)+' dia(s) — ':''}Valor: ${brl(b.amount)} — Venc.: dia ${b.dueDay} — Juros: ${rateLabel} ${typeBadge}</div><div>${badge} <button class="btn small" data-pay-side="${b.id}">Pagar</button></div>`; list.appendChild(div); }); $$('#billsListSide [data-pay-side]').forEach(btn=>btn.addEventListener('click',e=>payBill(e.currentTarget.getAttribute('data-pay-side')))); }
function billProjectionTooltip(b){ const r = (typeof b.interestRate==='number')? b.interestRate : 0.03; const v=(days)=> (b.amount*Math.pow(1+r,days)).toFixed(2); return `Se atrasar: +3 dias → R$ ${v(3)}; +5 dias → R$ ${v(5)}; +10 dias → R$ ${v(10)}`; }
function payBill(id){ const b=state.bills.find(x=>x.id===id); if(!b || b.paid) return; if(state.money < b.amount){ flash('Dinheiro insuficiente para pagar esta conta.','error'); return; } state.money -= b.amount; b.paid = true; logDay(`Pagou ${b.name} (${brl(b.amount)}).`); renderBills(); renderBillsSide(); renderHUD(); save(); checkEnd(); }
function applyOverduesOnNewDay(){ let any=false; const lines=[]; state.bills.forEach(b=>{ if (!b.paid && state.day > b.dueDay){ const before = b.amount; b.lateDays=(b.lateDays||0)+1; const rate = (typeof b.interestRate==='number')? b.interestRate : 0.03; b.amount = +(b.amount * (1+rate)).toFixed(2); const inc = +(b.amount - before).toFixed(2); any=true; lines.push(`Juros ${Math.round(rate*100)}% — ${b.name}: +${brl(inc)} → ${brl(b.amount)} (atraso ${b.lateDays} dia${b.lateDays>1?'s':''}).`); } }); if (any){ lines.forEach(l=>logDay(l)); } }
function logDay(text){ if(!state.calendarLog[state.day]) state.calendarLog[state.day]=[]; state.calendarLog[state.day].push(text); }
function renderCalendar(){ const list=$('#calendarList'); if(!list) return; list.innerHTML=''; const days=Object.keys(state.calendarLog).map(Number).sort((a,b)=>a-b); if(!days.length){ list.innerHTML='<p class="small">Sem registros ainda.</p>'; return; } days.forEach(d=>{ const div=document.createElement('div'); div.className='card thin'; const items=state.calendarLog[d].map(i=>`<li>${i}</li>`).join(''); div.innerHTML=`<strong>Dia ${d}</strong><ul>${items}</ul>`; list.appendChild(div); }); }
function work(type){ if(state.shiftsToday>=state.maxShiftsPerDay){ flash('Limite de turnos alcançado hoje.','warn'); return;} const prevHum=state.energia; if(type==='freela'){ state.money+=100; state.energia=clamp(state.energia-1,0,10); logDay('Fez um freela rápido. (+R$ 100, -1 Humor)'); } else { state.money+=160; state.energia=clamp(state.energia-2,0,10); logDay('Fez um bico pesado. (+R$ 160, -2 Humor)'); } state.shiftsToday++; renderHUD(prevHum); save(); checkEnd(); }
function genJobForToday(){ const area=$('#jobArea'); if(!area) return; if(state.jobOpportunityLostToday){ area.innerHTML='<em>Você saiu hoje. A vaga do dia foi perdida.</em>'; return; } const jobs=[{name:'Teste de App',dm:+150,dh:-1,desc:'Avalie um aplicativo. Paga hoje.'},{name:'Aula Particular',dm:+120,dh:0,desc:'Ensine por 2h. Paga hoje.'},{name:'Entrega Expressa',dm:+140,dh:-2,desc:'Entregas rápidas. Paga hoje.'},{name:'Design de Flyer',dm:+110,dh:-1,desc:'Crie um flyer simples. Paga hoje.'}]; const j=jobs[Math.floor(Math.random()*jobs.length)]; area.innerHTML=`<strong>${j.name}</strong><br>${j.desc}<br>Pagamento: <strong>${brl(j.dm)}</strong> — Humor: ${j.dh>=0?'+':''}${j.dh}<div style="margin-top:8px;"><button class="btn small" id="btnAcceptJob">Aceitar</button></div>`; const btn=$('#btnAcceptJob'); if(btn) btn.onclick=()=>{ if(state.jobTakenToday){ flash('Você já aceitou uma vaga hoje.','warn'); return;} if(state.jobOpportunityLostToday){ flash('Vaga indisponível hoje.','warn'); return;} const prevHum=state.energia; state.money+=j.dm; state.energia=clamp(state.energia+j.dh,0,10); state.jobTakenToday=true; logDay(`Vaga: ${j.name} (${brl(j.dm)}, Humor ${j.dh>=0?'+':''}${j.dh}).`); renderHUD(prevHum); area.innerHTML='<em>Vaga de hoje concluída.</em>'; save(); checkEnd(); } }

// ===== Next Day / Coffee =====
function nextDay(){ const from=state.day, to=state.day+1; const dt=$('#dayTrans'), txt=$('#dtText'); if(dt&&txt){ txt.textContent=`Dia ${from} → Dia ${to}`; dt.classList.remove('hidden'); sfxDay(); }
  setTimeout(()=>{ if(dt) dt.classList.add('hidden'); state.day = to; applyOverduesOnNewDay(); state.shiftsToday=0; state.jobTakenToday=false; state.jobOpportunityLostToday=false; state.dayEvents=[]; state.eventsCompleted=0; if (state.day>state.monthDays){ if (state.energia===10 && state.money>0){ showOverlay('🎉 Vitória!',`Você finalizou o mês com Humor 10 e Dinheiro positivo (${brl(state.money)}).`);} else { showOverlay('⏳ Fim do Mês',`Mês encerrado, mas objetivo não alcançado. Humor: ${state.energia}/10 • Dinheiro: ${brl(state.money)}.`);} save(); return; } startOfDay(); renderHUD(); save(); checkEnd(); }, 820);
}
function drinkCoffee(){ const prevHum=state.energia; if (state.day - state.lastCoffeeDay < state.coffeeCooldown){ const wait = state.coffeeCooldown - (state.day - state.lastCoffeeDay); flash(`Café indisponível. Tente novamente em ${wait} dia(s).`,'warn'); return; } if (state.energia>=10){ flash('Seu humor já está no máximo.','warn'); return; } state.energia=clamp(state.energia+1,0,10); state.lastCoffeeDay=state.day; logDay('Tomou um café (+1 Humor).'); renderHUD(prevHum); save(); }

// ===== HUD/Save/End =====
function renderHUD(prevHumorValue=null){ $('#day').textContent=state.day; $('#monthDays').textContent=state.monthDays; qAny('#energia','#humor').textContent=state.energia; const moneyEl=$('#money'); if(moneyEl){ moneyEl.textContent=brl(state.money); moneyEl.classList.toggle('money-neg', state.money<0); moneyEl.classList.toggle('money-pos', state.money>0); } const hb=qAny('#energiaBar','#humorBar'); hb.innerHTML=''; for(let i=0;i<10;i++){ const s=document.createElement('span'); s.className='heart'+(i<state.energia?' on':''); hb.appendChild(s);} if(prevHumorValue!==null){ const diff=state.energia - prevHumorValue; if(diff!==0){ const dir=diff>0?1:-1; for(let k=0;k<Math.abs(diff);k++){ const idx = dir>0 ? prevHumorValue+k : prevHumorValue-1-k; const child = hb.children[idx]; if(child) child.classList.add('bump'); } } } $('#shiftsToday').textContent=state.shiftsToday; $('#maxShiftsTop').textContent=state.maxShiftsPerDay; const wi=$('#workInfo'); if(wi) wi.textContent=`Turnos hoje: ${state.shiftsToday}/${state.maxShiftsPerDay}`; const mx=$('#maxShifts'); if(mx) mx.textContent=state.maxShiftsPerDay; const ec=$('#eventsChip'); if(ec) ec.textContent=`${state.eventsCompleted}/${state.dayEvents.length||3}`; const bS=$('#btnSound'); if(bS){ bS.textContent = (state.ui?.soundEnabled? '🔊 Som' : '🔇 Som off'); } }
function flash(msg,type='info'){ const box=$('#messages'); if(!box) return; box.textContent=msg; box.style.color=(type==='error'?'var(--danger)':type==='warn'?'var(--warn)':'var(--muted)'); setTimeout(()=>{ if(box.textContent===msg) box.textContent=''; },3000); }
function save(){ try{ localStorage.setItem('sv_fim_mes_state', JSON.stringify(state)); }catch(e){} }
function load(){ try{ const s=localStorage.getItem('sv_fim_mes_state'); state = s? JSON.parse(s) : JSON.parse(JSON.stringify(DEFAULT_STATE)); }catch{ state=JSON.parse(JSON.stringify(DEFAULT_STATE)); } migrateState(); }
function newGame(){ state=JSON.parse(JSON.stringify(DEFAULT_STATE)); save(); ensureDayStarted(); renderAll(); }
function showOverlay(title,message){ $('#overlayTitle').textContent=title; $('#overlayMessage').textContent=message; $('#overlay').classList.remove('hidden'); }
function hideOverlay(){ $('#overlay').classList.add('hidden'); }
function autoRestartLoss(){ setTimeout(()=>{ hideOverlay(); newGame(); }, 1800); }
function checkEnd(){ if(state.energia<=0){ showOverlay('💤 Desmotivação','Seu humor chegou a 0. Reiniciando o jogo...'); autoRestartLoss(); } else if(state.money<=-500){ showOverlay('💸 Falência','Seu dinheiro atingiu R$ -500. Reiniciando o jogo...'); autoRestartLoss(); } }

function renderAll(){ renderHUD(); renderEvents(); renderBills(); renderBillsSide(); renderCalendar(); bindBillFilters(); }
function bindBillFilters(){ $$('.bill-filters [data-filter]').forEach(btn=>{ btn.addEventListener('click',()=>{ $$('.bill-filters .chip').forEach(c=>c.classList.remove('active')); btn.classList.add('active'); if(!state.ui) state.ui={billFilter:'all', soundEnabled:true}; state.ui.billFilter=btn.getAttribute('data-filter'); renderBillsSide(); save(); }); }); }
function openModal(sel){ const el=$(sel); if(el) el.classList.remove('hidden'); }
function closeModal(sel){ const el=$(sel); if(el) el.classList.add('hidden'); }
function ensureDayStarted(){ if(!Array.isArray(state.dayEvents) || state.dayEvents.length===0){ startOfDay(); } else { genJobForToday(); renderBills(); renderBillsSide(); renderEvents(); } renderHUD(); }
function initUI(){ renderAll(); ensureDayStarted(); }
function initEvents(){ $$('[data-close]').forEach(btn=>btn.addEventListener('click',e=>closeModal(e.currentTarget.getAttribute('data-close')))); $$('.tabs .tab').forEach(tab=>tab.addEventListener('click',e=>{ $$('.tabs .tab').forEach(t=>t.classList.remove('active')); e.currentTarget.classList.add('active'); const id=e.currentTarget.getAttribute('data-tab'); $$('.tab-pane').forEach(p=>p.classList.remove('active')); const pane=document.getElementById(id); if(pane) pane.classList.add('active'); })); const wf=$('#btnWorkFreela'); if(wf) wf.addEventListener('click',()=>work('freela')); const wb=$('#btnWorkBico'); if(wb) wb.addEventListener('click',()=>work('bico')); const ng=$('#btnNewGame'); if(ng) ng.addEventListener('click', newGame); const br=$('#btnRestart'); if(br) br.addEventListener('click', ()=>{ hideOverlay(); newGame(); }); const or=$('#btnOpenRules'); if(or) or.addEventListener('click',()=>openModal('#modalRules')); const bs=$('#btnSound'); if(bs) bs.addEventListener('click',()=>{ state.ui.soundEnabled = !state.ui.soundEnabled; renderHUD(); save(); }); const td=$('#tileDay'); if(td) td.addEventListener('click',()=>{ renderCalendar(); openModal('#modalCalendar'); }); requestAnimationFrame(loop); }

function boot(){ load(); initUI(); initEvents(); }
window.addEventListener('load', boot);
