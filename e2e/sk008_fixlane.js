// sk008_fixlane.js — CONTROL LANE: serve the SAME c6b4d61 bundle on :9132 and patch the
// sandbox CORS allowlist to include :9132, to prove the :9131 failures are lane-config,
// not app code. Sandbox-only change (allowed); never touches dev/live.
const {execSync}=require('child_process');
const http=require('http');
const path=require('path');
const ROOT='/home/devsystemadmin/GloboExpats_Mobile/build/web';
const srv=http.createServer((req,res)=>{
  let f=req.url.split('#')[0].split('?')[0];
  if(f==='/'||f==='/index.html') f='/index.html';
  const fp=path.join(ROOT,f==='/'?'/index.html':f);
  require('fs').readFile(fp,(e,d)=>{ if(e){res.writeHead(404,{'Content-Type':'text/html'});res.end('<h1>404</h1>');return;}
    const ext=path.extname(fp);
    res.writeHead(200,{'Content-Type':ext==='.js'?'text/javascript':ext==='.html'?'text/html':'application/octet-stream'});
    res.end(d); });
});
srv.listen(9132,'0.0.0.0',()=>console.log('control lane on :9132'));
