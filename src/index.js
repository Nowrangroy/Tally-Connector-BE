const mongoose = require('mongoose');
const app = require('./app');
const config = require('./config/config');
const logger = require('./config/logger');
const { initializeMcpClient } = require('./services/mcp.service');

let server;
mongoose.connect(config.mongoose.url, config.mongoose.options).then(async () => {
  logger.info('Connected to MongoDB');
  try {
    await initializeMcpClient();
  } catch (error) {
    logger.error('Failed to connect to Tally MCP Server on startup:', error);
  }
  server = app.listen(config.port, () => {
    logger.info(`Listening to port ${config.port}`);
    // Allow up to 5 minutes for long-running requests (e.g. OCR on scanned PDFs)
    server.setTimeout(5 * 60 * 1000);
  });
});

const exitHandler = () => {
  if (server) {
    server.close(() => {
      logger.info('Server closed');
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
};

const unexpectedErrorHandler = (error) => {
  logger.error(error);
  exitHandler();
};

process.on('uncaughtException', unexpectedErrorHandler);
process.on('unhandledRejection', unexpectedErrorHandler);

process.on('SIGTERM', () => {
  logger.info('SIGTERM received');
  if (server) {
    server.close();
  }
});

// Trigger reload

