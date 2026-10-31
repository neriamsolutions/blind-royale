(function(){
"use strict";
// Nombre de la app: cambiarlo aquí (y en manifest.webmanifest) lo cambia en todas partes.
// El logo usa la primera palabra en la fuente de bloque y el resto en script neón.
const APP_NAME="Blind Royale";
(()=>{const [a,...b]=APP_NAME.split(" ");document.title=APP_NAME;
  document.querySelectorAll("[data-app]").forEach(el=>el.textContent=el.dataset.app==="wm-a"?a.toUpperCase():el.dataset.app==="wm-b"?b.join(" "):APP_NAME);})();
const KEY_CFG="hgclock.cfg.v1", KEY_ST="hgclock.state.v1", KEY_FAV="hgclock.fav.v1";
const $=id=>document.getElementById(id);
const fmt=n=>Math.round(n).toLocaleString("en-US");

// Escalera de ciegas pensada para 10,000 fichas con fichas de 25/100/500/1000.
const LADDER=[[25,50,0],[50,100,0],[100,200,0],[150,300,0],"B",[200,400,400],[300,600,600],[400,800,800],"B",[600,1200,1200],[800,1600,1600],[1000,2000,2000],[1500,3000,3000],[2000,4000,4000],[3000,6000,6000],[4000,8000,8000],[6000,12000,12000]];
function buildLevels(min,breakMin){
  return LADDER.map(r=>r==="B"?{t:"B",min:breakMin}:{t:"L",sb:r[0],bb:r[1],ante:r[2],min});
}
let FAV=null;
const PRESETS={fav:()=>JSON.parse(JSON.stringify(FAV.levels)),std:()=>buildLevels(20,10),noante:()=>buildLevels(20,10).map(L=>L.t==="L"?{...L,ante:0}:L),turbo:()=>buildLevels(15,10),slow:()=>buildLevels(25,15)};
function defaults(){
  return {name:"Home Game",cur:"$",buyin:20,stack:10000,
    rebuyOn:true,rebuyCost:20,rebuyStack:10000,rebuyUntil:4,
    addonOn:false,addonCost:20,addonStack:10000,
    payouts:[50,30,20],
    chips:[{v:25,n:8,c:"#e9e4d6"},{v:100,n:8,c:"#c8423a"},{v:500,n:6,c:"#3d7ed1"},{v:1000,n:6,c:"#1f1f22"}],
    levels:FAV?PRESETS.fav():PRESETS.noante(),sound:true,voice:false,anteMig:true};
}
function freshState(){return {idx:0,running:false,endAt:0,remaining:null,entries:8,remaining_p:8,rebuys:0,addons:0,elapsedMs:0,lastTick:0,players:[],dealer:-1};}

function load(k){try{const s=localStorage.getItem(k);return s?JSON.parse(s):null}catch(e){return null}}
function save(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
// Versión del esquema de datos guardados. Si un cambio futuro altera la forma de cfg/st/historial,
// sube SCHEMA_V y agrega el paso en migrate(): corre antes de leer nada y también sobre respaldos importados.
const SCHEMA_V=1, KEY_SCHEMA="hgclock.schema";
function migrate(from){/* v1 es la primera versión: no hay pasos todavía. Ej.: if(from<2){…} */}
(()=>{let v=0;try{v=+localStorage.getItem(KEY_SCHEMA)||0}catch(e){} if(v<SCHEMA_V){migrate(v);try{localStorage.setItem(KEY_SCHEMA,String(SCHEMA_V))}catch(e){}}})();
FAV=load(KEY_FAV); if(!FAV||!Array.isArray(FAV.levels)||!FAV.levels.length) FAV=null;
const rawCfg=load(KEY_CFG);
let cfg=Object.assign(defaults(),rawCfg||{});
let st=Object.assign(freshState(),load(KEY_ST)||{});
if(!Array.isArray(cfg.levels)||!cfg.levels.length) cfg.levels=PRESETS.noante();
// v27: la estructura principal pasa a ser sin ante; si la tabla guardada es la estándar sin cambios, se le quitan los antes una sola vez
if(rawCfg&&!rawCfg.anteMig){cfg.anteMig=true;
  if(cfg.levels.length===LADDER.length&&cfg.levels.every((L,i)=>LADDER[i]==="B"?L.t==="B":L.t==="L"&&+L.sb===LADDER[i][0]&&+L.bb===LADDER[i][1]&&+L.ante===LADDER[i][2]))
    cfg.levels=cfg.levels.map(L=>L.t==="L"?{...L,ante:0}:L);
  save(KEY_CFG,cfg);}
if(!Array.isArray(st.players)) st.players=[];
if(!cfg.name||/martes/i.test(cfg.name)) cfg.name="Home Game";
const saveCfg=()=>save(KEY_CFG,cfg), saveSt=()=>save(KEY_ST,st);

// ---------- Sonido ----------
let ac=null;
function audio(){ if(!ac){try{ac=new (window.AudioContext||window.webkitAudioContext)()}catch(e){}} if(ac&&ac.state==="suspended") ac.resume(); return ac; }
function tone(freq,start,dur,vol){
  const a=audio(); if(!a) return;
  const o=a.createOscillator(), g=a.createGain(), t=a.currentTime+start;
  o.type="sine"; o.frequency.value=freq;
  g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(vol||0.4,t+0.02); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t+dur+0.05);
}
// Identidad sonora de la app: fichas de cerámica + un piano eléctrico de lounge.
// El motivo de la marca es La–Do#–Mi–La (sube como una apuesta que crece).
const NOTE={A3:220,E4:329.6,A4:440,Cs5:554.4,E5:659.3,A5:880,Gs4:415.3,B4:493.9,D5:587.3,Fs5:740,Cs6:1108.7};
let noiseBuf=null;
function getNoise(a){ if(noiseBuf) return noiseBuf; const len=Math.floor(a.sampleRate*0.05); noiseBuf=a.createBuffer(1,len,a.sampleRate); const d=noiseBuf.getChannelData(0); for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/len,4); return noiseBuf; }
function clack(start,vol){
  // Ficha contra ficha: ruido brillante + un "tink" corto
  const a=audio(); if(!a) return; const t=a.currentTime+start, v=vol||0.5;
  const src=a.createBufferSource(), bp=a.createBiquadFilter(), g=a.createGain();
  src.buffer=getNoise(a); bp.type="bandpass"; bp.frequency.value=3200+Math.random()*900; bp.Q.value=2.5;
  g.gain.setValueAtTime(v,t); g.gain.exponentialRampToValueAtTime(0.0001,t+0.07);
  src.connect(bp).connect(g).connect(a.destination); src.start(t);
  const o=a.createOscillator(), g2=a.createGain(); o.type="sine"; o.frequency.value=2300+Math.random()*700;
  g2.gain.setValueAtTime(v*0.35,t); g2.gain.exponentialRampToValueAtTime(0.0001,t+0.05);
  o.connect(g2).connect(a.destination); o.start(t); o.stop(t+0.08);
}
function chipRiffle(start,n,gap){ for(let i=0;i<n;i++) clack(start+i*gap*(1-i*0.04),0.45+Math.random()*0.15); }
function ep(freq,start,dur,vol){
  // Piano eléctrico: fundamental + armónico con campana suave
  const a=audio(); if(!a) return; const t=a.currentTime+start, v=vol||0.3;
  const out=a.createGain(); out.gain.setValueAtTime(0.0001,t); out.gain.exponentialRampToValueAtTime(v,t+0.012); out.gain.exponentialRampToValueAtTime(v*0.35,t+0.25); out.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  const lp=a.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=3200; out.connect(lp).connect(a.destination);
  [[1,1,"sine"],[2,0.28,"sine"],[1.003,0.5,"triangle"],[3.5,0.06,"sine"]].forEach(([m,g0,type])=>{
    const o=a.createOscillator(), g=a.createGain(); o.type=type; o.frequency.value=freq*m; g.gain.value=g0; o.connect(g).connect(out); o.start(t); o.stop(t+dur+0.05);
  });
}
function boom(start,vol){
  const a=audio(); if(!a) return; const t=a.currentTime+start, o=a.createOscillator(), g=a.createGain();
  o.type="sine"; o.frequency.setValueAtTime(140,t); o.frequency.exponentialRampToValueAtTime(38,t+0.6);
  g.gain.setValueAtTime(vol||0.9,t); g.gain.exponentialRampToValueAtTime(0.0001,t+0.9);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t+1);
  const src=a.createBufferSource(), lp=a.createBiquadFilter(), g2=a.createGain(); src.buffer=getNoise(a); lp.type="lowpass"; lp.frequency.value=900;
  g2.gain.setValueAtTime(0.6,t); g2.gain.exponentialRampToValueAtTime(0.0001,t+0.3); src.connect(lp).connect(g2).connect(a.destination); src.start(t);
}
function brass(freqs,start,dur,vol){
  const a=audio(); if(!a) return; const t=a.currentTime+start, v=(vol||0.16)/Math.sqrt(freqs.length);
  freqs.forEach(f=>[-6,6].forEach(det=>{
    const o=a.createOscillator(), lp=a.createBiquadFilter(), g=a.createGain();
    o.type="sawtooth"; o.frequency.value=f; o.detune.value=det;
    lp.type="lowpass"; lp.frequency.setValueAtTime(500,t); lp.frequency.linearRampToValueAtTime(2600,t+0.12); lp.frequency.linearRampToValueAtTime(1400,t+dur);
    g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(v,t+0.05); g.gain.setValueAtTime(v,t+dur*0.7); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(lp).connect(g).connect(a.destination); o.start(t); o.stop(t+dur+0.05);
  }));
}
function motif(start,vol){ [NOTE.A4,NOTE.Cs5,NOTE.E5].forEach((f,i)=>ep(f,start+i*0.12,0.7,vol)); ep(NOTE.A5,start+0.36,1.6,vol); ep(NOTE.A3,start+0.36,1.6,(vol||0.3)*0.6); }
function chimeLevel(){
  if(!cfg.sound) return;
  const L=cfg.levels[st.idx];
  if(L&&L.t==="B"){ // break: el motivo baja, relajado
    chipRiffle(0,3,0.09); [NOTE.E5,NOTE.Cs5,NOTE.A4].forEach((f,i)=>ep(f,0.3+i*0.2,1.0,0.26)); ep(NOTE.E4,0.9,2.0,0.2); return;
  }
  chipRiffle(0,6,0.055); motif(0.38,0.3);
}
function chimeWarn(){ if(!cfg.sound) return; clack(0,0.55); clack(0.12,0.55); ep(NOTE.E4,0.25,0.5,0.3); ep(NOTE.E4,0.6,0.8,0.3); }
function say(text,queue){
  if(!cfg.voice||!("speechSynthesis" in window)) return;
  try{const u=new SpeechSynthesisUtterance(text);u.lang=LANG==="en"?"en-US":"es-MX";u.rate=0.95;if(!queue)speechSynthesis.cancel();speechSynthesis.speak(u)}catch(e){}
}
function announce(){
  const L=cfg.levels[st.idx]; if(!L) return;
  const en=LANG==="en";
  if(L.t==="B") say(en?L.min+" minute break.":"Break de "+L.min+" minutos.");
  else say(en?"Level "+levelNumber(st.idx)+". Blinds "+L.sb+" and "+L.bb+(L.ante?", with an ante of "+L.ante:"")+".":"Nivel "+levelNumber(st.idx)+". Ciegas "+L.sb+" y "+L.bb+(L.ante?", con ante de "+L.ante:"")+".");
}

// ---------- Utilidades de estructura ----------
function levelNumber(i){let n=0;for(let k=0;k<=i&&k<cfg.levels.length;k++) if(cfg.levels[k].t==="L") n++;return n;}
function durMs(i){const L=cfg.levels[i];return Math.max(1,+L.min||1)*60000;}
function remainingMs(){
  if(st.remaining==null) st.remaining=durMs(st.idx);
  return st.running? Math.max(0,st.endAt-Date.now()) : st.remaining;
}
function mmss(ms){const s=Math.ceil(ms/1000);const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),x=s%60;return (h?h+":"+String(m).padStart(2,"0"):m)+":"+String(x).padStart(2,"0");}
function hmm(ms){const m=Math.floor(ms/60000);return Math.floor(m/60)+":"+String(m%60).padStart(2,"0");}
function startOffsets(){let t=0;return cfg.levels.map(L=>{const s=t;t+=(+L.min||0)*60000;return s;});}

// ---------- Control del reloj ----------
let warned=false;
function goTo(i,{sound=true,keepRunning=true}={}){
  if(i<0||i>=cfg.levels.length) return;
  const wasRunning=st.running&&keepRunning;
  st.idx=i; st.remaining=durMs(i); warned=false;
  if(wasRunning){st.endAt=Date.now()+st.remaining;} else st.running=false;
  saveSt(); render(); renderStructure();
  if(sound){chimeLevel(); announce(); levelUp();}
}
function play(){ audio(); if(st.remaining==null) st.remaining=durMs(st.idx); st.endAt=Date.now()+st.remaining; st.running=true; st.lastTick=Date.now(); saveSt(); render(); requestWake(); }
function pause(){ st.remaining=remainingMs(); st.running=false; saveSt(); render(); }
function adjust(ms){
  if(st.running){st.endAt+=ms; if(st.endAt<Date.now()) st.endAt=Date.now();}
  else st.remaining=Math.max(0,remainingMs()+ms);
  warned=remainingMs()<=60000; saveSt(); render();
}

function tick(){
  const now=Date.now();
  if(st.running){
    if(st.lastTick) st.elapsedMs+=Math.min(now-st.lastTick,5000);
    st.lastTick=now;
    let rem=st.endAt-now;
    if(rem<=60000&&rem>0&&!warned&&durMs(st.idx)>90000){warned=true;chimeWarn();}
    if(rem<=0){
      // Avanza (también recupera si la pantalla estuvo dormida varios niveles)
      let over=-rem;
      while(st.idx<cfg.levels.length-1){
        st.idx++;
        const d=durMs(st.idx);
        if(over<d){st.endAt=now+(d-over);break;}
        over-=d;
      }
      if(st.idx>=cfg.levels.length-1&&st.endAt<=now){st.running=false;st.remaining=0;}
      warned=false; saveSt(); render(); renderStructure(); chimeLevel(); announce(); levelUp();
    }
    if(now-(tick.lastSave||0)>5000){tick.lastSave=now;saveSt();}
  } else st.lastTick=0;
  renderClock();
}

// ---------- Render ----------
function cur(){return cfg.cur||"$";}
function poolTotal(){return st.entries*cfg.buyin+(cfg.rebuyOn?st.rebuys*cfg.rebuyCost:0)+(cfg.addonOn?st.addons*cfg.addonCost:0);}
function chipsTotal(){return st.entries*cfg.stack+(cfg.rebuyOn?st.rebuys*cfg.rebuyStack:0)+(cfg.addonOn?st.addons*cfg.addonStack:0);}

function renderClock(){
  const L=cfg.levels[st.idx]; if(!L) return;
  const rem=remainingMs(), d=durMs(st.idx);
  $("timer").textContent=mmss(rem);
  const pct=Math.min(100,Math.max(0,100*(1-rem/d)));
  $("bar").style.width=pct.toFixed(2)+"%"; $("dealer").style.left=pct.toFixed(2)+"%";
  $("stage").classList.toggle("warn",st.running&&rem<=60000&&L.t==="L");
  $("pausedTag").hidden=st.running;
  $("btnPlay").textContent=st.running?"Pausar":(rem<d?"Continuar":"Iniciar");
  $("sElapsed").textContent=hmm(st.elapsedMs);
  // próximo break
  let t=rem, found=false;
  for(let k=st.idx+1;k<cfg.levels.length;k++){ if(cfg.levels[k].t==="B"){found=true;break;} t+=durMs(k); }
  $("sBreak").textContent=L.t==="B"?"Ahora":(found?mmss(t):"—");
}
function render(){
  const L=cfg.levels[st.idx];
  $("tName").textContent=cfg.name||"Home Game";
  renderCard();
  const isB=L.t==="B";
  $("stage").classList.toggle("is-break",isB);
  $("lvlLabel").textContent=isB?"Descanso":"Nivel";
  $("lvlNum").textContent=isB?"Break":levelNumber(st.idx)+" de "+cfg.levels.filter(x=>x.t==="L").length;
  $("blindsLabel").textContent=isB?"Al regresar":"Ciegas";
  let shown=L;
  if(isB){ for(let k=st.idx+1;k<cfg.levels.length;k++) if(cfg.levels[k].t==="L"){shown=cfg.levels[k];break;} }
  $("blinds").innerHTML=shown.t==="L"?chipHTML(shown.sb)+'<span class="sep">/</span>'+chipHTML(shown.bb):"—";
  $("ante").textContent=shown.t==="L"&&+shown.ante?"Ante de ciega grande: "+fmt(shown.ante):"";
  // siguiente
  const N=cfg.levels[st.idx+1];
  let nx="Último nivel de la estructura";
  if(N) nx=N.t==="B"?"Después: <b>break de "+N.min+" min</b>":"Siguiente: <b>"+fmt(N.sb)+" / "+fmt(N.bb)+(+N.ante?" · ante "+fmt(N.ante):"")+"</b>";
  if(isB){
    const notes=[];
    if(cfg.addonOn&&st.idx===cfg.levels.findIndex(x=>x.t==="B")) notes.push("Momento del add-on");
    const idxBefore=levelNumber(st.idx);
    if(cfg.rebuyOn&&idxBefore<=cfg.rebuyUntil&&idxBefore>0) notes.push("Recompras abiertas");
    if(notes.length) nx+=" · "+notes.join(" · ");
  }
  $("next").innerHTML=nx;
  // jugadores
  $("cEntries").textContent=st.entries; $("cRemaining").textContent=st.remaining_p;
  $("cRebuys").textContent=st.rebuys; $("cAddons").textContent=st.addons;
  $("rowRebuys").hidden=!cfg.rebuyOn; $("rowAddons").hidden=!cfg.addonOn;
  const lvlNow=levelNumber(st.idx);
  $("rebuyHint").textContent=lvlNow<=cfg.rebuyUntil?("Sugeridas hasta el nivel "+cfg.rebuyUntil):"Pasó el nivel "+cfg.rebuyUntil+": la mesa decide";
  $("sPlayers").textContent=st.remaining_p+" / "+st.entries;
  const avg=st.remaining_p>0?chipsTotal()/st.remaining_p:0;
  $("sAvg").textContent=fmt(avg);
  $("sPool").textContent=cur()+fmt(poolTotal());
  $("sBB").textContent=shown.t==="L"&&shown.bb?fmt(avg/shown.bb)+" BB":"—";
  // premios
  const pool=poolTotal(), ps=cfg.payouts||[];
  const ord=["1.º","2.º","3.º","4.º","5.º","6.º","7.º","8.º","9.º","10.º"];
  $("payouts").innerHTML=ps.map((p,i)=>"<li><span>"+(ord[i]||(i+1)+".º")+" · "+p+"%</span><span>"+cur()+fmt(pool*p/100)+"</span></li>").join("")||"<li><span>Sin reparto configurado</span><span></span></li>";
  // próximos
  const up=[];
  for(let k=st.idx+1;k<cfg.levels.length&&up.length<4;k++){
    const X=cfg.levels[k];
    up.push(X.t==="B"?'<li class="brk"><span>Break</span><span>'+X.min+" min</span></li>":"<li><span>Nivel "+levelNumber(k)+"</span><span>"+fmt(X.sb)+" / "+fmt(X.bb)+(+X.ante?" ("+fmt(X.ante)+")":"")+"</span></li>");
  }
  if(!$("view-table").hidden) renderTable();
  renderChipLegend();
  $("upcoming").innerHTML=up.join("")||"<li><span>No hay más niveles</span><span></span></li>";
  renderClock();
}

