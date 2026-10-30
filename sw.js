// Guarda o app no celular para funcionar sem internet na obra.
// Só apaga caches do próprio checklist: o Diário de Obra usa o mesmo site e tem o cache dele.
const CACHE="checklist-ectas-v3";
const ARQUIVOS=["./","index.html","style.css?v=2","app.js?v=2","config.js?v=1","logo.png","icon-192.png","icon-512.png","manifest.webmanifest","lib/jspdf.umd.min.js","lib/xlsx.full.min.js"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ARQUIVOS)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith("checklist-ectas-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  const u=new URL(e.request.url);
  if(u.origin!==location.origin&&!u.host.includes("fonts.g"))return;   // a central (Google) nunca passa pelo cache
  e.respondWith(
    fetch(e.request,u.origin===location.origin?{cache:"no-cache"}:{}).then(r=>{
      if(r.ok){const c=r.clone();caches.open(CACHE).then(k=>k.put(e.request,c));}
      return r;
    }).catch(()=>caches.match(e.request,{ignoreSearch:true}))
  );
});
