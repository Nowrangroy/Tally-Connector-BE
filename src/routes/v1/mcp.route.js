const express = require('express');
const multer = require('multer');
const auth = require('../../middlewares/auth');
const checkCompanyAccess = require('../../middlewares/companyAccess');
const mcpController = require('../../controllers/mcp.controller');
const uploadController = require('../../controllers/reconciliation.controller');

const upload       = multer({ storage: multer.memoryStorage() });
const uploadDual   = multer({ storage: multer.memoryStorage() });

const router = express.Router();

// All MCP routes require authentication
// ── Core MCP pass-through ──────────────────────────────────────────────────
router.get('/tools', auth(), checkCompanyAccess, mcpController.getTools);
router.post('/call', auth(), checkCompanyAccess, mcpController.callTool);

// ── Single-file reconciliation (party-ledger, gstr-2b, tds, bank) ─────────
router.post('/reconcile', auth(), upload.single('file'), checkCompanyAccess, uploadController.reconcile);

// ── Single-file utility tools (pdf-to-excel, bill-to-tally-excel) ─────────
router.post('/upload', auth(), upload.single('file'), checkCompanyAccess, uploadController.uploadSingleFile);

// ── Dual-file utility tools (pdf-compare, compare-excel) ──────────────────
router.post('/upload-dual', auth(), uploadDual.fields([
  { name: 'fileA', maxCount: 1 },
  { name: 'fileB', maxCount: 1 },
]), checkCompanyAccess, uploadController.uploadDualFile);

// ── Single-file path-based tools (excel-to-tally-validate, preview, push) ──
router.post('/upload-to-path', auth(), upload.single('file'), checkCompanyAccess, uploadController.uploadToPath);

module.exports = router;
