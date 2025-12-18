/**
 * HTTP wrapper for MCP Postgres Server
 * Exposes MCP protocol over HTTP for integration with the AI assistant
 */

const { spawn } = require('child_process');
const http = require('http');

const PORT = process.env.PORT || 3100;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

// Store active MCP process
let mcpProcess = null;
let requestId = 0;
const pendingRequests = new Map();

function startMCPProcess() {
  console.log('Starting MCP Postgres server...');

  mcpProcess = spawn('npx', ['-y', '@modelcontextprotocol/server-postgres', DATABASE_URL], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env }
  });

  let buffer = '';

  mcpProcess.stdout.on('data', (data) => {
    buffer += data.toString();

    // Try to parse complete JSON messages
    const lines = buffer.split('\n');
    buffer = lines.pop(); // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.trim()) {
        try {
          const response = JSON.parse(line);
          console.log('MCP Response:', JSON.stringify(response).substring(0, 200));

          // Check if this is a response to a pending request
          if (response.id !== undefined && pendingRequests.has(response.id)) {
            const { resolve } = pendingRequests.get(response.id);
            pendingRequests.delete(response.id);
            resolve(response);
          }
        } catch (e) {
          console.log('MCP stdout (non-JSON):', line);
        }
      }
    }
  });

  mcpProcess.stderr.on('data', (data) => {
    console.error('MCP stderr:', data.toString());
  });

  mcpProcess.on('close', (code) => {
    console.log(`MCP process exited with code ${code}`);
    mcpProcess = null;
    // Restart after delay
    setTimeout(startMCPProcess, 5000);
  });

  mcpProcess.on('error', (err) => {
    console.error('MCP process error:', err);
  });

  // Initialize MCP connection
  setTimeout(() => {
    sendMCPRequest({ jsonrpc: '2.0', id: 0, method: 'initialize', params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'aml-platform', version: '1.0.0' }
    }}).then(response => {
      console.log('MCP initialized successfully');
      // Send initialized notification
      if (mcpProcess && !mcpProcess.killed) {
        mcpProcess.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
      }
    }).catch(err => {
      console.error('MCP initialization error:', err.message);
    });
  }, 1000);
}

// Handle unhandled promise rejections gracefully
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

function sendMCPRequest(request) {
  return new Promise((resolve, reject) => {
    if (!mcpProcess || mcpProcess.killed) {
      reject(new Error('MCP process not running'));
      return;
    }

    const id = request.id ?? ++requestId;
    request.id = id;

    pendingRequests.set(id, { resolve, reject, timestamp: Date.now() });

    const message = JSON.stringify(request) + '\n';
    console.log('Sending to MCP:', message.trim());
    mcpProcess.stdin.write(message);

    // Timeout after 30 seconds
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error('MCP request timeout'));
      }
    }, 30000);
  });
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      mcp_running: mcpProcess !== null && !mcpProcess.killed
    }));
    return;
  }

  // List available tools
  if (req.url === '/tools' && req.method === 'GET') {
    try {
      const response = await sendMCPRequest({
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {}
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response.result || response));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // List resources (tables/schemas)
  if (req.url === '/resources' && req.method === 'GET') {
    try {
      const response = await sendMCPRequest({
        jsonrpc: '2.0',
        method: 'resources/list',
        params: {}
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response.result || response));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // Calculator tool - evaluate mathematical expressions
  if (req.url === '/calculate' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { expression } = JSON.parse(body);

        if (!expression) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Expression required' }));
          return;
        }

        // Support math functions by replacing them with Math.* equivalents
        let processedExpr = expression
          .replace(/\bround\s*\(/gi, 'Math.round(')
          .replace(/\bfloor\s*\(/gi, 'Math.floor(')
          .replace(/\bceil\s*\(/gi, 'Math.ceil(')
          .replace(/\babs\s*\(/gi, 'Math.abs(')
          .replace(/\bsqrt\s*\(/gi, 'Math.sqrt(')
          .replace(/\bpow\s*\(/gi, 'Math.pow(')
          .replace(/\bmin\s*\(/gi, 'Math.min(')
          .replace(/\bmax\s*\(/gi, 'Math.max(');

        // For round to N decimal places: round(x, n) -> Math.round(x * 10^n) / 10^n
        processedExpr = processedExpr.replace(/Math\.round\(([^,]+),\s*(\d+)\)/g, (match, num, decimals) => {
          const multiplier = Math.pow(10, parseInt(decimals));
          return `(Math.round((${num}) * ${multiplier}) / ${multiplier})`;
        });

        // Safe evaluation - only allow numbers, decimal points, basic math operators, and Math.*
        // First check if the processed expression only contains safe patterns
        const safePattern = /^[\d.+\-*/().%\s,]*(Math\.(round|floor|ceil|abs|sqrt|pow|min|max)\([\d.+\-*/().%\s,]*(Math\.(round|floor|ceil|abs|sqrt|pow|min|max)\([\d.+\-*/().%\s,]*\))?[\d.+\-*/().%\s,]*\)[\d.+\-*/().%\s,]*)*$/;

        // Simpler approach: check that after removing all valid patterns, nothing remains
        const testExpr = processedExpr
          .replace(/Math\.(round|floor|ceil|abs|sqrt|pow|min|max)/g, '')
          .replace(/[0-9.+\-*/().%\s,]/g, '');

        if (testExpr.length > 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid characters in expression. Only numbers, operators (+, -, *, /, %), and functions (round, floor, ceil, abs, sqrt, pow, min, max) are allowed.' }));
          return;
        }

        // Evaluate the expression
        const result = Function('"use strict"; return (' + processedExpr + ')')();

        if (!isFinite(result)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Result is not a valid number (infinity or NaN)' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          expression: expression,
          result: result,
          formatted: typeof result === 'number' ? result.toLocaleString('en-US', { maximumFractionDigits: 6 }) : String(result)
        }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Calculation error: ${error.message}` }));
      }
    });
    return;
  }

  // Execute query via MCP tool
  if (req.url === '/query' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { sql } = JSON.parse(body);

        if (!sql) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'SQL query required' }));
          return;
        }

        // Safety check - only allow SELECT
        if (!sql.trim().toUpperCase().startsWith('SELECT')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Only SELECT queries allowed' }));
          return;
        }

        const response = await sendMCPRequest({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'query',
            arguments: { sql }
          }
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response.result || response));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // Read resource (table schema)
  if (req.url.startsWith('/resource/') && req.method === 'GET') {
    const uri = decodeURIComponent(req.url.replace('/resource/', ''));
    try {
      const response = await sendMCPRequest({
        jsonrpc: '2.0',
        method: 'resources/read',
        params: { uri }
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response.result || response));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // 404 for unknown routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Start everything
startMCPProcess();

server.listen(PORT, () => {
  console.log(`MCP HTTP wrapper listening on port ${PORT}`);
  console.log(`Database: ${DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  if (mcpProcess) mcpProcess.kill();
  server.close();
  process.exit(0);
});
