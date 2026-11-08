'use strict';
/* Regras e salas da Cacheta. O servidor é a única fonte da verdade: embaralha, confere cada jogada
   e manda para cada jogador só a mão dele. As regras abaixo espelham as do index.html. */
const crypto = require('crypto');

const SUITS = ['♠︎', '♥︎', '♦︎', '♣︎'];
const RANKS = [null, 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const MAX_PLAYERS = 4;
const AFK_MS = 4000;
const EMOJIS = ['😂', '😎', '😡', '😱', '🤔', '👏', '🙏', '🔥', '😴', '🤞'];

const label = c => (c.j ? 'um curinga' : RANKS[c.r] + SUITS[c.s]);
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function pc(m) { let c = 0; while (m) { m &= m - 1; c++; } return c; }

function cleanCfg(c) {
  c = c || {};
  const num = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, Math.round(+v))) : d);
  const oneOf = (v, list, d) => (list.includes(v) ? v : d);
  const bate = oneOf(c.bate, ['ambos', 'dez', 'nove'], 'dez');
  return {
    opps: 2, level: 'esperto',
    decks: num(c.decks, 1, 3, 2), jokers: num(c.jokers, 0, 8, 4),
    alvo: oneOf(+c.alvo, [0, 3, 5, 7, 10], 5), bate, dez2: !!c.dez2 && bate !== 'nove',
    tempo: oneOf(+c.tempo, [0, 1, 2, 3, 5], 2), dicas: c.dicas !== false, limite: num(c.limite, 5, 600, 15),
  };
}

/* ---------- regras ---------- */
function isGroup(cs) {
  const n = cs.length; if (n < 3) return false;
  const nat = cs.filter(c => !c.j); if (!nat.length) return true;
  const r0 = nat[0].r;
  if (nat.every(c => c.r === r0)) { if (new Set(nat.map(c => c.s)).size === nat.length && n <= 4) return true; }
  const s0 = nat[0].s; if (!nat.every(c => c.s === s0) || n > 13) return false;
  for (const hi of [false, true]) {
    const v = nat.map(c => (c.r === 1 && hi ? 14 : c.r));
    if (new Set(v).size !== v.length) continue;
    if (Math.max(...v) - Math.min(...v) + 1 <= n) return true;
  }
  return false;
}

function solver(cards) {
  const n = cards.length, size = 1 << n, valid = new Uint8Array(size);
  for (let m = 1; m < size; m++) { if (pc(m) >= 3) { const g = []; for (let i = 0; i < n; i++) if (m >> i & 1) g.push(cards[i]); valid[m] = isGroup(g) ? 1 : 0; } }
  const memo = new Int16Array(size).fill(-1), pick = new Int32Array(size);
  function f(m) {
    if (m === 0) return 0; if (memo[m] >= 0) return memo[m];
    const low = m & -m, rest = m ^ low; let best = f(rest), bp = 0;
    for (let s = rest; s > 0; s = (s - 1) & rest) { const g = s | low; if (valid[g]) { const v = pc(g) + f(m ^ g); if (v > best) { best = v; bp = g; } } }
    memo[m] = best; pick[m] = bp; return best;
  }
  function groups(m) {
    f(m); const out = [];
    while (m) { const g = pick[m]; if (g) { const gc = []; for (let i = 0; i < n; i++) if (g >> i & 1) gc.push(cards[i]); out.push(gc); m ^= g; } else m ^= (m & -m); }
    return out;
  }
  return { n, full: size - 1, f, groups };
}

function canBater(hand, preferId, takenId, mode) {
  mode = mode || 'ambos';
  const sv = solver(hand), n = hand.length;
  if (mode !== 'nove' && n === 10 && sv.f(sv.full) === 10) return { type: 10, groups: sv.groups(sv.full), discard: null };
  if (mode === 'dez') return null;
  const idx = hand.map((c, i) => i).filter(i => !hand[i].j && hand[i].id !== takenId);
  idx.sort((a, b) => (hand[b].id === preferId) - (hand[a].id === preferId));
  for (const i of idx) { const m = sv.full ^ (1 << i); if (sv.f(m) === n - 1) return { type: 9, groups: sv.groups(m), discard: hand[i] }; }
  return null;
}

