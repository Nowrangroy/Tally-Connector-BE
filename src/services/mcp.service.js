const path = require('path');

let clientInstance = null;

/**
 * Tear down the cached MCP client so the next call forces a fresh connect.
 */
const resetClient = () => {
  if (clientInstance) {
    try { clientInstance.close?.(); } catch (_) { /* ignore */ }
    clientInstance = null;
  }
};

const initializeMcpClient = async () => {
  if (clientInstance) return clientInstance;

  try {
    // Dynamic import to support ESM-only @modelcontextprotocol/sdk in CommonJS
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');

    const serverPath = path.resolve(__dirname, '../../../tally-mcp-server/dist/index.mjs');

    const transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: {
        ...process.env,
        TALLY_HOST: process.env.TALLY_HOST || '13.202.32.16',
        TALLY_PORT: process.env.TALLY_PORT || '8888',
      },
    });

    const client = new Client(
      { name: 'tally-connector-backend-client', version: '1.0.0' },
      { capabilities: {} }
    );

    await client.connect(transport);
    clientInstance = client;
    console.log('Successfully connected to Tally MCP Server via Stdio');
    return client;
  } catch (error) {
    clientInstance = null;
    console.error('Failed to initialize Tally MCP Client:', error);
    throw error;
  }
};

const listTools = async () => {
  const client = await initializeMcpClient();
  const result = await client.listTools();
  return result;
};

/**
 * Call a tool by name, with one automatic retry on transport / stale-client errors.
 */
const callTool = async (name, args) => {
  let client;
  try {
    client = await initializeMcpClient();
    // 4.5-minute timeout — OCR on scanned PDFs can take up to 2-3 minutes
    const TOOL_TIMEOUT_MS = 4.5 * 60 * 1000;
    const result = await client.callTool({ name, arguments: args }, undefined, { timeout: TOOL_TIMEOUT_MS });
    return result;
  } catch (error) {
    // If the error looks like a transport / connection issue, reset and retry once
    const isTransportError =
      error?.code === -32000 ||           // MCP ConnectionClosed
      error?.message?.includes('closed') ||
      error?.message?.includes('transport') ||
      error?.message?.includes('connect');

    if (isTransportError) {
      console.warn(`[MCP] Transport error on tool "${name}" — resetting client and retrying…`);
      resetClient();
      try {
        client = await initializeMcpClient();
        const TOOL_TIMEOUT_MS = 4.5 * 60 * 1000;
        const result = await client.callTool({ name, arguments: args }, undefined, { timeout: TOOL_TIMEOUT_MS });
        return result;
      } catch (retryError) {
        console.error(`[MCP] Retry also failed for tool "${name}":`, retryError);
        throw retryError;
      }
    }
    throw error;
  }
};

module.exports = {
  initializeMcpClient,
  resetClient,
  listTools,
  callTool,
};
