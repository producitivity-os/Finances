use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, sync::Mutex};
use tauri::Manager;

struct AppState {
  db: Mutex<Connection>,
}

#[derive(Debug, Serialize)]
struct Account {
  id: String,
  display_name: String,
  account_name: String,
  r#type: String,
}

#[derive(Debug, Deserialize)]
struct CreateAccountPayload {
  id: String,
  display_name: String,
  account_name: String,
  r#type: String,
}

#[derive(Debug, Serialize)]
struct Record {
  id: String,
  date: String,
  account_from_id: String,
  payee_to_id: String,
  r#type: String,
  amount: String,
  currency: String,
  detail: String,
  description: String,
  category: String,
}

#[derive(Debug, Deserialize)]
struct CreateRecordPayload {
  id: String,
  date: String,
  account_from_id: String,
  payee_to_id: String,
  r#type: String,
  amount: String,
  currency: String,
  detail: String,
  description: String,
  category: String,
}

#[derive(Debug, Deserialize)]
struct UpdateRecordPayload {
  id: String,
  date: String,
  account_from_id: String,
  payee_to_id: String,
  r#type: String,
  amount: String,
  currency: String,
  detail: String,
  description: String,
  category: String,
}

#[derive(Debug, Deserialize)]
struct UpdateAccountPayload {
  id: String,
  display_name: String,
  account_name: String,
}

#[derive(Debug, Deserialize)]
struct MergeAccountsPayload {
  from_id: String,
  into_id: String,
}

#[derive(Debug, Deserialize)]
struct ImportLedgerPayload {
  accounts: Vec<CreateAccountPayload>,
  records: Vec<CreateRecordPayload>,
}

fn init_db(db: &Connection) -> Result<(), String> {
  db.pragma_update(None, "journal_mode", "WAL")
    .map_err(|e| e.to_string())?;

  db.execute_batch(
    "
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
      category TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    ",
  )
  .map_err(|e| e.to_string())
}

fn map_account(row: &rusqlite::Row<'_>) -> rusqlite::Result<Account> {
  Ok(Account {
    id: row.get(0)?,
    display_name: row.get(1)?,
    account_name: row.get(2)?,
    r#type: row.get(3)?,
  })
}

fn map_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<Record> {
  Ok(Record {
    id: row.get(0)?,
    date: row.get(1)?,
    account_from_id: row.get(2)?,
    payee_to_id: row.get(3)?,
    r#type: row.get(4)?,
    amount: row.get(5)?,
    currency: row.get(6)?,
    detail: row.get(7)?,
    description: row.get(8)?,
    category: row.get(9)?,
  })
}

