import {
  applyMove as chessApply,
  initialGame as chessInitial,
  legalMoves as chessMoves,
  statusOf as chessStatus,
} from '../src/lib/playables/chess.ts';
import {
  applyMove as checkersApply,
  initialGame as checkersInitial,
  legalMoves as checkersMoves,
  statusOf as checkersStatus,
} from '../src/lib/playables/checkers.ts';
import {
  applyMove as connect4Apply,
  dropCell,
  initialGame as connect4Initial,
  legalMoves as connect4Moves,
  statusOf as connect4Status,
} from '../src/lib/playables/connect4.ts';
import { playerFromToken } from './lib/player.js';

// One Durable Object per room code: the authoritative position, the two seats
// and every hibernating socket. Sockets are accepted with ctx.acceptWebSocket()
// so the object can be evicted between moves; the per-socket seat lives in
// serializeAttachment() and the position is reloaded from SQLite on wake.

const SEATS = [0, 1];
const PROMOTIONS = ['q', 'r', 'b', 'n'];

// Both games expose the same handful of operations, so the room code stays one
// code path: the client sends from/to and the server re-derives the actual move
// from its own engine, which is what makes captures and chains trustworthy.
const GAMES = {
  chess: {
    colors: ['w', 'b'],
    initial: chessInitial,
    moves: (state) => chessMoves(state),
    status: (state, moves) => chessStatus(state, moves),
    over: (status) => status === 'checkmate' || status === 'stalemate' || status === 'draw',
    apply: chessApply,
    turn: (state) => state.turn,
    // The client sends squares; the move itself is taken from the engine above.
    parse: (state, moves, msg) => {
      const from = Number(msg.from);
      const to = Number(msg.to);
      if (![from, to].every((square) => Number.isInteger(square) && square >= 0 && square <= 63)) {
        return { error: 'bad-square' };
      }
      const promotion = PROMOTIONS.includes(msg.promotion) ? msg.promotion : 'q';
      const move = moves.find(
        (candidate) => candidate.from === from && candidate.to === to && (!candidate.promotion || candidate.promotion === promotion)
      );
      return move ? { move, from, to } : null;
    },
    echo: ({ move, seat, to, colors }) => ({
      // En passant lands on an empty square, with the taken pawn behind it.
      captured: move.capture ? (move.enPassant ? to + (colors[seat] === 'w' ? 8 : -8) : to) : null,
      promotion: move.promotion ?? null,
    }),
  },
  checkers: {
    colors: ['r', 'b'],
    initial: checkersInitial,
    moves: (state) => checkersMoves(state),
    status: (state) => checkersStatus(state),
    over: (status) => status === 'won' || status === 'draw',
    apply: checkersApply,
    turn: (state) => state.turn,
    parse: (state, moves, msg) => {
      const from = Number(msg.from);
      const to = Number(msg.to);
      if (![from, to].every((square) => Number.isInteger(square) && square >= 0 && square <= 63)) {
        return { error: 'bad-square' };
      }
      const move = moves.find((candidate) => candidate.from === from && candidate.to === to);
      return move ? { move, from, to } : null;
    },
    echo: ({ state, move, to, before }) => ({
      captured: move.capture ?? null,
      kinged: Boolean(before && state.board[to] && state.board[to].king && !before.king),
    }),
  },
  connect4: {
    colors: ['r', 'y'],
    initial: connect4Initial,
    moves: (state) => connect4Moves(state),
    status: (state) => connect4Status(state),
    over: (status) => status !== 'playing',
    apply: (state, move) => connect4Apply(state, move.col),
    turn: (state) => state.turn,
    // A drop names a column; the landing cell comes from the engine.
    parse: (state, moves, msg) => {
      const col = Number(msg.col);
      if (!moves.includes(col)) return null;
      return { move: { col }, from: col, to: dropCell(state.board, col) };
    },
    echo: ({ move, to }) => ({ captured: null, col: move.col, cell: to }),
  },
};

