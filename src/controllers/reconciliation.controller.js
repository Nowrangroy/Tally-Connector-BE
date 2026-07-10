// Trigger nodemon reload for fresh Stdio MCP Client - V2
const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const mcpService = require('../services/mcp.service');
const XLSX = require('xlsx');
const { PDFParse } = require('pdf-parse');
const fs = require('fs');
const path = require('path');
const https = require('https');

// ─── Tools that require exactly ONE file upload ───────────────────────────────
const SINGLE_FILE_RECONCILIATION_TOOLS = new Set([
  'party-ledger-reconciliation',
  'gstr-2b-reconciliation',
  'tds-reconciliation',
  'bank-reconciliation',
]);

// ─── Tools that require ONE file (non-reconciliation) ─────────────────────────
const SINGLE_FILE_UTILITY_TOOLS = new Set([
  'pdf-to-excel',
  'bill-to-tally-excel',
]);

// ─── Tools that require TWO files ─────────────────────────────────────────────
const DUAL_FILE_TOOLS = new Set([
  'pdf-compare',
  'compare-excel',
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a Multer memory-buffer file to a base64 string.
 */
const toBase64 = (file) => file.buffer.toString('base64');

/**
 * Parse an Excel / CSV buffer into an array of row objects with normalised keys.
 */
const parseExcelRows = (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const raw = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  return raw.map((row) => {
    const normalized = {};
    for (const [key, value] of Object.entries(row)) {
      const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
      normalized[cleanKey] = value;
      const camelKey = cleanKey.replace(/_([a-z])/g, (_, g) => g.toUpperCase());
      normalized[camelKey] = value;
      normalized[key] = value; // raw key fallback
    }
    return normalized;
  });
};

/**
 * Parse a PDF buffer into compact transaction lines.
 * Returns { sourceFormat, statementRowsCompact }
 */
const parsePdfRows = async (buffer) => {
  const parser = new PDFParse(new Uint8Array(buffer));
  await parser.load();
  const textObj = await parser.getText();
  const text = (textObj && textObj.pages) ? textObj.pages.map((p) => p.text).join('\n') : '';
  const lines = text.split('\n');
  
  console.log(`[parsePdfRows] Extracted PDF text: ${lines.length} lines. First 20 lines:`);
  console.log(lines.slice(0, 20).join('\n'));

  const statementRowsCompact = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    const dateMatch = trimmed.match(
      /(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})|(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})/
    );
    if (dateMatch) {
      const date = dateMatch[0];
      const lineWithoutDate = trimmed.replace(date, '').trim();
      const numbers = lineWithoutDate.match(/\b\d[\d,]*(\.\d{2})?\b/g);
      if (numbers && numbers.length > 0) {
        let narration = lineWithoutDate;
        numbers.forEach((n) => { narration = narration.replace(n, ''); });
        narration = narration.replace(/[^a-zA-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();
        const cleanNumbers = numbers.map((n) => parseFloat(n.replace(/,/g, '')));
        const debit   = cleanNumbers[0] || 0;
        const credit  = cleanNumbers[1] || 0;
        const balance = cleanNumbers.length > 2 ? cleanNumbers[2] : (cleanNumbers[1] || 0);
        statementRowsCompact.push(
          `${date}|TXN-${Math.floor(1000 + Math.random() * 9000)}|${debit}|${credit}|${balance}|${narration || 'Transaction'}`
        );
      }
    }
  });

  return statementRowsCompact;
};

/**
 * Parse a bill/invoice image using Claude to extract structured JSON.
 */
