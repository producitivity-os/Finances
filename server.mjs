import fs from "node:fs"
import path from "node:path"

import Database from "better-sqlite3"
import express from "express"

const app = express()
const port = 4000

app.use(express.json())

const dataDir = path.resolve("./data")
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const db = new Database(path.join(dataDir, "finances.db"))
db.pragma("journal_mode = WAL")

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL UNIQUE,
    account_name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('individual', 'restaurant', 'other')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    account_from_id TEXT NOT NULL,
    payee_to_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('Transfer', 'Deposit', 'Expense')),
    amount TEXT NOT NULL,
    currency TEXT NOT NULL,
    detail TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('Savings', 'Income', 'Groceries', 'Transportation')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`)

const listAccountsStmt = db.prepare(`
  SELECT id, display_name, account_name, type
  FROM accounts
  ORDER BY display_name ASC
`)

const insertAccountStmt = db.prepare(`
  INSERT INTO accounts (id, display_name, account_name, type)
  VALUES (@id, @display_name, @account_name, @type)
`)

const getAccountByIdStmt = db.prepare(`
  SELECT id, display_name, account_name, type
  FROM accounts
  WHERE id = ?
`)

const listStmt = db.prepare(`
  SELECT id, date, account_from_id, payee_to_id, type, amount, currency, detail, description, category
  FROM records
  ORDER BY date ASC, created_at ASC
`)

const insertStmt = db.prepare(`
  INSERT INTO records (
    id, date, account_from_id, payee_to_id, type, amount, currency, detail, description, category
  ) VALUES (
    @id, @date, @account_from_id, @payee_to_id, @type, @amount, @currency, @detail, @description, @category
  )
`)

const updateStmt = db.prepare(`
  UPDATE records
  SET
    date = @date,
    account_from_id = @account_from_id,
    payee_to_id = @payee_to_id,
    type = @type,
    amount = @amount,
    currency = @currency,
    detail = @detail,
    description = @description,
    category = @category
  WHERE id = @id
`)

const getByIdStmt = db.prepare(`
  SELECT id, date, account_from_id, payee_to_id, type, amount, currency, detail, description, category
  FROM records
  WHERE id = ?
`)

app.get("/api/records", (_req, res) => {
  const rows = listStmt.all()
  res.json(rows)
})

app.get("/api/accounts", (_req, res) => {
  res.json(listAccountsStmt.all())
})

app.post("/api/accounts", (req, res) => {
  const payload = req.body
  try {
    insertAccountStmt.run(payload)
    res.status(201).json(getAccountByIdStmt.get(payload.id))
  } catch (error) {
    res.status(400).json({ error: "Unable to create account" })
  }
})

app.post("/api/records", (req, res) => {
  const payload = req.body
  insertStmt.run(payload)
  res.status(201).json(getByIdStmt.get(payload.id))
})

app.put("/api/records/:id", (req, res) => {
  const payload = { ...req.body, id: req.params.id }
  const result = updateStmt.run(payload)
  if (result.changes === 0) {
    res.status(404).json({ error: "Record not found" })
    return
  }
  res.json(getByIdStmt.get(req.params.id))
})

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`SQLite API running on http://localhost:${port}`)
})
