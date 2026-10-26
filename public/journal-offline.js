import { journalCacheStorage } from './journal-cache-storage.mjs';
import { mergeJournalPayload } from './journal-offline-cache.mjs';
const status = document.getElementById('status'), items = document.getElementById('items'), reader = document.getElementById('reader');
let storage, token, payload, reading, seconds=0, lastTick=performance.now(), lastActivity=performance.now(), unreadOnly=false, alive=true, flushing=false;
function deny(message) { alive=false; items.replaceChildren(); reader.hidden=true; document.getElementById('article').textContent=''; status.textContent=message; }
function clear() { sessionStorage.removeItem('atlas.journal.offline-capability'); deny('Cache purgé. Ouvrez le Journal en ligne pour réautoriser cet onglet.'); }
addEventListener('storage', e => { if(e.key==='atlas.journal.purge' || (e.key==='atlas.journal.scope' && e.newValue!==token?.scope)) clear(); });
async function snapshot() { const root=await storage.cache.snapshot(token); if(!root) {clear();throw Error('Scope invalidated');} return root; }
async function queue(operation) {
 await storage.cache.enqueue(token,operation);const root=await snapshot();payload=mergeJournalPayload(payload,payload,root.queue);
 if(!await storage.cache.save(token,payload,undefined,Date.now())) throw Error('Scope invalidated');
 status.textContent='Hors ligne — changements enregistrés sur cet appareil, synchronisation au retour dans l’application.';
}
async function state(item,value) {try {await queue({id:crypto.randomUUID(),kind:'state',body:{workspaceId:JSON.parse(token.scope)[1],editionId:item.editionId,itemId:item.id,status:value},previousState:item.state});render();}catch(error){status.textContent=error.message;}}
function position() { const max=document.documentElement.scrollHeight-innerHeight;return Math.round((max>0 ? Math.min(1,Math.max(0,scrollY/max)) : 1)*100)/100; }
async function flush() {
 if(!alive || !reading || seconds<1 || flushing) return;flushing=true;
 const delta=Math.min(120,Math.floor(seconds)),item=reading;seconds-=delta;const id=crypto.randomUUID();
 try {await queue({id,kind:'progress',body:{workspaceId:JSON.parse(token.scope)[1],batchId:id,events:[{editionId:item.editionId,itemId:item.id,deltaSeconds:delta,position:position()}]}});}
 catch(error) {seconds+=delta;status.textContent='Temps non enregistré : '+error.message;}finally{flushing=false;}
}
function render() {
 if(!alive)return;const category=document.getElementById('category').value;items.replaceChildren();
 for(const item of payload.items.filter(i=>(!unreadOnly || i.state==='new') && (category==='all'||i.category===category))) {
  const article=document.createElement('article'),button=document.createElement('button'),meta=document.createElement('p');button.textContent=item.title;meta.textContent=(item.category||'Journal')+' · '+(item.state||'new');
  button.onclick=async()=>{await flush();reading=item;seconds=0;lastTick=lastActivity=performance.now();items.hidden=true;reader.hidden=false;document.getElementById('title').textContent=item.title;document.getElementById('article').textContent=item.summary+(item.whyItMatters?'\n\n'+item.whyItMatters:'');if(item.state==='new')await state(item,'read');scrollTo(0,0);};
  article.append(button,meta);items.append(article);
 }
}
try {
 token=JSON.parse(sessionStorage.getItem('atlas.journal.offline-capability') || 'null');
 if(!token?.scope || !token?.epoch)throw Error('Nouvel onglet hors ligne non autorisé. Ouvrez d’abord le Journal en ligne dans cet onglet.');
 storage=await journalCacheStorage();const root=await snapshot();payload=root.editions[0]?.payload;if(!payload)throw Error('Aucune édition enregistrée.');payload=mergeJournalPayload(payload,payload,root.queue);
 for(const c of [...new Set(payload.items.map(i=>i.category))]){const option=document.createElement('option');option.value=option.textContent=c;document.getElementById('category').append(option);}
 status.textContent='Hors ligne — copie privée de cet onglet. Les couvertures nécessitent le réseau.';
 document.getElementById('all').onclick=()=>{unreadOnly=false;render();};document.getElementById('unread').onclick=()=>{unreadOnly=true;render();};document.getElementById('category').onchange=render;
 document.getElementById('back').onclick=async()=>{await flush();reading=null;reader.hidden=true;items.hidden=false;render();};document.getElementById('done').onclick=async()=>{if(reading)await state(reading,'done');};
 document.getElementById('stats').onclick=()=>{status.textContent=payload.items.filter(i=>i.state!=='new').length+'/'+payload.items.length+' lus — temps et statistiques serveur actualisés en ligne.';};
 document.getElementById('exit').onclick=async()=>{await flush();await storage.cache.purge();localStorage.setItem('atlas.journal.purge',crypto.randomUUID());clear();};
 for(const event of ['scroll','touchstart','keydown','pointerdown'])addEventListener(event,()=>{lastActivity=performance.now();},{passive:true});
 setInterval(()=>{const now=performance.now(),elapsed=now-lastTick;lastTick=now;if(alive&&reading&&document.visibilityState==='visible'&&document.hasFocus()&&now-lastActivity<60000&&elapsed<=2000)seconds+=elapsed/1000;if(seconds>=15)void flush();},1000);
 addEventListener('blur',()=>{lastTick=performance.now();void flush();});document.addEventListener('visibilitychange',()=>{lastTick=performance.now();if(document.hidden)void flush();});addEventListener('pagehide',()=>{void flush();});render();
}catch(error){deny(error.message || 'Cache privé indisponible.');}
