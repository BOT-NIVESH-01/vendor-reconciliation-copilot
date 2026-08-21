let result = null;


/* =========================================
   HELPER
========================================= */

function $(id) {
  return document.getElementById(id);
}


function money(value) {

  return "$" +
    Number(value || 0).toLocaleString(
      undefined,
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    );

}


function esc(value) {

  return String(value).replace(
    /[&<>"']/g,
    char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char])
  );

}


function toast(message) {

  $("toast").textContent = message;

  $("toast").classList.add("show");

  setTimeout(() => {

    $("toast").classList.remove("show");

  }, 2200);

}


/* =========================================
   FILE INPUT
========================================= */

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


/* =========================================
   LOAD DEMO
========================================= */

async function loadDemo() {

  try {

    const response =
      await fetch("/api/demo");

    const data =
      await response.json();

    result =
      data.result;

    render(data.result);

    toast("Demo reconciliation loaded");

  } catch (error) {

    toast("Unable to load demo data");

  }

}


/* =========================================
   RECONCILE
========================================= */

async function runReconcile() {

  const vendor =
    await fileText(
      $("vendorFile")
    );

  const ledger =
    await fileText(
      $("ledgerFile")
    );


  if (!vendor || !ledger) {

    toast(
      "Select both CSV files first"
    );

    return;

  }


  try {

    const response =
      await fetch(
        "/api/reconcile",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            vendorCSV: vendor,
            ledgerCSV: ledger
          })
        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.error
      );

    }


    result = data;

    render(data);

    toast(
      "Reconciliation completed"
    );

  } catch (error) {

    toast(
      error.message
    );

  }

}


/* =========================================
   RENDER RESULTS
========================================= */

