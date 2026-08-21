let result=null;

function $(id){return document.getElementById(id)}
function money(n){return "$"+Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function toast(t){$("toast").textContent=t;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2200)}
function fileText(input){return new Promise((resolve,reject)=>{const f=input.files[0];if(!f)return resolve("");const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsText(f)})}
$("vendorFile").onchange=()=>{$("vendorName").textContent=$("vendorFile").files[0]?.name||"No file selected"}
$("ledgerFile").onchange=()=>{$("ledgerName").textContent=$("ledgerFile").files[0]?.name||"No file selected"}

async function loadDemo(){
  const r=await fetch("/api/demo");const d=await r.json();
  result=d.result;
  render(d.result);
  toast("Demo reconciliation loaded");
}
async function runReconcile(){
  const vendor=await fileText($("vendorFile")), ledger=await fileText($("ledgerFile"));
  if(!vendor||!ledger){toast("Select both CSV files first");return}
  try{
    const r=await fetch("/api/reconcile",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({vendorCSV:vendor,ledgerCSV:ledger})});
    const d=await r.json();if(!r.ok)throw Error(d.error);
    result=d;render(d);toast("Reconciliation completed");
  }catch(e){toast(e.message)}
}
function render(d){
  $("vendorBal").textContent=money(d.summary.vendorBalance);
  $("ledgerBal").textContent=money(d.summary.ledgerBalance);
  $("matched").textContent=d.summary.matched;
  $("exceptions").textContent=d.summary.discrepancyCount+d.summary.unmatchedVendor+d.summary.unmatchedLedger;
  $("variance").textContent=Math.abs(d.summary.variance)<.001?"BALANCED":"Variance "+money(d.summary.variance);
  $("statusText").textContent=d.summary.status;
  $("statusSub").textContent=`${d.summary.matched} matched · ${d.summary.discrepancyCount} discrepancies · ${d.summary.unmatchedVendor+d.summary.unmatchedLedger} unmatched`;
  $("statusDot").parentElement.className="statusbar "+(d.summary.status==="Reconciled"?"good":"bad");

  const all=[];
  d.discrepancies.forEach(x=>all.push(`<div class="exception"><div class="ex-top"><span class="ex-title">${esc(x.kind)}</span><span class="badge">REVIEW</span></div><div class="ex-reason">${esc(x.reason)}</div>${x.vendor?`<div class="ex-fields">Vendor ${esc(x.vendor.reference)} · Ledger ${esc(x.ledger.reference)} · Match score ${Math.round(x.score*100)}%</div>`:""}</div>`));
  d.unmatchedVendor.forEach(x=>all.push(`<div class="exception"><div class="ex-top"><span class="ex-title">Unmatched vendor transaction</span><span class="badge">VENDOR ONLY</span></div><div class="ex-reason">${esc(x.description)} — ${money(x.amount)}</div><div class="ex-fields">${esc(x.reference)} · ${esc(x.date)}</div></div>`));
  d.unmatchedLedger.forEach(x=>all.push(`<div class="exception"><div class="ex-top"><span class="ex-title">Unmatched ledger transaction</span><span class="badge">LEDGER ONLY</span></div><div class="ex-reason">${esc(x.description)} — ${money(x.amount)}</div><div class="ex-fields">${esc(x.reference)} · ${esc(x.date)}</div></div>`));
  $("discrepancyList").innerHTML=all.length?all.join(""):`<div class="empty">✓ No discrepancies found.</div>`;

  $("matchCount").textContent=`${d.matches.length} records`;
  $("matchTable").innerHTML=d.matches.length?`<table class="table"><thead><tr><th>Vendor</th><th>Ledger</th><th>Description</th><th>Amount</th><th>Score</th><th>Status</th></tr></thead><tbody>${d.matches.map(x=>`<tr><td>${esc(x.vendor.reference)}</td><td>${esc(x.ledger.reference)}</td><td>${esc(x.vendor.description)}</td><td>${money(x.vendor.amount)}</td><td class="match-score">${Math.round(x.score*100)}%</td><td class="match-ok">✓ Matched</td></tr>`).join("")}</tbody></table>`:`<div class="empty">No exact matches.</div>`;
}