// ---------- Mesas ----------
// Asiento global: mesa 1 = 0..9, mesa 2 = 10..19. Asiento -1 = eliminado sin lugar en la mesa.
let selSeat=null, curTable=0;
const PER=10, TABLES=2;
const tOf=seat=>Math.floor(seat/PER);
function activeAt(t){return st.players.filter(p=>!p.out&&p.seat>=0&&tOf(p.seat)===t);}
function occupant(seat){return st.players.find(q=>q.seat===seat&&!q.out)||lastOutAt(seat);}
function lastOutAt(seat){const o=st.players.filter(p=>p.seat===seat&&p.out);return o[o.length-1];}
function tablesInUse(){return st.players.some(p=>p.seat>=PER)?2:1;}
function seatCount(t){
  const here=st.players.filter(p=>p.seat>=0&&tOf(p.seat)===t);
  const used=here.reduce((m,p)=>Math.max(m,p.seat%PER+1),0);
  return Math.min(PER,Math.max(8,used,activeAt(t).length+1));
}
function freeSeatIn(t){
  const n=seatCount(t);
  for(let k=0;k<PER;k++){const g=t*PER+k;if(!st.players.some(p=>p.seat===g)&&k<n) return g;}
  for(let k=0;k<PER;k++){const g=t*PER+k;if(!st.players.some(p=>p.seat===g&&!p.out)) return g;}
  return -1;
}
function pickTable(){
  const a0=activeAt(0).length,a1=activeAt(1).length;
  if(tablesInUse()===1&&a0<PER) return 0;
  return a1<a0?1:0;
}
function initials(n){return n.trim().split(/\s+/).map(w=>w[0]).join("").slice(0,2).toUpperCase()||"?";}
function freshGame(){return st.idx===0&&!st.elapsedMs&&!st.rebuys&&!st.addons;}
function dealers(){if(typeof st.dealers!=="object"||!st.dealers){st.dealers={0:typeof st.dealer==="number"?st.dealer:-1,1:-1};}return st.dealers;}
function addPlayer(name,seat){
  name=(name||"").trim(); if(!name) return false;
  if(seat==null||seat<0||st.players.some(p=>p.seat===seat&&!p.out)) seat=freeSeatIn(pickTable());
  if(seat<0) return false;
  if(!st.players.length){st.entries=0;st.remaining_p=0;st.rebuys=0;}
  st.players.push({id:Date.now()+Math.random(),name,seat,out:false,place:null,rebuys:0});
  st.entries++; st.remaining_p++;
  const d=dealers(), t=tOf(seat); if(d[t]==null||d[t]<0) d[t]=seat;
  curTable=t; saveSt(); return true;
}
function eliminate(p){p.out=true;p.outMs=st.elapsedMs;if(p.firstOutMs==null)p.firstOutMs=st.elapsedMs;p.place=st.remaining_p;st.remaining_p=Math.max(0,st.remaining_p-1);if(dealers()[tOf(p.seat)]===p.seat)moveDealer(tOf(p.seat));saveSt();if(st.players.length>=2&&st.players.filter(q=>!q.out).length===1)setTimeout(champion,350);}
function rebuy(p){
  if(st.players.some(q=>q.seat===p.seat&&!q.out)) p.seat=freeSeatIn(pickTable());
  if(p.seat<0) p.seat=freeSeatIn(pickTable());
  p.out=false;p.place=null;p.rebuys++;st.rebuys++;st.remaining_p++;saveSt();
}
function undoOut(p){delete p.outMs;if(!p.rebuys)delete p.firstOutMs;if(p.seat<0||st.players.some(q=>q.seat===p.seat&&!q.out))p.seat=freeSeatIn(pickTable());p.out=false;p.place=null;st.remaining_p++;saveSt();}
function removeP(p){st.players=st.players.filter(x=>x!==p);st.entries=Math.max(0,st.entries-1);if(!p.out)st.remaining_p=Math.max(0,st.remaining_p-1);st.rebuys=Math.max(0,st.rebuys-p.rebuys);st.addons=Math.max(0,st.addons-(p.addons||0));selSeat=null;saveSt();}
function moveDealer(t){const d=dealers();const act=activeAt(t).map(p=>p.seat).sort((a,b)=>a-b);if(!act.length){d[t]=-1;return;}d[t]=act.find(k=>k>d[t])??act[0];saveSt();}
function moveTo(p,t){
  // Sienta al jugador en la otra mesa, en el asiento libre más bajo
  const g=freeSeatIn(t); if(g<0) return false;
  const from=tOf(p.seat), d=dealers();
  st.players.filter(q=>q.out&&q.seat===g).forEach(q=>q.seat=-1);
  if(d[from]===p.seat) moveDealer(from);
  p.seat=g; if(d[t]==null||d[t]<0) d[t]=g; saveSt(); return true;
}
function mergeTables(){
  // Mesa final: todos a la mesa 1
  const movers=activeAt(1); const d=dealers();
  for(const p of movers){const g=freeSeatIn(0); if(g<0) break; st.players.filter(q=>q.out&&q.seat===g).forEach(q=>q.seat=-1); p.seat=g;}
  st.players.filter(q=>q.out&&q.seat>=PER).forEach(q=>q.seat=-1);
  d[1]=-1; if(d[0]<0&&activeAt(0).length) d[0]=activeAt(0)[0].seat;
  curTable=0; selSeat=null; saveSt();
}
function balanceInfo(){
  if(tablesInUse()<2) return null;
  const a0=activeAt(0).length,a1=activeAt(1).length;
  if(a0+a1<=PER) return {kind:"merge",text:"Quedan "+(a0+a1)+" jugadores: ya caben todos en una mesa.",btn:"Juntar en mesa final"};
  if(Math.abs(a0-a1)>=2){const big=a0>a1?0:1;return {kind:"balance",from:big,to:1-big,text:"Mesa "+(big+1)+" tiene "+Math.max(a0,a1)+" y mesa "+(2-big)+" tiene "+Math.min(a0,a1)+". Mueve a un jugador para equilibrar.",btn:"Mover a alguien de mesa "+(big+1)};}
  return null;
}
function balanceOnce(info){
  // Mueve al jugador que va a pagar la ciega grande pronto: el segundo a la izquierda del botón
  const act=activeAt(info.from).map(p=>p.seat).sort((a,b)=>a-b), d=dealers()[info.from];
  let i=act.findIndex(k=>k>d); if(i<0) i=0; const seat=act[(i+1)%act.length];
  const p=st.players.find(q=>q.seat===seat&&!q.out);
  if(p&&moveTo(p,info.to)){curTable=info.to;selSeat=p.seat;}
}
function renderTable(){
  renderDeal();
  const n2=tablesInUse(); if(curTable>=n2) curTable=0;
  const t=curTable, n=seatCount(t), box=$("ptable"), d=dealers();
  // selector de mesa
  $("tblSwitch").hidden=n2<2;
  $("tblSwitch").innerHTML=n2<2?"":[0,1].map(k=>'<button type="button" data-t="'+k+'" aria-pressed="'+(k===t)+'">Mesa '+(k+1)+'<b>'+activeAt(k).length+'</b></button>').join("");
  const info=balanceInfo();
  $("tblAlert").hidden=!info;
  if(info){$("tblAlertText").textContent=info.text;$("tblAlertBtn").textContent=info.btn;}
  box.querySelectorAll(".seat").forEach(e=>e.remove());
  for(let k=0;k<n;k++){
    const g=t*PER+k, a=Math.PI/2+k*2*Math.PI/n;
    const x=50+50*Math.cos(a), y=50+51*Math.sin(a);
    const p=occupant(g);
    const b=document.createElement("button"); b.type="button";
    b.className="seat "+(p?(p.out?"out":"active"):"empty")+(selSeat===g?" sel":"");
    b.style.left=x+"%"; b.style.top=y+"%"; b.dataset.seat=g;
    b.setAttribute("aria-label",p?(p.name+(p.out?", eliminado":"")):"Asiento "+(k+1)+" libre");
    b.innerHTML='<span class="av">'+(p?initials(p.name):"+")+(p&&!p.out&&d[t]===g?'<span class="db">D</span>':"")+'</span><span class="nm">'+(p?esc(p.name):"Asiento "+(k+1))+"</span>";
    box.appendChild(b);
  }
  const here=activeAt(t).length, out=st.players.filter(p=>p.out);
  $("tblCount").textContent=here+" jugando";
  $("tblSub").textContent=(n2>1?"Mesa "+(t+1)+" · "+st.remaining_p+" en total · ":"")+"Bote de premios "+cur()+fmt(poolTotal());
  // panel del jugador seleccionado
  const p=selSeat!=null?occupant(selSeat):null;
  $("selPanel").hidden=!p;
  if(p){
    $("selName").textContent=p.name;
    $("selMeta").textContent=(n2>1?"Mesa "+(tOf(p.seat)+1)+" · ":"")+"Asiento "+(p.seat%PER+1)+(p.rebuys?" · "+p.rebuys+" recompra"+(p.rebuys>1?"s":""):"")+(p.addons?" · Add-on":"")+(p.out?" · Eliminado en "+p.place+".º lugar":" · En juego");
    const rbOpen=cfg.rebuyOn;
    const other=1-tOf(p.seat), canMove=!p.out&&(n2>1||activeAt(0).length>=2)&&freeSeatIn(other)>=0;
    let h="";
    if(!p.out){h+='<button class="btn small danger" data-pa="out">Eliminar ('+st.remaining_p+'.º lugar)</button>';h+='<button class="btn small" data-pa="dealer">Darle el botón</button>';if(canMove)h+='<button class="btn small" data-pa="move">Pasar a mesa '+(other+1)+'</button>';if(cfg.addonOn)h+=p.addons?'<button class="btn small" data-pa="noaddon">Quitar add-on</button>':'<button class="btn small" data-pa="addon">Add-on ('+cur()+fmt(cfg.addonCost)+')</button>';}
    else{if(rbOpen)h+='<button class="btn small" data-pa="rebuy">Recompra ('+cur()+fmt(cfg.rebuyCost)+')</button>';h+='<button class="btn small" data-pa="undo">Deshacer eliminación</button>';}
    h+='<button class="btn small" data-pa="remove">Quitar de la mesa</button>';
    $("selActions").innerHTML=h;
  }
  const ord=[...out].sort((a,b)=>a.place-b.place);
  $("outList").innerHTML=ord.map(p=>"<li><span>"+p.place+".º</span><span>"+esc(p.name)+"</span></li>").join("")||"<li><span>Nadie todavía</span><span></span></li>";
  const full=activeAt(0).length>=PER&&activeAt(1).length>=PER;
  $("addHint").textContent=full?"Las dos mesas están llenas (20 asientos).":(n2<2&&activeAt(0).length>=PER?"La mesa 1 está llena: el siguiente abre la mesa 2.":"Se sienta en la mesa con menos jugadores y cuenta como una entrada.");
}
function esc(t){return String(t).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}

// Cada nivel es una carta; el break es el comodín.
let lastCard=-1;
function chipColor(v){
  const cs=[...cfg.chips].filter(c=>c.v>0).sort((a,b)=>a.v-b.v); let pick=cs[0];
  for(const c of cs) if(c.v<=v) pick=c;
  return pick?pick.c:"#c8423a";
}
function edgeFor(hex){const h=hex.replace("#","");const r=parseInt(h.substr(0,2),16),g=parseInt(h.substr(2,2),16),b=parseInt(h.substr(4,2),16);return (0.299*r+0.587*g+0.114*b)>160?"#2c4f8f":"#f6f0e0";}
function chipHTML(v){const c=chipColor(v);return '<span><i class="chip" style="--c:'+c+';--e:'+edgeFor(c)+'"></i>'+fmt(v)+'</span>';}
function renderCard(){
  const L=cfg.levels[st.idx], el=$("pcard");
  if(L.t==="B"){el.className="pcard joker";$("pcR1").innerHTML="★";$("pcR2").innerHTML="★";$("pcS").textContent="Break";}
  else{const n=levelNumber(st.idx), suits=["♠","♥","♣","♦"], s=suits[(n-1)%4];
    el.className="pcard"+(s==="♥"||s==="♦"?" red":"");
    $("pcR1").innerHTML=n+"<small>"+s+"</small>";$("pcR2").innerHTML=n+"<small>"+s+"</small>";$("pcS").textContent=s;}
  if(lastCard!==-1&&lastCard!==st.idx){void el.offsetWidth;el.classList.add("flip");}
  lastCard=st.idx;
}

// Leyenda de fichas y ranking de manos
const HANDS=[
 ["Escalera real","A♠ K♠ Q♠ J♠ 10♠"],["Escalera de color","9♥ 8♥ 7♥ 6♥ 5♥"],["Póker","Q♣ Q♦ Q♥ Q♠ 7♦"],["Full","K♠ K♥ K♦ 4♣ 4♠"],
 ["Color","A♦ J♦ 9♦ 6♦ 3♦"],["Escalera","8♣ 7♦ 6♠ 5♥ 4♣"],["Trío","7♠ 7♥ 7♣ K♦ 2♠"],["Doble par","J♥ J♣ 5♠ 5♦ A♣"],
 ["Par","10♠ 10♥ K♣ 8♦ 3♠"],["Carta alta","A♠ Q♦ 9♣ 6♥ 2♠"]];
const USED=[5,5,4,5,5,5,3,4,2,1];
function renderHands(){
  const html=HANDS.map((h,i)=>{
    const cards=h[1].split(" ").map((c,k)=>{const red=/[♥♦]/.test(c);return '<i class="'+(red?"r":"")+(k>=USED[i]?" dim":"")+'">'+c.replace("10","10")+'</i>';}).join("");
    return '<li><span class="hn">'+h[0]+'</span><span class="mc" aria-hidden="true">'+cards+'</span></li>';
  }).join("");
  document.querySelectorAll(".hands").forEach(e=>e.innerHTML=html);
}
function renderChipLegend(){
  const cs=[...cfg.chips].filter(c=>c.v>0).sort((a,b)=>a.v-b.v);
  $("chipLegend").innerHTML=cs.map(c=>'<li><i class="chip" style="--c:'+c.c+';--e:'+edgeFor(c.c)+'"></i>'+fmt(c.v)+'</li>').join("")||"<li>Configura tus fichas en Ajustes</li>";
}

function renderStructure(){
  renderFav();
  const offs=startOffsets();
  const rows=cfg.levels.map((L,i)=>{
    const cls=(L.t==="B"?"brk ":"")+(i===st.idx?"current":"");
    const num=L.t==="L"?levelNumber(i):"";
    const lvlCells=L.t==="L"
      ?'<td><input class="num" type="number" min="0" data-i="'+i+'" data-f="sb" value="'+L.sb+'" aria-label="Ciega chica"></td><td><input class="num" type="number" min="0" data-i="'+i+'" data-f="bb" value="'+L.bb+'" aria-label="Ciega grande"></td><td><input class="num" type="number" min="0" data-i="'+i+'" data-f="ante" value="'+(L.ante||0)+'" aria-label="Ante"></td>'
      :'<td colspan="3" style="color:var(--brass-2)">Descanso</td>';
    return '<tr class="'+cls+'"><td>'+num+'</td><td>'+(L.t==="L"?"Nivel":"Break")+'</td>'+lvlCells+
      '<td><input class="num" type="number" min="1" max="180" data-i="'+i+'" data-f="min" value="'+L.min+'" aria-label="Minutos"></td>'+
      '<td>'+hmm(offs[i])+'</td>'+
      '<td><span class="row-actions"><button class="icon-btn" data-act="go" data-i="'+i+'" title="Ir a este nivel">▶</button><button class="icon-btn" data-act="up" data-i="'+i+'" title="Subir">↑</button><button class="icon-btn" data-act="del" data-i="'+i+'" title="Eliminar">✕</button></span></td></tr>';
  });
  $("structBody").innerHTML=rows.join("");
  const total=cfg.levels.reduce((a,L)=>a+(+L.min||0),0);
  const nL=cfg.levels.filter(x=>x.t==="L").length, nB=cfg.levels.length-nL;
  // Estimación: el torneo suele terminar cuando la ciega grande ronda 1/20 de las fichas en juego
  const chips=chipsTotal();
  let est=null,t=0;
  for(const L of cfg.levels){ if(L.t==="L"&&L.bb>=chips/20){est=t;break;} t+=(+L.min||0)*60000; }
  $("structSummary").innerHTML="<b>"+nL+"</b> niveles y <b>"+nB+"</b> breaks, <b>"+hmm(total*60000)+" h</b> si se juega todo. Con "+fmt(chips)+" fichas en juego, lo normal es que el torneo termine alrededor de las <b>"+(est!=null?hmm(est)+" h":"—")+"</b> de juego.";
}

