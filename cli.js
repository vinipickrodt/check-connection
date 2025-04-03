#!/usr/bin/env node

const net = require('net');
const dns = require('dns').promises;

/**
 * Check if a connection can be established to the specified host:port.
 * @param {string} host - The hostname or IP address.
 * @param {number} port - The port number.
 * @param {number} timeoutMs - The timeout in milliseconds (default 5000).
 * @returns {Promise<string>} - Resolves with the resolved IP address if the connection is successful, or rejects on error.
 */
async function checkConnection(host, port, timeoutMs = 5000) {
  // Resolve the hostname to get its IP address
  const { address: resolvedIp } = await dns.lookup(host);

  return new Promise((resolve, reject) => {
    const socket = new net.Socket();

    // Set the socket timeout
    socket.setTimeout(timeoutMs);

    // If the connection is successful
    socket.on('connect', () => {
      socket.end();
      resolve(resolvedIp);
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

    // Attempt the connection to the resolved IP
    socket.connect(port, resolvedIp);
  });
}

async function run() {
  const [, , host, port] = process.argv;

  if (!host || !port) {
    console.error('Usage: check-connection <host> <port>');
    process.exit(1);
  }

  try {
    const ip = await checkConnection(host, port, 5000);
    console.log(`[${host}] resolved to [${ip}] — Port ${port} is open`);
    process.exit(0);
  } catch (err) {
    console.error(`[${host}] — Port ${port} is NOT open`);
    console.error(`Reason: ${err.message}`);
    process.exit(1);
  }
}

run();
