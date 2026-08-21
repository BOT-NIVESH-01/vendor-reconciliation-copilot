const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");

const vendorCSV = `date,reference,description,amount,type
2026-08-01,V-1001,Cloud hosting invoice,1250.00,DEBIT
2026-08-03,V-1002,Office supplies,420.50,DEBIT
2026-08-05,V-1003,Software subscription,899.00,DEBIT
2026-08-07,V-1004,Consulting services,2100.00,DEBIT
2026-08-09,V-1005,Refund from vendor,180.00,CREDIT
2026-08-12,V-1006,Security service,760.00,DEBIT`;

const ledgerCSV = `date,reference,description,amount,type
2026-08-01,L-7001,Cloud hosting invoice,1250.00,DEBIT
2026-08-03,L-7002,Office supplies,420.50,DEBIT
2026-08-05,L-7003,Software subscription,950.00,DEBIT
2026-08-08,L-7004,Consulting services,2100.00,DEBIT
2026-08-09,L-7005,Refund from vendor,180.00,CREDIT
2026-08-15,L-7006,Equipment maintenance,640.00,DEBIT`;

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines.shift().split(",").map(x => x.trim());

  return lines
    .filter(Boolean)
    .map(line => {
      const values = line.split(",").map(x => x.trim());
      const row = {};

      headers.forEach((header, index) => {
        row[header] = values[index] ?? "";
      });

      row.amount = Number(row.amount || 0);

      return row;
    });
}