const parseBillImage = async (fileBuffer, mimeType) => {
  if (!process.env.CLAUDE_API_KEY || process.env.CLAUDE_API_KEY === 'YOUR_CLAUDE_API_KEY_HERE') {
    throw new Error("CLAUDE_API_KEY is not set. Add your key to .env to process images.");
  }

  const prompt = `Extract the bill/invoice details from this image and return ONLY valid JSON (no markdown, no explanation) matching this schema:
{
  "billDate": "YYYY-MM-DD or raw date string",
  "partyName": "supplier/party name exactly as printed",
  "billNumber": "bill/invoice number",
  "billTotal": 0.00,
  "lineItems": [
    { "particular": "item name", "quantity": 0, "unit": "Kgs/Pcs/Nos", "rate": 0.00, "amount": 0.00 }
  ]
}
- billDate, partyName, and lineItems are required
- Use empty string for unreadable text fields, 0 for numbers`;

  const mediaType = mimeType === 'application/pdf' ? 'application/pdf' : (mimeType || 'image/jpeg');

  const body = JSON.stringify({
    model: 'claude-opus-4-8',
    max_tokens: 8192,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: fileBuffer.toString('base64') } }
      ]
    }]
  });

  const response = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          try {
            const err = JSON.parse(data);
            reject(new Error(err.error?.message || err.message || `HTTP ${res.statusCode}`));
          } catch {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          }
          return;
        }
        resolve(JSON.parse(data));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  // Collect text from all content blocks (handles thinking blocks)
  let rawText = '';
  for (const block of response.content || []) {
    if (block.type === 'text') rawText += block.text;
  }
  if (!rawText) throw new Error('Claude returned empty response');

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not parse JSON from Claude response');
  const parsed = JSON.parse(jsonMatch[0]);

  // Sanitize: MCP tool requires string/number types, rejects null
  parsed.billDate = parsed.billDate || '';
  parsed.partyName = parsed.partyName || '';
  parsed.billNumber = parsed.billNumber || '';
  parsed.billTotal = typeof parsed.billTotal === 'number' ? parsed.billTotal : 0;
  if (Array.isArray(parsed.lineItems)) {
    parsed.lineItems = parsed.lineItems.map(item => ({
      particular: item.particular || '',
      quantity: typeof item.quantity === 'number' ? item.quantity : 0,
      unit: item.unit || 'Nos',
      rate: typeof item.rate === 'number' ? item.rate : 0,
      amount: typeof item.amount === 'number' ? item.amount : 0,
    }));
  } else {
    parsed.lineItems = [];
  }

  return parsed;
};

// ─── Reconciliation handler (single file, existing behaviour) ─────────────────
const reconcile = catchAsync(async (req, res) => {
  if (!req.file) {
    return res.status(httpStatus.BAD_REQUEST).send({ message: 'No statement file uploaded.' });
  }

  const { toolName, targetCompany, ledgerName, fromDate, toDate } = req.body;
  if (!toolName) {
    return res.status(httpStatus.BAD_REQUEST).send({ message: 'toolName parameter is required.' });
  }

  let partyStatementRows = [];
  let statementRowsCompact = [];
  let sourceFormat = 'manual';

  const fileExtension = req.file.originalname.split('.').pop().toLowerCase();

  try {
    const mcpArguments = { targetCompany, fromDate, toDate, sourceFormat };

    if (['xlsx', 'xls', 'csv'].includes(fileExtension)) {
      sourceFormat = 'excel';
      mcpArguments.sourceFormat = 'excel';
      partyStatementRows = parseExcelRows(req.file.buffer);
    } else if (fileExtension === 'pdf') {
      sourceFormat = 'pdf';
      mcpArguments.sourceFormat = 'pdf';
      
      if (toolName === 'bank-reconciliation') {
        const uploadDir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        const tempFilePath = path.join(uploadDir, `temp-${Date.now()}-${req.file.originalname}`);
        fs.writeFileSync(tempFilePath, req.file.buffer);

        try {
          console.log(`Parsing PDF statement via parse-bank-statement MCP tool...`);
          const parseResult = await mcpService.callTool('parse-bank-statement', {
            filePath: tempFilePath,
            bankLedgerName: ledgerName || '',
            targetCompany: targetCompany
          });

          if (parseResult && !parseResult.isError) {
            const text = parseResult.content?.[0]?.text;
            if (text) {
              const parsed = JSON.parse(text);
              if (parsed && Array.isArray(parsed.transactions) && parsed.transactions.length > 0) {
                mcpArguments.bankStatementRows = parsed.transactions.map((t) => {
                  const amtVal = Math.abs(t.amount || 0);
                  const isDebit = t.voucher_type === 'Payment' || t.amount < 0 || String(t.type || '').toLowerCase() === 'withdrawal';
                  return {
                    "Date": t.date,
                    "Narration": t.narration || '',
                    "Chq./Ref.No.": t.voucher_no || '',
                    "Value Dt": t.date,
                    "Withdrawal Amt.": isDebit ? amtVal : 0,
                    "Deposit Amt.": !isDebit ? amtVal : 0,
                    "Closing Balance": t.balance || 0
                  };
                });
              }
            }
          }
        } catch (parseErr) {
          console.error("PDF extraction via parse-bank-statement MCP tool failed:", parseErr);
        } finally {
          if (fs.existsSync(tempFilePath)) {
            try { fs.unlinkSync(tempFilePath); } catch (e) {}
          }
        }
      }

      if (!mcpArguments.bankStatementRows || mcpArguments.bankStatementRows.length === 0) {
        statementRowsCompact = await parsePdfRows(req.file.buffer);
      }
    }

    if (ledgerName) {
      mcpArguments.ledgerName = ledgerName;
      mcpArguments.ledgerNames = [ledgerName];
    }

    if (mcpArguments.bankStatementRows && mcpArguments.bankStatementRows.length > 0) {
      // already set from PDF/MCP parser
    } else if (partyStatementRows.length > 0) {
      mcpArguments.partyStatementRows = partyStatementRows;
    } else if (statementRowsCompact.length > 0) {
      mcpArguments.statementRowsCompact = statementRowsCompact;
    } else {
      return res.status(httpStatus.BAD_REQUEST).send({
        message:
          'Could not extract any valid transaction rows from the uploaded statement. Please check the file formatting.',
      });
    }

    console.log(
      `Sending reconciliation request to tool ${toolName} with ${partyStatementRows.length || statementRowsCompact.length} rows…`
    );
    const result = await mcpService.callTool(toolName, mcpArguments);
    // Trigger reload
    res.send(result);
  } catch (error) {
    console.error('Reconciliation error:', error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).send({ message: error.message || error });
  }
});

