// Local end-to-end check for the rooms API and the GameRoom Durable Object.
//
//   cd api
//   npx wrangler dev --port 8787 --var PLAYABLES_DEV_AUTH:1
//   node test/rooms.mjs
//
// PLU_API overrides the base URL (default http://127.0.0.1:8787).

const BASE = (process.env.PLU_API || 'http://127.0.0.1:8787').replace(/\/$/, '');
const WS_BASE = BASE.replace(/^http/, 'ws');

const E2 = 52;
const E4 = 36;
const E7 = 12;
const E5 = 28;

let failures = 0;

function check(ok, label, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${!ok && detail ? ` -> ${JSON.stringify(detail)}` : ''}`);
  if (!ok) failures += 1;
}

class Client {
  #ws;
  #inbox = [];
  #waiters = [];

  constructor(ws) {
    this.#ws = ws;
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const waiter = this.#waiters.findIndex((candidate) => candidate.match(message));
      if (waiter === -1) this.#inbox.push(message);
      else this.#waiters.splice(waiter, 1)[0].resolve(message);
    });
  }

  static async open(code, token) {
    const ws = new WebSocket(`${WS_BASE}/rooms/${code}/ws`);
    const client = new Client(ws);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error('websocket failed to open')), { once: true });
    });
    await client.next((m) => m.type === 'hello');
    client.send({ type: 'hello', token });
    const welcome = await client.next((m) => m.type === 'welcome' || m.type === 'error');
    if (welcome.type === 'error') throw new Error(`hello rejected: ${welcome.message}`);
    return { client, seat: welcome.seat, room: welcome.room };
  }

  next(match, timeoutMs = 4000) {
    const ready = this.#inbox.findIndex(match);
    if (ready !== -1) return Promise.resolve(this.#inbox.splice(ready, 1)[0]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.#waiters.findIndex((candidate) => candidate.resolve === resolve);
        if (index !== -1) this.#waiters.splice(index, 1);
        reject(new Error('timed out waiting for a message'));
      }, timeoutMs);
      this.#waiters.push({
        match,
        resolve: (message) => {
          clearTimeout(timer);
          resolve(message);
        },
      });
    });
  }

  send(payload) {
    this.#ws.send(JSON.stringify(payload));
  }

  close() {
    this.#ws.close();
  }
}

async function createRoom(token) {
  const res = await fetch(`${BASE}/rooms/create`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => null);
  return { res, body };
}

try {
  console.log(`testing ${BASE}\n`);

  const anonymous = await fetch(`${BASE}/rooms/create`, { method: 'POST' });
  check(anonymous.status === 401, 'create without a token is rejected', anonymous.status);

  const { res: created, body: creation } = await createRoom('dev:alice');
  check(created.status === 201, 'create returns 201', { status: created.status, body: creation });
  const code = creation && creation.code;
  check(/^[A-HJ-NP-Z2-9]{5}$/.test(String(code)), 'room code looks right', code);

  const missing = await fetch(`${BASE}/rooms/ZZZZZ`, { headers: { Authorization: 'Bearer dev:alice' } });
  check(missing.status === 404, 'unknown room is 404', missing.status);

  const anonymousRead = await fetch(`${BASE}/rooms/${code}`);
  check(anonymousRead.status === 401, 'reading a room needs a token', anonymousRead.status);

  const white = await Client.open(code, 'dev:alice');
  check(white.seat === 0, 'first player takes seat 0 (white)', white.seat);
  check(white.room.state.turn === 'w', 'new room starts on white', white.room.state.turn);

  const black = await Client.open(code, 'dev:bob');
  check(black.seat === 1, 'second player takes seat 1 (black)', black.seat);

  const arrival = await white.client.next((m) => m.type === 'state' && m.room.seats[1].name === 'bob');
  check(arrival.room.seats[1].online === true, 'white sees black arrive', arrival.room.seats);

  white.client.send({ type: 'move', from: E2, to: E4 });
  const afterE4 = await black.client.next((m) => m.type === 'state' && m.room.plies === 1);
  check(afterE4.room.state.turn === 'b', 'black gets the move over the socket', afterE4.room.state.turn);
  check(afterE4.room.plies === 1, 'move log has one ply', afterE4.room.plies);
  check(afterE4.room.state.board[E4] && afterE4.room.state.board[E4].type === 'p', 'e4 holds a pawn', afterE4.room.state.board[E4]);

  black.client.send({ type: 'move', from: E7, to: E5 });
  const afterE5 = await white.client.next((m) => m.type === 'state' && m.room.plies === 2);
  check(afterE5.room.state.turn === 'w', 'white gets black reply', afterE5.room.state.turn);

  black.client.send({ type: 'move', from: 51, to: 35 });
  const outOfTurn = await black.client.next((m) => m.type === 'error');
  check(outOfTurn.code === 'not-your-turn', 'server rejects moving out of turn', outOfTurn);

  white.client.send({ type: 'move', from: E2, to: E4 });
  const illegal = await white.client.next((m) => m.type === 'error');
  check(illegal.code === 'illegal-move', 'server rejects an illegal move', illegal);

  const snapshot = await fetch(`${BASE}/rooms/${code}`, { headers: { Authorization: 'Bearer dev:alice' } });
  const snapshotBody = await snapshot.json();
  check(snapshot.status === 200, 'GET /rooms/:code returns state', snapshot.status);
  check(snapshotBody.plies === 2, 'snapshot has both plies', snapshotBody.plies);
  check(snapshotBody.seats.every((seat) => seat.online), 'snapshot shows both seats online', snapshotBody.seats);

  const spectator = await Client.open(code, 'dev:carol');
  check(spectator.seat === null, 'third player becomes a spectator', spectator.seat);
  spectator.client.send({ type: 'move', from: 48, to: 32 });
  const denied = await spectator.client.next((m) => m.type === 'error');
  check(denied.code === 'unauthenticated' || denied.code === 'illegal-move', 'spectator cannot move', denied);
  spectator.client.close();

  black.client.close();
  white.client.close();

  const reunited = await Client.open(code, 'dev:alice');
  check(reunited.seat === 0, 'reconnecting player keeps their seat', reunited.seat);
  check(reunited.room.plies === 2, 'position survives the sockets closing', reunited.room.plies);
  check(reunited.room.seats[1].online === false, 'closed socket is reported offline', reunited.room.seats);
  reunited.client.close();
} catch (error) {
  check(false, error.message, error.stack);
}

console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