function evalHand(cards) {
  const sv = solver(cards), cover = sv.f(sv.full), gs = sv.groups(sv.full);
  const used = new Set(gs.flat().map(c => c.id)), loose = cards.filter(c => !used.has(c.id) && !c.j);
  let bonus = 0;
  for (let i = 0; i < loose.length; i++) for (let k = i + 1; k < loose.length; k++) {
    const a = loose[i], b = loose[k];
    if (a.r === b.r && a.s !== b.s) bonus += 3;
    else if (a.s === b.s) { const d = Math.abs(a.r - b.r); if (d === 1) bonus += 3; else if (d === 2) bonus += 2; }
  }
  return cover * 10 + bonus;
}
function bestDiscard(cards, excludeId) {
  let cand = cards.filter(c => !c.j && c.id !== excludeId); if (!cand.length) cand = cards.filter(c => !c.j);
  let best = null, bs = -1e9;
  for (const c of cand) { const s = evalHand(cards.filter(x => x !== c)) + Math.random() * .5; if (s > bs) { bs = s; best = c; } }
  return best;
}
/* Pifado: a mão de 9 cartas bate com qualquer carta que faltar (testado com um curinga imaginário). */
const PJ = { id: -999, j: true, r: 0, s: -1 };
const isPifado = (h, mode) => h.length === 9 && !!canBater([...h, PJ], null, PJ.id, mode || 'ambos');
const sortByNaipe = h => h.sort((a, b) => (a.j ? 999 : a.s * 20 + a.r) - (b.j ? 999 : b.s * 20 + b.r));

/* ---------- sala ---------- */
class Room {
  constructor(code, cfg) {
    this.code = code; this.cfg = cleanCfg(cfg);
    this.players = []; this.host = 0;
    this.phase = 'lobby'; // lobby | play | roundEnd
    this.round = 0; this.dealer = 0; this.deck = []; this.lixo = [];
    this.turn = 0; this.tphase = 'draw'; this.takenId = null; this.lastBy = -1;
    this.windowCard = null; this.windowMs = 0; this.lockUntil = 0; this.deadline = 0;
    this.result = null; this.logEv = null; this.uid = 1; this.gen = 0; this.timer = null;
    this.lastActivity = Date.now();
  }

  /* --- jogadores --- */
  connectedCount() { return this.players.filter(p => p.connected).length; }
  byToken(tk) { return tk ? this.players.find(p => p.token && p.token === tk) : null; }
  idx(p) { return this.players.indexOf(p); }

  addPlayer(name, ws) {
    if (this.phase !== 'lobby') return { err: 'A partida já começou.' };
    if (this.players.length >= MAX_PLAYERS) return { err: 'A mesa está cheia (máximo de 4).' };
    let nm = name, k = 2; while (this.players.some(p => p.name === nm)) nm = name + ' ' + k++;
    const p = { name: nm, token: crypto.randomBytes(12).toString('hex'), ws: null, connected: false, hand: [], pts: 0, queimado: false, pifado: false, drop: null, lastEmoji: 0 };
    this.players.push(p); this.attach(p, ws);
    return { p };
  }
  attach(p, ws) {
    if (p.ws && p.ws !== ws) { p.ws.room = null; p.ws.player = null; try { p.ws.close(4000, 'replaced'); } catch (_) {} }
    clearTimeout(p.drop); p.drop = null;
    p.ws = ws; p.connected = true; ws.room = this; ws.player = p; this.lastActivity = Date.now();
  }
  /* Conexão caiu. No saguão o lugar some depois de 30s; na partida a vaga fica e joga sozinha. */
  detach(p, ws) {
    if (p.ws !== ws) return;
    p.ws = null; p.connected = false; this.lastActivity = Date.now();
    if (this.phase === 'lobby') { p.drop = setTimeout(() => { this.remove(p); this.broadcast(); }, 30000); }
    else if (this.players[this.turn] === p && this.phase === 'play') { this.deadline = Math.min(this.deadline, Date.now() + AFK_MS); this.arm(); }
    this.broadcast();
  }
  leave(p) {
    p.token = null;
    if (p.ws) { p.ws.room = null; p.ws.player = null; p.ws = null; }
    p.connected = false;
    if (this.phase === 'lobby') this.remove(p);
    else if (this.players[this.turn] === p && this.phase === 'play') { this.deadline = Math.min(this.deadline, Date.now() + AFK_MS); this.arm(); }
    this.broadcast();
  }
  remove(p) {
    const i = this.idx(p); if (i < 0) return;
    clearTimeout(p.drop); this.players.splice(i, 1);
    if (i < this.host) this.host--; else if (i === this.host) this.host = Math.max(0, this.players.findIndex(q => q.connected));
  }

