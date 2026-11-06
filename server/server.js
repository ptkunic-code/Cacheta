'use strict';
/* Servidor da Cacheta online: WebSocket para as mesas + os arquivos do jogo (para testar local). */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { Room, makeCode } = require('./game');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');
const MAX_ROOMS = 300;
const IDLE_MS = 10 * 60 * 1000;
const rooms = new Map();

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png' };
const PUBLIC = /^\/(index\.html|manifest\.webmanifest|sw\.js|icons\/[\w.-]+)?$/;

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
  if (!PUBLIC.test(url)) { res.writeHead(404); return res.end('Not found'); }
  const file = path.join(ROOT, url === '/' ? 'index.html' : url);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, maxPayload: 8 * 1024 });
const cleanName = s => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 14) || 'Jogador';
const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };

function onMessage(ws, m) {
  if (!m || typeof m.t !== 'string') return;
  if (m.t === 'create') {
    if (ws.room) return;
    if (rooms.size >= MAX_ROOMS) return send(ws, { t: 'err', fatal: true, text: 'O servidor está cheio. Tente de novo em alguns minutos.' });
    const room = new Room(makeCode(rooms), m.cfg); rooms.set(room.code, room);
    const { p } = room.addPlayer(cleanName(m.name), ws);
    send(ws, { t: 'joined', code: room.code, token: p.token, you: room.idx(p) });
    return room.broadcast();
  }
  if (m.t === 'join') {
    if (ws.room) return;
    const room = rooms.get(String(m.code || '').toUpperCase().trim());
    if (!room) return send(ws, { t: 'err', fatal: true, text: 'Sala não encontrada. Confira o código.' });
    const back = room.byToken(m.token);
    if (back) { room.attach(back, ws); send(ws, { t: 'joined', code: room.code, token: back.token, you: room.idx(back) }); return room.broadcast(); }
    const r = room.addPlayer(cleanName(m.name), ws);
    if (r.err) return send(ws, { t: 'err', fatal: true, text: r.err });
    send(ws, { t: 'joined', code: room.code, token: r.p.token, you: room.idx(r.p) });
    return room.broadcast();
  }
  const room = ws.room, p = ws.player; if (!room || !p) return;
  room.lastActivity = Date.now();
  switch (m.t) {
    case 'start': return room.start(p);
    case 'draw': return room.draw(p, !!m.lixo);
    case 'discard': return room.discard(p, m.id);
    case 'bater': return room.bater(p, m.sel);
    case 'next': return room.next(p);
    case 'order': return room.order(p, m.ids);
    case 'emoji': return room.emoji(p, m.e);
    case 'leave': return room.leave(p);
  }
}

wss.on('connection', ws => {
  ws.isAlive = true; ws.room = null; ws.player = null; ws.burst = { n: 0, at: Date.now() };
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => {
    const now = Date.now();
    if (now - ws.burst.at > 1000) ws.burst = { n: 0, at: now };
    if (++ws.burst.n > 30) return; // gente demais por segundo: ignora
    let m; try { m = JSON.parse(raw); } catch (_) { return; }
    try { onMessage(ws, m); } catch (e) { console.error('erro na mensagem', m && m.t, e); }
  });
  ws.on('close', () => { if (ws.room && ws.player) ws.room.detach(ws.player, ws); });
  ws.on('error', () => {});
});

setInterval(() => {
  wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; try { ws.ping(); } catch (_) {} });
  const now = Date.now();
  rooms.forEach((room, code) => { if (!room.connectedCount() && now - room.lastActivity > IDLE_MS) { room.destroy(); rooms.delete(code); } });
}, 25000);

server.listen(PORT, () => console.log(`Cacheta online em http://localhost:${PORT}`));