function renderSetup(){
  $("fName").value=cfg.name; $("fCur").value=cfg.cur; $("fBuyin").value=cfg.buyin; $("fStack").value=cfg.stack;
  $("fRebuyOn").checked=cfg.rebuyOn; $("fRebuyCost").value=cfg.rebuyCost; $("fRebuyStack").value=cfg.rebuyStack; $("fRebuyUntil").value=cfg.rebuyUntil;
  $("fAddonOn").checked=cfg.addonOn; $("fAddonCost").value=cfg.addonCost; $("fAddonStack").value=cfg.addonStack;
  $("fPayouts").value=(cfg.payouts||[]).join(", ");
  renderChips(); payHint();
}
function renderChips(){
  $("chipBody").innerHTML=cfg.chips.map((c,i)=>'<tr><td><input type="color" data-ci="'+i+'" data-cf="c" value="'+c.c+'" aria-label="Color" style="width:44px;height:34px;padding:2px;background:transparent;border:1px solid var(--line);border-radius:8px"></td><td><input class="num" type="number" min="1" data-ci="'+i+'" data-cf="v" value="'+c.v+'" aria-label="Valor"></td><td><input class="num" type="number" min="0" data-ci="'+i+'" data-cf="n" value="'+c.n+'" aria-label="Cantidad"></td><td><span class="chip-dot" style="background:'+c.c+'"></span>'+fmt(c.v*c.n)+'</td><td><button class="icon-btn" data-cdel="'+i+'" title="Eliminar">✕</button></td></tr>').join("");
  chipSummary(); renderChipLegend();
}
function chipSummary(){
  const tot=cfg.chips.reduce((a,c)=>a+c.v*c.n,0), pieces=cfg.chips.reduce((a,c)=>a+(+c.n||0),0);
  const ok=tot===+cfg.stack;
  $("chipSummary").innerHTML="Total por jugador: <b>"+fmt(tot)+"</b> en "+pieces+" fichas. "+(ok?'<span class="ok">Coincide con el stack inicial.</span>':'<span class="bad">El stack inicial es '+fmt(cfg.stack)+', ajusta cantidades.</span>');
}
function payHint(){
  const s=(cfg.payouts||[]).reduce((a,b)=>a+b,0);
  $("payHint").innerHTML=s===100?'<span class="ok">Suma 100%.</span>':'<span class="bad">Suman '+s+'%. Deben sumar 100.</span>';
}

// ---------- Eventos ----------
document.querySelectorAll("nav.tabs button").forEach(b=>b.addEventListener("click",()=>show(b.dataset.view)));
function show(v){
  document.querySelectorAll("nav.tabs button").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.view===v)));
  const cash=cfg.mode==="cash";
  if(cash&&(v==="table"||v==="structure")) v="clock";
  if(!cash&&v==="bank") v="clock";
  document.querySelectorAll("nav.tabs button").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.view===v)));
  ["clock","table","structure","setup","bank","cashclock","history","me"].forEach(x=>$("view-"+x).hidden=true);
  $("view-"+(cash&&v==="clock"?"cashclock":v)).hidden=false;
  if(cash) renderCash();
  if(v==="history") renderHistory(); if(v==="me") renderMe(); if(v==="table") renderTable(); if(v==="structure") renderStructure(); if(v==="setup") renderSetup();
  try{const sb=document.querySelector('nav.tabs button[aria-selected="true"]');if(sb&&sb.parentNode.scrollWidth>sb.parentNode.clientWidth)sb.parentNode.scrollLeft=Math.max(0,sb.offsetLeft-40);}catch(e){}
  try{sessionStorage.setItem("hgclock.view",v)}catch(e){}
}
$("btnPlay").onclick=()=>{
  if(!$("gl").hidden) return;
  if(st.running){pause();return;}
  // Primer arranque de la noche: animación de "Good luck" antes de correr el reloj
  if(st.idx===0&&!st.elapsedMs&&remainingMs()>=durMs(0)){audio();goodLuck();return;}
  play();
};
$("btnNext").onclick=()=>goTo(st.idx+1);
$("btnPrev").onclick=()=>goTo(st.idx-1);
$("btnPlus").onclick=()=>adjust(60000);
$("btnMinus").onclick=()=>adjust(-60000);
$("btnRestartLvl").onclick=()=>{st.remaining=durMs(st.idx);if(st.running)st.endAt=Date.now()+st.remaining;warned=false;saveSt();render();};
function syncToggles(){
  $("btnSound").textContent="Sonido: "+(cfg.sound?"sí":"no"); $("btnSound").classList.toggle("on",cfg.sound); $("btnSound").setAttribute("aria-pressed",cfg.sound);
  $("btnVoice").textContent="Voz: "+(cfg.voice?"sí":"no"); $("btnVoice").classList.toggle("on",cfg.voice); $("btnVoice").setAttribute("aria-pressed",cfg.voice);
}
$("btnSound").onclick=()=>{cfg.sound=!cfg.sound;saveCfg();syncToggles();if(cfg.sound)chimeWarn();};
$("btnVoice").onclick=()=>{cfg.voice=!cfg.voice;saveCfg();syncToggles();if(cfg.voice)announce();};
$("btnFs").onclick=()=>{
  try{
    if(document.fullscreenElement){document.exitFullscreen();}
    else{const p=document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen(); if(p&&p.catch)p.catch(()=>{$("btnFs").textContent="No disponible aquí";});}
  }catch(e){$("btnFs").textContent="No disponible aquí";}
};
document.addEventListener("fullscreenchange",()=>{document.body.classList.toggle("fs",!!document.fullscreenElement);$("btnFs").textContent=document.fullscreenElement?"Salir de pantalla completa":"Pantalla completa";});

document.querySelectorAll("[data-step]").forEach(b=>b.addEventListener("click",()=>{
  const k=b.dataset.step, d=+b.dataset.d;
  if(k==="entries"){st.entries=Math.max(1,st.entries+d); if(d>0) st.remaining_p++; else st.remaining_p=Math.min(st.remaining_p,st.entries);}
  if(k==="remaining") st.remaining_p=Math.min(st.entries+st.rebuys,Math.max(0,st.remaining_p+d));
  if(k==="rebuys") st.rebuys=Math.max(0,st.rebuys+d);
  if(k==="addons") st.addons=Math.max(0,st.addons+d);
  saveSt(); render();
}));

document.addEventListener("keydown",e=>{
  if(e.target.matches("input,select,textarea")) return;
  if(e.key==="Escape"){["lvlup","champ"].forEach(id=>$(id).hidden=true);stopConfetti();if(document.body.classList.contains("tv"))setTv(false);return;}
  if(e.code==="Space"){e.preventDefault();st.running?pause():play();}
  else if(e.key==="ArrowRight") goTo(st.idx+1);
  else if(e.key==="ArrowLeft") goTo(st.idx-1);
});

// Mesa
let pendingSeat=null;
$("tblSwitch").addEventListener("click",e=>{const b=e.target.closest("[data-t]");if(!b)return;curTable=+b.dataset.t;selSeat=null;pendingSeat=null;renderTable();});
$("tblAlertBtn").addEventListener("click",()=>{const info=balanceInfo();if(!info)return;if(info.kind==="merge")mergeTables();else balanceOnce(info);render();renderTable();});
$("ptable").addEventListener("click",e=>{
  const b=e.target.closest(".seat"); if(!b) return; const g=+b.dataset.seat;
  if(!occupant(g)){pendingSeat=g;selSeat=null;renderTable();$("addName").placeholder="Nombre para el asiento "+(g%PER+1);$("addName").focus();return;}
  selSeat=selSeat===g?null:g; pendingSeat=null; $("addName").placeholder="Nombre"; renderTable();
});
$("addForm").addEventListener("submit",e=>{
  e.preventDefault();
  if(addPlayer($("addName").value,pendingSeat)){$("addName").value="";pendingSeat=null;$("addName").placeholder="Nombre";render();renderTable();$("addName").focus();}
});
$("selActions").addEventListener("click",e=>{
  const b=e.target.closest("[data-pa]"); if(!b) return;
  const p=occupant(selSeat); if(!p) return;
  const a=b.dataset.pa;
  if(a==="out"){eliminate(p); if(st.players.filter(q=>!q.out).length>1) knockout(p);}
  if(a==="rebuy"){rebuy(p);selSeat=p.seat;curTable=tOf(p.seat);}
  if(a==="undo"){undoOut(p);selSeat=p.seat;curTable=tOf(p.seat);}
  if(a==="dealer"){dealers()[tOf(p.seat)]=p.seat;saveSt();}
  if(a==="addon"){p.addons=1;st.addons++;saveSt();}
  if(a==="noaddon"){p.addons=0;st.addons=Math.max(0,st.addons-1);saveSt();}
  if(a==="move"){if(moveTo(p,1-tOf(p.seat))){curTable=tOf(p.seat);selSeat=p.seat;}}
  if(a==="remove"){
    if(b.dataset.armed!=="1"){b.dataset.armed="1";b.textContent="¿Quitar a "+p.name+"? Toca otra vez";return;}
    removeP(p);
  }
  render(); renderTable();
});

// Estructura
$("structBody").addEventListener("change",e=>{
  const t=e.target; if(!t.dataset.f) return;
  const i=+t.dataset.i, f=t.dataset.f, v=Math.max(0,Math.round(+t.value||0));
  cfg.levels[i][f]=f==="min"?Math.max(1,v):v;
  if(f==="min"&&i===st.idx&&!st.running) st.remaining=durMs(i);
  saveCfg(); saveSt(); renderStructure(); render();
});
$("structBody").addEventListener("click",e=>{
  const b=e.target.closest("button[data-act]"); if(!b) return;
  const i=+b.dataset.i;
  if(b.dataset.act==="go"){goTo(i,{sound:false});return;}
  if(b.dataset.act==="up"&&i>0){[cfg.levels[i-1],cfg.levels[i]]=[cfg.levels[i],cfg.levels[i-1]];}
  if(b.dataset.act==="del"&&cfg.levels.length>1){cfg.levels.splice(i,1); if(st.idx>=cfg.levels.length) st.idx=cfg.levels.length-1; else if(i<st.idx) st.idx--;}
  saveCfg(); saveSt(); renderStructure(); render();
});
$("btnAddLevel").onclick=()=>{
  const lastL=[...cfg.levels].reverse().find(x=>x.t==="L")||{sb:25,bb:50,ante:0,min:20};
  cfg.levels.push({t:"L",sb:lastL.sb*2,bb:lastL.bb*2,ante:lastL.ante?lastL.bb*2:0,min:lastL.min});
  saveCfg(); renderStructure(); render();
};
$("btnAddBreak").onclick=()=>{cfg.levels.push({t:"B",min:10});saveCfg();renderStructure();render();};
$("btnAllMin").onclick=()=>{const m=Math.max(1,+$("allMin").value||20);cfg.levels.forEach(L=>{if(L.t==="L")L.min=m;});if(!st.running)st.remaining=durMs(st.idx);saveCfg();saveSt();renderStructure();render();};
function sameLevels(a,b){return JSON.stringify(a.map(L=>L.t==="B"?["B",+L.min]:[+L.sb,+L.bb,+L.ante,+L.min]))===JSON.stringify(b.map(L=>L.t==="B"?["B",+L.min]:[+L.sb,+L.bb,+L.ante,+L.min]));}
function renderFav(){
  const sel=$("presetSel"), b=$("btnFav"); if(!sel||!b) return;
  let o=sel.querySelector('option[value="fav"]');
  if(FAV){if(!o){o=document.createElement("option");o.value="fav";sel.prepend(o);sel.value="fav";}o.textContent=T("★ Mi favorita","★ My favorite");}
  else if(o){o.remove();sel.value="noante";}
  const is=FAV&&sameLevels(FAV.levels,cfg.levels);
  b.textContent=is?T("★ Es tu favorita","★ Your favorite"):T("☆ Guardar como favorita","☆ Save as favorite");
  b.classList.toggle("fav-on",!!is);
  b.title=T("La favorita es la estructura que se carga por defecto en una noche nueva","Your favorite is the structure a new night starts with");
}
$("btnFav").onclick=()=>{
  const b=$("btnFav");
  if(FAV&&sameLevels(FAV.levels,cfg.levels)){ // tocar de nuevo la quita
    if(b.dataset.armed!=="1"){b.dataset.armed="1";b.textContent=T("¿Quitar favorita? Toca otra vez","Remove favorite? Tap again");setTimeout(()=>{b.dataset.armed="";renderFav();},4000);return;}
    b.dataset.armed="";FAV=null;try{localStorage.removeItem(KEY_FAV)}catch(e){}renderFav();return;}
  FAV={levels:JSON.parse(JSON.stringify(cfg.levels)),at:Date.now()};save(KEY_FAV,FAV);renderFav();
};
$("btnPreset").onclick=()=>{
  const b=$("btnPreset");
  if(b.dataset.armed!=="1"){b.dataset.armed="1";b.textContent="¿Reemplazar la tabla? Toca otra vez";setTimeout(()=>{b.dataset.armed="";b.textContent="Cargar estructura";},4000);return;}
  b.dataset.armed="";b.textContent="Estructura cargada";
  cfg.levels=PRESETS[$("presetSel").value](); st.idx=Math.min(st.idx,cfg.levels.length-1); if(!st.running) st.remaining=durMs(st.idx);
  saveCfg(); saveSt(); renderStructure(); render();
  setTimeout(()=>b.textContent="Cargar estructura",2000);
};

// Ajustes
function bindNum(id,key){$(id).addEventListener("input",()=>{cfg[key]=Math.max(0,+$(id).value||0);saveCfg();render();if(key==="stack")chipSummary();});}
$("fName").addEventListener("input",()=>{cfg.name=$("fName").value;saveCfg();render();});
$("fCur").addEventListener("input",()=>{cfg.cur=$("fCur").value;saveCfg();render();});
[["fBuyin","buyin"],["fStack","stack"],["fRebuyCost","rebuyCost"],["fRebuyStack","rebuyStack"],["fRebuyUntil","rebuyUntil"],["fAddonCost","addonCost"],["fAddonStack","addonStack"]].forEach(a=>bindNum(...a));
$("fRebuyOn").addEventListener("change",()=>{cfg.rebuyOn=$("fRebuyOn").checked;saveCfg();render();});
$("fAddonOn").addEventListener("change",()=>{cfg.addonOn=$("fAddonOn").checked;saveCfg();render();});
$("fPayouts").addEventListener("input",()=>{cfg.payouts=$("fPayouts").value.split(/[,\s]+/).map(Number).filter(n=>n>0);saveCfg();payHint();render();});
$("chipBody").addEventListener("input",e=>{
  const t=e.target; if(!t.dataset.cf) return; const c=cfg.chips[+t.dataset.ci];
  c[t.dataset.cf]=t.dataset.cf==="c"?t.value:Math.max(0,+t.value||0); saveCfg();
  if(t.dataset.cf==="c"){renderChips();} else {chipSummary(); t.closest("tr").cells[3].innerHTML='<span class="chip-dot" style="background:'+c.c+'"></span>'+fmt(c.v*c.n);}
});
$("chipBody").addEventListener("click",e=>{const b=e.target.closest("[data-cdel]");if(!b)return;cfg.chips.splice(+b.dataset.cdel,1);saveCfg();renderChips();});
$("btnAddChip").onclick=()=>{cfg.chips.push({v:5000,n:0,c:"#7a4fb5"});saveCfg();renderChips();};
function twoTap(btn,label,fn){
  btn.onclick=()=>{
    if(btn.dataset.armed!=="1"){btn.dataset.armed="1";btn.textContent="¿Seguro? Toca otra vez";setTimeout(()=>{btn.dataset.armed="";btn.textContent=label;},4000);return;}
    btn.dataset.armed="";fn();btn.textContent="Listo";setTimeout(()=>btn.textContent=label,1800);
  };
}
twoTap($("btnReset"),"Reiniciar torneo",()=>{const e=st.entries,pl=st.players.map(p=>({...p,out:false,place:null,rebuys:0,addons:0}));st=freshState();st.players=pl;pl.filter(p=>p.seat<0).forEach(p=>p.seat=freeSeatIn(pickTable()));st.entries=pl.length||e;st.remaining_p=st.entries;st.dealers={0:-1,1:-1};pl.forEach(p=>{const t=tOf(p.seat);if(p.seat>=0&&st.dealers[t]<0)st.dealers[t]=p.seat;});saveSt();render();renderStructure();renderTable();show("clock");welcomeShow("main");});
twoTap($("btnNewNight"),"Nueva noche",()=>{if(FAV){cfg.levels=PRESETS.fav();saveCfg();}st=freshState();st.entries=0;st.remaining_p=0;selSeat=null;curTable=0;saveSt();render();renderStructure();renderTable();show("clock");welcomeShow();});
twoTap($("btnDefaults"),"Restaurar valores sugeridos",()=>{const s=cfg.sound,v=cfg.voice;cfg=defaults();cfg.sound=s;cfg.voice=v;saveCfg();st.idx=0;st.remaining=durMs(0);st.running=false;saveSt();renderSetup();render();renderStructure();});


