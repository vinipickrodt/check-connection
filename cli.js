#!/usr/bin/env node

const net = require('net');
const dns = require('dns').promises;

/**
 * Attempts a TCP connection to the specified IP and port within a given timeout.
 * @param {string} ip - The IP address to connect to.
 * @param {number} port - The port to connect to.
 * @param {number} timeoutMs - Connection timeout in milliseconds (default: 5000).
 * @returns {Promise<void>} - Resolves if successful, rejects on error or timeout.
 */
function checkConnection(ip, port, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      socket.end();
      resolve();
    });

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error(`Timed out after ${timeoutMs}ms trying to connect to ${ip}:${port}`));
    });

    socket.on('error', (err) => {
      socket.destroy();
      reject(err);
    });

    socket.connect(port, ip);
  });
}

/**
 * Retrieves ASN information from Team Cymru’s whois service for a given IP.
 * @param {string} ip - IP address (IPv4 or IPv6) to look up.
 * @returns {Promise<Object|null>} - Parsed ASN info or `null` if not available.
 */
async function getAsnInfoFromCymru(ip) {
  return new Promise((resolve, reject) => {
    let rawData = '';
    const client = net.connect(43, 'whois.cymru.com', () => {
      // The '-v' option includes a header row in the response, which we'll parse out.
      client.write(`-v ${ip}\n`);
    });

    // Accumulate data as it arrives
    client.on('data', (chunk) => {
      rawData += chunk.toString();
    });

    // When the server closes the connection, parse the result
    client.on('end', () => {
      // Split into lines, trim them, remove empty lines
      const lines = rawData
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l);

      // The first line is typically a header. The second line is data, if any.
      // Header example: "AS | IP | BGP Prefix | CC | Registry | Allocated | AS Name"
      // Data example:   "15169 | 8.8.8.8 | 8.8.8.0/24 | US | ARIN | 1992-12-01 | GOOGLE - Google LLC, US"
      if (lines.length > 1) {
        const row = lines[1];
        const columns = row.split('|').map((c) => c.trim());

        if (columns.length >= 7) {
          const [asn, ipReported, prefix, cc, registry, allocated, asName] = columns;
          resolve({
            asn,
            ipReported,
            prefix,
            cc,
            registry,
            allocated,
            asName,
          });
          return;
        }
      }

      // If we can’t parse any usable data, return null
      resolve(null);
    });

    client.on('error', (err) => {
      reject(err);
    });
  });
}

async function run() {
  const args = process.argv.slice(2);
  let asnFlag = false;
  const positionalArgs = [];

  // Separate out the --asn flag from the <host> and <port>
  for (const arg of args) {
    if (arg === '--asn') {
      asnFlag = true;
    } else {
      positionalArgs.push(arg);
    }
  }

  // We expect host and port in the positional args
  const [host, port] = positionalArgs;

  if (!host || !port) {
    console.error('Usage: check-connection [--asn] <host> <port>');
    process.exit(1);
  }

  // 1) Resolve the hostname to an IP
  let resolvedIp;
  try {
    const { address } = await dns.lookup(host);
    resolvedIp = address;
  } catch (err) {
    console.error(`Error resolving hostname '${host}': ${err.message}`);
    process.exit(1);
  }

  // 2) Check connection
  let connectionSuccess = false;
  let connectionError = null;
  try {
    await checkConnection(resolvedIp, port, 5000);
    connectionSuccess = true;
  } catch (err) {
    connectionError = err;
  }

  // 3) Print the port check result first (as requested)
  if (connectionSuccess) {
    console.log(`[${host}] resolved to [${resolvedIp}] - Port ${port} is open`);
  } else {
    console.log(`[${host}] resolved to [${resolvedIp}] - Port ${port} is NOT open`);
    // You can optionally show the reason:
    // console.error(`Reason: ${connectionError.message}`);
  }

  // 4) If --asn is requested, fetch and display ASN info (even if port is not open)
  if (asnFlag) {
    try {
      const asnInfo = await getAsnInfoFromCymru(resolvedIp);
      if (asnInfo) {
        console.log(`ASN:       ${asnInfo.asn}`);
        console.log(`AS Name:   ${asnInfo.asName}`);
        console.log(`BGP Prefix: ${asnInfo.prefix}`);
        console.log(`CC:        ${asnInfo.cc}`);
        console.log(`Registry:  ${asnInfo.registry}`);
        console.log(`Allocated: ${asnInfo.allocated}`);
      } else {
        console.log('No ASN information could be retrieved for this IP.');
      }
    } catch (err) {
      console.error(`Error fetching ASN info: ${err.message}`);
    }
  }

  // 5) Exit code: 0 if port is open, 1 if not
  process.exit(connectionSuccess ? 0 : 1);
}

run();
