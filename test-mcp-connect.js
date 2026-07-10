const mcp = require('./src/services/mcp.service');

async function main() {
  try {
    console.log('Connecting to MCP server...');
    const client = await mcp.initializeMcpClient();
    console.log('Connected! Listing tools:');
    const tools = await mcp.listTools();
    console.log('Tools list count:', tools.tools?.length || 0);
  } catch (e) {
    console.error('Connection failed:', e);
  }
}
main();