function render(data) {


  /* KPI */

  $("vendorBal").textContent =
    money(
      data.summaryStats.vendorBalance
    );


  $("ledgerBal").textContent =
    money(
      data.summaryStats.ledgerBalance
    );


  $("matched").textContent =
    data.summaryStats.matched;


  $("exceptions").textContent =
    data.summaryStats.totalExceptions;


  /* STATUS */

  $("variance").textContent =
    Math.abs(
      data.summaryStats.variance
    ) < 0.001

      ? "BALANCED"

      : "Variance " +
        money(
          data.summaryStats.variance
        );


  $("statusText").textContent =
    data.status;


  $("statusSub").textContent =
    `${data.summaryStats.matched} matched · ` +
    `${data.summaryStats.discrepancies} discrepancies · ` +
    `${data.summaryStats.unmatchedVendor +
      data.summaryStats.unmatchedLedger} unmatched`;


  $("statusDot")
    .parentElement
    .className =
      "statusbar " +
      (
        data.status === "Reconciled"
          ? "good"
          : "bad"
      );


  /* SUMMARY */

  $("summaryText").textContent =
    data.summary;


  $("summaryStatus").textContent =
    data.status;


  $("summaryStatus").className =
    "summary-status " +
    (
      data.status === "Reconciled"
        ? "summary-good"
        : "summary-warning"
    );


  /* DISCREPANCIES */

  const discrepancyHTML = [];


  data.discrepancies.forEach(
    item => {

      discrepancyHTML.push(`

        <div class="exception">

          <div class="ex-top">

            <span class="ex-title">
              ${esc(item.kind)}
            </span>

            <span
              class="priority ${String(
                item.priority || "Medium"
              ).toLowerCase()}"
            >
              ${esc(
                item.priority ||
                "Review"
              )}
            </span>

          </div>


          <div class="ex-reason">
            ${esc(item.reason)}
          </div>


          ${
            item.vendor

              ? `

                <div class="ex-fields">

                  Vendor
                  ${esc(
                    item.vendor.reference
                  )}

                  · Ledger
                  ${esc(
                    item.ledger.reference
                  )}

                  · Match score
                  ${Math.round(
                    item.score * 100
                  )}%

                </div>

              `

              : ""
          }

        </div>

      `);

    }
  );


  /* UNMATCHED VENDOR */

  data.unmatchedVendor.forEach(
    item => {

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

            ${esc(
              item.description
            )}

            —

            ${money(
              item.amount
            )}

          </div>


          <div class="ex-fields">

            ${esc(
              item.reference
            )}

            ·

            ${esc(
              item.date
            )}

          </div>

        </div>

      `);

    }
  );


  /* UNMATCHED LEDGER */

  data.unmatchedLedger.forEach(
    item => {

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

            ${esc(
              item.description
            )}

            —

            ${money(
              item.amount
            )}

          </div>


          <div class="ex-fields">

            ${esc(
              item.reference
            )}

            ·

            ${esc(
              item.date
            )}

          </div>

        </div>

      `);

    }
  );


  $("discrepancyList").innerHTML =
    discrepancyHTML.length

      ? discrepancyHTML.join("")

      : `

        <div class="empty">

          ✓ No discrepancies found.

        </div>

      `;


  /* VENDOR RUNNING BALANCE */

  $("vendorRunningCount").textContent =
    `${data.vendor.length} transactions`;


  $("vendorRunningTable").innerHTML =
    createRunningBalanceTable(
      data.vendor
    );


  /* LEDGER RUNNING BALANCE */

  $("ledgerRunningCount").textContent =
    `${data.ledger.length} transactions`;


  $("ledgerRunningTable").innerHTML =
    createRunningBalanceTable(
      data.ledger
    );


  /* MATCHED */

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

            ${data.matches
              .map(
                item => `

                  <tr>

                    <td>
                      ${esc(
                        item.vendor.reference
                      )}
                    </td>

                    <td>
                      ${esc(
                        item.ledger.reference
                      )}
                    </td>

                    <td>
                      ${esc(
                        item.vendor.description
                      )}
                    </td>

                    <td>
                      ${money(
                        item.vendor.amount
                      )}
                    </td>

                    <td class="match-score">

                      ${Math.round(
                        item.score * 100
                      )}%

                    </td>

                    <td class="match-ok">

                      ✓ Matched

                    </td>

                  </tr>

                `
              )
              .join("")}

          </tbody>

        </table>

      `

      : `

        <div class="empty">

          No exact matches.

        </div>

      `;

}


/* =========================================
   RUNNING BALANCE TABLE
========================================= */

function createRunningBalanceTable(
  rows
) {

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

          <th>
            Reference
          </th>

          <th>
            Description
          </th>

          <th>
            Type
          </th>

          <th>
            Amount
          </th>

          <th>
            Running Balance
          </th>

        </tr>

      </thead>


      <tbody>

        ${rows
          .map(
            row => `

              <tr>

                <td>
                  ${esc(row.date)}
                </td>

                <td>
                  ${esc(
                    row.reference
                  )}
                </td>

                <td>
                  ${esc(
                    row.description
                  )}
                </td>

                <td>
                  ${esc(row.type)}
                </td>

                <td>

                  ${
                    row.type === "CREDIT"
                      ? "-"
                      : "+"
                  }

                  ${money(
                    row.amount
                  )}

                </td>

                <td>

                  <strong>
                    ${money(
                      row.runningBalance
                    )}
                  </strong>

                </td>

              </tr>

            `
          )
          .join("")}

      </tbody>

    </table>

  `;

}


/* =========================================
   SIDEBAR NAVIGATION
========================================= */

function navigateTo(
  targetId,
  clickedButton
) {

  const target =
    document.getElementById(
      targetId
    );

  if (!target) return;


  target.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });


  document
    .querySelectorAll(".nav")
    .forEach(nav => {

      nav.classList.remove(
        "active"
      );

    });


  clickedButton.classList.add(
    "active"
  );

}


/* =========================================
   ACTIVE SIDEBAR WHILE SCROLLING
========================================= */

const navigationSections = [

  {
    id: "dashboard",
    nav: '[data-target="dashboard"]'
  },

  {
    id: "summary",
    nav: '[data-target="summary"]'
  },

  {
    id: "discrepancies",
    nav: '[data-target="discrepancies"]'
  },

  {
    id: "matched",
    nav: '[data-target="matched"]'
  }

];


window.addEventListener(
  "scroll",
  () => {

    let currentSection =
      "dashboard";


    navigationSections.forEach(
      section => {

        const element =
          document.getElementById(
            section.id
          );

        if (!element) return;


        const position =
          element.getBoundingClientRect()
            .top;


        if (position <= 150) {

          currentSection =
            section.id;

        }

      }
    );


    document
      .querySelectorAll(".nav")
      .forEach(nav => {

        nav.classList.remove(
          "active"
        );


        if (
          nav.dataset.target ===
          currentSection
        ) {

          nav.classList.add(
            "active"
          );

        }

      });

  }
);