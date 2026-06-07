/**
 * Socket.io end-to-end smoke test
 * Run with: node scripts/test-socket.mjs <RIDE_ID>
 *
 * This simulates a DRIVER and a CUSTOMER joining the same ride room,
 * then tests live_location and chat messaging between them.
 */
import { io } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3000';
const RIDE_ID = process.argv[2];

if (!RIDE_ID) {
  console.error('Usage: node scripts/test-socket.mjs <RIDE_ID>');
  process.exit(1);
}

const DRIVER_ID   = '0be0ee51-153b-4b1f-bea3-a32b68a84b49';
const CUSTOMER_ID = '2f3957da-8e85-4076-9d84-9cd3f601f386';

let driverSocket, customerSocket;
let step = 0;

function log(who, ...args) {
  console.log(`[${who.padEnd(8)}]`, ...args);
}

// ─── Driver socket ───────────────────────────────────────────────────────────
driverSocket = io(SERVER_URL, {
  extraHeaders: {
    'x-mock-user-id': DRIVER_ID,
    'x-mock-role': 'DRIVER',
  },
  transports: ['websocket'],
});

driverSocket.on('connect', () => {
  log('DRIVER', `✅ Connected  socketId=${driverSocket.id}`);
  step++;

  // Step 1: join the ride room
  log('DRIVER', `→ Emitting join_ride  rideId=${RIDE_ID}`);
  driverSocket.emit('join_ride', { rideId: RIDE_ID });
});

driverSocket.on('room_joined', ({ room }) => {
  log('DRIVER', `✅ room_joined  room="${room}"`);
  step++;

  // Step 3: send location after both sockets have joined
  maybeSendLocation();
});

driverSocket.on('new_chat_message', (msg) => {
  log('DRIVER', `📨 new_chat_message:`, JSON.stringify(msg));
});

driverSocket.on('error', (err) => {
  log('DRIVER', `❌ error:`, err);
});

driverSocket.on('connect_error', (err) => {
  log('DRIVER', `❌ connect_error:`, err.message);
  process.exit(1);
});

// ─── Customer socket ─────────────────────────────────────────────────────────
customerSocket = io(SERVER_URL, {
  extraHeaders: {
    'x-mock-user-id': CUSTOMER_ID,
    'x-mock-role': 'CUSTOMER',
  },
  transports: ['websocket'],
});

customerSocket.on('connect', () => {
  log('CUSTOMER', `✅ Connected  socketId=${customerSocket.id}`);
  step++;

  // Step 2: join the same ride room
  log('CUSTOMER', `→ Emitting join_ride  rideId=${RIDE_ID}`);
  customerSocket.emit('join_ride', { rideId: RIDE_ID });
});

customerSocket.on('room_joined', ({ room }) => {
  log('CUSTOMER', `✅ room_joined  room="${room}"`);
  step++;

  maybeSendLocation();
});

customerSocket.on('live_location', (loc) => {
  log('CUSTOMER', `📍 live_location received:`, JSON.stringify(loc));
});

customerSocket.on('new_chat_message', (msg) => {
  log('CUSTOMER', `📨 new_chat_message:`, JSON.stringify(msg));
});

customerSocket.on('error', (err) => {
  log('CUSTOMER', `❌ error:`, err);
});

customerSocket.on('connect_error', (err) => {
  log('CUSTOMER', `❌ connect_error:`, err.message);
  process.exit(1);
});

// ─── Test sequence ────────────────────────────────────────────────────────────
// Wait for both sockets to join their room before running tests
let locationSent = false;
function maybeSendLocation() {
  // Both room_joined events fired (step 3 & 4 counting from 1)
  if (step < 4 || locationSent) return;
  locationSent = true;

  setTimeout(() => {
    // Test 1: Driver sends location → Customer should receive live_location
    log('DRIVER', '→ Emitting driver_location_update');
    driverSocket.emit('driver_location_update', {
      lat: 23.8150,
      lng: 90.4180,
      heading: 45,
      speed: 32,
    });

    // Test 2: Driver sends chat → Customer should receive new_chat_message
    setTimeout(() => {
      log('DRIVER', '→ Emitting message');
      driverSocket.emit('message', { message: 'I am 2 minutes away!' });

      // Test 3: Customer replies
      setTimeout(() => {
        log('CUSTOMER', '→ Emitting message');
        customerSocket.emit('message', { message: 'Great, I am at the gate!' });

        // Cleanup
        setTimeout(() => {
          log('TEST', '✅ All tests done — disconnecting');
          driverSocket.disconnect();
          customerSocket.disconnect();
          process.exit(0);
        }, 500);
      }, 500);
    }, 500);
  }, 200);
}

// Safety timeout
setTimeout(() => {
  console.error('❌ Timeout — something is wrong. Check your server logs.');
  process.exit(1);
}, 8000);