export class GameRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.game = 'chess';
    this.state = null;
    this.players = [null, null];
    this.ply = 0;
    this.ready = ctx.blockConcurrencyWhile(() => this.#init());
  }

  async fetch(request) {
    await this.ready;

    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean); // rooms/<code>/<action>
    const code = (parts[1] || '').toUpperCase();
    const action = parts[2] || '';

    if (request.headers.get('Upgrade') === 'websocket') {
      return this.state ? this.#accept() : this.#fail('Room not found', 404);
    }

    if (request.method === 'POST' && action === 'create') {
      const requested = url.searchParams.get('game') || 'chess';
      this.#create(code, GAMES[requested] ? requested : 'chess');
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
      'CREATE TABLE IF NOT EXISTS room (id INTEGER PRIMARY KEY CHECK (id = 1), code TEXT NOT NULL, game TEXT NOT NULL DEFAULT \'chess\', state TEXT NOT NULL, created_at INTEGER NOT NULL)'
    );
    sql.exec(
      'CREATE TABLE IF NOT EXISTS players (seat INTEGER PRIMARY KEY, uid TEXT NOT NULL, name TEXT NOT NULL, joined_at INTEGER NOT NULL)'
    );
    sql.exec(
      'CREATE TABLE IF NOT EXISTS moves (ply INTEGER PRIMARY KEY, seat INTEGER NOT NULL, uid TEXT NOT NULL, from_sq INTEGER NOT NULL, to_sq INTEGER NOT NULL, promotion TEXT, at INTEGER NOT NULL)'
    );

    // Rooms created before checkers existed have no game column.
    const columns = sql.exec('PRAGMA table_info(room)').toArray().map((row) => row.name);
    if (!columns.includes('game')) {
      sql.exec("ALTER TABLE room ADD COLUMN game TEXT NOT NULL DEFAULT 'chess'");
    }

    const room = sql.exec('SELECT code, game, state FROM room WHERE id = 1').toArray()[0];
    if (room) {
      this.code = room.code;
      this.game = GAMES[room.game] ? room.game : 'chess';
      this.state = JSON.parse(room.state);
    }

    for (const row of sql.exec('SELECT seat, uid, name FROM players').toArray()) {
      if (SEATS.includes(row.seat)) this.players[row.seat] = { uid: row.uid, name: row.name };
    }

    this.ply = sql.exec('SELECT COUNT(*) AS n FROM moves').one().n;
  }

  #create(code, game) {
    if (this.state) return;

    this.code = code;
    this.game = GAMES[game] ? game : 'chess';
    this.state = GAMES[this.game].initial();
    this.ply = 0;
    this.ctx.storage.sql.exec(
      'INSERT INTO room (id, code, game, state, created_at) VALUES (1, ?, ?, ?, ?)',
      code,
      this.game,
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
    const game = GAMES[this.game];
    const moves = game.moves(this.state);
    const status = game.status(this.state, moves);

    if (game.over(status)) {
      return this.#error(ws, 'game-over', `Game is over (${status})`);
    }
    if (game.turn(this.state) !== game.colors[seat]) {
      return this.#error(ws, 'not-your-turn', 'It is not your turn');
    }

    // Re-derive the move from the engine so the client cannot invent a capture,
    // jumping chain, crowning or a drop into a full column.
    const parsed = game.parse(this.state, moves, msg);
    if (!parsed) return this.#error(ws, 'illegal-move', 'That move is not legal');
    if (parsed.error) return this.#error(ws, parsed.error, 'from/to must be 0-63');

    const { move, from, to } = parsed;
    const before = this.state.board[from];

    this.state = game.apply(this.state, move);
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
      last: {
        from,
        to,
        seat,
        ply: this.ply,
        ...game.echo({ state: this.state, move, seat, to, before, colors: game.colors }),
      },
    });
  }

  #snapshot() {
    if (!this.state) {
      return { code: this.code, game: this.game, state: null, status: 'playing', plies: 0, seats: [] };
    }

    const game = GAMES[this.game];
    const moves = game.moves(this.state);
    const online = new Set();

    for (const ws of this.ctx.getWebSockets()) {
      const seat = ws.deserializeAttachment()?.seat;
      if (SEATS.includes(seat)) online.add(seat);
    }

    return {
      code: this.code,
      game: this.game,
      state: this.state,
      status: game.status(this.state, moves),
      plies: this.ply,
      seats: SEATS.map((seat) => ({
        seat,
        color: game.colors[seat],
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
