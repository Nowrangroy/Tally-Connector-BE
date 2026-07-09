const express = require('express');
const multer = require('multer');
const mcpController = require('../../controllers/mcp.controller');
const uploadController = require('../../controllers/reconciliation.controller');

const upload       = multer({ storage: multer.memoryStorage() });
const uploadDual   = multer({ storage: multer.memoryStorage() });

const router = express.Router();

// ── Core MCP pass-through ──────────────────────────────────────────────────
router.get('/tools', mcpController.getTools);
router.post('/call', mcpController.callTool);

// ── Single-file reconciliation (party-ledger, gstr-2b, tds, bank) ─────────
router.post('/reconcile', upload.single('file'), uploadController.reconcile);

// ── Single-file utility tools (pdf-to-excel, bill-to-tally-excel) ─────────
router.post('/upload', upload.single('file'), uploadController.uploadSingleFile);

// ── Dual-file utility tools (pdf-compare, compare-excel) ──────────────────
router.post('/upload-dual', uploadDual.fields([
  { name: 'fileA', maxCount: 1 },
  { name: 'fileB', maxCount: 1 },
]), uploadController.uploadDualFile);

// ── Single-file path-based tools (excel-to-tally-validate, preview, push) ──
router.post('/upload-to-path', upload.single('file'), uploadController.uploadToPath);

module.exports = router;