// ---------- Bienvenida ----------
function welcomeShow(step){
  if(step!=="keep"){const pick=step!=="main";$("wPick").hidden=!pick;$("wMain").hidden=pick;}
  $("wQ").textContent=T("¿Qué jugamos hoy?","What are we playing tonight?");
  $("wTsub").textContent=T("Todos empiezan juntos y hay un campeón","Everyone starts together, one champion");
  $("wCsub").textContent=T("A tu ritmo, recompra al quedar en cero","Play at your pace, rebuy at zero");
  $("btnWelcomeBack").textContent=T("← Cambiar tipo de noche","← Change type of night");
  $("wKind").textContent=cfg.mode==="cash"?"Cash night":"Tournament night";
  $("wTitle").textContent=cfg.name||"Home Game";
  let d=""; try{d=new Date().toLocaleDateString(LANG==="en"?"en-US":"es-MX",{weekday:"long",day:"numeric",month:"long"});}catch(e){}
  $("wDate").textContent=d;
  const nL=cfg.levels.filter(x=>x.t==="L").length, first=cfg.levels.find(x=>x.t==="L")||{sb:0,bb:0,min:0};
  const active=st.players.filter(p=>!p.out);
  $("wFacts").innerHTML='<span><b>'+(active.length||st.entries)+'</b>jugadores</span><span><b>'+fmt(cfg.stack)+'</b>fichas</span><span><b>'+cur()+fmt(cfg.buyin)+'</b>buy-in</span><span><b>'+first.min+'</b>min por nivel</span><span><b>'+fmt(first.sb)+'/'+fmt(first.bb)+'</b>para empezar</span>';
  $("wNames").innerHTML=active.map(p=>"<span>"+esc(p.name)+"</span>").join("");
  if(cfg.mode==="cash"){const C=cfg.cash,cp=cs.players.filter(p=>p.cashout==null);
    $("wFacts").innerHTML='<span data-notr><b>'+cp.length+'</b>'+T("jugadores","players")+'</span><span data-notr><b>'+fm(C.buyin)+'</b>buy-in</span><span data-notr><b>'+fm(C.sb)+'/'+fm(C.bb)+'</b>'+T("ciegas","blinds")+'</span><span data-notr><b>'+Math.round(C.buyin/C.bb)+'</b>'+T("ciegas grandes","big blinds")+'</span>';
    $("wNames").innerHTML=cp.map(p=>"<span>"+esc(p.name)+"</span>").join("");}
  $("welcome").hidden=false;
}
$("btnDeal").onclick=()=>{$("welcome").hidden=true;try{sessionStorage.setItem("hgclock.welcomed","1")}catch(e){} show("clock");audio();
  if(cfg.mode==="cash"){if(cs.started){if(!cs.running)toggleSession();return;}glAfter=()=>{startSession();chimeLevel();};}
  goodLuck();};
document.querySelectorAll("#wPick .wopt").forEach(b=>b.addEventListener("click",()=>{audio();clack(0,.5);setMode(b.dataset.m);welcomeShow("main");}));
$("btnWelcomeBack").onclick=()=>welcomeShow();
// Buena suerte: letrero de neón, cartas repartidas y fichas; luego arranca el reloj
let glT=null, glDone=false;
function shuffleSound(){
  const a=audio(); if(!a||!cfg.sound) return;
  const len=Math.floor(a.sampleRate*0.03), buf=a.createBuffer(1,len,a.sampleRate), d=buf.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/len,3);
  for(let k=0;k<16;k++){const src=a.createBufferSource(),g=a.createGain(),f=a.createBiquadFilter();f.type="highpass";f.frequency.value=1800;
    src.buffer=buf;g.gain.value=0.5;src.connect(f).connect(g).connect(a.destination);src.start(a.currentTime+k*0.045+Math.random()*0.01);}
  chipRiffle(0.95,8,0.05); motif(1.2,0.32);
  [NOTE.A3,NOTE.E4,NOTE.A4,NOTE.Cs5,NOTE.E5].forEach(f=>ep(f,1.75,2.4,0.2));
}
function goodLuck(){
  const el=$("gl"); el.querySelectorAll(".fly,.gl-chip").forEach(x=>x.remove());
  const ranks=["A","K","Q","J","10"], suits=["♠","♥","♦","♣"], W=innerWidth, H=innerHeight;
  for(let i=0;i<18;i++){
    const ang=i/18*Math.PI*2+Math.random()*.3, rad=Math.max(W,H)*(.32+Math.random()*.2);
    const c=document.createElement("div"), su=suits[i%4], back=i%3===2;
    c.className="fly"+(back?" back":"")+(su==="♥"||su==="♦"?" red":"");
    c.textContent=back?"":ranks[i%5]+su;
    c.style.cssText="--x:"+Math.cos(ang)*rad+"px;--y:"+Math.sin(ang)*rad*.8+"px;--r:"+(Math.random()*540-270)+"deg;--d:"+(i*0.045)+"s";
    el.appendChild(c);
  }
  const cols=cfg.chips.map(ch=>ch.c);
  for(let i=0;i<14;i++){
    const ang=Math.random()*Math.PI*2, rad=Math.min(W,H)*.38+Math.random()*Math.min(W,H)*.22;
    const c=document.createElement("div"); c.className="gl-chip";
    c.style.cssText="--c:"+(cols[i%cols.length]||"#c8423a")+";--x:"+Math.cos(ang)*rad+"px;--y:"+Math.sin(ang)*rad+"px;--r:"+(Math.random()*720)+"deg;--d:"+(0.8+i*0.03)+"s";
    el.appendChild(c);
  }
  el.hidden=false; el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
  shuffleSound(); glDone=false;
  if(cfg.voice) setTimeout(()=>say(LANG==="en"?"Good luck, everyone. Shuffle up and deal.":"Buena suerte a todos. Shuffle up and deal."),900);
  clearTimeout(glT); glT=setTimeout(endGoodLuck,5000);
}
let glAfter=null;
function endGoodLuck(){
  if(glDone) return; glDone=true; clearTimeout(glT);
  $("gl").hidden=true; $("gl").classList.remove("show");
  if(glAfter){const f=glAfter;glAfter=null;f();return;}
  play(); chimeLevel(); levelUp();
}
$("gl").addEventListener("click",endGoodLuck);
$("btnWelcomeSkip").onclick=()=>{$("welcome").hidden=true;try{sessionStorage.setItem("hgclock.welcomed","1")}catch(e){}};


// ---------- Trato en la mesa final ----------
let dealOpen=false;
function dealPot(n){const ps=cfg.payouts||[];let s=0;for(let k=0;k<n;k++)s+=ps[k]||0;return Math.round(poolTotal()*s)/100;}
function renderDeal(){
  const el=$("dealPanel"); if(!el) return;
  const alive=st.players.filter(p=>!p.out), n=alive.length;
  const show=n>=2&&n<=4&&st.players.length>=3;
  el.hidden=!show; if(!show){dealOpen=false;return;}
  const key=(dealOpen?"o":"c")+alive.map(p=>p.id).join(",")+"|"+LANG;
  if(dealOpen&&el.dataset.key===key&&el.querySelector("[data-dl-amt]")){dealSum();return;}
  el.dataset.key=key;
  const pot=dealPot(n), c=cur();
  if(!dealOpen){el.innerHTML='<h2>'+T("Trato","Deal")+'</h2><p class="deal-p">'+T("Quedan "+n+". Si quieren repartirse los "+c+fmt(pot)+" sin seguir jugando, ciérrenlo aquí.","There are "+n+" left. If they want to split the "+c+fmt(pot)+" instead of playing on, close it here.")+'</p><button class="btn small" data-dl="open">'+T("Hacer un trato","Make a deal")+'</button>';return;}
  const eq=Math.floor(pot/n), rest=Math.round((pot-eq*n)*100)/100;
  el.innerHTML='<h2>'+T("Trato","Deal")+'</h2><p class="deal-p">'+T("A repartir: ","To split: ")+'<b>'+c+fmt(pot)+'</b>. '+T("Elige quién se lleva el título.","Choose who takes the title.")+'</p>'+
    '<div class="deal-rows">'+alive.map((p,i)=>'<label class="deal-row"><input type="radio" name="dealChamp" value="'+p.id+'"'+(i===0?' checked':'')+' aria-label="'+T("Campeón: ","Champion: ")+esc(p.name)+'"><span class="nm">'+esc(p.name)+'</span><span class="amt">'+c+'<input type="number" min="0" step="1" inputmode="decimal" data-dl-amt="'+p.id+'" value="'+(eq+(i===0?rest:0))+'"></span></label>').join("")+'</div>'+
    '<div class="deal-foot"><span id="dealSum"></span><div class="toolbar" style="margin-top:0"><button class="btn small" data-dl="even">'+T("Partes iguales","Even split")+'</button><button class="btn small primary" data-dl="go">'+T("Cerrar con trato","Close with deal")+'</button><button class="btn small" data-dl="cancel">'+T("Cancelar","Cancel")+'</button></div></div>';
  dealSum();
}
function dealVals(){const o={};document.querySelectorAll("[data-dl-amt]").forEach(x=>o[x.dataset.dlAmt]=Math.max(0,parseFloat(x.value)||0));return o;}
function dealSum(){
  const n=st.players.filter(p=>!p.out).length, pot=dealPot(n), v=dealVals(), s=Object.values(v).reduce((a,b)=>a+b,0), ok=Math.abs(s-pot)<0.01;
  const el=$("dealSum"); if(el){el.textContent=T("Suma ","Total ")+cur()+fmt(s)+(ok?" ✓":" · "+T("faltan ","off by ")+cur()+fmt(Math.abs(pot-s)));el.className=ok?"ok":"bad";}
  const g=document.querySelector('[data-dl="go"]'); if(g) g.disabled=!ok;
  return ok;
}
$("dealPanel").addEventListener("input",e=>{if(e.target.matches("[data-dl-amt]"))dealSum();});
$("dealPanel").addEventListener("click",e=>{
  const b=e.target.closest("[data-dl]"); if(!b) return; const a=b.dataset.dl;
  if(a==="open"){dealOpen=true;renderDeal();}
  if(a==="cancel"){dealOpen=false;renderDeal();}
  if(a==="even"){const xs=[...document.querySelectorAll("[data-dl-amt]")],pot=dealPot(xs.length),eq=Math.floor(pot/xs.length);xs.forEach((x,i)=>x.value=eq+(i===0?Math.round((pot-eq*xs.length)*100)/100:0));dealSum();}
  if(a==="go"){
    if(!dealSum()) return;
    if(b.dataset.armed!=="1"){b.dataset.armed="1";b.textContent=T("¿Seguro? Toca otra vez","Sure? Tap again");return;}
    const v=dealVals(), r=document.querySelector('input[name="dealChamp"]:checked'), champ=r?r.value:null;
    const alive=st.players.filter(p=>!p.out);
    st.deal={amounts:{}}; alive.forEach(p=>st.deal.amounts[String(p.id)]=v[String(p.id)]||0);
    alive.filter(p=>String(p.id)!==champ).sort((x,y)=>(v[String(y.id)]||0)-(v[String(x.id)]||0)).forEach((p,i)=>{p.out=true;p.place=2+i;p.outMs=st.elapsedMs;});
    st.remaining_p=1; dealOpen=false; saveSt(); render(); renderTable(); setTimeout(champion,250);
  }
});

// ---------- Jugador eliminado ----------
let koTimer=null;
function knockout(p){
  const el=$("ko"), left=st.players.filter(q=>!q.out).length, place=p.place, ps=cfg.payouts||[];
  el.querySelectorAll(".ko-chip,.ko-ember").forEach(x=>x.remove());
  el.querySelectorAll(".ko-name .h").forEach(h=>h.textContent=p.name);
  const word=T("Eliminado","Busted"); $("koFat").setAttribute("aria-label",word);
  $("koFat").innerHTML=[...word].map((ch,i)=>'<b style="--i:'+i+';--r:'+(Math.random()*24-12).toFixed(1)+'deg">'+ch+'</b>').join("");
  $("koPlace").textContent=(LANG==="en"?"Finishes "+ordEn(place):"Termina en "+place+".º lugar")+" · "+(LANG==="en"?left+" left":"quedan "+left);
  const x=$("koExtra"); x.className="ko-extra";
  const rbOpen=cfg.rebuyOn;
  if(ps[place-1]){x.classList.add("money");x.textContent=T("Cobra ","Cashes ")+cur()+fmt(poolTotal()*ps[place-1]/100);}
  else if(rbOpen&&levelNumber(st.idx)<=cfg.rebuyUntil){x.textContent=T("Recompra disponible ","Rebuy available ")+"("+cur()+fmt(cfg.rebuyCost)+")";}
  else if(place===ps.length+1){x.classList.add("bubble");x.textContent=T("¡Se reventó la burbuja! Los demás ya cobran","The bubble bursts! Everyone left is in the money")+(rbOpen?T(" (a menos que recompre)"," (unless they rebuy)"):"");}
  else if(rbOpen){x.textContent=T("Recompra disponible ","Rebuy available ")+"("+cur()+fmt(cfg.rebuyCost)+")";}
  else x.textContent="";
  const cols=[...cfg.chips].map(c=>c.c).concat(["#c8423a","#1f1f22"]);
  for(let i=0;i<18;i++){
    const ang=Math.random()*Math.PI*2, rad=Math.min(innerWidth,innerHeight)*(.3+Math.random()*.4);
    const c=document.createElement("i"); c.className="ko-chip";
    c.style.cssText="--c:"+cols[i%cols.length]+";--x:"+Math.cos(ang)*rad+"px;--y:"+Math.sin(ang)*rad+"px;--r:"+(Math.random()*900-450)+"deg;--d:"+(2.12+Math.random()*0.12)+"s";
    el.appendChild(c);
  }
  for(let i=0;i<34;i++){
    const e=document.createElement("i"); e.className="ko-ember";
    e.style.cssText="left:"+(Math.random()*100).toFixed(1)+"%;--s:"+(3+Math.random()*6).toFixed(1)+"px;--x:"+(Math.random()*160-80).toFixed(0)+"px;--t:"+(2.6+Math.random()*3).toFixed(2)+"s;--d:"+(i<12?Math.random()*1.2:1.6+Math.random()*3).toFixed(2)+"s";
    el.appendChild(e);
  }
  el.hidden=false; el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
  koSound(!!ps[place-1]);
  if(cfg.voice) setTimeout(()=>{if(!$("ko").hidden)say(LANG==="en"?p.name+", knocked out in "+ordEn(place)+" place.":p.name+", eliminado en "+place+".º lugar.");},3600);
  clearTimeout(koTimer); koTimer=setTimeout(koHide,8500);
}
function koHide(){clearTimeout(koTimer);$("ko").hidden=true;$("ko").classList.remove("show");try{speechSynthesis.cancel()}catch(e){}}
$("ko").addEventListener("click",koHide);
function koSound(money){
  if(!cfg.sound) return;
  const a=audio(); if(!a) return;
  const noise=(t,dur,f0,f1,q,vol,type)=>{const n=a.createBufferSource(),buf=a.createBuffer(1,a.sampleRate*dur,a.sampleRate),d=buf.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,1.6);
    const f=a.createBiquadFilter(),g=a.createGain(); f.type=type||"bandpass"; f.Q.value=q; f.frequency.setValueAtTime(f0,t); f.frequency.exponentialRampToValueAtTime(f1,t+dur);
    g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(.0001,t+dur); n.buffer=buf; n.connect(f); f.connect(g); g.connect(a.destination); n.start(t);};
  const T0=a.currentTime;
  // gong de arena: parciales inarmónicos con cola larga
  [[73,.34],[146.7,.2],[198.4,.14],[261.9,.1],[331.2,.07],[412.5,.05]].forEach(([f,v])=>{
    const o=a.createOscillator(),g=a.createGain(); o.type="sine"; o.frequency.setValueAtTime(f*1.02,T0+.05); o.frequency.exponentialRampToValueAtTime(f,T0+.6);
    g.gain.setValueAtTime(.0001,T0+.05); g.gain.exponentialRampToValueAtTime(v,T0+.08); g.gain.exponentialRampToValueAtTime(.0001,T0+3.2);
    o.connect(g); g.connect(a.destination); o.start(T0+.05); o.stop(T0+3.3);});
  boom(.05,.9); noise(T0+.05,1.4,2400,300,.7,.18);
  // trueno y corte
  noise(T0+1.55,.5,6000,700,.5,.55,"highpass"); noise(T0+1.6,1.6,900,60,.4,.6,"lowpass"); boom(1.6,1);
  noise(T0+2.1,.32,4200,500,1.2,.5); boom(2.18,.8); chipRiffle(2.2,9,.05);
  // palabra final: golpe por letra y acorde menor
  for(let i=0;i<9;i++) boom(2.6+i*.06,.3);
  boom(3.1,1); brass([55,65.4,82.4,110],3.05,2.4,.24);
  if(money){[NOTE.E5,NOTE.Cs5,NOTE.A4].forEach((f,i)=>ep(f,3.6+i*.14,.8,.22));}
}

// ---------- Cambio de nivel ----------
let luTimer=null;
function levelUp(){
  const L=cfg.levels[st.idx]; if(!L) return;
  const el=$("lvlup"), card=$("luCard");
  if(L.t==="B"){card.className="pcard joker";$("luR1").innerHTML="★";$("luR2").innerHTML="★";$("luS").textContent="Break";
    $("luLabel").textContent="Descanso";$("luBlinds").textContent=L.min+" min";
    const N=cfg.levels.slice(st.idx+1).find(x=>x.t==="L");$("luSub").textContent=N?"Al regresar: "+fmt(N.sb)+" / "+fmt(N.bb):"";}
  else{const n=levelNumber(st.idx),suits=["♠","♥","♣","♦"],su=suits[(n-1)%4];
    card.className="pcard"+(su==="♥"||su==="♦"?" red":"");
    $("luR1").innerHTML=n+"<small>"+su+"</small>";$("luR2").innerHTML=n+"<small>"+su+"</small>";$("luS").textContent=su;
    $("luLabel").textContent=n===1?"Nivel 1":"Suben las ciegas · Nivel "+n;
    $("luBlinds").innerHTML=chipHTML(L.sb)+'<span style="color:var(--muted);opacity:.7;margin-inline:.12em">/</span>'+chipHTML(L.bb);
    $("luSub").textContent=+L.ante?"Ante de ciega grande: "+fmt(L.ante):"";}
  el.hidden=false; el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
  clearTimeout(luTimer); luTimer=setTimeout(()=>{el.hidden=true;},4200);
}
$("lvlup").addEventListener("click",()=>{$("lvlup").hidden=true;});

