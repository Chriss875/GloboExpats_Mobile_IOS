// au058_deleteall_r15.js — delete-all CONFIRMED path with a correct read-back probe.
// r14 result: UI deleted + unread 0 + "No notifications yet." rendered, but the
// GET /notifications readback still returned 7 rows => the mobile client calls
// DELETE /delete-all with NO BODY while the backend REQUIRES {ids:[...]}, so the
// server 4xx'd and the rows survived. This run captures the wire evidence.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP='http://localhost:9131', UNIT='AU-058';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const fx=JSON.parse(fs.readFileSync('/tmp/au058_fixtures_r14.json','utf8'));
  const tok=fx.buyerToken;
  const before=(await L.api(tok,'GET','/api/v1/notifications?page=0&size=50')).json.content.length;
  console.log('rows before:',before);

  // direct backend contract check: what does DELETE /delete-all need?
  const noBody=await L.api(tok,'DELETE','/api/v1/notifications/delete-all');
  console.log('DELETE /delete-all (no body):', noBody.status, JSON.stringify(noBody.json).slice(0,140));
  const withIds=await L.api(tok,'DELETE','/api/v1/notifications/delete-all',{ids:(await L.api(tok,'GET','/api/v1/notifications?page=0&size=50')).json.content.map(n=>n.notificationId)});
  console.log('DELETE /delete-all ({ids}):', withIds.status);
  const afterRows=((await L.api(tok,'GET','/api/v1/notifications?page=0&size=50')).json.content||[]).length;
  console.log('rows after body-bearing call:', afterRows);

  fs.writeFileSync('/tmp/au058_deleteall_wire.json', JSON.stringify({
    before, noBodyStatus:noBody.status, noBodyErr:noBody.json,
    idsStatus:withIds.status, afterRows }, null, 1));
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
