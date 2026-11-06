'use strict';
/* Teste de fumaça: sobe o servidor e joga com 3 clientes WebSocket de verdade. */
const assert = require('assert');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 3999;
const URL = `ws://localhost:${PORT}`;
const wait = ms => new Promise(r => setTimeout(r, ms));

function client(name) {
  const ws = new WebSocket(URL), c = { ws, name, state: null, msgs: [], events: [] };
  c.ready = new Promise(r => ws.on('open', r));
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.t === 'state') c.state = m; else if (m.t === 'joined') Object.assign(c, { code: m.code, token: m.token, you: m.you }); else c.events.push(m);
    c.msgs.push(m);
  });
  c.send = o => ws.send(JSON.stringify(o));
  return c;
}
const until = async (fn, ms = 3000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await wait(15); } throw new Error('timeout esperando condição: ' + fn); };

(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: __dirname, env: { ...process.env, PORT } });
  srv.stderr.on('data', d => process.stderr.write(d));
  await wait(700);
  try {
    const A = client('Ana'), B = client('Beto'), C = client('Cida');
    await Promise.all([A.ready]);
    A.send({ t: 'create', name: 'Ana', cfg: { decks: 2, jokers: 4, alvo: 3, bate: 'ambos', tempo: 0, limite: 5 } });
    await until(() => A.code);
    assert.match(A.code, /^[A-Z]{4}$/);

    // sala inexistente
    const X = client('X'); await X.ready; X.send({ t: 'join', code: 'ZZZZ', name: 'X' });
    await until(() => X.events.find(e => e.t === 'err' && e.fatal));
    X.ws.close();

    await Promise.all([B.ready, C.ready]);
    B.send({ t: 'join', code: A.code.toLowerCase(), name: 'Beto' });
    C.send({ t: 'join', code: A.code, name: 'Cida' });
    await until(() => B.code && C.code);
    await until(() => A.state && A.state.players.length === 3);
    assert.strictEqual(A.state.phase, 'lobby');

    // só o anfitrião começa
    B.send({ t: 'start' }); await wait(150); assert.strictEqual(A.state.phase, 'lobby');
    A.send({ t: 'start' });
    await until(() => A.state.phase === 'play' && B.state.phase === 'play' && C.state.phase === 'play');

    for (const p of [A, B, C]) {
      assert.strictEqual(p.state.hand.length, 9, 'cada um recebe 9 cartas');
      assert.strictEqual(p.state.players.length, 3);
      p.state.players.forEach((q, i) => assert.strictEqual(q.count, 9));
      assert(!JSON.stringify(p.state).includes('"hands"'));
    }
    // privacidade: ninguém recebe cartas dos outros
    const ids = s => new Set(s.hand.map(c => c.id));
    assert(![...ids(A.state)].some(id => ids(B.state).has(id)), 'mãos distintas');
    assert.strictEqual(A.state.deckCount + 27 + 1, 2 * 52 + 4, 'contagem do baralho');

    // jogada fora da vez é ignorada
    const players = [A, B, C], turnOf = () => players[A.state.turn];
    const other = players.find(p => p !== turnOf());
    const before = JSON.stringify(other.state.hand);
    other.send({ t: 'draw', lixo: false }); await wait(150);
    assert.strictEqual(JSON.stringify(other.state.hand), before, 'compra fora da vez ignorada');

    // joga várias vezes: compra e descarta até alguém bater ou o monte acabar
    let turns = 0;
    while (A.state.phase === 'play' && turns < 400) {
      const me = turnOf(), n = me.state.hand.length; assert.strictEqual(n, 9);
      me.send({ t: 'draw', lixo: false });
      await until(() => me.state.hand.length === 10 || me.state.phase !== 'play');
      if (me.state.phase !== 'play') break;
      // tenta bater (o servidor decide)
      me.send({ t: 'bater', sel: null }); await wait(40);
      if (me.state.phase !== 'play') break;
      const c = me.state.hand.find(x => !x.j && x.id !== me.state.takenId);
      me.send({ t: 'discard', id: c.id });
      await until(() => me.state.hand.length === 9 && me.state.turn !== players.indexOf(me));
      turns++;
    }
    console.log('turnos jogados:', turns, '| fase final:', A.state.phase);

    // reconexão por token
    const Cws = C.ws; C.ws.close(); await wait(200);
    const C2 = client('Cida'); await C2.ready; C2.send({ t: 'join', code: A.code, token: C.token, name: 'Cida' });
    await until(() => C2.state && C2.you === C.you);
    assert.strictEqual(C2.state.hand.length, C.state.hand.length, 'reconectou na mesma vaga');

    // emoji chega para todos
    A.send({ t: 'emoji', e: '🔥' }); await until(() => B.events.find(e => e.t === 'emoji' && e.e === '🔥'));
    console.log('OK');
  } catch (e) {
    console.error('FALHOU:', e); process.exitCode = 1;
  } finally {
    srv.kill(); setTimeout(() => process.exit(), 100);
  }
})();
