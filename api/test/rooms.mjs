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

  static async open(game, code, token) {
    const ws = new WebSocket(`${WS_BASE}/rooms/${game}/${code}/ws`);
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

async function createRoom(token, game) {
  const res = await fetch(`${BASE}/rooms/create`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ game }),
  });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function chessRoom() {
  console.log('chess\n');

  const anonymous = await fetch(`${BASE}/rooms/create`, { method: 'POST' });
  check(anonymous.status === 401, 'create without a token is rejected', anonymous.status);

  const { res: created, body: creation } = await createRoom('dev:alice', 'chess');
  check(created.status === 201, 'create returns 201', { status: created.status, body: creation });
  const code = creation && creation.code;
  check(/^[A-HJ-NP-Z2-9]{5}$/.test(String(code)), 'room code looks right', code);
  check(creation.game === 'chess', 'a plain create defaults to chess', creation.game);

  const missing = await fetch(`${BASE}/rooms/chess/ZZZZZ`, { headers: { Authorization: 'Bearer dev:alice' } });
  check(missing.status === 404, 'unknown room is 404', missing.status);

  const bogusGame = await fetch(`${BASE}/rooms/nope/${code}`, { headers: { Authorization: 'Bearer dev:alice' } });
  check(bogusGame.status === 404, 'unknown game is 404', bogusGame.status);

  const anonymousRead = await fetch(`${BASE}/rooms/chess/${code}`);
  check(anonymousRead.status === 401, 'reading a room needs a token', anonymousRead.status);

  const white = await Client.open('chess', code, 'dev:alice');
  check(white.seat === 0, 'first player takes seat 0 (white)', white.seat);
  check(white.room.state.turn === 'w', 'new room starts on white', white.room.state.turn);
  check(white.room.game === 'chess', 'snapshot reports the game', white.room.game);

  const black = await Client.open('chess', code, 'dev:bob');
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

  const snapshot = await fetch(`${BASE}/rooms/chess/${code}`, { headers: { Authorization: 'Bearer dev:alice' } });
  const snapshotBody = await snapshot.json();
  check(snapshot.status === 200, 'GET /rooms/chess/:code returns state', snapshot.status);
  check(snapshotBody.plies === 2, 'snapshot has both plies', snapshotBody.plies);
  check(snapshotBody.seats.every((seat) => seat.online), 'snapshot shows both seats online', snapshotBody.seats);

  const spectator = await Client.open('chess', code, 'dev:carol');
  check(spectator.seat === null, 'third player becomes a spectator', spectator.seat);
  spectator.client.send({ type: 'move', from: 48, to: 32 });
  const denied = await spectator.client.next((m) => m.type === 'error');
  check(denied.code === 'unauthenticated' || denied.code === 'illegal-move', 'spectator cannot move', denied);
  spectator.client.close();

  black.client.close();
  white.client.close();

  const reunited = await Client.open('chess', code, 'dev:alice');
  check(reunited.seat === 0, 'reconnecting player keeps their seat', reunited.seat);
  check(reunited.room.plies === 2, 'position survives the sockets closing', reunited.room.plies);
  check(reunited.room.seats[1].online === false, 'closed socket is reported offline', reunited.room.seats);
  reunited.client.close();
}

async function checkersRoom() {
  console.log('\ncheckers\n');

  const { res, body } = await createRoom('dev:dana', 'checkers');
  check(res.status === 201, 'checkers room is created', { status: res.status, body });
  check(body.game === 'checkers', 'create echoes the game', body.game);
  const code = body.code;

  const red = await Client.open('checkers', code, 'dev:dana');
  check(red.seat === 0, 'first player takes seat 0', red.seat);
  check(red.room.state.turn === 'r', 'checkers starts on red', red.room.state.turn);
  check(red.room.seats[0].color === 'r' && red.room.seats[1].color === 'b', 'seats carry the checkers colours', red.room.seats);
  check(red.room.state.board.filter(Boolean).length === 24, 'room opens with 24 pieces', 0);

  const black = await Client.open('checkers', code, 'dev:erin');
  check(black.seat === 1, 'second player takes seat 1', black.seat);

  // c3-d4 then f6-e5 leaves red a compulsory jump on e5.
  red.client.send({ type: 'move', from: 42, to: 35 });
  const first = await black.client.next((m) => m.type === 'state' && m.room.plies === 1);
  check(first.room.state.turn === 'b', 'black gets the move', first.room.state.turn);
  check(first.last.to === 35 && first.last.captured === null, 'quiet move echoes no capture', first.last);

  black.client.send({ type: 'move', from: 21, to: 28 });
  const second = await red.client.next((m) => m.type === 'state' && m.room.plies === 2);
  check(second.room.state.turn === 'r', 'red is up again', second.room.state.turn);

  // A capture is available now, so a plain step must be refused.
  red.client.send({ type: 'move', from: 35, to: 26 });
  const forced = await red.client.next((m) => m.type === 'error');
  check(forced.code === 'illegal-move', 'server enforces compulsory captures', forced);

  red.client.send({ type: 'move', from: 35, to: 21 });
  const jumped = await black.client.next((m) => m.type === 'state' && m.room.plies === 3);
  check(jumped.last.captured === 28, 'the jump reports the captured square', jumped.last);
  check(jumped.room.state.board[28] === null, 'the captured man is gone', jumped.room.state.board[28]);
  check(jumped.room.state.board[21] && jumped.room.state.board[21].color === 'r', 'the jumper landed on f6', jumped.room.state.board[21]);
  check(jumped.room.state.board.filter(Boolean).length === 23, '23 pieces remain', 0);
  check(jumped.room.state.turn === 'b', 'turn passes to black', jumped.room.state.turn);

  // It is black's turn, so a move sent by red must be refused on turn alone.
  red.client.send({ type: 'move', from: 21, to: 14 });
  const wrongTurn = await red.client.next((m) => m.type === 'error');
  check(wrongTurn.code === 'not-your-turn', 'server rejects moving out of turn', wrongTurn);

  const snapshot = await fetch(`${BASE}/rooms/checkers/${code}`, { headers: { Authorization: 'Bearer dev:erin' } });
  const snapshotBody = await snapshot.json();
  check(snapshot.status === 200 && snapshotBody.game === 'checkers', 'GET /rooms/checkers/:code works', snapshot.status);
  check(snapshotBody.status === 'playing', 'snapshot reports the game as playing', snapshotBody.status);
  check(snapshotBody.plies === 3, 'snapshot has three plies', snapshotBody.plies);

  // The same code in the other game is a different room.
  const chessLookalike = await fetch(`${BASE}/rooms/chess/${code}`, { headers: { Authorization: 'Bearer dev:erin' } });
  check(chessLookalike.status === 404, 'a checkers code is not a chess room', chessLookalike.status);

  const spectator = await Client.open('checkers', code, 'dev:frank');
  check(spectator.seat === null, 'third player spectates', spectator.seat);
  spectator.client.send({ type: 'move', from: 19, to: 26 });
  const refused = await spectator.client.next((m) => m.type === 'error');
  check(refused.code === 'unauthenticated' || refused.code === 'illegal-move', 'spectator cannot move', refused);
  spectator.client.close();

  red.client.close();
  black.client.close();
}

