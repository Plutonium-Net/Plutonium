import { applyMove, initialGame, legalMoves, statusOf } from '../src/lib/playables/chess.ts';
import { playerFromToken } from './lib/player.js';

// One Durable Object per room code: the authoritative position, the two seats
// and every hibernating socket. Sockets are accepted with ctx.acceptWebSocket()
// so the object can be evicted between moves; the per-socket seat lives in
// serializeAttachment() and the position is reloaded from SQLite on wake.

const COLORS = ['w', 'b'];
const SEATS = [0, 1];
const PROMOTIONS = ['q', 'r', 'b', 'n'];

export class GameRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.state = null;
    this.players = [null, null];
    this.ply = 0;
    this.ready = ctx.blockConcurrencyWhile(() => this.#init());
  }

  async fetch(request) {
    await this.ready;

    const parts = new URL(request.url).pathname.split('/').filter(Boolean); // rooms/<code>/<action>
    const code = (parts[1] || '').toUpperCase();
    const action = parts[2] || '';

    if (request.headers.get('Upgrade') === 'websocket') {
      return this.state ? this.#accept() : this.#fail('Room not found', 404);
    }

    if (request.method === 'POST' && action === 'create') {
      this.#create(code);
      return this.#ok(this.#snapshot());
    }

    return this.state ? this.#ok(this.#snapshot()) : this.#fail('Room not found', 404);
  }

  async webSocketMessage(ws, raw) {
    await this.ready;

    const msg = parse(raw);
    if (!msg || typeof msg.type !== 'string') {
      return this.#error(ws, 'bad-message', 'Messages must be JSON with a type');
    }

    if (msg.type === 'hello') return this.#hello(ws, msg.token);
    if (msg.type === 'ping') return this.#send(ws, { type: 'pong' });

    const seat = this.#seatOf(ws);
    if (seat === null) return this.#error(ws, 'unauthenticated', 'Send a hello message first');
    if (msg.type === 'resync') return this.#send(ws, { type: 'state', room: this.#snapshot(), seat });
    if (msg.type === 'move') return this.#move(ws, seat, msg);

    return this.#error(ws, 'bad-type', `Unknown message type: ${msg.type}`);
  }

  webSocketClose(ws) {
    this.#broadcast({ type: 'state', room: this.#snapshot() }, ws);
  }

  webSocketError(ws) {
    this.webSocketClose(ws);
  }

  #init() {
    const sql = this.ctx.storage.sql;

    sql.exec(
      'CREATE TABLE IF NOT EXISTS room (id INTEGER PRIMARY KEY CHECK (id = 1), code TEXT NOT NULL, state TEXT NOT NULL, created_at INTEGER NOT NULL)'
    );
    sql.exec(
      'CREATE TABLE IF NOT EXISTS players (seat INTEGER PRIMARY KEY, uid TEXT NOT NULL, name TEXT NOT NULL, joined_at INTEGER NOT NULL)'
    );
    sql.exec(
      'CREATE TABLE IF NOT EXISTS moves (ply INTEGER PRIMARY KEY, seat INTEGER NOT NULL, uid TEXT NOT NULL, from_sq INTEGER NOT NULL, to_sq INTEGER NOT NULL, promotion TEXT, at INTEGER NOT NULL)'
    );

    const room = sql.exec('SELECT code, state FROM room WHERE id = 1').toArray()[0];
    if (room) {
      this.code = room.code;
      this.state = JSON.parse(room.state);
    }

    for (const row of sql.exec('SELECT seat, uid, name FROM players').toArray()) {
      if (SEATS.includes(row.seat)) this.players[row.seat] = { uid: row.uid, name: row.name };
    }

    this.ply = sql.exec('SELECT COUNT(*) AS n FROM moves').one().n;
  }

  #create(code) {
    if (this.state) return;

    this.code = code;
    this.state = initialGame();
    this.ply = 0;
    this.ctx.storage.sql.exec(
      'INSERT INTO room (id, code, state, created_at) VALUES (1, ?, ?, ?)',
      code,
      JSON.stringify(this.state),
      Date.now()
    );
  }

  #accept() {
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    this.#send(pair[1], { type: 'hello' });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async #hello(ws, token) {
    if (!this.state) return this.#error(ws, 'no-room', 'Room not found');

    const player = await playerFromToken(typeof token === 'string' ? token : '', this.env);
    if (!player) return this.#error(ws, 'unauthorized', 'Sign-in required');

    const seat = this.#assignSeat(player);
    ws.serializeAttachment({ seat, uid: player.uid, name: player.name });

    this.#send(ws, { type: 'welcome', seat, room: this.#snapshot() });
    // The newcomer already has the room from its welcome, so only tell the others.
    this.#broadcast({ type: 'state', room: this.#snapshot() }, ws);
  }

  #assignSeat(player) {
    const mine = SEATS.find((seat) => this.players[seat]?.uid === player.uid);
    if (mine !== undefined) return mine;

    const free = SEATS.find((seat) => !this.players[seat]);
    if (free === undefined) return null; // spectator

    this.players[free] = { uid: player.uid, name: player.name };
    this.ctx.storage.sql.exec(
      'INSERT INTO players (seat, uid, name, joined_at) VALUES (?, ?, ?, ?)',
      free,
      player.uid,
      player.name,
      Date.now()
    );
    return free;
  }

  #move(ws, seat, msg) {
    const moves = legalMoves(this.state);
    const status = statusOf(this.state, moves);

    if (status === 'checkmate' || status === 'stalemate' || status === 'draw') {
      return this.#error(ws, 'game-over', `Game is over (${status})`);
    }
    if (this.state.turn !== COLORS[seat]) {
      return this.#error(ws, 'not-your-turn', 'It is not your turn');
    }

    const from = Number(msg.from);
    const to = Number(msg.to);
    if (![from, to].every((square) => Number.isInteger(square) && square >= 0 && square <= 63)) {
      return this.#error(ws, 'bad-square', 'from/to must be 0-63');
    }

    // Re-derive the move from the engine so the client cannot invent a capture,
    // castle or promotion; an underpromotion is matched on the requested piece.
    const promotion = PROMOTIONS.includes(msg.promotion) ? msg.promotion : 'q';
    const move = moves.find(
      (candidate) => candidate.from === from && candidate.to === to && (!candidate.promotion || candidate.promotion === promotion)
    );
    if (!move) return this.#error(ws, 'illegal-move', 'That move is not legal');

    this.state = applyMove(this.state, move);
    this.ply += 1;

    const sql = this.ctx.storage.sql;
    sql.exec('UPDATE room SET state = ? WHERE id = 1', JSON.stringify(this.state));
    sql.exec(
      'INSERT INTO moves (ply, seat, uid, from_sq, to_sq, promotion, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      this.ply,
      seat,
      this.players[seat]?.uid ?? '',
      from,
      to,
      move.promotion ?? null,
      Date.now()
    );

    this.#broadcast({
      type: 'state',
      room: this.#snapshot(),
      last: { from, to, seat, ply: this.ply },
    });
  }

  #snapshot() {
    const moves = this.state ? legalMoves(this.state) : [];
    const online = new Set();

    for (const ws of this.ctx.getWebSockets()) {
      const seat = ws.deserializeAttachment()?.seat;
      if (SEATS.includes(seat)) online.add(seat);
    }

    return {
      code: this.code,
      game: 'chess',
      state: this.state,
      status: this.state ? statusOf(this.state, moves) : 'playing',
      plies: this.ply,
      seats: SEATS.map((seat) => ({
        seat,
        color: COLORS[seat],
        name: this.players[seat]?.name ?? null,
        online: online.has(seat),
      })),
    };
  }

  #seatOf(ws) {
    const seat = ws.deserializeAttachment()?.seat;
    return SEATS.includes(seat) ? seat : null;
  }

  #send(ws, payload) {
    try {
      ws.send(JSON.stringify(payload));
    } catch (_) {}
  }

  #error(ws, code, message) {
    this.#send(ws, { type: 'error', code, message });
  }

  #broadcast(payload, skip) {
    const text = JSON.stringify(payload);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === skip) continue;
      try {
        ws.send(text);
      } catch (_) {}
    }
  }

  #ok(body) {
    return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
  }

  #fail(error, status) {
    return Response.json({ error }, { status });
  }
}

function parse(raw) {
  try {
    return JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
  } catch (_) {
    return null;
  }
}