// ─── Generic single-file upload handler (pdf-to-excel, bill-to-tally-excel) ──
const uploadSingleFile = catchAsync(async (req, res) => {
  if (!req.file) {
    return res.status(httpStatus.BAD_REQUEST).send({ message: 'No file uploaded.' });
  }

  const { toolName, targetCompany, ...extraBody } = req.body;
  if (!toolName) {
    return res.status(httpStatus.BAD_REQUEST).send({ message: 'toolName parameter is required.' });
  }

  try {
    const fileBase64 = toBase64(req.file);
    const mcpArguments = {
      targetCompany,
      ...extraBody,
    };

    // Map by tool to the correct parameter name expected by the MCP tool
    if (toolName === 'pdf-to-excel') {
      mcpArguments.pdfBase64 = fileBase64;
      mcpArguments.fileName = req.file.originalname;
      mcpArguments.returnBase64 = true;
    } else if (toolName === 'bill-to-tally-excel') {
      console.log(`Parsing image with Claude for bill-to-tally-excel...`);
      let parsedData;
      try {
        parsedData = await parseBillImage(req.file.buffer, req.file.mimetype);
        console.log(`Extracted JSON: ${JSON.stringify(parsedData)}`);
      } catch (claudeError) {
        console.error(`Claude extraction failed: ${claudeError.message}`);
        return res.status(httpStatus.BAD_REQUEST).send({
          message: `Could not read bill from image: ${claudeError.message}. Make sure the image is clear and try again.`,
        });
      }
      
      // Override/merge the extracted structured data into mcpArguments
      Object.assign(mcpArguments, parsedData);
      mcpArguments.fileName = req.file.originalname;
      mcpArguments.voucherMode = mcpArguments.voucherMode || req.body.voucherMode || 'purchase';
      mcpArguments.returnBase64 = true;
    } else if (toolName === 'parse-bank-statement') {
      // Save file to disk and pass filePath (MCP tool expects a filesystem path)
      const uploadDir = path.join(__dirname, '../uploads');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      const tempFilePath = path.join(uploadDir, `temp-${Date.now()}-${req.file.originalname}`);
      fs.writeFileSync(tempFilePath, req.file.buffer);
      mcpArguments.filePath = tempFilePath;
      mcpArguments.fileName = req.file.originalname;
    } else {
      // Generic fallback
      mcpArguments.fileBase64 = fileBase64;
      mcpArguments.fileName = req.file.originalname;
    }

    const result = await mcpService.callTool(toolName, mcpArguments);
    // 🌟 CRITICAL: Check if MCP tool returned an error (isError: true)
    if (result && result.isError) {
      const errText = result.content?.[0]?.text || 'Tool execution failed';
      return res.status(httpStatus.INTERNAL_SERVER_ERROR).send({ message: errText });
    }
    res.send(result);
  } catch (error) {
    console.error(`Upload error for ${toolName}:`, error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).send({ message: error.message || error });
  }
});