#[tauri::command]
fn list_accounts(state: tauri::State<'_, AppState>) -> Result<Vec<Account>, String> {
  let db = state.db.lock().map_err(|e| e.to_string())?;
  let mut stmt = db
    .prepare(
      "SELECT id, display_name, account_name, type FROM accounts ORDER BY display_name ASC",
    )
    .map_err(|e| e.to_string())?;

  let rows = stmt
    .query_map([], map_account)
    .map_err(|e| e.to_string())?;

  rows.collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn create_account(
  payload: CreateAccountPayload,
  state: tauri::State<'_, AppState>,
) -> Result<Account, String> {
  let db = state.db.lock().map_err(|e| e.to_string())?;
  db.execute(
    "INSERT INTO accounts (id, display_name, account_name, type) VALUES (?1, ?2, ?3, ?4)",
    params![payload.id, payload.display_name, payload.account_name, payload.r#type],
  )
  .map_err(|e| e.to_string())?;

  db.query_row(
    "SELECT id, display_name, account_name, type FROM accounts WHERE id = ?1",
    [payload.id],
    map_account,
  )
  .map_err(|e| e.to_string())
}

#[tauri::command]
fn update_account(
  payload: UpdateAccountPayload,
  state: tauri::State<'_, AppState>,
) -> Result<Account, String> {
  let db = state.db.lock().map_err(|e| e.to_string())?;
  let updated = db
    .execute(
      "UPDATE accounts SET display_name = ?1, account_name = ?2 WHERE id = ?3",
      params![payload.display_name, payload.account_name, payload.id],
    )
    .map_err(|e| e.to_string())?;

  if updated == 0 {
    return Err("Account not found".to_string());
  }

  db.query_row(
    "SELECT id, display_name, account_name, type FROM accounts WHERE id = ?1",
    [payload.id],
    map_account,
  )
  .map_err(|e| e.to_string())
}

#[tauri::command]
fn merge_accounts(
  payload: MergeAccountsPayload,
  state: tauri::State<'_, AppState>,
) -> Result<(), String> {
  let db = state.db.lock().map_err(|e| e.to_string())?;
  db.execute(
    "UPDATE records SET account_from_id = ?1 WHERE account_from_id = ?2",
    params![payload.into_id, payload.from_id],
  )
  .map_err(|e| e.to_string())?;
  db.execute(
    "UPDATE records SET payee_to_id = ?1 WHERE payee_to_id = ?2",
    params![payload.into_id, payload.from_id],
  )
  .map_err(|e| e.to_string())?;
  db.execute(
    "DELETE FROM accounts WHERE id = ?1",
    params![payload.from_id],
  )
  .map_err(|e| e.to_string())?;
  Ok(())
}

#[tauri::command]
fn list_records(state: tauri::State<'_, AppState>) -> Result<Vec<Record>, String> {
  let db = state.db.lock().map_err(|e| e.to_string())?;
  let mut stmt = db
    .prepare(
      "SELECT id, date, account_from_id, payee_to_id, type, amount, currency, detail, description, category FROM records ORDER BY date ASC, created_at ASC",
    )
    .map_err(|e| e.to_string())?;

  let rows = stmt
    .query_map([], map_record)
    .map_err(|e| e.to_string())?;

  rows.collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn create_record(
  payload: CreateRecordPayload,
  state: tauri::State<'_, AppState>,
) -> Result<Record, String> {
  let db = state.db.lock().map_err(|e| e.to_string())?;
  db.execute(
    "INSERT INTO records (id, date, account_from_id, payee_to_id, type, amount, currency, detail, description, category) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
    params![
      payload.id,
      payload.date,
      payload.account_from_id,
      payload.payee_to_id,
      payload.r#type,
      payload.amount,
      payload.currency,
      payload.detail,
      payload.description,
      payload.category
    ],
  )
  .map_err(|e| e.to_string())?;

  db.query_row(
    "SELECT id, date, account_from_id, payee_to_id, type, amount, currency, detail, description, category FROM records WHERE id = ?1",
    [payload.id],
    map_record,
  )
  .map_err(|e| e.to_string())
}

#[tauri::command]
fn update_record(
  payload: UpdateRecordPayload,
  state: tauri::State<'_, AppState>,
) -> Result<Record, String> {
  let db = state.db.lock().map_err(|e| e.to_string())?;
  let updated = db
    .execute(
      "UPDATE records SET date = ?1, account_from_id = ?2, payee_to_id = ?3, type = ?4, amount = ?5, currency = ?6, detail = ?7, description = ?8, category = ?9 WHERE id = ?10",
      params![
        payload.date,
        payload.account_from_id,
        payload.payee_to_id,
        payload.r#type,
        payload.amount,
        payload.currency,
        payload.detail,
        payload.description,
        payload.category,
        payload.id
      ],
    )
    .map_err(|e| e.to_string())?;

  if updated == 0 {
    return Err("Record not found".to_string());
  }

  db.query_row(
    "SELECT id, date, account_from_id, payee_to_id, type, amount, currency, detail, description, category FROM records WHERE id = ?1",
    [payload.id],
    map_record,
  )
  .map_err(|e| e.to_string())
}

#[tauri::command]
fn import_ledger(
  payload: ImportLedgerPayload,
  state: tauri::State<'_, AppState>,
) -> Result<(), String> {
  let mut db = state.db.lock().map_err(|e| e.to_string())?;
  let tx = db.transaction().map_err(|e| e.to_string())?;

  tx.execute("DELETE FROM records", [])
    .map_err(|e| e.to_string())?;
  tx.execute("DELETE FROM accounts", [])
    .map_err(|e| e.to_string())?;

  for account in payload.accounts {
    tx.execute(
      "INSERT INTO accounts (id, display_name, account_name, type) VALUES (?1, ?2, ?3, ?4)",
      params![
        account.id,
        account.display_name,
        account.account_name,
        account.r#type
      ],
    )
    .map_err(|e| e.to_string())?;
  }

  for record in payload.records {
    tx.execute(
      "INSERT INTO records (id, date, account_from_id, payee_to_id, type, amount, currency, detail, description, category) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
      params![
        record.id,
        record.date,
        record.account_from_id,
        record.payee_to_id,
        record.r#type,
        record.amount,
        record.currency,
        record.detail,
        record.description,
        record.category
      ],
    )
    .map_err(|e| e.to_string())?;
  }

  tx.commit().map_err(|e| e.to_string())
}

fn resolve_dev_db_path() -> Result<PathBuf, Box<dyn std::error::Error>> {
  let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
  let repo_root = manifest_dir
    .parent()
    .ok_or("Could not resolve repository root from CARGO_MANIFEST_DIR")?;
  let data_dir = repo_root.join("data");
  fs::create_dir_all(&data_dir)?;
  Ok(data_dir.join("finances.dev.db"))
}

fn resolve_prod_db_path(app: &tauri::App) -> Result<PathBuf, Box<dyn std::error::Error>> {
  let app_data_dir = app.path().app_data_dir()?;
  fs::create_dir_all(&app_data_dir)?;
  let db_path = app_data_dir.join("finances.db");

  if !db_path.exists() {
    let bundled = app.path().resolve("data/finances.prod.db", tauri::path::BaseDirectory::Resource)?;
    if bundled.exists() {
      fs::copy(&bundled, &db_path)?;
    }
  }

  Ok(db_path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let db_path = if cfg!(debug_assertions) {
        resolve_dev_db_path()?
      } else {
        resolve_prod_db_path(app)?
      };
      let db = Connection::open(db_path)?;
      init_db(&db).map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;

      app.manage(AppState { db: Mutex::new(db) });
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      list_accounts,
      create_account,
      update_account,
      merge_accounts,
      list_records,
      create_record,
      update_record,
      import_ledger
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