async function connect4Room() {
  console.log('\nconnect 4\n');

  const { res, body } = await createRoom('dev:gina', 'connect4');
  check(res.status === 201, 'connect 4 room is created', { status: res.status, body });
  check(body.game === 'connect4', 'create echoes the game', body.game);
  const code = body.code;

  const red = await Client.open('connect4', code, 'dev:gina');
  check(red.seat === 0 && red.room.state.turn === 'r', 'red opens in seat 0', red.seat);
  check(red.room.seats[0].color === 'r' && red.room.seats[1].color === 'y', 'seats carry the disc colours', red.room.seats);

  const yellow = await Client.open('connect4', code, 'dev:hugo');
  check(yellow.seat === 1, 'second player takes seat 1', yellow.seat);

  // A drop names the column; the server works out the cell.
  red.client.send({ type: 'move', col: 3 });
  const first = await yellow.client.next((m) => m.type === 'state' && m.room.plies === 1);
  check(first.last.col === 3 && first.last.cell === 38, 'the drop echoes its column and landing cell', first.last);
  check(first.room.state.board[38] === 'r', 'the disc sits at the bottom of column 3', first.room.state.board[38]);
  check(first.room.state.turn === 'y', 'yellow is up', first.room.state.turn);

  yellow.client.send({ type: 'move', col: 3 });
  const second = await red.client.next((m) => m.type === 'state' && m.room.plies === 2);
  check(second.room.state.board[31] === 'y', 'the second disc stacks above', second.room.state.board[31]);

  red.client.send({ type: 'move', col: 9 });
  const badColumn = await red.client.next((m) => m.type === 'error');
  check(badColumn.code === 'illegal-move', 'server rejects a column off the board', badColumn);

  yellow.client.send({ type: 'move', col: 0 });
  const wrongTurn = await yellow.client.next((m) => m.type === 'error');
  check(wrongTurn.code === 'not-your-turn', 'server rejects moving out of turn', wrongTurn);

  // Fill column 0 for red while yellow scatters so it does not win first.
  const yellowColumns = [1, 1, 5];
  for (let i = 0; i < 3; i += 1) {
    red.client.send({ type: 'move', col: 0 });
    await red.client.next((m) => m.type === 'state' && m.room.plies === 3 + i * 2);
    yellow.client.send({ type: 'move', col: yellowColumns[i] });
    await yellow.client.next((m) => m.type === 'state' && m.room.plies === 4 + i * 2);
  }
  red.client.send({ type: 'move', col: 0 });
  const won = await red.client.next((m) => m.type === 'state' && m.room.status === 'won');
  check(won.room.state.winner === 'r', 'four in a column wins for red', won.room.state.winner);
  check(won.room.state.line.length === 4, 'the winning line has four cells', won.room.state.line);
  check(won.room.plies === 9, 'nine plies are recorded', won.room.plies);

  yellow.client.send({ type: 'move', col: 2 });
  const over = await yellow.client.next((m) => m.type === 'error');
  check(over.code === 'game-over', 'no moves after the game is won', over);

  const snapshot = await fetch(`${BASE}/rooms/connect4/${code}`, { headers: { Authorization: 'Bearer dev:hugo' } });
  const snapshotBody = await snapshot.json();
  check(snapshotBody.status === 'won' && snapshotBody.game === 'connect4', 'snapshot reports the result', snapshotBody.status);

  const spectator = await Client.open('connect4', code, 'dev:iris');
  check(spectator.seat === null, 'third player spectates', spectator.seat);
  spectator.client.close();

  red.client.close();
  yellow.client.close();
}

try {
  console.log(`testing ${BASE}\n`);
  await chessRoom();
  await checkersRoom();
  await connect4Room();
} catch (error) {
  check(false, error.message, error.stack);
}

console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