// ─── Dual-file upload handler (pdf-compare, compare-excel) ────────────────────
const uploadDualFile = catchAsync(async (req, res) => {
  const files = req.files || {};
  const fileA = Array.isArray(files.fileA) ? files.fileA[0] : null;
  const fileB = Array.isArray(files.fileB) ? files.fileB[0] : null;

  if (!fileA || !fileB) {
    return res.status(httpStatus.BAD_REQUEST).send({ message: 'Two files are required: fileA and fileB.' });
  }

  const { toolName, targetCompany, ...extraBody } = req.body;
  if (!toolName) {
    return res.status(httpStatus.BAD_REQUEST).send({ message: 'toolName parameter is required.' });
  }

  try {
    const mcpArguments = {
      targetCompany,
      ...extraBody,
    };

    if (toolName === 'pdf-compare') {
      mcpArguments.pdfBase64_a = toBase64(fileA);
      mcpArguments.pdfBase64_b = toBase64(fileB);
      mcpArguments.fileAName  = fileA.originalname;
      mcpArguments.fileBName  = fileB.originalname;
    } else if (toolName === 'compare-excel') {
      mcpArguments.excelBase64_a = toBase64(fileA);
      mcpArguments.excelBase64_b = toBase64(fileB);
      mcpArguments.fileAName   = fileA.originalname;
      mcpArguments.fileBName   = fileB.originalname;
    } else {
      mcpArguments.fileABase64 = toBase64(fileA);
      mcpArguments.fileBBase64 = toBase64(fileB);
    }

    const result = await mcpService.callTool(toolName, mcpArguments);
    if (result && result.isError) {
      const errText = result.content?.[0]?.text || 'Tool execution failed';
      return res.status(httpStatus.INTERNAL_SERVER_ERROR).send({ message: errText });
    }
    res.send(result);
  } catch (error) {
    console.error(`Dual-file upload error for ${toolName}:`, error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).send({ message: error.message || error });
  }
});

const uploadToPath = catchAsync(async (req, res) => {
  if (!req.file) {
    return res.status(httpStatus.BAD_REQUEST).send({ message: 'No file uploaded.' });
  }

  const { toolName, targetCompany, ...extraBody } = req.body;
  if (!toolName) {
    return res.status(httpStatus.BAD_REQUEST).send({ message: 'toolName parameter is required.' });
  }

  const uploadDir = path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const tempFilePath = path.join(uploadDir, `temp-${Date.now()}-${req.file.originalname}`);

  try {
    fs.writeFileSync(tempFilePath, req.file.buffer);

    const mcpArguments = {
      filePath: tempFilePath,
      targetCompany,
    };

    for (const [key, value] of Object.entries(extraBody)) {
      if (value === undefined || value === '') continue;
      if (['overrides', 'vouchersData', 'voucherIndices'].includes(key)) {
        try {
          mcpArguments[key] = JSON.parse(value);
        } catch (_) {
          mcpArguments[key] = value;
        }
      } else if (value === 'true' || value === 'false') {
        mcpArguments[key] = value === 'true';
      } else if (!isNaN(Number(value)) && key !== 'invoice_no' && key !== 'voucher_no') {
        mcpArguments[key] = Number(value);
      } else {
        mcpArguments[key] = value;
      }
    }

    console.log(`Executing ${toolName} with temp file: ${tempFilePath}`);
    const result = await mcpService.callTool(toolName, mcpArguments);
    if (result && result.isError) {
      const errText = result.content?.[0]?.text || 'Tool execution failed';
      return res.status(httpStatus.INTERNAL_SERVER_ERROR).send({ message: errText });
    }
    res.send(result);
  } catch (error) {
    console.error(`Upload to path error for ${toolName}:`, error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).send({ message: error.message || error });
  } finally {
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    } catch (err) {
      console.error('Failed to delete temp file:', err);
    }
  }
});

module.exports = {
  reconcile,
  uploadSingleFile,
  uploadDualFile,
  uploadToPath,
  SINGLE_FILE_RECONCILIATION_TOOLS,
  SINGLE_FILE_UTILITY_TOOLS,
  DUAL_FILE_TOOLS,
};
