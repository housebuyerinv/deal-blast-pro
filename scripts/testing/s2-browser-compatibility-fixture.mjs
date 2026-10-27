// Local-only tool-compatibility fixture. Never imports app config or real SDK.
import http from 'node:http';
import process from 'node:process';
const page = `<!doctype html><title>BuyerMatch local compatibility</title>
<h1>LOCAL ONLY - no login or credentials</h1><p id="status" role="status">Fixture ready</p>
<button id="verify">Check synthetic in-app fixture</button>
<script>globalThis.__dealBlastSupabaseClient={supabaseUrl:'https://qxhhlprentrufobpcgna.supabase.co',auth:{getUser:async()=>({data:{user:{id:'368f5f93-acf7-4cc3-9805-a4c0817506c3',email:'dbp-s2-pro-1792721835370@example.com',role:'authenticated',email_confirmed_at:'2026-10-20T00:00:00Z'}}})}};
document.getElementById('verify').onclick=async()=>{const r=await globalThis.__dealBlastSupabaseClient.auth.getUser(); document.getElementById('status').textContent=r.data.user.id==='368f5f93-acf7-4cc3-9805-a4c0817506c3'?'SYNTHETIC UI COMPATIBILITY PASS - NOT AUTHENTICATION':'UNVERIFIED';};</script>`;
http.createServer((req, res) => {
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; connect-src 'none'");
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/html');
  if (req.method !== 'GET' || req.url !== '/') { res.writeHead(404); res.end(); return; }
  res.end(page);
}).listen(5197, '127.0.0.1', () => process.stdout.write('LOCAL_FIXTURE_READY_5197\n'));