function normalize(rows, source) {
  return rows
    .map((row, index) => ({
      id: `${source}-${index + 1}`,
      source,
      date: row.date,
      reference: row.reference,
      description: row.description,
      amount: Number(row.amount),
      type: (row.type || "DEBIT").toUpperCase(),
      signedAmount:
        (row.type || "DEBIT").toUpperCase() === "CREDIT"
          ? -Math.abs(Number(row.amount))
          : Math.abs(Number(row.amount))
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function descriptionTokens(text) {
  return new Set(
    String(text)
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter(word => word.length > 2)
  );
}

function similarity(a, b) {
  const A = descriptionTokens(a);
  const B = descriptionTokens(b);

  const union = new Set([...A, ...B]);
  const intersection = [...A].filter(x => B.has(x)).length;

  return union.size ? intersection / union.size : 0;
}

function calculateRunningBalance(rows) {
  let balance = 0;

  return rows.map(row => {
    balance += row.signedAmount;

    return {
      ...row,
      runningBalance: Number(balance.toFixed(2))
    };
  });
}

function reconcile(vendorRows, ledgerRows) {
  const vendor = normalize(vendorRows, "Vendor");
  const ledger = normalize(ledgerRows, "Ledger");

  const vendorRunning = calculateRunningBalance(vendor);
  const ledgerRunning = calculateRunningBalance(ledger);

  const usedLedger = new Set();

  const matches = [];
  const discrepancies = [];
  const unmatchedVendor = [];
  const unmatchedLedger = [];

  for (const vendorTransaction of vendor) {
    let best = null;

    for (const ledgerTransaction of ledger) {
      if (usedLedger.has(ledgerTransaction.id)) continue;

      if (vendorTransaction.type !== ledgerTransaction.type) continue;

      const amountDifference = Math.abs(
        vendorTransaction.amount - ledgerTransaction.amount
      );

      const dateDifference = Math.abs(
        (new Date(vendorTransaction.date) -
          new Date(ledgerTransaction.date)) /
          86400000
      );

      const descriptionScore = similarity(
        vendorTransaction.description,
        ledgerTransaction.description
      );

      let score = 0;

      if (amountDifference === 0) {
        score += 0.6;
      } else if (amountDifference <= 10) {
        score += 0.3;
      }

      if (descriptionScore >= 0.8) {
        score += 0.25;
      } else if (descriptionScore >= 0.4) {
        score += 0.15;
      }

      if (dateDifference === 0) {
        score += 0.15;
      } else if (dateDifference <= 3) {
        score += 0.1;
      }

      if (!best || score > best.score) {
        best = {
          ledger: ledgerTransaction,
          score,
          amountDifference,
          dateDifference,
          descriptionScore
        };
      }
    }

    if (best && best.score >= 0.75) {
      usedLedger.add(best.ledger.id);

      if (best.amountDifference === 0) {
        matches.push({
          vendor: vendorTransaction,
          ledger: best.ledger,
          score: best.score,
          status: "Matched"
        });
      } else {
        const priority =
          best.amountDifference >= 500
            ? "High"
            : best.amountDifference >= 100
            ? "Medium"
            : "Low";

        discrepancies.push({
          kind: "Amount mismatch",
          priority,
          vendor: vendorTransaction,
          ledger: best.ledger,
          score: best.score,
          reason:
            `Amount differs by $${best.amountDifference.toFixed(2)}. ` +
            `Vendor: $${vendorTransaction.amount.toFixed(2)}, ` +
            `Ledger: $${best.ledger.amount.toFixed(2)}.`
        });
      }
    } else {
      unmatchedVendor.push(vendorTransaction);
    }
  }

  for (const ledgerTransaction of ledger) {
    if (!usedLedger.has(ledgerTransaction.id)) {
      unmatchedLedger.push(ledgerTransaction);
    }
  }

  const vendorBalance = vendor.reduce(
    (sum, transaction) => sum + transaction.signedAmount,
    0
  );

  const ledgerBalance = ledger.reduce(
    (sum, transaction) => sum + transaction.signedAmount,
    0
  );

  const variance = vendorBalance - ledgerBalance;

  if (Math.abs(variance) > 0.001) {
    discrepancies.push({
      kind: "Balance variance",
      priority: Math.abs(variance) >= 500 ? "High" : "Medium",
      vendor: null,
      ledger: null,
      score: 1,
      reason:
        `The two sources differ by $${Math.abs(variance).toFixed(2)}. ` +
        `Vendor balance: $${vendorBalance.toFixed(2)}. ` +
        `Ledger balance: $${ledgerBalance.toFixed(2)}.`
    });
  }

  const priorityOrder = {
    High: 1,
    Medium: 2,
    Low: 3
  };

  discrepancies.sort(
    (a, b) =>
      (priorityOrder[a.priority] || 3) -
      (priorityOrder[b.priority] || 3)
  );

  const totalExceptions =
    discrepancies.length +
    unmatchedVendor.length +
    unmatchedLedger.length;

  let summary;

  if (totalExceptions === 0) {
    summary =
      `The reconciliation is complete with no exceptions. ` +
      `${matches.length} transactions were successfully matched, ` +
      `and the vendor and ledger balances are fully aligned at ` +
      `$${vendorBalance.toFixed(2)}.`;
  } else {
    const parts = [];

    parts.push(
      `The reconciliation identified ${totalExceptions} item(s) requiring attention.`
    );

    if (matches.length > 0) {
      parts.push(
        `${matches.length} transaction(s) were successfully matched.`
      );
    }

    if (discrepancies.length > 0) {
      parts.push(
        `${discrepancies.length} discrepancy item(s) were identified.`
      );
    }

    if (unmatchedVendor.length > 0) {
      parts.push(
        `${unmatchedVendor.length} vendor transaction(s) have no matching ledger record.`
      );
    }

    if (unmatchedLedger.length > 0) {
      parts.push(
        `${unmatchedLedger.length} ledger transaction(s) have no matching vendor record.`
      );
    }

    parts.push(
      `The vendor balance is $${vendorBalance.toFixed(2)} while the ledger balance is $${ledgerBalance.toFixed(2)}, resulting in a variance of $${Math.abs(
        variance
      ).toFixed(2)}.`
    );

    summary = parts.join(" ");
  }

  return {
    vendor: vendorRunning,
    ledger: ledgerRunning,
    matches,
    discrepancies,
    unmatchedVendor,
    unmatchedLedger,

    summary,

    summaryStats: {
      totalVendorTransactions: vendor.length,
      totalLedgerTransactions: ledger.length,
      matched: matches.length,
      discrepancies: discrepancies.length,
      unmatchedVendor: unmatchedVendor.length,
      unmatchedLedger: unmatchedLedger.length,
      totalExceptions,
      vendorBalance,
      ledgerBalance,
      variance
    },

    status:
      totalExceptions === 0
        ? "Reconciled"
        : "Exceptions Found"
  };
}

function sendJSON(res, status, data) {
  const body = JSON.stringify(data);

  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  });

  res.end(body);
}

function readBody(req) {
  return new Promise(resolve => {
    let body = "";

    req.on("data", chunk => {
      body += chunk;
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const demoResult = reconcile(
  parseCSV(vendorCSV),
  parseCSV(ledgerCSV)
);

async function api(req, res, pathname) {

  if (pathname === "/api/demo" && req.method === "GET") {
    return sendJSON(res, 200, {
      vendorCSV,
      ledgerCSV,
      result: demoResult
    });
  }

  if (pathname === "/api/reconcile" && req.method === "POST") {

    const body = await readBody(req);

    try {

      if (!body.vendorCSV || !body.ledgerCSV) {
        return sendJSON(res, 400, {
          error: "Both CSV files are required."
        });
      }

      const result = reconcile(
        parseCSV(body.vendorCSV),
        parseCSV(body.ledgerCSV)
      );

      return sendJSON(res, 200, result);

    } catch (error) {

      return sendJSON(res, 400, {
        error:
          "Could not parse the CSV files. Required columns: date, reference, description, amount, type."
      });

    }
  }

  return sendJSON(res, 404, {
    error: "API endpoint not found."
  });
}

function serveStatic(res, pathname) {

  const file =
    pathname === "/" ? "/index.html" : pathname;

  const cleanPath = path
    .normalize(file)
    .replace(/^(\.\.[/\\])+/, "");

  const fullPath = path.join(PUBLIC, cleanPath);

  if (!fullPath.startsWith(PUBLIC)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(fullPath, (error, data) => {

    if (error) {
      res.writeHead(404);
      return res.end("Not found");
    }

    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8"
    };

    res.writeHead(200, {
      "Content-Type":
        types[path.extname(fullPath)] ||
        "application/octet-stream"
    });

    res.end(data);
  });
}

http
  .createServer((req, res) => {

    const url = new URL(
      req.url,
      `http://${req.headers.host || "localhost"}`
    );

    if (url.pathname.startsWith("/api/")) {
      return api(req, res, url.pathname);
    }

    serveStatic(res, url.pathname);

  })
  .listen(PORT, "0.0.0.0", () => {
    console.log(
      `Vendor Reconciliation Copilot running on port ${PORT}`
    );
  });