/* Public static fallback. No API responses in Cache Storage; read only scoped IndexedDB. */
(async function () {
  var status = document.getElementById('status'), items = document.getElementById('items');
  function clear() { items.replaceChildren(); status.textContent = 'Cache purgé. Reconnectez-vous en ligne.'; }
  addEventListener('storage', function(e) { if(e.key === 'atlas.journal.purge') clear(); });
  try {
    var root = await new Promise(function(resolve,reject) {
      var request = indexedDB.open('atlas-journal-v2',1);
      request.onupgradeneeded = function() { request.result.createObjectStore('cache'); };
      request.onerror = reject;
      request.onsuccess = function() {
        var db=request.result,tx=db.transaction('cache'),read=tx.objectStore('cache').get('root');
        read.onsuccess=function(){resolve(read.result);}; read.onerror=reject;tx.oncomplete=function(){db.close();};
      };
    });
    if (!root) root=JSON.parse(localStorage.getItem('atlas.journal.cache.v2') || 'null');
    // Offline access is device-local, not fresh server authorization; logout purges it.
    if (!root || root.cacheVersion !== 2 || !root.scope || !root.editions.length) {status.textContent='Aucune édition enregistrée. Ouvrez le Journal en ligne une première fois.';return;}
    status.textContent='Copie privée enregistrée sur cet appareil. Actions et mises à jour disponibles au retour dans l’application en ligne.';
    root.editions[0].payload.items.forEach(function(item){
      var article=document.createElement('article'),title=document.createElement('h2'),body=document.createElement('p');
      title.textContent=item.title;body.textContent=item.summary + (item.whyItMatters ? '\n\n'+item.whyItMatters : '');
      article.append(title,body);items.append(article);
    });
  } catch {status.textContent='Cache local indisponible.';}
})();
