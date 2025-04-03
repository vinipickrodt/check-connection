#!/usr/bin/env node

const net = require('net');
const dns = require('dns').promises;

/**
 * Attempts a TCP connection to the specified IP and port within a given timeout.
 * @param {string} ip - The IP address to connect to.
 * @param {number} port - The port to connect to.
 * @param {number} timeoutMs - Connection timeout in milliseconds (default 5000).
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
 * Retrieves ASN information from Team Cymru’s whois service.
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

      // Lines[0] is typically the header: 
      // "AS      | IP               | BGP Prefix          | CC | Registry | Allocated  | AS Name"
      // lines[1] should be the actual data
      if (lines.length > 1) {
        // Example line:
        // "15169   | 8.8.8.8          | 8.8.8.0/24          | US | ARIN     | 1992-12-01 | GOOGLE - Google LLC, US"
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

      // If we cannot parse the data, return null
      resolve(null);
    });

    client.on('error', (err) => {
      reject(err);
    });
  });
}

async function run() {
  // Separate positional arguments (host, port) from flags
  const args = process.argv.slice(2);
  let asnFlag = false;
  const positionalArgs = [];

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

  // 1) Resolve hostname -> IP
  let resolvedIp;
  try {
    const { address } = await dns.lookup(host);
    resolvedIp = address;
  } catch (err) {
    console.error(`Error resolving hostname '${host}': ${err.message}`);
    process.exit(1);
  }

  // 2) Check connection
  try {
    await checkConnection(resolvedIp, port, 5000);
    console.log(`[${host}] resolved to [${resolvedIp}] — Port ${port} is open`);
  } catch (err) {
    console.error(`[${host}] resolved to [${resolvedIp}] — Port ${port} is NOT open`);
    console.error(`Reason: ${err.message}`);
    process.exit(1);
  }

  // 3) If --asn is specified, retrieve ASN info from Team Cymru
  if (asnFlag) {
    try {
      const asnInfo = await getAsnInfoFromCymru(resolvedIp);
      if (asnInfo) {
        const { asn, asName, prefix, cc, registry, allocated } = asnInfo;
        console.log(`ASN:       ${asn}`);
        console.log(`AS Name:   ${asName}`);
        console.log(`BGP Prefix: ${prefix}`);
        console.log(`CC:        ${cc}`);
        console.log(`Registry:  ${registry}`);
        console.log(`Allocated: ${allocated}`);
      } else {
        console.log('No ASN information could be retrieved for this IP.');
      }
    } catch (err) {
      console.error(`Error fetching ASN info: ${err.message}`);
      // Not exiting with error code here, since the main check was successful
    }
  }

  process.exit(0);
}

run();