  /* --- fluxo --- */
  start(p) {
    if (this.phase !== 'lobby' || this.idx(p) !== this.host) return;
    this.players.filter(q => !q.connected).forEach(q => this.remove(q));
    if (this.players.length < 2) return this.msgTo(p, 'Precisa de pelo menos 2 jogadores.', true);
    this.players.forEach(q => { q.pts = 0; });
    this.round = 0; this.dealer = this.players.length - 1; this.startRound();
  }
  startRound() {
    const c = this.cfg, n = this.players.length;
    this.round++; this.phase = 'play'; this.result = null;
    this.deck = [];
    for (let k = 0; k < c.decks; k++) for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) this.deck.push({ id: this.uid++, r, s, j: false });
    for (let k = 0; k < c.jokers; k++) this.deck.push({ id: this.uid++, r: 0, s: -1, j: true });
    shuffle(this.deck);
    this.lixo = []; this.takenId = null; this.lastBy = -1; this.windowCard = null; this.windowMs = 0;
    this.players.forEach(p => { p.hand = []; p.queimado = false; p.pifado = false; });
    const first = (this.dealer + 1) % n;
    for (let k = 0; k < 9; k++) for (let j = 0; j < n; j++) this.players[(first + j) % n].hand.push(this.deck.pop());
    let t = this.deck.length - 1; while (t > 0 && this.deck[t].j) t--;
    this.lixo.push(this.deck.splice(t, 1)[0]);
    this.players.forEach(p => sortByNaipe(p.hand));
    this.turn = first; this.logEv = { k: 'deal', by: this.dealer };
    /* pifado só é anunciado depois de um descarte, nunca na hora de dar as cartas */
    this.beginTurn(); this.broadcast();
  }
  beginTurn() {
    this.tphase = 'draw'; this.takenId = null;
    const p = this.players[this.turn], now = Date.now();
    this.lockUntil = now + (this.windowMs || 0);
    this.deadline = this.lockUntil + (p.connected ? this.cfg.limite * 1000 : AFK_MS);
    this.arm();
  }
  arm() {
    clearTimeout(this.timer); const g = ++this.gen;
    this.timer = setTimeout(() => this.timeUp(g), Math.max(0, this.deadline - Date.now()) + 20);
  }
  stopClock() { clearTimeout(this.timer); this.timer = null; this.gen++; }

  /* Acabou o tempo: compra do monte e descarta a melhor carta, como no modo offline. */
  timeUp(g) {
    if (g !== this.gen || this.phase !== 'play') return;
    const pi = this.turn, p = this.players[pi];
    if (this.tphase === 'draw') { this.lockUntil = 0; if (!this.doDraw(pi, false)) return; }
    if (this.tphase !== 'discard') return;
    const c = bestDiscard(p.hand, this.takenId); if (!c) return;
    this.doDiscard(pi, c, true);
  }
  drawFromDeck() {
    this.reshuffled = false;
    if (!this.deck.length && this.lixo.length > 1) { const top = this.lixo.pop(); this.deck = shuffle(this.lixo); this.lixo = [top]; this.reshuffled = true; }
    return this.deck.pop() || null;
  }
  /* devolve false se a rodada acabou por falta de cartas */
  doDraw(pi, fromLixo) {
    const p = this.players[pi]; let c;
    if (fromLixo) { if (!this.lixo.length) return false; c = this.lixo.pop(); this.takenId = c.id; }
    else { c = this.drawFromDeck(); if (!c) { this.stalemate(); return false; } }
    p.hand.push(c); this.tphase = 'discard';
    this.drawInfo = { lixo: !!fromLixo, took: fromLixo ? c : null };
    this.logEv = { k: 'draw', by: pi, ...this.drawInfo, re: this.reshuffled };
    this.broadcast(); return true;
  }
  draw(p, fromLixo) {
    const pi = this.idx(p);
    if (this.phase !== 'play' || this.turn !== pi || this.tphase !== 'draw') return;
    if (Date.now() < this.lockUntil) return this.msgTo(p, 'Espere o tempo entre jogadas.', true);
    this.doDraw(pi, !!fromLixo);
  }
  doDiscard(pi, c, auto) {
    const p = this.players[pi];
    p.hand = p.hand.filter(x => x !== c); this.lixo.push(c);
    this.logEv = { k: auto ? 'auto' : 'disc', by: pi, card: c, ...this.drawInfo };
    this.endTurn();
  }
  discard(p, id) {
    const pi = this.idx(p);
    if (this.phase !== 'play' || this.turn !== pi || this.tphase !== 'discard') return;
    const c = p.hand.find(x => x.id === id);
    if (!c) return this.msgTo(p, 'Toque numa carta para escolher o descarte.', true);
    if (c.j) return this.msgTo(p, 'Curinga não pode ser descartado.', true);
    if (c.id === this.takenId) return this.msgTo(p, 'A carta que veio do lixo não pode voltar na mesma vez.', true);
    this.doDiscard(pi, c, false);
  }
  endTurn() {
    const by = this.turn, n = this.players.length, top = this.lixo[this.lixo.length - 1];
    const now = isPifado(this.players[by].hand, this.cfg.bate), novo = now && !this.players[by].pifado;
    this.players[by].pifado = now;
    this.lastBy = by; this.windowCard = top ? top.id : null; this.windowMs = this.cfg.tempo * 1000;
    this.turn = (by + 1) % n; this.beginTurn(); this.broadcast();
    if (novo) this.event({ t: 'pifado', who: [by] });
  }
  oot(pi) {
    const top = this.lixo[this.lixo.length - 1];
    return this.phase === 'play' && this.tphase === 'draw' && this.turn !== pi && this.lastBy !== pi && !!top && top.id === this.windowCard;
  }
  bater(p, sel) {
    const pi = this.idx(p); if (this.phase !== 'play') return;
    sel = Number.isInteger(sel) ? sel : null;
    if (this.turn === pi && this.tphase === 'discard') {
      if (p.queimado && this.takenId) return this.msgTo(p, 'Depois de bater errado, você só bate com carta comprada do monte.', true);
      const b = canBater(p.hand, sel, this.takenId, this.cfg.bate);
      return b ? this.endRound(pi, b) : this.burn(p);
    }
    if (!this.oot(pi)) return;
    if (p.queimado) return this.msgTo(p, 'Depois de bater errado, você não pode bater com o lixo.', true);
    const top = this.lixo[this.lixo.length - 1], h = [...p.hand, top], b = canBater(h, sel, top.id, this.cfg.bate);
    if (!b) return this.burn(p);
    this.lixo.pop(); p.hand = h; b.fora = true; this.endRound(pi, b);
  }
  burn(p) {
    p.queimado = true; this.logEv = { k: 'burn', by: this.idx(p) };
    this.msgTo(p, 'Não fechou. Até o fim da rodada você só pode bater com carta comprada do monte.', true);
    this.broadcast();
  }
  endRound(wi, b) {
    this.stopClock(); this.phase = 'roundEnd';
    const w = this.players[wi];
    if (b.discard) { w.hand = w.hand.filter(x => x !== b.discard); this.lixo.push(b.discard); }
    const gain = (b.type === 10 && this.cfg.dez2) ? 2 : 1; w.pts += gain;
    const over = !!this.cfg.alvo && w.pts >= this.cfg.alvo;
    this.result = { winner: wi, type: b.type, fora: !!b.fora, gain, over, groups: b.groups, discard: b.discard || null, stalemate: false };
    if (!over) this.dealer = (this.dealer + 1) % this.players.length;
    this.broadcast();
  }
  stalemate() {
    this.stopClock(); this.phase = 'roundEnd';
    this.result = { stalemate: true, over: false };
    this.dealer = (this.dealer + 1) % this.players.length;
    this.broadcast();
  }
  next(p) {
    if (this.phase !== 'roundEnd') return;
    if (this.idx(p) !== this.host && this.players[this.host].connected) return;
    if (this.result && this.result.over) this.toLobby(); else this.startRound();
  }
  toLobby() {
    this.stopClock(); this.phase = 'lobby'; this.result = null; this.round = 0;
    this.players.filter(q => !q.connected).forEach(q => this.remove(q));
    this.players.forEach(q => { q.pts = 0; q.hand = []; q.pifado = false; q.queimado = false; });
    this.broadcast();
  }
  order(p, ids) {
    if (!Array.isArray(ids) || ids.length !== p.hand.length) return;
    const by = new Map(p.hand.map(c => [c.id, c]));
    const out = ids.map(id => by.get(id)); if (out.some(c => !c) || new Set(ids).size !== ids.length) return;
    p.hand = out;
  }
  emoji(p, e) {
    const now = Date.now(); if (!EMOJIS.includes(e) || now - p.lastEmoji < 400) return; p.lastEmoji = now;
    this.event({ t: 'emoji', from: this.idx(p), e });
  }

  /* --- envio --- */
  send(p, obj) { if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(obj)); }
  msgTo(p, text, warn) { this.send(p, { t: 'msg', text, warn: !!warn }); }
  event(obj) { this.players.forEach(p => this.send(p, obj)); }
  broadcast() { this.lastActivity = Date.now(); this.players.forEach((p, i) => { if (p.connected) this.send(p, this.view(i)); }); }

  fmtLog(v) {
    const e = this.logEv; if (!e) return '';
    const who = i => (i === v ? 'Você' : this.players[i].name);
    const nm = this.players[e.by] ? who(e.by) : '';
    const got = e.lixo ? `pegou ${label(e.took)} do lixo` : 'comprou do monte';
    switch (e.k) {
      case 'deal': return `Rodada ${this.round}. ${e.by === v ? 'Você deu' : nm + ' deu'} as cartas.`;
      case 'draw': return `${nm} ${got}.` + (e.re ? ' O monte acabou e o lixo foi embaralhado.' : '');
      case 'disc': return `${nm} ${got} e descartou ${label(e.card)}.`;
      case 'auto': return `Tempo esgotado: o app jogou por ${e.by === v ? 'você' : nm} e descartou ${label(e.card)}.`;
      case 'burn': return `${nm} apertou Bater sem fechar o jogo.`;
      default: return '';
    }
  }
  view(v) {
    const me = this.players[v], now = Date.now(), live = this.phase === 'play';
    return {
      t: 'state', code: this.code, phase: this.phase, cfg: this.cfg, round: this.round, host: this.host, you: v,
      players: this.players.map(p => ({ name: p.name, pts: p.pts, count: p.hand.length, pifado: p.pifado, connected: p.connected })),
      hand: me.hand, queimado: me.queimado, deckCount: this.deck.length, lixo: this.lixo.slice(-3),
      turn: this.turn, tphase: this.tphase, takenId: this.turn === v ? this.takenId : null, lastBy: this.lastBy, windowCard: this.windowCard,
      lockLeft: live ? Math.max(0, this.lockUntil - now) : 0, deadlineLeft: live ? Math.max(0, this.deadline - now) : 0,
      log: this.fmtLog(v), result: this.result,
    };
  }
  destroy() { this.stopClock(); this.players.forEach(p => clearTimeout(p.drop)); }
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
function makeCode(taken) {
  for (;;) { let c = ''; for (let i = 0; i < 4; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]; if (!taken.has(c)) return c; }
}

module.exports = { Room, makeCode, cleanCfg, MAX_PLAYERS, canBater, isGroup, solver, isPifado };
