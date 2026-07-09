const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const mcpService = require('../services/mcp.service');

const getTools = catchAsync(async (req, res) => {
  const result = await mcpService.listTools();
  res.send(result);
});

const callTool = catchAsync(async (req, res) => {
  const { name, arguments: args } = req.body;
  const result = await mcpService.callTool(name, args);
  res.send(result);
});

module.exports = {
  getTools,
  callTool,
};
