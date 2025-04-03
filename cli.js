#!/usr/bin/env node

const net = require('net');

function checkConnection(host, port, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();

    // Set the timeout
    socket.setTimeout(timeoutMs);

    // Successful connection
    socket.on('connect', () => {
      socket.end();
      resolve();
    });

    // If a timeout occurs
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error(`Timed out after ${timeoutMs}ms trying to connect to ${host}:${port}`));
    });

    // If an error occurs (e.g., ECONNREFUSED)
    socket.on('error', (err) => {
      socket.destroy();
      reject(err);
    });

    // Attempt to connect
    socket.connect(port, host);
  });
}

async function run() {
  const [, , host, port] = process.argv;

  if (!host || !port) {
    console.error('Usage: check-connection <host> <port>');
    process.exit(1);
  }

  try {
    await checkConnection(host, port, 5000);
    console.log(`${host}:${port} is open`);
    process.exit(0);
  } catch (err) {
    console.error(`${host}:${port} is NOT open`);
    console.error(`Reason: ${err.message}`);
    process.exit(1);
  }
}

run();