// ---------- Modo TV ----------
let tvUiT=null;
function setTv(on){
  document.body.classList.toggle("tv",on);
  if(on){try{const p=document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen();if(p&&p.catch)p.catch(()=>{});}catch(e){} show("clock"); requestWake(); pokeTv();}
  else{try{if(document.fullscreenElement)document.exitFullscreen();}catch(e){}}
  window.scrollTo(0,0);
}
function pokeTv(){document.body.classList.add("tv-ui");clearTimeout(tvUiT);tvUiT=setTimeout(()=>document.body.classList.remove("tv-ui"),2500);}
$("btnTv").onclick=()=>setTv(true);
$("tvExit").onclick=e=>{e.stopPropagation();setTv(false);};
["mousemove","touchstart"].forEach(ev=>document.addEventListener(ev,()=>{if(document.body.classList.contains("tv"))pokeTv();},{passive:true}));
$("stage").addEventListener("click",e=>{if(!document.body.classList.contains("tv"))return;if(e.target.closest("button"))return;st.running?pause():play();});

// ---------- Campeón ----------
function champion(){
  const alive=st.players.filter(p=>!p.out);
  const w=alive.length===1?alive[0]:null;
  if(st.running) pause();
  const pool=poolTotal(), ps=cfg.payouts||[];
  const prize=i=>ps[i]?cur()+fmt(pool*ps[i]/100):"";
  const dAmt=p=>st.deal&&p&&st.deal.amounts&&st.deal.amounts[String(p.id)]!=null?st.deal.amounts[String(p.id)]:null;
  const pz=(p,i)=>dAmt(p)!=null?cur()+fmt(dAmt(p)):prize(i);
  $("chName").textContent=w?w.name:"¡Tenemos campeón!";
  let titles=0; try{titles=w?recordTournament(w):0;}catch(e){}
  $("chTitles").textContent=titles>1?T("Título número "+titles+" en "+APP_NAME,APP_NAME+" title #"+titles):titles===1?T("Primer título en "+APP_NAME,"First "+APP_NAME+" title"):"";
  $("chPrize").textContent=pz(w,0)?"Se lleva "+pz(w,0):"";
  if(st.deal) $("chTitles").textContent+=($("chTitles").textContent?" · ":"")+T("trato en la mesa final","final-table deal");
  const byPlace=k=>st.players.filter(p=>p.out&&p.place===k).slice(-1)[0];
  const p2=byPlace(2),p3=byPlace(3);
  const col=(cls,pl,p,pr)=>'<div class="'+cls+'"><span class="pl">'+pl+'</span><span class="pn">'+(p?esc(p.name):"—")+'</span><span class="pp">'+(pr||"")+'</span></div>';
  $("chPodium").innerHTML=col("p2","2.º",p2,pz(p2,1))+col("p1","1.º",w,pz(w,0))+col("p3","3.º",p3,pz(p3,2));
  const el=$("champ"); el.hidden=false; el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
  // el premio cuenta hacia arriba
  const target=dAmt(w)!=null?dAmt(w):(ps[0]?pool*ps[0]/100:0), pre=LANG==="en"?"Wins ":"Se lleva ";
  $("chPrize").textContent=target?pre+cur()+"0":"";
  if(target){const t0=performance.now()+2200;(function up(t){const k=Math.min(1,Math.max(0,(t-t0)/1300));$("chPrize").textContent=pre+cur()+fmt(target*(1-Math.pow(1-k,3)));if(k<1&&!el.hidden)requestAnimationFrame(up);})(performance.now());}
  if(cfg.sound) champSound();
  setTimeout(()=>{ if(!$("champ").hidden) confetti(); },600);
  if(cfg.voice&&w) setTimeout(()=>say(LANG==="en"?"Congratulations "+w.name+", "+APP_NAME+" champion.":"Felicidades "+w.name+", campeón de "+APP_NAME+"."),3200);
}
$("chClose").onclick=()=>{$("champ").hidden=true;$("champ").classList.remove("show");stopConfetti();};
function champSound(){
  // redoble de fichas, golpe, fanfarria en La mayor y lluvia de fichas
  chipRiffle(0,10,0.045);
  boom(0.55,1);
  brass([NOTE.A3,NOTE.E4,NOTE.A4,NOTE.Cs5],0.6,0.5);
  brass([NOTE.D5/2,NOTE.Fs5/2,NOTE.A4,NOTE.D5],1.15,0.35);
  brass([NOTE.E4,NOTE.Gs4,NOTE.B4,NOTE.E5],1.5,0.35);
  brass([NOTE.A3,NOTE.E4,NOTE.A4,NOTE.Cs5,NOTE.E5,NOTE.A5],1.9,2.4,0.2);
  boom(1.9,0.7);
  motif(2.4,0.28); ep(NOTE.Cs6,2.9,1.8,0.18);
  for(let i=0;i<34;i++) clack(2.0+Math.random()*2.2,0.25+Math.random()*0.3);
}
let confRAF=null;
function confetti(){
  if(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c=$("confetti"), x=c.getContext("2d"); c.hidden=false;
  const W=c.width=innerWidth*devicePixelRatio, H=c.height=innerHeight*devicePixelRatio, k=devicePixelRatio;
  const cols=cfg.chips.map(ch=>ch.c).concat(["#d9a944"]);
  const parts=Array.from({length:110},()=>({x:Math.random()*W,y:-Math.random()*H*0.8,r:(8+Math.random()*10)*k,vy:(2+Math.random()*3.5)*k,vx:(Math.random()-.5)*2*k,a:Math.random()*6,va:(Math.random()-.5)*0.2,c:cols[Math.floor(Math.random()*cols.length)]}));
  const t0=performance.now();
  (function frame(t){
    x.clearRect(0,0,W,H);
    for(const p of parts){p.x+=p.vx;p.y+=p.vy;p.a+=p.va;
      const sx=Math.abs(Math.cos(p.a));
      x.save();x.translate(p.x,p.y);x.scale(Math.max(.15,sx),1);
      x.beginPath();x.arc(0,0,p.r,0,7);x.fillStyle=p.c;x.fill();
      x.lineWidth=p.r*.28;x.setLineDash([p.r*.5,p.r*.5]);x.strokeStyle="#f6f0e0";x.beginPath();x.arc(0,0,p.r*.82,0,7);x.stroke();
      x.restore();}
    if(t-t0<7000) confRAF=requestAnimationFrame(frame); else stopConfetti();
  })(t0);
}
function stopConfetti(){cancelAnimationFrame(confRAF);const c=$("confetti");c.getContext("2d").clearRect(0,0,c.width,c.height);c.hidden=true;}

// ---------- Idioma (inglés por defecto) ----------
let LANG="en"; try{LANG=localStorage.getItem("hgclock.lang")||"en"}catch(e){}
const DICT={"Historial":"History","Mi perfil":"Profile",
"Respaldo":"Backup","Exportar respaldo":"Export backup","Importar respaldo":"Import backup",
"Todo se guarda solo en este dispositivo. Descarga un respaldo de vez en cuando para no perder el historial si cambias de teléfono o borras el navegador.":"Everything is saved only on this device. Download a backup now and then so you don't lose your history if you switch phones or clear the browser.",
"Reloj":"Clock","Mesa":"Tables","Estructura":"Structure","Ajustes":"Settings","En pausa":"Paused","Nivel":"Level","Ciegas":"Blinds","Siguiente:":"Next:","Anterior":"Previous","Iniciar":"Start","Pausar":"Pause","Continuar":"Resume","Siguiente":"Next",
"Reiniciar nivel":"Restart level","Sonido: sí":"Sound: on","Sonido: no":"Sound: off","Voz: sí":"Voice: on","Voz: no":"Voice: off","Pantalla completa":"Full screen","Salir de pantalla completa":"Exit full screen","No disponible aquí":"Not available here","Modo TV":"TV mode",
"Jugadores":"Players","Stack promedio":"Average stack","Bote de premios":"Prize pool","Prom. en ciegas":"Avg. in big blinds","Próximo break":"Next break","Tiempo jugado":"Time played","Ahora":"Now",
"Entradas":"Entries","Quienes pagaron buy-in":"Players who paid the buy-in","Siguen jugando":"Still playing","Resta uno al eliminar":"Subtract one per knockout","Recompras":"Rebuys","Add-ons":"Add-ons","En el primer break":"At the first break",
"Premios":"Payouts","Lo que sigue":"Coming up","Valor de las fichas":"Chip values","Ranking de manos":"Hand rankings","Configura tus fichas en Ajustes":"Set up your chips in Settings",
"Escalera real":"Royal flush","Escalera de color":"Straight flush","Póker":"Four of a kind","Full":"Full house","Color":"Flush","Escalera":"Straight","Trío":"Three of a kind","Doble par":"Two pair","Par":"One pair","Carta alta":"High card",
"Atajos con teclado:":"Keyboard shortcuts:","Espacio":"Space","iniciar o pausar,":"start or pause,","cambiar nivel. La configuración y el reloj se guardan en este navegador, así que si recargas la página el torneo sigue donde iba.":"change level. Your settings and the clock are saved in this browser, so if you reload the page the tournament picks up where it left off.",
"Las mesas":"Tables","Toca un asiento vacío para sentar a alguien, o toca a un jugador para eliminarlo, darle recompra o moverle el botón. Con más de 10 jugadores se abre una segunda mesa.":"Tap an empty seat to seat someone, or tap a player to knock them out, give them a rebuy or move the button. With more than 10 players a second table opens.",
"Sentar jugador":"Seat a player","Agregar":"Add","Jugador":"Player","Eliminados":"Knocked out","Nadie todavía":"No one yet","No hay más niveles":"No more levels","Sin reparto configurado":"No payouts set up",
"Se sienta en el primer asiento libre y cuenta como una entrada.":"Takes the first free seat and counts as one entry.","Se sienta en la mesa con menos jugadores y cuenta como una entrada.":"Sits at the table with fewer players and counts as one entry.","Las dos mesas están llenas (20 asientos).":"Both tables are full (20 seats).","La mesa 1 está llena: el siguiente abre la mesa 2.":"Table 1 is full: the next player opens table 2.",
"Darle el botón":"Give them the button","Quitar de la mesa":"Remove from table","Deshacer eliminación":"Undo knockout","Juntar en mesa final":"Merge into final table",
"Estructura de ciegas":"Blind structure","Edita cualquier valor y se guarda solo. El ante es de ciega grande (lo paga solo quien está en BB); deja 0 para no usar ante.":"Edit any value and it saves on its own. The ante is a big blind ante (only the player in the BB pays it); leave 0 for no ante.",
"Estándar con ante · niveles de 20 min (~4 h)":"Standard with ante · 20 min levels (~4 h)","Estándar sin ante · niveles de 20 min (~4 h)":"Standard, no ante · 20 min levels (~4 h)","Turbo · niveles de 15 min (~3 h)":"Turbo · 15 min levels (~3 h)","Tranquilo · niveles de 25 min (~5 h)":"Relaxed · 25 min levels (~5 h)","Cargar estructura":"Load structure","Estructura cargada":"Structure loaded","¿Reemplazar la tabla? Toca otra vez":"Replace the table? Tap again",
"Tipo":"Type","Ciega chica":"Small blind","Ciega grande":"Big blind","Ante (BB)":"Ante (BB)","Minutos":"Minutes","Empieza a":"Starts at","Descanso":"Break","+ Agregar nivel":"+ Add level","+ Agregar break":"+ Add break","Cambiar todos los niveles a":"Set every level to","Aplicar":"Apply",
"niveles y":"levels and","breaks,":"breaks,","de juego.":"of play.",
"Ajustes del torneo":"Tournament settings","Los valores iniciales son una sugerencia para un home game de 8 personas. Cámbialos a tu gusto; todo se guarda en este dispositivo.":"The starting values are a suggestion for an 8-player home game. Change them however you like; everything is saved on this device.",
"General":"General","Texto debajo de":"Text under","Moneda":"Currency","Buy-in":"Buy-in","Stack inicial (fichas)":"Starting stack (chips)","Recompras y add-on":"Rebuys and add-on","Permitir recompras":"Allow rebuys","Costo de recompra":"Rebuy cost","Fichas por recompra":"Chips per rebuy","Recompras hasta el nivel":"Rebuys until level","Recompras sugeridas hasta el nivel":"Rebuys suggested until level","Es solo un aviso: el botón de recompra sigue disponible toda la noche.":"Just a reminder: the rebuy button stays available all night.","Permitir add-on":"Allow add-on","Costo del add-on":"Add-on cost","Fichas del add-on":"Add-on chips",
"Reparto de premios":"Payout split","Porcentajes por lugar":"Percent per place","Separados por coma. Deben sumar 100.":"Separated by commas. They must add up to 100.","Suma 100%.":"Adds up to 100%.","Fichas por jugador":"Chips per player","Valor":"Value","Cantidad":"Count","Subtotal":"Subtotal","+ Agregar ficha":"+ Add chip","Total por jugador:":"Total per player:","Coincide con el stack inicial.":"Matches the starting stack.",
"Torneo":"Tournament","Reinicia el reloj al nivel 1 y los contadores de jugadores. La estructura y los ajustes se conservan.":"Resets the clock to level 1 and the player counts. The structure and settings are kept.","Reiniciar torneo":"Reset tournament","Nueva noche":"New night","\"Nueva noche\" vacía las mesas y pone el reloj en el nivel 1. \"Reiniciar torneo\" hace lo mismo pero deja sentados a los jugadores. La estructura y los ajustes se conservan en los dos casos.":"\"New night\" clears the tables and sets the clock to level 1. \"Reset tournament\" does the same but keeps players seated. The structure and settings are kept either way.","Restaurar valores sugeridos":"Restore suggested values","¿Seguro? Toca otra vez":"Sure? Tap again","Listo":"Done",
"Salir del modo TV":"Exit TV mode","jugadores":"players","fichas":"chips","buy-in":"buy-in","min por nivel":"min per level","para empezar":"to start","Ajustar algo antes de empezar":"Adjust something before starting",
"Suben las ciegas":"Blinds up","¡Buena suerte a todos!":"Good luck, everyone!","Que gane la mejor mano":"May the best hand win","Campeón de la noche":"Tonight's champion","Campeón":"Champion","Cerrar":"Close","¡Tenemos campeón!":"We have a champion!","Momento del add-on":"Add-on time","Recompras abiertas":"Rebuys open","Último nivel de la estructura":"Last level of the structure",
"Secciones":"Sections","Nivel anterior (←)":"Previous level (←)","Iniciar / pausar (espacio)":"Start / pause (space)","Siguiente nivel (→)":"Next level (→)","Nombre":"Name","Nombre del jugador":"Player name","Estructura sugerida":"Suggested structure","Ante":"Ante","Ir a este nivel":"Go to this level","Subir":"Move up","Eliminar":"Delete","Quitar entrada":"Remove entry","Agregar entrada":"Add entry","Eliminar jugador":"Knock out player","Regresar jugador":"Bring player back","Quitar recompra":"Remove rebuy","Agregar recompra":"Add rebuy","Quitar add-on":"Remove add-on","Agregar add-on":"Add add-on"
};
function ordEn(n){n=+n;const s=["th","st","nd","rd"],v=n%100;return n+(s[(v-20)%10]||s[v]||s[0]);}
const RULES=[
[/^(\d+) de (\d+)$/,"$1 of $2"],
[/Suben las ciegas · Nivel (\d+)/,"Blinds up · Level $1"],
[/Asiento (\d+) libre/g,"Seat $1 empty"],[/Nombre para el asiento (\d+)/,"Name for seat $1"],[/Asiento (\d+)/g,"Seat $1"],
[/Eliminar \((\d+)\.º lugar\)/,(m,n)=>"Knock out ("+ordEn(n)+" place)"],[/Eliminado en (\d+)\.º lugar/,(m,n)=>"Out in "+ordEn(n)+" place"],[/, eliminado$/,", out"],
[/(\d+)\.º/g,(m,n)=>ordEn(n)],
[/Pasar a mesa (\d+)/,"Move to table $1"],[/Mover a alguien de mesa (\d+)/,"Move a player from table $1"],
[/Quedan (\d+) jugadores: ya caben todos en una mesa\./,"$1 players left: everyone fits at one table."],
[/Mesa (\d+) tiene (\d+) y mesa (\d+) tiene (\d+)\. Mueve a un jugador para equilibrar\./,"Table $1 has $2 and table $3 has $4. Move one player to balance."],
[/Mesa (\d+)/g,"Table $1"],[/(\d+) en total/,"$1 total"],[/(\d+) jugando/,"$1 playing"],[/Bote de premios/,"Prize pool"],
[/ · En juego/," · Playing"],[/(\d+) recompras/,"$1 rebuys"],[/(\d+) recompra\b/,"$1 rebuy"],[/^Recompra \((.+)\)$/,"Rebuy ($1)"],[/^Add-on \((.+)\)$/,"Add-on ($1)"],
[/^Nivel (\d+)$/,"Level $1"],[/^Ante de ciega grande: (.+)$/,"Big blind ante: $1"],[/^Al regresar: (.+)$/,"After the break: $1"],
[/^Después: $/,"Then: "],[/^break de (\d+) min$/,"$1 min break"],[/ · ante /g," · ante "],
[/Sugeridas hasta el nivel (\d+)/,"Suggested until level $1"],[/Pasó el nivel (\d+): la mesa decide/,"Past level $1: the table decides"],
[/^Se lleva (.+)$/,"Wins $1"],[/^¿Quitar a (.+)\? Toca otra vez$/,"Remove $1? Tap again"],
[/^si se juega todo\. Con (.+) fichas en juego, lo normal es que el torneo termine alrededor de las$/,"if every level is played. With $1 chips in play, the tournament usually ends at around"],
[/^en (\d+) fichas\.$/,"in $1 chips."],[/^El stack inicial es (.+), ajusta cantidades\.$/,"The starting stack is $1, adjust the counts."],[/^Suman (.+)%\. Deben sumar 100\.$/,"Adds up to $1%. It must add up to 100."],
[/^(\d+) eliminados?$/,"$1 out"],[/^Recompras hasta el nivel (\d+)$/,"Rebuys until level $1"]
];
function tr(s){
  if(LANG==="es") return s;
  const k=s.trim(); if(!k) return s;
  let out=DICT[k];
  if(out==null){out=k;for(const [re,rep] of RULES) out=out.replace(re,rep);}
  return out===k?s:s.replace(k,out);
}
const TXT=new WeakMap(), ATTRS=["placeholder","title","aria-label"];
let translating=false, mo=null;
function translateDOM(){
  translating=true;
  const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT); let n;
  while(n=w.nextNode()){
    const pt=n.parentElement&&n.parentElement.tagName; if(pt==="SCRIPT"||pt==="STYLE") continue;
    if(n.parentElement.closest("[data-notr]")) continue;
    let rec=TXT.get(n);
    if(!rec||n.nodeValue!==rec.shown){rec={orig:n.nodeValue,shown:null};TXT.set(n,rec);}
    const v=tr(rec.orig); if(n.nodeValue!==v) n.nodeValue=v; rec.shown=v;
  }
  document.querySelectorAll("[placeholder],[title],[aria-label]").forEach(el=>{ if(el.closest("[data-notr]")) return;
    ATTRS.forEach(a=>{ if(!el.hasAttribute(a)) return;
      const cur=el.getAttribute(a), ok="data-o-"+a, sk="data-s-"+a;
      if(!el.hasAttribute(ok)||cur!==el.getAttribute(sk)) el.setAttribute(ok,cur);
      const v=tr(el.getAttribute(ok)); if(cur!==v) el.setAttribute(a,v); el.setAttribute(sk,v);
    });
  });
  document.documentElement.lang=LANG;
  if(mo) mo.takeRecords();
  translating=false;
}
let trQueued=false;
function queueTr(){ if(trQueued) return; trQueued=true; requestAnimationFrame(()=>{trQueued=false;translateDOM();}); }
mo=new MutationObserver(()=>{ if(!translating) queueTr(); });
mo.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:ATTRS});
function setLang(l){
  LANG=l; if(typeof renderCash==="function") renderCash(); try{localStorage.setItem("hgclock.lang",l)}catch(e){}
  $("btnLang").textContent=l==="en"?"ES":"EN";
  $("btnLang").setAttribute("aria-label",l==="en"?"Cambiar a español":"Switch to English");
  if(!$("welcome").hidden) welcomeShow("keep");
  if(typeof renderHistory==="function") renderHistory();
  translateDOM();
}
$("btnLang").onclick=()=>setLang(LANG==="en"?"es":"en");

