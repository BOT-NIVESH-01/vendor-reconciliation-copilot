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
  return lines.filter(Boolean).map(line => {
    const values = line.split(",").map(x => x.trim());
    const row = {};
    headers.forEach((h,i) => row[h] = values[i] ?? "");
    row.amount = Number(row.amount || 0);
    return row;
  });
}

function normalize(rows, source) {
  return rows.map((r,i) => ({
    id: `${source}-${i+1}`,
    source,
    date: r.date,
    reference: r.reference,
    description: r.description,
    amount: Number(r.amount),
    type: (r.type || "DEBIT").toUpperCase(),
    signedAmount: (r.type || "DEBIT").toUpperCase() === "CREDIT" ? -Math.abs(Number(r.amount)) : Math.abs(Number(r.amount))
  }));
}

function descriptionTokens(s) {
  return new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(w => w.length > 2));
}

function similarity(a,b) {
  const A=descriptionTokens(a), B=descriptionTokens(b);
  const union=new Set([...A,...B]);
  const inter=[...A].filter(x=>B.has(x)).length;
  return union.size ? inter/union.size : 0;
}

function reconcile(vendorRows, ledgerRows) {
  const vendor = normalize(vendorRows,"Vendor");
  const ledger = normalize(ledgerRows,"Ledger");
  const used = new Set();
  const matches=[], discrepancies=[], unmatchedVendor=[], unmatchedLedger=[];

  for (const v of vendor) {
    let best=null;
    for (const l of ledger) {
      if (used.has(l.id) || v.type !== l.type) continue;
      const amountDiff=Math.abs(v.amount-l.amount);
      const dateDiff=Math.abs((new Date(v.date)-new Date(l.date))/86400000);
      const descScore=similarity(v.description,l.description);
      let score=0;
      if(amountDiff===0) score+=0.60;
      else if(amountDiff<=10) score+=0.30;
      if(descScore>=0.8) score+=0.25;
      else if(descScore>=0.4) score+=0.15;
      if(dateDiff===0) score+=0.15;
      else if(dateDiff<=3) score+=0.10;
      if(!best || score>best.score) best={l,score,amountDiff,dateDiff,descScore};
    }

    if(best && best.score>=0.75) {
      used.add(best.l.id);
      if(best.amountDiff===0) {
        matches.push({vendor:v,ledger:best.l,score:best.score,status:"Matched"});
      } else {
        discrepancies.push({
          kind:"Amount mismatch", vendor:v, ledger:best.l, score:best.score,
          reason:`Amount differs by $${best.amountDiff.toFixed(2)}. Vendor: $${v.amount.toFixed(2)}, Ledger: $${best.l.amount.toFixed(2)}.`
        });
      }
    } else {
      unmatchedVendor.push(v);
    }
  }

  for(const l of ledger) if(!used.has(l.id)) unmatchedLedger.push(l);

  const vendorBalance=vendor.reduce((s,x)=>s+x.signedAmount,0);
  const ledgerBalance=ledger.reduce((s,x)=>s+x.signedAmount,0);
  const variance=vendorBalance-ledgerBalance;

  if(Math.abs(variance)>0.001) {
    discrepancies.push({
      kind:"Balance variance", vendor:null, ledger:null, score:1,
      reason:`Running balances differ by $${Math.abs(variance).toFixed(2)}. Vendor balance: $${vendorBalance.toFixed(2)}; Ledger balance: $${ledgerBalance.toFixed(2)}.`
    });
  }

  return {
    vendor,ledger,matches,discrepancies,unmatchedVendor,unmatchedLedger,
    summary:{
      vendorCount:vendor.length,ledgerCount:ledger.length,
      matched:matches.length,discrepancyCount:discrepancies.length,
      unmatchedVendor:unmatchedVendor.length,unmatchedLedger:unmatchedLedger.length,
      vendorBalance,ledgerBalance,variance,
      status:discrepancies.length===0 && unmatchedVendor.length===0 && unmatchedLedger.length===0 ? "Reconciled" : "Exceptions Found"
    }
  };
}

function json(res,code,data){
  const body=JSON.stringify(data);
  res.writeHead(code,{"Content-Type":"application/json; charset=utf-8","Access-Control-Allow-Origin":"*"});
  res.end(body);
}
function body(req){
  return new Promise(resolve=>{
    let b="";
    req.on("data",c=>b+=c);
    req.on("end",()=>{try{resolve(JSON.parse(b||"{}"))}catch{resolve({})}});
  });
}

const demoResult = reconcile(parseCSV(vendorCSV),parseCSV(ledgerCSV));

async function api(req,res,url){
  if(url==="/api/demo" && req.method==="GET") return json(res,200,{vendorCSV,ledgerCSV,result:demoResult});
  if(url==="/api/reconcile" && req.method==="POST"){
    const b=await body(req);
    try {
      if(!b.vendorCSV || !b.ledgerCSV) return json(res,400,{error:"Both CSV files are required."});
      return json(res,200,reconcile(parseCSV(b.vendorCSV),parseCSV(b.ledgerCSV)));
    } catch(e) { return json(res,400,{error:"Could not parse CSV files. Use comma-separated CSV with date, reference, description, amount and type columns."}); }
  }
  return json(res,404,{error:"Not found"});
}

function serve(res,url){
  const file=url==="/" ? "/index.html" : url;
  const clean=path.normalize(file).replace(/^(\.\.[/\\])+/, "");
  const full=path.join(PUBLIC,clean);
  if(!full.startsWith(PUBLIC)){res.writeHead(403);return res.end("Forbidden")}
  fs.readFile(full,(err,data)=>{
    if(err){res.writeHead(404);return res.end("Not found")}
    const types={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8"};
    res.writeHead(200,{"Content-Type":types[path.extname(full)]||"application/octet-stream"});
    res.end(data);
  });
}

http.createServer((req,res)=>{
  const u=new URL(req.url,`http://${req.headers.host||"localhost"}`);
  if(u.pathname.startsWith("/api/")) return api(req,res,u.pathname);
  serve(res,u.pathname);
}).listen(PORT, "0.0.0.0", () => {
  console.log(`Vendor Reconciliation Copilot running on port ${PORT}`);
});