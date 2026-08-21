# Supervity FDE — Problem 2: Vendor Reconciliation Copilot

This is a **completely offline** implementation of Problem 2 from the Supervity FDE assessment.

The assessment asks for two CSV sources, normalization, transparent transaction matching, discrepancies, running balances, and a natural-language reconciliation summary. It specifically evaluates whether matching is transparent and inspectable rather than a black-box LLM call.

## No external APIs

- No OpenAI
- No external LLM
- No database
- No cloud dependency
- No internet request
- All reconciliation logic runs locally

## Run

Requires Node.js 18+.

```bash
npm install
npm start
```

`npm install` is optional because the project has no dependencies. You can simply run:

```bash
node server.js
```

Then open:

```text
http://localhost:3000
```

## Demo

Click **Load demo data** to immediately demonstrate the complete workflow.

Or upload:
1. Vendor statement CSV
2. Internal ledger CSV

Required columns:

```text
date,reference,description,amount,type
```

## Matching logic

The engine:
1. Normalizes both sources into a common schema.
2. Compares transaction type.
3. Compares amount.
4. Calculates description token similarity.
5. Considers date proximity.
6. Assigns an inspectable matching score.
7. Separates exact matches, amount mismatches, and unmatched records.
8. Calculates signed balances and the reconciliation variance.

No LLM is used for the matching decision.

## Assessment alignment

Problem 2 requires:
- Ingest both CSVs and normalize them → implemented
- Match transactions across both sources → implemented
- Surface unmatched/mismatched items → implemented
- Summarize reconciliation outcome → implemented
- Transparent/inspectable matching logic → implemented
- Correct reconciling balance → implemented


## Deployment

This can be deployed to Render as a Node web service.

Start command:

```text
node server.js
```
