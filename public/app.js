let result = null;

function $(id) {
  return document.getElementById(id);
}

function money(value) {
  return "$" + Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");

  setTimeout(() => {
    $("toast").classList.remove("show");
  }, 2200);
}

function fileText(input) {
  return new Promise((resolve, reject) => {
    const file = input.files[0];

    if (!file) {
      resolve("");
      return;
    }

    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;

    reader.readAsText(file);
  });
}

$("vendorFile").onchange = () => {
  $("vendorName").textContent =
    $("vendorFile").files[0]?.name ||
    "No file selected";
};

$("ledgerFile").onchange = () => {
  $("ledgerName").textContent =
    $("ledgerFile").files[0]?.name ||
    "No file selected";
};

async function loadDemo() {
  const response = await fetch("/api/demo");
  const data = await response.json();

  result = data.result;

  render(data.result);

  toast("Demo reconciliation loaded");
}

async function runReconcile() {
  const vendor = await fileText($("vendorFile"));
  const ledger = await fileText($("ledgerFile"));

  if (!vendor || !ledger) {
    toast("Select both CSV files first");
    return;
  }

  try {
    const response = await fetch("/api/reconcile", {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        vendorCSV: vendor,
        ledgerCSV: ledger
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error);
    }

    result = data;

    render(data);

    toast("Reconciliation completed");

  } catch (error) {
    toast(error.message);
  }
}

function render(data) {

  /*
    KPI section
  */

  $("vendorBal").textContent =
    money(data.summaryStats.vendorBalance);

  $("ledgerBal").textContent =
    money(data.summaryStats.ledgerBalance);

  $("matched").textContent =
    data.summaryStats.matched;

  $("exceptions").textContent =
    data.summaryStats.totalExceptions;


  /*
    Status
  */

  $("variance").textContent =
    Math.abs(data.summaryStats.variance) < 0.001
      ? "BALANCED"
      : "Variance " +
        money(data.summaryStats.variance);

  $("statusText").textContent =
    data.status;

  $("statusSub").textContent =
    `${data.summaryStats.matched} matched · ` +
    `${data.summaryStats.discrepancies} discrepancies · ` +
    `${data.summaryStats.unmatchedVendor +
      data.summaryStats.unmatchedLedger} unmatched`;

  $("statusDot").parentElement.className =
    "statusbar " +
    (data.status === "Reconciled"
      ? "good"
      : "bad");


  /*
    Plain-English summary
  */

  $("summaryText").textContent =
    data.summary;

  $("summaryStatus").textContent =
    data.status;

  $("summaryStatus").className =
    "summary-status " +
    (data.status === "Reconciled"
      ? "summary-good"
      : "summary-warning");


  /*
    Discrepancies
  */

  const discrepancyHTML = [];

  data.discrepancies.forEach(item => {

    discrepancyHTML.push(`
      <div class="exception">

        <div class="ex-top">

          <span class="ex-title">
            ${esc(item.kind)}
          </span>

          <span class="priority ${String(
            item.priority
          ).toLowerCase()}">
            ${esc(item.priority || "Review")}
          </span>

        </div>

        <div class="ex-reason">
          ${esc(item.reason)}
        </div>

        ${
          item.vendor
            ? `
              <div class="ex-fields">
                Vendor ${esc(item.vendor.reference)}
                · Ledger ${esc(item.ledger.reference)}
                · Match score
                ${Math.round(item.score * 100)}%
              </div>
            `
            : ""
        }

      </div>
    `);
  });


  /*
    Unmatched vendor
  */

  data.unmatchedVendor.forEach(item => {

    discrepancyHTML.push(`
      <div class="exception">

        <div class="ex-top">

          <span class="ex-title">
            Unmatched vendor transaction
          </span>

          <span class="priority high">
            HIGH
          </span>

        </div>

        <div class="ex-reason">
          ${esc(item.description)}
          — ${money(item.amount)}
        </div>

        <div class="ex-fields">
          ${esc(item.reference)}
          · ${esc(item.date)}
        </div>

      </div>
    `);
  });


  /*
    Unmatched ledger
  */

  data.unmatchedLedger.forEach(item => {

    discrepancyHTML.push(`
      <div class="exception">

        <div class="ex-top">

          <span class="ex-title">
            Unmatched ledger transaction
          </span>

          <span class="priority high">
            HIGH
          </span>

        </div>

        <div class="ex-reason">
          ${esc(item.description)}
          — ${money(item.amount)}
        </div>

        <div class="ex-fields">
          ${esc(item.reference)}
          · ${esc(item.date)}
        </div>

      </div>
    `);
  });


  $("discrepancyList").innerHTML =
    discrepancyHTML.length
      ? discrepancyHTML.join("")
      : `
        <div class="empty">
          ✓ No discrepancies found.
        </div>
      `;


  /*
    Vendor running balance
  */

  $("vendorRunningCount").textContent =
    `${data.vendor.length} transactions`;

  $("vendorRunningTable").innerHTML =
    createRunningBalanceTable(data.vendor);


  /*
    Ledger running balance
  */

  $("ledgerRunningCount").textContent =
    `${data.ledger.length} transactions`;

  $("ledgerRunningTable").innerHTML =
    createRunningBalanceTable(data.ledger);


  /*
    Existing matched transactions
  */

  $("matchCount").textContent =
    `${data.matches.length} records`;

  $("matchTable").innerHTML =
    data.matches.length
      ? `
        <table class="table">

          <thead>
            <tr>
              <th>Vendor</th>
              <th>Ledger</th>
              <th>Description</th>
              <th>Amount</th>
              <th>Score</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>

            ${data.matches.map(item => `
              <tr>

                <td>
                  ${esc(item.vendor.reference)}
                </td>

                <td>
                  ${esc(item.ledger.reference)}
                </td>

                <td>
                  ${esc(item.vendor.description)}
                </td>

                <td>
                  ${money(item.vendor.amount)}
                </td>

                <td class="match-score">
                  ${Math.round(item.score * 100)}%
                </td>

                <td class="match-ok">
                  ✓ Matched
                </td>

              </tr>
            `).join("")}

          </tbody>

        </table>
      `
      : `
        <div class="empty">
          No exact matches.
        </div>
      `;
}


/*
  Running balance table
*/

function createRunningBalanceTable(rows) {

  if (!rows.length) {
    return `
      <div class="empty">
        No transactions found.
      </div>
    `;
  }

  return `
    <table class="table">

      <thead>

        <tr>
          <th>Date</th>
          <th>Reference</th>
          <th>Description</th>
          <th>Type</th>
          <th>Amount</th>
          <th>Running Balance</th>
        </tr>

      </thead>

      <tbody>

        ${rows.map(row => `

          <tr>

            <td>
              ${esc(row.date)}
            </td>

            <td>
              ${esc(row.reference)}
            </td>

            <td>
              ${esc(row.description)}
            </td>

            <td>
              ${esc(row.type)}
            </td>

            <td>
              ${row.type === "CREDIT" ? "-" : "+"}
              ${money(row.amount)}
            </td>

            <td>
              <strong>
                ${money(row.runningBalance)}
              </strong>
            </td>

          </tr>

        `).join("")}

      </tbody>

    </table>
  `;
}