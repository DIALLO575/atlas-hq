// Runs only in remote CI against its own disposable Chromium, no user's Browser.
import { writeFileSync } from 'node:fs';
const target = await fetch('http://127.0.0.1:9222/json/new?'+encodeURIComponent('about:blank'), {method:'PUT'}).then(r=>r.json());
const socket = new WebSocket(target.webSocketDebuggerUrl); let seq=0; const pending=new Map();
const watchdog=setTimeout(()=>{console.error('Journal browser test timed out');process.exit(1);},30000);
await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id && pending.has(message.id)){const {resolve,reject}=pending.get(message.id);pending.delete(message.id);message.error?reject(Error(JSON.stringify(message.error))):resolve(message.result);}});
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
try {
 await call('Page.enable');
 const loaded = new Promise(resolve=>socket.addEventListener('message',function listener(event){if(JSON.parse(event.data).method==='Page.loadEventFired'){socket.removeEventListener('message',listener);resolve();}}));
 await call('Page.navigate',{url:'http://127.0.0.1:8765/tests/browser/journal-cache-real.html'});await loaded;
 const result=await call('Runtime.evaluate',{expression:'new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(document.body.dataset.result){clearInterval(timer);resolve(document.getElementById("result").textContent);}else if(++n>200){clearInterval(timer);reject(Error("Test page did not complete"));}},100);})',awaitPromise:true,returnByValue:true});
 if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));
 const report=JSON.parse(result.result.value);writeFileSync('journal-cache-browser-result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(!report.ok)process.exitCode=1;
}finally{clearTimeout(watchdog);socket.close();}