// ---------- Modo Cash ----------
// Caja del anfitrión: compras de $X, recompras solo en cero, confirmación de e-transfer, retiros y cuadre final.
const T=(es,en)=>LANG==="en"?en:es;
function cashDefaults(){return {buyin:20,sb:0.1,bb:0.2,chips:[{v:0.1,n:10,c:"#e9e4d6"},{v:0.5,n:8,c:"#c8423a"},{v:1,n:5,c:"#3d7ed1"},{v:5,n:2,c:"#1f1f22"}]};}
cfg.mode=cfg.mode||"tournament";
cfg.cash=Object.assign(cashDefaults(),cfg.cash||{});
const KEY_CASH="hgclock.cash.v1";
function freshCash(){return {players:[],running:false,startAt:0,elapsed:0,started:false};}
let cs=Object.assign(freshCash(),load(KEY_CASH)||{});
const saveCash=()=>save(KEY_CASH,cs);
const r2=v=>Math.round((+v||0)*100)/100;
const fm=v=>cur()+r2(v).toFixed(2);
const fms=v=>(r2(v)>=0?"+":"−")+cur()+Math.abs(r2(v)).toFixed(2);
const pIn=p=>p.buys.reduce((a,b)=>a+b.amt,0);
const pPend=p=>p.buys.filter(b=>!b.paid).reduce((a,b)=>a+b.amt,0);
function sessMs(){return cs.elapsed+(cs.running?Date.now()-cs.startAt:0);}
function hms(ms){const s=Math.floor(ms/1000);return Math.floor(s/3600)+":"+String(Math.floor(s%3600/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0");}
function cashChip(v){
  const cs2=[...cfg.cash.chips].filter(c=>c.v>0).sort((a,b)=>a.v-b.v); let pick=cs2[0];
  for(const c of cs2) if(c.v<=v+1e-9) pick=c;
  const col=pick?pick.c:"#c8423a";
  return '<span><i class="chip" style="--c:'+col+';--e:'+edgeFor(col)+'"></i>'+fm(v)+'</span>';
}
function totals(){
  let bought=0,pend=0,out=0,seated=0,nbuys=0;
  for(const p of cs.players){bought+=pIn(p);pend+=pPend(p);nbuys+=p.buys.length;if(p.cashout!=null)out+=p.cashout;else seated++;}
  return {bought:r2(bought),pend:r2(pend),conf:r2(bought-pend),out:r2(out),onTable:r2(bought-out),seated,nbuys};
}
function setMode(m){
  cfg.mode=m; saveCfg();
  document.body.classList.toggle("mode-cash",m==="cash");
  if(m==="cash"&&st.running) pause();
  show("clock");
}
function startSession(){cs.started=true;cs.running=true;cs.startAt=Date.now();saveCash();requestWake();renderCash();}
function toggleSession(){
  if(!cs.started){audio();glAfter=()=>{startSession();chimeLevel();};goodLuck();return;}
  if(cs.running){cs.elapsed+=Date.now()-cs.startAt;cs.running=false;}else{cs.running=true;cs.startAt=Date.now();requestWake();}
  saveCash();renderCash();
}
let coOpen=null;
function renderCash(){
  const cash=cfg.mode==="cash";
  document.body.classList.toggle("mode-cash",cash);
  $("modeT").textContent=T("Torneo","Tournament"); $("modeC").textContent="Cash";
  $("modeT").setAttribute("aria-pressed",String(!cash)); $("modeC").setAttribute("aria-pressed",String(cash));
  $("tab-bank").textContent=T("Caja","Bank");
  if(!cash) return;
  const C=cfg.cash, t=totals();
  // Pantalla grande
  $("view-cashclock").innerHTML=
  '<div class="clock-grid"><div class="main-col"><div class="rail"><div class="stage" data-notr>'+
   '<span class="cash-tag">CASH GAME</span>'+
   '<div class="blinds-label">'+T("Ciegas","Blinds")+'</div>'+
   '<div class="cash-blinds">'+cashChip(C.sb)+'<span style="color:var(--muted);opacity:.7;margin-inline:.12em">/</span>'+cashChip(C.bb)+'</div>'+
   '<div class="cash-rule">'+T("Buy-in ","Buy-in ")+fm(C.buyin)+' · '+T("Recompra solo cuando quedas en cero","Rebuy only when you are at zero")+'</div>'+
   '<div class="cash-session"><span class="k">'+T("Sesión","Session")+'</span><span class="v" id="csTime">'+hms(sessMs())+'</span></div>'+
   '<div class="controls"><button class="btn primary" data-c="session">'+(!cs.started?"Shuffle up and deal":cs.running?T("Pausar","Pause"):T("Continuar","Resume"))+'</button>'+
   '<button class="btn small" data-c="fs">'+T("Pantalla completa","Full screen")+'</button><button class="btn small" data-c="tv">'+T("Modo TV","TV mode")+'</button></div>'+
  '</div></div>'+
  '<div class="panel statbar" data-notr><h2>'+T("Caja","Bank")+'</h2><div class="stats">'+
   st2(T("En la mesa","At the table"),t.seated)+st2(T("Compras","Buy-ins"),t.nbuys)+st2(T("Total comprado","Total bought"),fm(t.bought))+
   st2(T("En fichas en la mesa","In chips on the table"),fm(t.onTable))+st2(T("Por confirmar","Pending"),fm(t.pend))+st2(T("Pagado al retirarse","Cashed out"),fm(t.out))+
  '</div></div></div>'+
  '<aside class="side"><div class="panel" data-notr><h2>'+T("Valor de las fichas","Chip values")+'</h2><ul class="chiplegend">'+
   [...C.chips].filter(c=>c.v>0).sort((a,b)=>a.v-b.v).map(c=>'<li><i class="chip" style="--c:'+c.c+';--e:'+edgeFor(c.c)+'"></i>'+fm(c.v)+'</li>').join("")+
  '</ul><p class="summary-line" style="margin:10px 0 0;font-size:13px">'+T("Por cada compra: ","Per buy-in: ")+C.chips.filter(c=>c.n>0).map(c=>c.n+" × "+fm(c.v)).join(" · ")+'</p></div>'+
  '<div class="panel"><h2 data-notr>'+T("Ranking de manos","Hand rankings")+'</h2><ol class="hands"></ol></div></aside></div>';
  renderHands();
  // Caja
  const rows=cs.players.map((p,i)=>{
    const tin=pIn(p), pend=pPend(p), done=p.cashout!=null;
    let pills='<span class="pill">'+p.buys.length+' '+T(p.buys.length===1?"compra":"compras",p.buys.length===1?"buy-in":"buy-ins")+' · '+fm(tin)+'</span>';
    if(pend>0) pills+='<span class="pill pend">'+T("Falta confirmar ","Awaiting ")+fm(pend)+'</span>'; else if(p.buys.length) pills+='<span class="pill ok">'+T("Pagado ✓","Paid ✓")+'</span>';
    if(done){const res=p.cashout-tin;pills+='<span class="pill '+(res>=0?"up":"down")+'">'+fms(res)+'</span>';}
    const buys='<div class="buys">'+p.buys.map((b,k)=>'<span class="buy'+(b.paid?"":" pending")+'">'+fm(b.amt)+(b.paid?' ✓':' <button data-c="confirm" data-i="'+i+'" data-k="'+k+'">'+T("Llegó la transferencia","Transfer received")+'</button>')+(!done?'<button class="x" data-c="delbuy" data-i="'+i+'" data-k="'+k+'" aria-label="'+T("Quitar compra","Remove buy-in")+'">✕</button>':'')+'</span>').join("")+'</div>';
    let act='';
    if(!done){
      if(coOpen===i) act='<form class="coform" data-c="coform" data-i="'+i+'"><label for="co'+i+'" class="k" style="color:var(--muted)">'+T("Fichas al retirarse","Chips at cash-out")+'</label><input type="number" id="co'+i+'" step="0.05" min="0" inputmode="decimal" placeholder="0.00"><button class="btn small" type="submit">'+T("Confirmar retiro","Confirm cash-out")+'</button><button class="btn small" type="button" data-c="cocancel">'+T("Cancelar","Cancel")+'</button></form>';
      else act='<button class="btn small" data-c="rebuy" data-i="'+i+'">'+T("+ Recompra ","+ Rebuy ")+fm(C.buyin)+'</button><button class="btn small" data-c="coopen" data-i="'+i+'">'+T("Retirarse","Cash out")+'</button><span class="summary-line" style="margin:0;font-size:12px">'+T("Recompra solo si quedó en cero","Rebuy only if they are at zero")+'</span>';
    } else {
      act='<span class="result">'+T("Transfiérele ","Send them ")+'<b class="money" style="font-size:20px">'+fm(p.cashout)+'</b></span>'+
        '<button class="btn small'+(p.transferred?" on":"")+'" data-c="sent" data-i="'+i+'">'+(p.transferred?T("Transferencia enviada ✓","Transfer sent ✓"):T("Marcar transferencia enviada","Mark transfer sent"))+'</button>'+
        '<button class="btn small" data-c="undoco" data-i="'+i+'">'+T("Deshacer retiro","Undo cash-out")+'</button>';
    }
    return '<div class="prow'+(done?" done":"")+'"><div class="prow-top"><span class="pname">'+esc(p.name)+'</span>'+pills+'</div>'+buys+'<div class="prow-actions">'+act+'</div></div>';
  }).join("")||'<div class="prow"><span class="summary-line" style="margin:0">'+T("Todavía no hay nadie. Agrega a cada jugador cuando haga su primera compra.","No one yet. Add each player when they make their first buy-in.")+'</span></div>';
  let bal;
  if(!cs.players.length) bal='<div class="balance info">'+T("El cuadre aparece cuando haya compras.","The balance check appears once there are buy-ins.")+'</div>';
  else if(t.seated>0) bal='<div class="balance info">'+T("Siguen "+t.seated+" en la mesa con "+fm(t.onTable)+" en fichas. Cuando todos se retiren, aquí verás si cuadra.",t.seated+" still at the table with "+fm(t.onTable)+" in chips. Once everyone cashes out, you will see here whether it balances.")+'</div>';
  else { const d=r2(t.bought-t.out);
    bal=d===0?'<div class="balance ok">'+T("Cuadra: lo pagado es igual a lo comprado.","Balanced: what you paid out equals what was bought.")+'</div>'
      :d>0?'<div class="balance warn">'+T("Sobran "+fm(d)+": se compró más de lo que se retiró. Vuelvan a contar fichas o revisen si falta registrar un retiro.",fm(d)+" unclaimed: more was bought than was cashed out. Recount the chips or check for a missing cash-out.")+'</div>'
      :'<div class="balance warn">'+T("Faltan "+fm(-d)+": se retiró más de lo que se compró. Vuelvan a contar fichas o revisen si falta registrar una compra.",fm(-d)+" short: more was cashed out than was bought. Recount the chips or check for a missing buy-in.")+'</div>'; }
  if(t.pend>0) bal+='<div class="balance warn">'+T("Falta confirmar "+fm(t.pend)+" en transferencias.","Still waiting on "+fm(t.pend)+" in transfers.")+'</div>';
  $("view-bank").innerHTML='<div data-notr><div class="section-head"><div><h2>'+T("La caja","The bank")+'</h2><p>'+T("Cada compra queda pendiente hasta que confirmes que llegó la transferencia; entrega las fichas al confirmar. Cuando alguien se va, escribe lo que contó en fichas y la app te dice cuánto transferirle.","Each buy-in stays pending until you confirm the transfer arrived; hand over the chips once it is confirmed. When someone leaves, enter what they counted in chips and the app tells you how much to send them.")+'</p></div></div>'+
   '<div class="bank-grid"><div class="bank-list">'+
    '<div class="panel"><h2>'+T("Nuevo jugador","New player")+'</h2><form class="addrow" data-c="addp"><input type="text" id="cashName" maxlength="18" autocomplete="off" placeholder="'+T("Nombre","Name")+'" aria-label="'+T("Nombre del jugador","Player name")+'"><button class="btn small" type="submit">'+T("Agregar con compra de ","Add with buy-in of ")+fm(C.buyin)+'</button></form></div>'+
    rows+'</div>'+
   '<aside class="side"><div class="panel"><h2>'+T("Cuentas","Ledger")+'</h2><div class="ledger">'+
     '<span class="k">'+T("Compras confirmadas","Confirmed buy-ins")+'</span><span>'+fm(t.conf)+'</span>'+
     '<span class="k">'+T("Por confirmar","Pending")+'</span><span>'+fm(t.pend)+'</span>'+
     '<span class="k tot">'+T("Total comprado","Total bought")+'</span><span class="tot">'+fm(t.bought)+'</span>'+
     '<span class="k">'+T("Pagado al retirarse","Cashed out")+'</span><span>'+fm(t.out)+'</span>'+
     '<span class="k tot">'+T("En fichas en la mesa","In chips on the table")+'</span><span class="tot">'+fm(t.onTable)+'</span>'+
    '</div>'+bal+'</div>'+
    '<div class="panel"><h2>'+T("Resumen para WhatsApp","WhatsApp summary")+'</h2><textarea class="summary-box" id="cashSummary" readonly aria-label="'+T("Resumen","Summary")+'">'+esc(cashSummary())+'</textarea><div class="toolbar"><button class="btn small" data-c="copy">'+T("Copiar","Copy")+'</button></div></div>'+
    '<div class="panel"><h2>'+T("Noche de cash","Cash night")+'</h2><p style="margin:0 0 10px;color:var(--muted)">'+T("Borra jugadores, compras y el tiempo de sesión para empezar otra noche.","Clears players, buy-ins and the session time to start a new night.")+'</p><button class="btn danger" data-c="newcash">'+T("Nueva noche de cash","New cash night")+'</button></div>'+
   '</aside></div></div>';
  // Ajustes
  $("cashSetHead").innerHTML='<div data-notr><h2>'+T("Ajustes del cash","Cash game settings")+'</h2><p>'+T("Todo se guarda en este dispositivo.","Everything is saved on this device.")+'</p></div>';
  const tot=r2(C.chips.reduce((a,c)=>a+c.v*c.n,0));
  $("cashSettings").innerHTML='<div class="stack-gap" data-notr><div class="panel"><h2>'+T("Mesa","Table")+'</h2><div class="form-grid">'+
    '<div class="field"><label for="cBuy">'+T("Compra (y cada recompra)","Buy-in (and each rebuy)")+'</label><input type="number" id="cBuy" step="1" min="1" value="'+C.buyin+'"></div>'+
    '<div class="field"><label for="cSb">'+T("Ciega chica","Small blind")+'</label><input type="number" id="cSb" step="0.05" min="0" value="'+C.sb+'"></div>'+
    '<div class="field"><label for="cBb">'+T("Ciega grande","Big blind")+'</label><input type="number" id="cBb" step="0.05" min="0.05" value="'+C.bb+'"><span class="hint">'+T("Cada compra son ","Each buy-in is ")+(C.bb>0?Math.round(C.buyin/C.bb):0)+T(" ciegas grandes."," big blinds.")+'</span></div>'+
   '</div></div>'+
   '<div class="panel"><h2>'+T("Fichas por compra","Chips per buy-in")+'</h2><div class="table-wrap" style="border:0;background:transparent"><table style="min-width:420px"><thead><tr><th>'+T("Color de ficha","Chip color")+'</th><th>'+T("Valor","Value")+'</th><th>'+T("Cantidad","Count")+'</th><th>'+T("Subtotal","Subtotal")+'</th><th></th></tr></thead><tbody>'+
    C.chips.map((c,i)=>'<tr><td><input type="color" data-cc="'+i+'" data-f="c" value="'+c.c+'" aria-label="'+T("Color","Colour")+'" style="width:44px;height:34px;padding:2px;background:transparent;border:1px solid var(--line);border-radius:8px"></td><td><input class="num" type="number" step="0.05" min="0.05" data-cc="'+i+'" data-f="v" value="'+c.v+'"></td><td><input class="num" type="number" min="0" data-cc="'+i+'" data-f="n" value="'+c.n+'"></td><td><span class="chip-dot" style="background:'+c.c+'"></span>'+fm(c.v*c.n)+'</td><td><button class="icon-btn" data-c="delchip" data-i="'+i+'">✕</button></td></tr>').join("")+
   '</tbody></table></div><div class="toolbar"><button class="btn small" data-c="addchip">'+T("+ Agregar ficha","+ Add chip")+'</button></div>'+
   '<p class="summary-line">'+T("Total por compra: ","Total per buy-in: ")+'<b>'+fm(tot)+'</b>. '+(tot===r2(C.buyin)?'<span class="ok">'+T("Coincide con la compra.","Matches the buy-in.")+'</span>':'<span class="bad">'+T("La compra es de ","The buy-in is ")+fm(C.buyin)+T(", ajusta cantidades.",", adjust the counts.")+'</span>')+'</p></div></div>';
}
function st2(k,v){return '<div class="stat"><div class="k">'+k+'</div><div class="v">'+v+'</div></div>';}
function cashSummary(){
  const C=cfg.cash, t=totals(); let d="";
  try{d=new Date().toLocaleDateString(LANG==="en"?"en-US":"es-MX",{weekday:"long",day:"numeric",month:"long"});}catch(e){}
  const L=[];
  L.push("♠ "+APP_NAME+" · Cash game"+(d?" · "+d:""));
  L.push(T("Ciegas ","Blinds ")+fm(C.sb)+"/"+fm(C.bb)+" · Buy-in "+fm(C.buyin)+" · "+T("Sesión ","Session ")+hms(sessMs()).replace(/:\d\d$/,""));
  L.push("");
  const res=cs.players.map(p=>({p,tin:pIn(p),res:p.cashout!=null?p.cashout-pIn(p):null})).sort((a,b)=>(b.res??-1e9)-(a.res??-1e9));
  for(const r of res) L.push(r.p.name+": "+(r.res==null?T("sigue jugando ("+fm(r.tin)+" comprado)","still playing ("+fm(r.tin)+" bought)"):fms(r.res)+T(" (compró "," (bought ")+fm(r.tin)+")"));
  const pays=cs.players.filter(p=>p.cashout>0);
  if(pays.length){L.push("");L.push(T("Transferencias del anfitrión:","Transfers from the host:"));for(const p of pays)L.push("→ "+p.name+": "+fm(p.cashout)+(p.transferred?" ✓":""));}
  L.push("");L.push(T("Total comprado ","Total bought ")+fm(t.bought)+" · "+T("Pagado ","Paid out ")+fm(t.out)+(t.seated===0&&cs.players.length&&r2(t.bought-t.out)===0?" ✓":""));
  return L.join("\n");
}
// Eventos del modo cash
$("modeSwitch").addEventListener("click",e=>{const b=e.target.closest("[data-mode]");if(b)setMode(b.dataset.mode);});
function cashClick(e){
  const b=e.target.closest("[data-c]"); if(!b||b.tagName==="FORM") return;
  const c=b.dataset.c, i=+b.dataset.i, p=cs.players[i], C=cfg.cash;
  if(c==="session"){toggleSession();return;}
  if(c==="fs"){$("btnFs").click();return;}
  if(c==="tv"){setTv(true);return;}
  if(c==="rebuy"&&p){p.buys.push({amt:C.buyin,paid:false});clack(0,.5);clack(.08,.5);}
  if(c==="confirm"&&p){p.buys[+b.dataset.k].paid=true;clack(0,.4);}
  if(c==="delbuy"&&p){p.buys.splice(+b.dataset.k,1);if(!p.buys.length)cs.players.splice(i,1);}
  if(c==="coopen"){coOpen=i;saveCash();renderCash();setTimeout(()=>{const x=$("co"+i);if(x)x.focus();},0);return;}
  if(c==="cocancel"){coOpen=null;}
  if(c==="sent"&&p){p.transferred=!p.transferred;}
  if(c==="undoco"&&p){p.cashout=null;p.transferred=false;}
  if(c==="copy"){const ta=$("cashSummary");const txt=ta.value;try{navigator.clipboard.writeText(txt).then(()=>{b.textContent=T("Copiado ✓","Copied ✓");},()=>{ta.select();});}catch(err){ta.select();}return;}
  if(c==="newcash"){if(b.dataset.armed!=="1"){b.dataset.armed="1";b.textContent=T("¿Seguro? Toca otra vez","Sure? Tap again");return;}cs=freshCash();coOpen=null;saveCash();renderCash();welcomeShow();return;}
  if(c==="addchip"){C.chips.push({v:10,n:0,c:"#7a4fb5"});saveCfg();}
  if(c==="delchip"){C.chips.splice(i,1);saveCfg();}
  saveCash(); renderCash();
}
function cashSubmit(e){
  const f=e.target.closest("form[data-c]"); if(!f) return; e.preventDefault();
  if(f.dataset.c==="addp"){const n=$("cashName").value.trim(); if(!n) return;
    cs.players.push({id:Date.now(),name:n,buys:[{amt:cfg.cash.buyin,paid:false}],cashout:null,transferred:false});
    clack(0,.5);clack(.08,.5);saveCash();renderCash();const x=$("cashName");if(x)x.focus();return;}
  if(f.dataset.c==="coform"){const i=+f.dataset.i,v=parseFloat($("co"+i).value); if(isNaN(v)||v<0) return;
    cs.players[i].cashout=r2(v); coOpen=null; chipRiffle(0,4,.06); saveCash(); renderCash();}
}
function cashInput(e){
  const x=e.target, C=cfg.cash;
  if(x.id==="cBuy"||x.id==="cSb"||x.id==="cBb"){const v=parseFloat(x.value); if(isNaN(v)) return;
    C[{cBuy:"buyin",cSb:"sb",cBb:"bb"}[x.id]]=r2(v); saveCfg(); return;}
  if(x.dataset.cc!=null){const c=C.chips[+x.dataset.cc]; c[x.dataset.f]=x.dataset.f==="c"?x.value:r2(x.value); saveCfg();}
}
["view-cashclock","view-bank","cashSettings"].forEach(id=>{const el=$(id);el.addEventListener("click",cashClick);el.addEventListener("submit",cashSubmit);el.addEventListener("input",cashInput);});
$("cashSettings").addEventListener("change",()=>{const a=document.activeElement&&document.activeElement.id;renderCash();if(a&&$(a))$(a).focus();});
setInterval(()=>{if(cfg.mode==="cash"){const el=$("csTime");if(el)el.textContent=hms(sessMs());}},500);

// ---------- Historial de torneos ----------
const KEY_HIST="hgclock.history.v1";
let HIST=load(KEY_HIST)||[], histAdd=false;
const nk=n=>String(n||"").trim().toLowerCase();
const hDate=iso=>{try{const t=new Date(iso).toLocaleDateString(LANG==="en"?"en-US":"es-MX",{weekday:"short",day:"numeric",month:"short",year:"numeric"});return t.charAt(0).toUpperCase()+t.slice(1);}catch(e){return String(iso).slice(0,10);}};
const hDur=ms=>{const m=Math.round((ms||0)/60000);return m<60?m+" min":Math.floor(m/60)+"h "+String(m%60).padStart(2,"0")+"m";};
function histSorted(){return [...HIST].sort((a,b)=>String(b.date).localeCompare(String(a.date)));}
function histLocal(){save(KEY_HIST,HIST);}
function histWrite(rec){
  const i=HIST.findIndex(r=>r.id===rec.id); if(i>=0) HIST[i]=rec; else HIST.push(rec);
  histLocal(); renderHistory();
}
function histDelete(id){
  HIST=HIST.filter(r=>r.id!==id); histLocal(); renderHistory();
}
function recordTournament(w){
  if(!st.tid){st.tid="t"+Date.now();saveSt();}
  const ps=cfg.payouts||[], pool=poolTotal();
  const res=st.players.map(p=>{
    const place=p.out?p.place:1;
    return {name:p.name,place,rebuys:p.rebuys||0,addons:p.addons||0,
      prize:(st.deal&&st.deal.amounts&&st.deal.amounts[String(p.id)]!=null)?st.deal.amounts[String(p.id)]:(ps[place-1]?Math.round(pool*ps[place-1])/100:0),
      spent:cfg.buyin*(1+(p.rebuys||0))+(cfg.addonOn?(p.addons||0)*cfg.addonCost:0),
      outMs:p.out?(p.outMs??null):st.elapsedMs, firstOutMs:p.firstOutMs??null};
  }).sort((a,b)=>a.place-b.place);
  const rec={id:st.tid,date:new Date().toISOString(),title:cfg.name||"Home Game",players:st.players.length,entries:st.entries,
    rebuys:st.rebuys,addons:st.addons,pool,buyin:cfg.buyin,paid:ps.filter(x=>x>0).length,durationMs:st.elapsedMs,
    lastLevel:levelNumber(st.idx),cur:cur(),deal:!!st.deal,results:res};
  histWrite(rec);
  return HIST.filter(r=>r.results&&r.results.some(x=>x.place===1&&nk(x.name)===nk(w.name))).length;
}
// Estadísticas de todos los torneos
function histStats(){
  const P={}, recs=[];
  const pl=n=>{const k=nk(n);return P[k]||(P[k]={name:n,played:0,wins:0,podiums:0,cashes:0,prize:0,spent:0,bubbles:0,rebuys:0,places:[]});};
  for(const r of histSorted().reverse()){
    for(const x of r.results||[]){
      const p=pl(x.name); p.name=x.name; p.played++; p.places.push(x.place);
      if(x.place===1)p.wins++; if(x.place<=3)p.podiums++; if(x.prize>0)p.cashes++;
      p.prize+=x.prize||0; if(x.spent!=null)p.spent+=x.spent; p.rebuys+=x.rebuys||0;
      if(r.paid&&x.place===r.paid+1&&r.players>r.paid)p.bubbles++;
      if(x.firstOutMs!=null) recs.push({kind:"fast",name:x.name,v:x.firstOutMs,r});
      if(x.rebuys) recs.push({kind:"rebuy",name:x.name,v:x.rebuys,r});
    }
  }
  const list=Object.values(P).sort((a,b)=>b.wins-a.wins||b.podiums-a.podiums||(b.prize-b.spent)-(a.prize-a.spent)||a.name.localeCompare(b.name));
  return {list,recs};
}
function renderHistory(){
  const el=$("view-history"); if(!el) return;
  const H=histSorted(), S=histStats(), c=cur();
  const money=v=>c+fmt(Math.round(v));
  const rec=(icon,label,val,who,when)=>'<div class="hrec"><span class="hico" aria-hidden="true">'+icon+'</span><div><div class="k">'+label+'</div><div class="v">'+val+'</div><div class="w">'+who+(when?' · '+when:'')+'</div></div></div>';
  // récords
  const fast=S.recs.filter(x=>x.kind==="fast").sort((a,b)=>a.v-b.v)[0];
  const rb=S.recs.filter(x=>x.kind==="rebuy").sort((a,b)=>b.v-a.v)[0];
  const king=S.list.filter(p=>p.wins>0)[0];
  const bub=[...S.list].sort((a,b)=>b.bubbles-a.bubbles)[0];
  const best=[...S.list].filter(p=>p.spent>0).sort((a,b)=>(b.prize-b.spent)-(a.prize-a.spent))[0];
  const longT=[...H].filter(r=>r.durationMs).sort((a,b)=>b.durationMs-a.durationMs)[0];
  const bigP=[...H].sort((a,b)=>(b.pool||0)-(a.pool||0))[0];
  const winnerOf=r=>{const w=(r.results||[]).find(x=>x.place===1);return w?esc(w.name):"—";};
  let recs="";
  if(king) recs+=rec("♛",T("Más títulos","Most titles"),king.wins+" "+(king.wins===1?T("título","title"):T("títulos","titles")),esc(king.name));
  if(fast) recs+=rec("↯",T("El que menos duró","Fastest bust"),hDur(fast.v)+" "+T("de juego","of play"),esc(fast.name),hDate(fast.r.date));
  if(rb){const tie=S.recs.filter(x=>x.kind==="rebuy"&&x.v===rb.v), names=[...new Set(tie.map(x=>x.name))], days=new Set(tie.map(x=>hDate(x.r.date)));
    recs+=rec("↻",T("Rey de las recompras","Rebuy king"),rb.v+" "+(rb.v===1?T("recompra","rebuy"):T("recompras","rebuys"))+" "+T("en una noche","in one night"),names.map(esc).join(", "),days.size===1?hDate(rb.r.date):"");}
  if(bub&&bub.bubbles) recs+=rec("◌",T("Imán de burbujas","Bubble magnet"),bub.bubbles+" "+(bub.bubbles===1?T("vez","time"):T("veces","times"))+" "+T("en la burbuja","on the bubble"),esc(bub.name));
  if(best&&best.prize-best.spent>0) recs+=rec("$",T("Más ganancia neta","Biggest net winner"),"+"+money(best.prize-best.spent),esc(best.name));
  if(longT) recs+=rec("◷",T("Torneo más largo","Longest tournament"),hDur(longT.durationMs),T("Ganó ","Won by ")+winnerOf(longT),hDate(longT.date));
  if(bigP&&bigP.pool) recs+=rec("◆",T("Bote más grande","Biggest prize pool"),money(bigP.pool),T("Ganó ","Won by ")+winnerOf(bigP),hDate(bigP.date));
  // tabla de jugadores
  const rows=S.list.map((p,i)=>{
    const net=p.prize-p.spent, avg=p.places.reduce((a,b)=>a+b,0)/p.places.length;
    return '<tr><td class="rk">'+(i+1)+'</td><td class="nm">'+esc(p.name)+(p.wins?' <span class="crowns" aria-label="'+p.wins+'">'+"♛".repeat(Math.min(p.wins,5))+'</span>':'')+'</td><td>'+p.played+'</td><td>'+p.wins+'</td><td>'+p.podiums+'</td><td>'+avg.toFixed(1)+'</td><td class="'+(net>0?"pos":net<0?"neg":"")+'">'+(p.spent?(net>0?"+":net<0?"−":"")+money(Math.abs(net)):"—")+'</td></tr>';
  }).join("");
  // torneos
  const cards=H.map(r=>{
    const R=r.results||[], by=k=>R.find(x=>x.place===k);
    const pod=[1,2,3].map(k=>{const x=by(k);return x?'<li class="pl'+k+'"><span>'+(k===1?"♛":k+(LANG==="en"?(k===2?"nd":"rd"):".º"))+'</span><b>'+esc(x.name)+'</b>'+(x.prize?'<i>'+money(x.prize)+'</i>':'')+'</li>':'';}).join("");
    const fx=R.filter(x=>x.firstOutMs!=null).sort((a,b)=>a.firstOutMs-b.firstOutMs)[0];
    const rx=R.filter(x=>x.rebuys>0).sort((a,b)=>b.rebuys-a.rebuys);
    let aw="";
    if(fx) aw+='<span>↯ '+T("Primero en salir: ","First out: ")+'<b>'+esc(fx.name)+'</b> ('+hDur(fx.firstOutMs)+')</span>';
    if(rx.length) aw+='<span>↻ '+T("Recompras: ","Rebuys: ")+rx.map(x=>'<b>'+esc(x.name)+'</b> ('+x.rebuys+')').join(", ")+'</span>';
    const facts=[r.players+" "+T("jugadores","players"),r.pool?money(r.pool)+" "+T("en premios","prize pool"):"",r.durationMs?hDur(r.durationMs):"",r.lastLevel?T("hasta el nivel ","up to level ")+r.lastLevel:"",r.deal?T("con trato","with a deal"):"",r.manual?T("agregado a mano","added by hand"):""].filter(Boolean).join(" · ");
    return '<article class="panel hcard"><header><div><div class="hdate">'+hDate(r.date)+'</div><div class="hfacts">'+facts+'</div></div><button class="icon-btn" data-h="del" data-id="'+esc(r.id)+'" aria-label="'+T("Borrar torneo","Delete tournament")+'">✕</button></header><ol class="hpod">'+pod+'</ol>'+(aw?'<div class="haw">'+aw+'</div>':'')+'</article>';
  }).join("");
  const form=histAdd?'<form class="panel hform" data-h="addform"><h2>'+T("Agregar torneo pasado","Add a past tournament")+'</h2><div class="hgrid">'+
    '<div class="field"><label for="hfDate">'+T("Fecha","Date")+'</label><input type="date" id="hfDate" required value="'+new Date().toISOString().slice(0,10)+'"></div>'+
    '<div class="field"><label for="hfW">'+T("Campeón","Champion")+'</label><input id="hfW" maxlength="18" required autocomplete="off"></div>'+
    '<div class="field"><label for="hf2">'+T("2.º lugar","2nd place")+'</label><input id="hf2" maxlength="18" autocomplete="off"></div>'+
    '<div class="field"><label for="hf3">'+T("3.er lugar","3rd place")+'</label><input id="hf3" maxlength="18" autocomplete="off"></div>'+
    '<div class="field"><label for="hfN">'+T("Jugadores","Players")+'</label><input type="number" id="hfN" min="2" value="8"></div>'+
    '<div class="field"><label for="hfP">'+T("Bote total","Prize pool")+'</label><input type="number" id="hfP" min="0" step="1" placeholder="160"></div>'+
    '</div><div class="toolbar"><button class="btn primary small" type="submit">'+T("Guardar","Save")+'</button><button class="btn small" type="button" data-h="cancel">'+T("Cancelar","Cancel")+'</button></div></form>':'';
  el.innerHTML='<div class="section-head"><div><h2>'+T("Salón de la fama","Hall of Fame")+'</h2><p>'+T("Cada torneo se guarda solo cuando hay campeón. También puedes agregar noches pasadas a mano.","Every tournament is saved automatically when there is a champion. You can also add past nights by hand.")+'</p></div><div class="toolbar" style="margin-top:0"><button class="btn small" data-h="add">'+T("+ Agregar torneo pasado","+ Add past tournament")+'</button></div></div>'+form+
    (H.length?
      (recs?'<div class="panel"><h2>'+T("Récords","Records")+'</h2><div class="hrecs">'+recs+'</div></div>':'')+
      '<div class="panel"><h2>'+T("Tabla de jugadores","Player standings")+'</h2><div class="hwrap"><table class="htable"><thead><tr><th></th><th>'+T("Jugador","Player")+'</th><th>'+T("Jugados","Played")+'</th><th>'+T("Títulos","Titles")+'</th><th>'+T("Podios","Podiums")+'</th><th>'+T("Lugar prom.","Avg finish")+'</th><th>'+T("Neto","Net")+'</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>'+
      '<h3 class="hsub">'+T("Torneos","Tournaments")+' <span>'+H.length+'</span></h3><div class="hcards">'+cards+'</div>'
    :'<div class="panel hempty"><div class="hbig">♛</div><p>'+T("Todavía no hay torneos. El primer campeón quedará aquí para siempre.","No tournaments yet. The first champion will live here forever.")+'</p></div>');
}
$("view-history").addEventListener("click",e=>{
  const b=e.target.closest("[data-h]"); if(!b||b.tagName==="FORM") return;
  const a=b.dataset.h;
  if(a==="add"){histAdd=true;renderHistory();setTimeout(()=>{const x=$("hfW");if(x)x.focus();},0);}
  if(a==="cancel"){histAdd=false;renderHistory();}
  if(a==="del"){if(b.dataset.armed!=="1"){b.dataset.armed="1";b.textContent=T("¿Borrar?","Delete?");b.classList.add("armed");return;}histDelete(b.dataset.id);}
});
$("view-history").addEventListener("submit",e=>{
  const f=e.target.closest("form[data-h='addform']"); if(!f) return; e.preventDefault();
  const w=$("hfW").value.trim(); if(!w) return;
  const n=Math.max(2,parseInt($("hfN").value,10)||2), pool=parseFloat($("hfP").value)||0, ps=cfg.payouts||[];
  const names=[w,$("hf2").value.trim(),$("hf3").value.trim()];
  const results=names.map((nm,i)=>nm?{name:nm,place:i+1,rebuys:0,addons:0,prize:ps[i]?Math.round(pool*ps[i])/100:0,spent:cfg.buyin,outMs:null,firstOutMs:null}:null).filter(Boolean);
  const d=$("hfDate").value||new Date().toISOString().slice(0,10);
  histAdd=false;
  histWrite({id:"m"+Date.now(),date:d+"T20:00:00",title:cfg.name||"Home Game",players:n,entries:n,rebuys:0,addons:0,pool,buyin:cfg.buyin,paid:ps.filter(x=>x>0).length,durationMs:0,lastLevel:0,cur:cur(),manual:true,results});
});
// TODO v2: En vivo — sincronizar el historial (colección "tournaments") con el backend de cuentas.

// ---------- Mi perfil: cada jugador ve sus torneos ----------
// El jugador elige su nombre y se recuerda en este dispositivo.
const KEY_ME="hgclock.me";
function myPick(){try{return localStorage.getItem(KEY_ME)||""}catch(e){return ""}}
function myName(){const p=myPick(); return p?{name:p}:null;}
function playerStats(name){
  const k=nk(name), rows=[];
  for(const r of histSorted()){const x=(r.results||[]).find(y=>nk(y.name)===k); if(x) rows.push({r,x});}
  const s={rows,played:rows.length,wins:0,podiums:0,cashes:0,prize:0,spent:0,rebuys:0,bubbles:0,best:null,bestN:0,sum:0,surv:[]};
  rows.forEach(({r,x})=>{
    if(x.place===1)s.wins++; if(x.place<=3)s.podiums++; if(x.prize>0)s.cashes++;
    s.prize+=x.prize||0; s.spent+=x.spent||0; s.rebuys+=x.rebuys||0; s.sum+=x.place;
    if(r.paid&&x.place===r.paid+1&&r.players>r.paid)s.bubbles++;
    if(s.best==null||x.place<s.best){s.best=x.place;s.bestN=1;} else if(x.place===s.best)s.bestN++;
    if(r.durationMs&&x.outMs!=null) s.surv.push(Math.min(1,x.outMs/r.durationMs));
  });
  const S=histStats(); s.rank=S.list.findIndex(p=>nk(p.name)===k)+1; s.of=S.list.length;
  return s;
}
function renderMe(){
  const el=$("view-me"); if(!el||el.hidden) return;
  const c=cur(), money=v=>c+fmt(Math.round(v)), names=histStats().list.map(p=>p.name), me=myName();
  let h='';
  if(!me){
    h+='<div class="section-head"><div><h2>'+T("¿Quién eres?","Who are you?")+'</h2><p>'+T("Elige tu nombre para ver tus torneos, tus números y tu lugar en la tabla.","Pick your name to see your tournaments, your numbers and where you rank.")+'</p></div></div>';
    h+=names.length?'<div class="panel"><div class="me-pick">'+names.map(n=>'<button class="btn" data-me="pick" data-n="'+esc(n)+'">'+esc(n)+'</button>').join("")+'</div></div>'
      :'<div class="panel hempty"><div class="hbig">♠</div><p>'+T("Todavía no hay torneos guardados. Cuando juegues el primero, aquí aparecerán tus números.","No tournaments saved yet. Once you play the first one, your numbers show up here.")+'</p></div>';
  } else {
    const s=playerStats(me.name), net=s.prize-s.spent;
    const avg=s.played?s.sum/s.played:0, surv=s.surv.length?Math.round(s.surv.reduce((a,b)=>a+b,0)/s.surv.length*100):null;
    const ordS=n=>LANG==="en"?ordEn(n):n+".º";
    h+='<div class="panel me-hero"><div class="me-av" aria-hidden="true">'+esc(me.name.charAt(0).toUpperCase())+'</div><div class="me-id"><div class="me-name">'+esc(me.name)+'</div><div class="me-how">'+
      T("Elegido en este dispositivo","Picked on this device")+' · <button class="linkbtn" data-me="change">'+T("Cambiar","Change")+'</button>'+'</div></div>'+
      (s.rank?'<div class="me-rank"><span>'+T("En la tabla","Standing")+'</span><b>#'+s.rank+'</b><i>'+T("de ","of ")+s.of+'</i></div>':'')+'</div>';
    if(!s.played){h+='<div class="panel hempty"><p>'+T("Todavía no apareces en ningún torneo guardado.","You don't appear in any saved tournament yet.")+'</p></div>';}
    else{
      const tile=(k,v,sub,cls)=>'<div class="me-tile'+(cls?" "+cls:"")+'"><div class="k">'+k+'</div><div class="v">'+v+'</div>'+(sub?'<div class="w">'+sub+'</div>':'')+'</div>';
      h+='<div class="me-tiles">'+
        tile(T("Torneos","Tournaments"),s.played,"")+
        tile(T("Títulos","Titles"),s.wins?"♛ "+s.wins:"0",s.podiums+" "+T(s.podiums===1?"podio":"podios",s.podiums===1?"podium":"podiums"),s.wins?"gold":"")+
        tile(T("Cobros","Cashes"),s.cashes,Math.round(s.cashes/s.played*100)+"% "+T("de las veces","of the time"))+
        tile(T("Neto","Net"),(net>0?"+":net<0?"−":"")+money(Math.abs(net)),T("ganado ","won ")+money(s.prize)+" · "+T("gastado ","spent ")+money(s.spent),net>0?"pos":net<0?"neg":"")+
        tile(T("Mejor resultado","Best finish"),s.best===1?"♛":ordS(s.best),s.bestN>1?s.bestN+" "+T("veces","times"):"")+
        tile(T("Lugar promedio","Avg finish"),avg.toFixed(1),"")+
        (surv!=null?tile(T("Sobrevives","You last"),surv+"%",T("del torneo en promedio","of the tournament on average")):"")+
        tile(T("Recompras","Rebuys"),s.rebuys,s.bubbles?s.bubbles+" "+T(s.bubbles===1?"vez en la burbuja":"veces en la burbuja",s.bubbles===1?"bubble":"bubbles"):"")+
        '</div>';
      const last=s.rows.slice(0,10).reverse();
      h+='<div class="panel"><h2>'+T("Tus últimos torneos","Your recent form")+'</h2><div class="me-form">'+last.map(({r,x})=>{
          const cls=x.place===1?"f1":x.place<=3?"f3":x.prize>0?"fc":"";
          return '<span class="'+cls+'" title="'+esc(hDate(r.date))+'"><b>'+(x.place===1?"♛":x.place)+'</b><i>/'+(r.players||"?")+'</i></span>';
        }).join("")+'</div><p class="me-legend"><span class="f1"></span>'+T("Campeón","Champion")+'<span class="f3"></span>'+T("Podio","Podium")+'<span class="fc"></span>'+T("Cobró","Cashed")+'</p></div>';
      h+='<div class="panel"><h2>'+T("Tus torneos","Your tournaments")+'</h2><div class="hwrap"><table class="htable me-table"><thead><tr><th>'+T("Fecha","Date")+'</th><th>'+T("Lugar","Finish")+'</th><th>'+T("Premio","Prize")+'</th><th>'+T("Neto","Net")+'</th></tr></thead><tbody>'+
        s.rows.map(({r,x})=>{const n=(x.prize||0)-(x.spent||0);return '<tr><td>'+esc(hDate(r.date))+(r.deal?' <span class="me-tag">'+T("trato","deal")+'</span>':'')+'</td><td class="nm">'+(x.place===1?"♛ ":"")+ordS(x.place)+' <span class="me-of">'+T("de ","of ")+(r.players||"?")+'</span></td><td>'+(x.prize?money(x.prize):"—")+'</td><td class="'+(n>0?"pos":n<0?"neg":"")+'">'+(x.spent!=null?(n>0?"+":n<0?"−":"")+money(Math.abs(n)):"—")+'</td></tr>';}).join("")+
        '</tbody></table></div></div>';
    }
  }
  // TODO v2: En vivo — panel del organizador para vincular cuentas de jugadores a nombres.
  if(!$("view-me").hidden) el.innerHTML=h;
}
$("view-me").addEventListener("click",e=>{
  const b=e.target.closest("[data-me]"); if(!b) return; const a=b.dataset.me, n=b.dataset.n;
  if(a==="pick"){try{localStorage.setItem(KEY_ME,n)}catch(e){} renderMe(); window.scrollTo({top:0});}
  if(a==="change"){try{localStorage.removeItem(KEY_ME)}catch(e){} renderMe();}
});

// ---------- Respaldo: exportar / importar todo lo guardado en este dispositivo ----------
// JSON = objetos guardados con save(); RAW = cadenas sueltas (idioma, "quién soy").
const BK_JSON={cfg:KEY_CFG,state:KEY_ST,fav:KEY_FAV,cash:KEY_CASH,history:KEY_HIST}, BK_RAW={lang:"hgclock.lang",me:KEY_ME};
const BK_SHAPE={cfg:"object",state:"object",fav:"object",cash:"object",history:"array",lang:"string",me:"string"};
let bkPending=null;
function backupData(){
  const data={}; Object.entries(BK_JSON).forEach(([k,key])=>{const v=load(key); if(v!=null) data[k]=v;});
  Object.entries(BK_RAW).forEach(([k,key])=>{try{const v=localStorage.getItem(key); if(v!=null) data[k]=v;}catch(e){}});
  return {app:"blind-royale",schemaV:SCHEMA_V,exportedAt:new Date().toISOString(),data};
}
function backupCheck(b){
  if(!b||b.app!=="blind-royale"||!Number.isInteger(b.schemaV)||b.schemaV<1||!b.data||typeof b.data!=="object") return "bad";
  if(b.schemaV>SCHEMA_V) return "newer";
  for(const [k,v] of Object.entries(b.data)){const s=BK_SHAPE[k]; if(!s) continue;
    if(s==="array"?!Array.isArray(v):s==="object"?(v===null||typeof v!=="object"||Array.isArray(v)):typeof v!==s) return "bad";}
  return "";
}
function importBox(h){const el=$("importBox"); el.innerHTML=h||""; el.hidden=!h;}
$("btnExport").onclick=()=>{
  const b=backupData(), url=URL.createObjectURL(new Blob([JSON.stringify(b,null,1)],{type:"application/json"}));
  const a=document.createElement("a"); a.href=url; a.download=APP_NAME.toLowerCase().replace(/\s+/g,"-")+"-"+T("respaldo","backup")+"-"+new Date().toLocaleDateString("en-CA")+".json";
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  const btn=$("btnExport"), lbl=btn.textContent; btn.textContent=T("✓ Respaldo descargado","✓ Backup downloaded"); setTimeout(()=>btn.textContent=lbl,2200);
};
$("btnImport").onclick=()=>{importBox(""); $("fImport").value=""; $("fImport").click();};
$("fImport").addEventListener("change",async()=>{
  const f=$("fImport").files[0]; if(!f) return; let b=null;
  try{b=JSON.parse(await f.text());}catch(e){}
  const err=backupCheck(b);
  if(err){bkPending=null; importBox('<p class="hint" style="color:#ff9fb1;margin:10px 0 0">'+(err==="newer"
    ?T("Este respaldo viene de una versión más nueva de la app. Actualízala e inténtalo de nuevo.","This backup comes from a newer version of the app. Update it and try again.")
    :T("Ese archivo no es un respaldo válido de ","That file is not a valid backup of ")+esc(APP_NAME)+".")+'</p>'); return;}
  bkPending=b; const n=(b.data.history||[]).length, when=hDate(b.exportedAt);
  importBox('<p style="margin:10px 0">'+T("Respaldo del ","Backup from ")+esc(when)+" · "+n+" "+T(n===1?"torneo":"torneos",n===1?"tournament":"tournaments")+'. <b>'+
    T("Esto reemplaza todos los datos de este dispositivo: ajustes, torneo en curso, cash e historial.","This replaces all data on this device: settings, current tournament, cash game and history.")+'</b></p>'+
    '<div class="toolbar" style="margin-top:0"><button class="btn danger" data-imp="ok">'+T("Reemplazar mis datos","Replace my data")+'</button><button class="btn" data-imp="no">'+T("Cancelar","Cancel")+'</button></div>');
});
$("importBox").addEventListener("click",e=>{
  const b=e.target.closest("[data-imp]"); if(!b) return;
  if(b.dataset.imp==="no"||!bkPending){bkPending=null; importBox(""); return;}
  const d=bkPending.data;
  try{
    Object.entries(BK_JSON).concat(Object.entries(BK_RAW)).forEach(([k,key])=>{
      if(d[k]==null) localStorage.removeItem(key); else localStorage.setItem(key,k in BK_RAW?d[k]:JSON.stringify(d[k]));
    });
    localStorage.setItem(KEY_SCHEMA,String(bkPending.schemaV)); // al recargar, migrate() lo sube a la versión actual
    sessionStorage.setItem("hgclock.welcomed","1"); sessionStorage.setItem("hgclock.view","setup");
  }catch(e){importBox('<p class="hint" style="color:#ff9fb1;margin:10px 0 0">'+T("No se pudo guardar el respaldo en este dispositivo.","Couldn't save the backup on this device.")+'</p>'); return;}
  location.reload();
});

// ---------- TODO v2: En vivo ----------
// El organizador publicaba su reloj y los jugadores lo seguían en su celular (modo amigo, solo lectura).
// Se publicaba al guardar cfg/st (debounce 600 ms) un documento live/now con: on, name, cur, idx,
// levels[{t,sb,bb,ante,min}], running, endAt, remaining, elapsedMs, entries, left, rebuys, pool,
// payouts, chips, rebuyOn, rebuyUntil, players[{n,out,place,rb}], champ, updatedAt.
// La vista mostraba nivel, ciegas, tiempo, stack promedio, bote, premios y quién sigue en pie.
// Implementación v1 completa en poker-nights-original.html (funciones live*: push, render, listen).

// Mantener la pantalla encendida mientras corre el reloj
let wake=null;
async function requestWake(){try{if("wakeLock" in navigator&&!wake){wake=await navigator.wakeLock.request("screen");wake.addEventListener("release",()=>wake=null);}}catch(e){}}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){if(st.running)requestWake();tick();}});

// Arranque
syncToggles(); renderHands(); render(); renderStructure();
let welcomed=false; try{welcomed=sessionStorage.getItem("hgclock.welcomed")==="1"}catch(e){}
setLang(LANG);
renderCash(); if(cfg.mode==="cash") show("clock");
if(!welcomed&&!cs.started&&freshGame()&&!st.running&&remainingMs()>=durMs(st.idx)) welcomeShow();
try{const v=sessionStorage.getItem("hgclock.view"); if(v&&v!=="clock") show(v);}catch(e){}
setInterval(tick,250);
})();
