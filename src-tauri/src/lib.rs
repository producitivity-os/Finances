use rusqlite::{params, Connection};
use rfd::FileDialog;
use serde::{Deserialize, Serialize};
use std::{
  fs,
  path::PathBuf,
  sync::Mutex,
  time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

struct AppState {
  db: Mutex<Connection>,
  db_path: PathBuf,
}

#[derive(Debug, Serialize)]
struct BackupResult {
  path: String,
  accounts: usize,
  records: usize,
}

#[derive(Debug, Serialize)]
struct DataSourceInfo {
  method: String,
  path: String,
}

const DEFAULT_LOGIN_EMAIL: &str = "mustafa.y.elagib@gmail.com";
const DEFAULT_LOGIN_PASSWORD: &str = "Abutoofa2003+";
const DEFAULT_LOGIN_NAME: &str = "Mustafa Yousif";
const SESSION_TTL_SECONDS: i64 = 60 * 60;

#[derive(Debug, Serialize)]
struct Account {
  id: String,
  display_name: String,
  account_name: String,
  r#type: String,
  owner_email: Option<String>,
  default_category: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CreateAccountPayload {
  id: String,
  display_name: String,
  account_name: String,
  r#type: String,
  owner_email: Option<String>,
  default_category: Option<String>,
}

#[derive(Debug, Serialize)]
struct Record {
  id: String,
  date: String,
  #[serde(rename = "index")]
  r#index: i64,
  account_from_id: String,
  payee_to_id: String,
  waived_by_account_id: Option<String>,
  r#type: String,
  amount: String,
  currency: String,
  detail: String,
  description: String,
  category: String,
  flagged: bool,
  created_at: String,
}

#[derive(Debug, Deserialize)]
struct CreateRecordPayload {
  id: String,
  date: String,
  #[serde(rename = "index")]
  r#index: Option<i64>,
  account_from_id: String,
  payee_to_id: String,
  waived_by_account_id: Option<String>,
  r#type: String,
  amount: String,
  currency: String,
  detail: String,
  description: String,
  category: String,
  flagged: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct UpdateRecordPayload {
  id: String,
  date: String,
  #[serde(rename = "index")]
  r#index: Option<i64>,
  account_from_id: String,
  payee_to_id: String,
  waived_by_account_id: Option<String>,
  r#type: String,
  amount: String,
  currency: String,
  detail: String,
  description: String,
  category: String,
  flagged: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct UpdateAccountPayload {
  id: String,
  display_name: String,
  account_name: String,
  owner_email: Option<String>,
  default_category: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UpdateRecordCategoryPayload {
  from_category: String,
  to_category: String,
}

fn ensure_accounts_table_columns(db: &Connection) -> Result<(), String> {
  let mut stmt = db
    .prepare("PRAGMA table_info(accounts)")
    .map_err(|e| e.to_string())?;
  let rows = stmt
    .query_map([], |row| row.get::<_, String>(1))
    .map_err(|e| e.to_string())?;
  let column_names = rows
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;

  if !column_names.iter().any(|name| name == "owner_email") {
    db.execute("ALTER TABLE accounts ADD COLUMN owner_email TEXT", [])
      .map_err(|e| e.to_string())?;
  }

  if !column_names.iter().any(|name| name == "default_category") {
    db.execute("ALTER TABLE accounts ADD COLUMN default_category TEXT", [])
      .map_err(|e| e.to_string())?;
  }

  Ok(())
}

fn ensure_records_table_columns(db: &Connection) -> Result<(), String> {
  let mut stmt = db
    .prepare("PRAGMA table_info(records)")
    .map_err(|e| e.to_string())?;
  let rows = stmt
    .query_map([], |row| row.get::<_, String>(1))
    .map_err(|e| e.to_string())?;
  let column_names = rows
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;

  if !column_names.iter().any(|name| name == "waived_by_account_id") {
    db.execute("ALTER TABLE records ADD COLUMN waived_by_account_id TEXT", [])
      .map_err(|e| e.to_string())?;
  }

  if !column_names.iter().any(|name| name == "record_index") {
    db.execute("ALTER TABLE records ADD COLUMN record_index INTEGER", [])
      .map_err(|e| e.to_string())?;
  }

  if !column_names.iter().any(|name| name == "flagged") {
    db.execute("ALTER TABLE records ADD COLUMN flagged INTEGER NOT NULL DEFAULT 0", [])
      .map_err(|e| e.to_string())?;
  }

  db.execute(
    "UPDATE records AS r
      SET record_index = (
        SELECT COUNT(*)
        FROM records AS r2
        WHERE r2.date = r.date
          AND (
            r2.created_at < r.created_at
            OR (r2.created_at = r.created_at AND r2.id <= r.id)
          )
      )
      WHERE r.record_index IS NULL OR r.record_index <= 0",
    [],
  )
  .map_err(|e| e.to_string())?;

  Ok(())
}

fn ensure_records_table_shape(db: &Connection) -> Result<(), String> {
  let schema_sql: String = db
    .query_row(
      "SELECT COALESCE(sql, '') FROM sqlite_master WHERE type = 'table' AND name = 'records'",
      [],
      |row| row.get(0),
    )
    .map_err(|e| e.to_string())?;

  let normalized = schema_sql.to_lowercase().replace(char::is_whitespace, "");
  let has_legacy_category_check = normalized.contains("categorytextnotnullcheck(categoryin(");

  if !has_legacy_category_check {
    return Ok(());
  }

  db.execute_batch(
    "
    BEGIN;
    CREATE TABLE records__migrated (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      account_from_id TEXT NOT NULL,
      payee_to_id TEXT NOT NULL,
      waived_by_account_id TEXT,
      type TEXT NOT NULL CHECK(type IN ('Transfer', 'Deposit', 'Expense')),
      amount TEXT NOT NULL,
      currency TEXT NOT NULL,
      detail TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      flagged INTEGER NOT NULL DEFAULT 0,
      record_index INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO records__migrated (
      id, date, account_from_id, payee_to_id, waived_by_account_id, type, amount, currency, detail, description, category, flagged, record_index, created_at
    )
    SELECT
      id,
      date,
      account_from_id,
      payee_to_id,
      waived_by_account_id,
      type,
      amount,
      currency,
      detail,
      description,
      category,
      0,
      NULL,
      COALESCE(created_at, CURRENT_TIMESTAMP)
    FROM records;
    DROP TABLE records;
    ALTER TABLE records__migrated RENAME TO records;
    COMMIT;
    ",
  )
  .map_err(|e| format!("Failed to migrate legacy records table schema: {e}"))?;

  Ok(())
}

#[derive(Debug, Deserialize)]
struct MergeAccountsPayload {
  from_id: String,
  into_id: String,
}

#[derive(Debug, Deserialize)]
struct DeleteAccountPayload {
  id: String,
}

#[derive(Debug, Deserialize)]
struct ImportLedgerPayload {
  accounts: Vec<CreateAccountPayload>,
  records: Vec<CreateRecordPayload>,
}

#[derive(Debug, Deserialize)]
struct LoginPayload {
  email: String,
  password: String,
}

#[derive(Debug, Serialize)]
struct LoginResponse {
  token: String,
  email: String,
  full_name: String,
  avatar_url: String,
  expires_at: i64,
}

#[derive(Debug, Serialize)]
struct UserProfile {
  email: String,
  full_name: String,
  avatar_url: String,
}

#[derive(Debug, Deserialize)]
struct UpdateUserProfilePayload {
  email: String,
  full_name: String,
}

#[derive(Debug, Deserialize)]
struct RestoreBackupPayload {
  csv: String,
}

#[derive(Debug, Deserialize)]
struct ExportBackupToPathPayload {
  path: String,
}

fn build_backup_csv(db: &Connection) -> Result<(String, usize, usize), String> {
  let mut accounts_stmt = db
    .prepare(
      "SELECT id, display_name, account_name, type, COALESCE(owner_email, ''), COALESCE(default_category, '') FROM accounts ORDER BY display_name ASC",
    )
    .map_err(|e| e.to_string())?;
  let account_rows = accounts_stmt
    .query_map([], |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, String>(2)?,
        row.get::<_, String>(3)?,
        row.get::<_, String>(4)?,
        row.get::<_, String>(5)?,
      ))
    })
    .map_err(|e| e.to_string())?;

  let mut records_stmt = db
    .prepare(
      "SELECT id, date, record_index, account_from_id, payee_to_id, waived_by_account_id, type, amount, currency, detail, description, category, flagged FROM records ORDER BY date ASC, record_index ASC, created_at ASC",
    )
    .map_err(|e| e.to_string())?;
  let record_rows = records_stmt
    .query_map([], |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, i64>(2)?,
        row.get::<_, String>(3)?,
        row.get::<_, String>(4)?,
        row.get::<_, String>(5)?,
        row.get::<_, String>(6)?,
        row.get::<_, String>(7)?,
        row.get::<_, String>(8)?,
        row.get::<_, String>(9)?,
        row.get::<_, String>(10)?,
        row.get::<_, String>(11)?,
        row.get::<_, i64>(12)?,
      ))
    })
    .map_err(|e| e.to_string())?;

  let mut out = String::new();
  let mut account_count = 0;
  let mut record_count = 0;

  out.push_str("FINANCES_BACKUP_V1\n");
  out.push_str("[accounts]\n");
  out.push_str("id,display_name,account_name,type,owner_email,default_category\n");
  for row in account_rows {
    let (id, display_name, account_name, account_type, owner_email, default_category) =
      row.map_err(|e| e.to_string())?;
    account_count += 1;
    out.push_str(&format!(
      "{},{},{},{},{},{}\n",
      escape_csv_cell(&id),
      escape_csv_cell(&display_name),
      escape_csv_cell(&account_name),
      escape_csv_cell(&account_type),
      escape_csv_cell(&owner_email),
      escape_csv_cell(&default_category)
    ));
  }

  out.push_str("[records]\n");
  out.push_str("id,date,index,account_from_id,payee_to_id,waived_by_account_id,type,amount,currency,detail,description,category,flagged\n");
  for row in record_rows {
    let (id, date, record_index, account_from_id, payee_to_id, waived_by_account_id, record_type, amount, currency, detail, description, category, flagged) =
      row.map_err(|e| e.to_string())?;
    record_count += 1;
    out.push_str(&format!(
      "{},{},{},{},{},{},{},{},{},{},{},{},{}\n",
      escape_csv_cell(&id),
      escape_csv_cell(&date),
      record_index,
      escape_csv_cell(&account_from_id),
      escape_csv_cell(&payee_to_id),
      escape_csv_cell(&waived_by_account_id),
      escape_csv_cell(&record_type),
      escape_csv_cell(&amount),
      escape_csv_cell(&currency),
      escape_csv_cell(&detail),
      escape_csv_cell(&description),
      escape_csv_cell(&category),
      flagged
    ));
  }

  Ok((out, account_count, record_count))
}

fn parse_backup_csv(
  csv: &str,
) -> Result<(Vec<CreateAccountPayload>, Vec<CreateRecordPayload>), String> {
  let mut section = "";
  let mut account_rows: Vec<CreateAccountPayload> = Vec::new();
  let mut record_rows: Vec<CreateRecordPayload> = Vec::new();

  for (index, line) in split_csv_rows(csv)?.into_iter().enumerate() {
    let trimmed = line.trim();
    if trimmed.is_empty() {
      continue;
    }
    if trimmed == "FINANCES_BACKUP_V1" {
      continue;
    }
    if trimmed == "[accounts]" {
      section = "accounts";
      continue;
    }
    if trimmed == "[records]" {
      section = "records";
      continue;
    }
    if trimmed.starts_with("id,display_name,account_name,type,owner_email")
      || trimmed.starts_with("id,date,index,account_from_id,payee_to_id")
      || trimmed.starts_with("id,date,account_from_id,payee_to_id")
    {
      continue;
    }

    let columns = parse_csv_line(&line);
    if section == "accounts" {
      if columns.len() < 5 {
        return Err(format!(
          "Invalid accounts row in backup CSV near logical line {}",
          index + 1
        ));
      }
      let account_type = match columns[3].as_str() {
        "individual" | "restaurant" | "other" => columns[3].clone(),
        _ => "other".to_string(),
      };
      account_rows.push(CreateAccountPayload {
        id: columns[0].clone(),
        display_name: columns[1].clone(),
        account_name: columns[2].clone(),
        r#type: account_type,
        owner_email: if columns[4].trim().is_empty() {
          None
        } else {
          Some(columns[4].clone())
        },
        default_category: columns
          .get(5)
          .and_then(|value| if value.trim().is_empty() { None } else { Some(value.clone()) }),
      });
      continue;
    }

    if section == "records" {
      if columns.len() < 10 {
        return Err(format!(
          "Invalid records row in backup CSV near logical line {}",
          index + 1
        ));
      }
      let has_index_column = columns.len() >= 12;
      let offset = if has_index_column { 1 } else { 0 };
      let has_waived_column = columns.len() >= 11 + offset;
      let category_index = if has_waived_column { 10 + offset } else { 9 + offset };
      record_rows.push(CreateRecordPayload {
        id: columns[0].clone(),
        date: columns[1].clone(),
        r#index: if has_index_column {
          columns[2].parse::<i64>().ok()
        } else {
          None
        },
        account_from_id: columns[2 + offset].clone(),
        payee_to_id: columns[3 + offset].clone(),
        waived_by_account_id: if has_waived_column {
          if columns[4 + offset].trim().is_empty() {
            None
          } else {
            Some(columns[4 + offset].clone())
          }
        } else {
          None
        },
        r#type: columns[if has_waived_column { 5 + offset } else { 4 + offset }].clone(),
        amount: columns[if has_waived_column { 6 + offset } else { 5 + offset }].clone(),
        currency: columns[if has_waived_column { 7 + offset } else { 6 + offset }].clone(),
        detail: columns[if has_waived_column { 8 + offset } else { 7 + offset }].clone(),
        description: columns[if has_waived_column { 9 + offset } else { 8 + offset }].clone(),
        category: columns[category_index].clone(),
        flagged: columns
          .get(category_index + 1)
          .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
          .or(Some(false)),
      });
      continue;
    }
  }

  Ok((account_rows, record_rows))
}

fn restore_backup_rows(
  account_rows: Vec<CreateAccountPayload>,
  record_rows: Vec<CreateRecordPayload>,
  state: tauri::State<'_, AppState>,
) -> Result<(), String> {
  let mut db = state.db.lock().map_err(|e| e.to_string())?;
  let tx = db.transaction().map_err(|e| e.to_string())?;
  tx.execute("DELETE FROM records", [])
    .map_err(|e| format!("Failed to clear existing records before restore: {e}"))?;
  tx.execute("DELETE FROM accounts", [])
    .map_err(|e| format!("Failed to clear existing accounts before restore: {e}"))?;

  for account in account_rows {
    tx.execute(
      "INSERT INTO accounts (id, display_name, account_name, type, owner_email, default_category) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
      params![
        account.id,
        account.display_name,
        account.account_name,
        account.r#type,
        account.owner_email,
        account.default_category
      ],
    )
    .map_err(|e| {
      format!(
        "Failed to restore account '{}' (id: {}): {e}",
        account.display_name, account.id
      )
    })?;
  }

  for record in record_rows {
    let record_index = record.r#index.unwrap_or_else(|| {
      tx.query_row(
        "SELECT COALESCE(MAX(record_index), 0) + 1 FROM records WHERE date = ?1",
        [&record.date],
        |row| row.get::<_, i64>(0),
      )
      .unwrap_or(1)
    });
    tx.execute(
      "INSERT INTO records (id, date, record_index, account_from_id, payee_to_id, waived_by_account_id, type, amount, currency, detail, description, category, flagged) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
      params![
        record.id,
        record.date,
        record_index,
        record.account_from_id,
        record.payee_to_id,
        record.waived_by_account_id,
        record.r#type,
        record.amount,
        record.currency,
        record.detail,
        record.description,
        record.category,
        record.flagged.unwrap_or(false)
      ],
    )
    .map_err(|e| {
      format!(
        "Failed to restore record '{}' on {} (id: {}): {e}",
        record.detail, record.date, record.id
      )
    })?;
  }

  tx.commit()
    .map_err(|e| format!("Failed to finalize restore transaction: {e}"))
}

fn default_backup_filename() -> Result<String, String> {
  let timestamp = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map_err(|e| e.to_string())?
    .as_secs();
  Ok(format!("finances-backup-{timestamp}.csv"))
}

fn escape_csv_cell(value: &str) -> String {
  if value.contains(',') || value.contains('"') || value.contains('\n') || value.contains('\r') {
    format!("\"{}\"", value.replace('"', "\"\""))
  } else {
    value.to_string()
  }
}

fn parse_csv_line(line: &str) -> Vec<String> {
  let mut result = Vec::new();
  let mut current = String::new();
  let mut in_quotes = false;
  let mut chars = line.chars().peekable();

  while let Some(ch) = chars.next() {
    if ch == '"' {
      if in_quotes && chars.peek() == Some(&'"') {
        current.push('"');
        chars.next();
      } else {
        in_quotes = !in_quotes;
      }
      continue;
    }
    if ch == ',' && !in_quotes {
      result.push(current.clone());
      current.clear();
      continue;
    }
    current.push(ch);
  }

  result.push(current);
  result
}

fn split_csv_rows(csv: &str) -> Result<Vec<String>, String> {
  let normalized = csv.replace("\r\n", "\n").replace('\r', "\n");
  let mut rows = Vec::new();
  let mut current = String::new();
  let mut chars = normalized.chars().peekable();
  let mut in_quotes = false;

  while let Some(ch) = chars.next() {
    match ch {
      '"' => {
        current.push(ch);
        if in_quotes && chars.peek() == Some(&'"') {
          current.push('"');
          chars.next();
        } else {
          in_quotes = !in_quotes;
        }
      }
      '\n' if !in_quotes => {
        rows.push(current);
        current = String::new();
      }
      _ => current.push(ch),
    }
  }

  if in_quotes {
    return Err("Backup CSV contains an unclosed quoted field".to_string());
  }

  if !current.is_empty() {
    rows.push(current);
  }

  Ok(rows)
}

fn ensure_users_table_columns(db: &Connection) -> Result<(), String> {
  let mut stmt = db
    .prepare("PRAGMA table_info(users)")
    .map_err(|e| e.to_string())?;
  let rows = stmt
    .query_map([], |row| row.get::<_, String>(1))
    .map_err(|e| e.to_string())?;
  let column_names = rows
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;

  if !column_names.iter().any(|name| name == "full_name") {
    db.execute(
      "ALTER TABLE users ADD COLUMN full_name TEXT NOT NULL DEFAULT ''",
      [],
    )
    .map_err(|e| e.to_string())?;
  }
  if !column_names.iter().any(|name| name == "avatar_url") {
    db.execute(
      "ALTER TABLE users ADD COLUMN avatar_url TEXT NOT NULL DEFAULT ''",
      [],
    )
    .map_err(|e| e.to_string())?;
  }

  Ok(())
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
      owner_email TEXT REFERENCES users(email),
      default_category TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      account_from_id TEXT NOT NULL,
      payee_to_id TEXT NOT NULL,
      waived_by_account_id TEXT,
      type TEXT NOT NULL CHECK(type IN ('Transfer', 'Deposit', 'Expense')),
      amount TEXT NOT NULL,
      currency TEXT NOT NULL,
      detail TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      flagged INTEGER NOT NULL DEFAULT 0,
      record_index INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      email TEXT PRIMARY KEY,
      password TEXT NOT NULL,
      full_name TEXT NOT NULL DEFAULT '',
      avatar_url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    ",
  )
  .map_err(|e| e.to_string())?;

  ensure_users_table_columns(db)?;
  ensure_records_table_shape(db)?;
  ensure_accounts_table_columns(db)?;
  ensure_records_table_columns(db)?;

  db.execute(
    "UPDATE accounts
      SET display_name = 'n-a', account_name = 'n-a'
      WHERE (
        LOWER(display_name) LIKE '%unknown%'
        OR LOWER(account_name) LIKE '%unknown%'
        OR LOWER(id) LIKE '%unknown%'
      )
      AND NOT EXISTS (
        SELECT 1 FROM accounts AS existing
        WHERE existing.display_name = 'n-a' AND existing.id <> accounts.id
      )",
    [],
  )
  .map_err(|e| e.to_string())?;

  db.execute(
    "INSERT OR IGNORE INTO accounts (id, display_name, account_name, type, owner_email, default_category) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    params!["acc-na", "n-a", "n-a", "other", Option::<String>::None, Option::<String>::None],
  )
  .map_err(|e| e.to_string())?;

  db.execute(
    "INSERT OR IGNORE INTO users (email, password, full_name, avatar_url) VALUES (?1, ?2, ?3, ?4)",
    params![
      DEFAULT_LOGIN_EMAIL,
      DEFAULT_LOGIN_PASSWORD,
      DEFAULT_LOGIN_NAME,
      ""
    ],
  )
  .map_err(|e| e.to_string())?;

  db.execute(
    "UPDATE users
      SET full_name = CASE WHEN TRIM(full_name) = '' THEN ?1 ELSE full_name END,
          avatar_url = COALESCE(avatar_url, '')
      WHERE email = ?2",
    params![DEFAULT_LOGIN_NAME, DEFAULT_LOGIN_EMAIL],
  )
  .map_err(|e| e.to_string())?;

  Ok(())
}

fn map_account(row: &rusqlite::Row<'_>) -> rusqlite::Result<Account> {
  Ok(Account {
    id: row.get(0)?,
    display_name: row.get(1)?,
    account_name: row.get(2)?,
    r#type: row.get(3)?,
    owner_email: row.get(4)?,
    default_category: row.get(5)?,
  })
}

fn map_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<Record> {
  Ok(Record {
    id: row.get(0)?,
    date: row.get(1)?,
    r#index: row.get(2)?,
    account_from_id: row.get(3)?,
    payee_to_id: row.get(4)?,
    waived_by_account_id: row.get(5)?,
    r#type: row.get(6)?,
    amount: row.get(7)?,
    currency: row.get(8)?,
    detail: row.get(9)?,
    description: row.get(10)?,
    category: row.get(11)?,
    flagged: row.get::<_, i64>(12)? != 0,
    created_at: row.get(13)?,
  })
}

fn next_record_index_for_date(db: &Connection, date: &str) -> Result<i64, String> {
  db.query_row(
    "SELECT COALESCE(MAX(record_index), 0) + 1 FROM records WHERE date = ?1",
    [date],
    |row| row.get(0),
  )
  .map_err(|e| e.to_string())
}

#[tauri::command]
fn list_accounts(state: tauri::State<'_, AppState>) -> Result<Vec<Account>, String> {
  let db = state.db.lock().map_err(|e| e.to_string())?;
  let mut stmt = db
    .prepare(
      "SELECT id, display_name, account_name, type, owner_email, default_category FROM accounts ORDER BY display_name ASC",
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
    "INSERT INTO accounts (id, display_name, account_name, type, owner_email, default_category) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    params![
      payload.id,
      payload.display_name,
      payload.account_name,
      payload.r#type,
      payload.owner_email,
      payload.default_category
    ],
  )
  .map_err(|e| e.to_string())?;

  db.query_row(
    "SELECT id, display_name, account_name, type, owner_email, default_category FROM accounts WHERE id = ?1",
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
      "UPDATE accounts SET display_name = ?1, account_name = ?2, owner_email = ?3, default_category = ?4 WHERE id = ?5",
      params![
        payload.display_name,
        payload.account_name,
        payload.owner_email,
        payload.default_category,
        payload.id
      ],
    )
    .map_err(|e| e.to_string())?;

  if updated == 0 {
    return Err("Account not found".to_string());
  }

  db.query_row(
    "SELECT id, display_name, account_name, type, owner_email, default_category FROM accounts WHERE id = ?1",
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
    "UPDATE records SET waived_by_account_id = ?1 WHERE waived_by_account_id = ?2",
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
fn delete_account(
  payload: DeleteAccountPayload,
  state: tauri::State<'_, AppState>,
) -> Result<(), String> {
  let db = state.db.lock().map_err(|e| e.to_string())?;
  let reference_count: i64 = db
    .query_row(
      "SELECT COUNT(*) FROM records WHERE account_from_id = ?1 OR payee_to_id = ?1 OR waived_by_account_id = ?1",
      params![payload.id],
      |row| row.get(0),
    )
    .map_err(|e| e.to_string())?;

  if reference_count > 0 {
    return Err(format!(
      "Account is used by {reference_count} transaction{}",
      if reference_count == 1 { "" } else { "s" }
    ));
  }

  let deleted = db
    .execute("DELETE FROM accounts WHERE id = ?1", params![payload.id])
    .map_err(|e| e.to_string())?;

  if deleted == 0 {
    return Err("Account not found".to_string());
  }

  Ok(())
}

#[tauri::command]
fn list_records(state: tauri::State<'_, AppState>) -> Result<Vec<Record>, String> {
  let db = state.db.lock().map_err(|e| e.to_string())?;
  let mut stmt = db
    .prepare(
      "SELECT id, date, record_index, account_from_id, payee_to_id, waived_by_account_id, type, amount, currency, detail, description, category, flagged, created_at FROM records ORDER BY date ASC, record_index ASC, created_at ASC",
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
  let record_index = match payload.r#index {
    Some(value) if value > 0 => value,
    _ => next_record_index_for_date(&db, &payload.date)?,
  };
  db.execute(
    "INSERT INTO records (id, date, record_index, account_from_id, payee_to_id, waived_by_account_id, type, amount, currency, detail, description, category, flagged) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
    params![
      payload.id,
      payload.date,
      record_index,
      payload.account_from_id,
      payload.payee_to_id,
      payload.waived_by_account_id,
      payload.r#type,
      payload.amount,
      payload.currency,
      payload.detail,
      payload.description,
      payload.category,
      payload.flagged.unwrap_or(false)
    ],
  )
  .map_err(|e| e.to_string())?;

  db.query_row(
    "SELECT id, date, record_index, account_from_id, payee_to_id, waived_by_account_id, type, amount, currency, detail, description, category, flagged, created_at FROM records WHERE id = ?1",
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
  let existing: (String, i64) = db
    .query_row(
      "SELECT date, record_index FROM records WHERE id = ?1",
      [&payload.id],
      |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .map_err(|e| e.to_string())?;
  let record_index = match payload.r#index {
    Some(value) if value > 0 => value,
    _ if existing.0 == payload.date => existing.1,
    _ => next_record_index_for_date(&db, &payload.date)?,
  };
  let updated = db
    .execute(
      "UPDATE records SET date = ?1, record_index = ?2, account_from_id = ?3, payee_to_id = ?4, waived_by_account_id = ?5, type = ?6, amount = ?7, currency = ?8, detail = ?9, description = ?10, category = ?11, flagged = ?12 WHERE id = ?13",
      params![
        payload.date,
        record_index,
        payload.account_from_id,
        payload.payee_to_id,
        payload.waived_by_account_id,
        payload.r#type,
        payload.amount,
        payload.currency,
        payload.detail,
        payload.description,
        payload.category,
        payload.flagged.unwrap_or(false),
        payload.id
      ],
    )
    .map_err(|e| e.to_string())?;

  if updated == 0 {
    return Err("Record not found".to_string());
  }

  db.query_row(
    "SELECT id, date, record_index, account_from_id, payee_to_id, waived_by_account_id, type, amount, currency, detail, description, category, flagged, created_at FROM records WHERE id = ?1",
    [payload.id],
    map_record,
  )
  .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_record(id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
  let db = state.db.lock().map_err(|e| e.to_string())?;
  let deleted = db
    .execute("DELETE FROM records WHERE id = ?1", params![id])
    .map_err(|e| e.to_string())?;

  if deleted == 0 {
    return Err("Record not found".to_string());
  }

  Ok(())
}

#[tauri::command]
fn update_record_category(
  payload: UpdateRecordCategoryPayload,
  state: tauri::State<'_, AppState>,
) -> Result<usize, String> {
  let db = state.db.lock().map_err(|e| e.to_string())?;
  db.execute(
    "UPDATE records SET category = ?1 WHERE category = ?2",
    params![payload.to_category, payload.from_category],
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
      "INSERT INTO accounts (id, display_name, account_name, type, owner_email, default_category) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
      params![
        account.id,
        account.display_name,
        account.account_name,
        account.r#type,
        account.owner_email,
        account.default_category
      ],
    )
    .map_err(|e| e.to_string())?;
  }

  for record in payload.records {
    let record_index = record.r#index.unwrap_or_else(|| {
      tx.query_row(
        "SELECT COALESCE(MAX(record_index), 0) + 1 FROM records WHERE date = ?1",
        [&record.date],
        |row| row.get::<_, i64>(0),
      )
      .unwrap_or(1)
    });
    tx.execute(
      "INSERT INTO records (id, date, record_index, account_from_id, payee_to_id, waived_by_account_id, type, amount, currency, detail, description, category, flagged) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
      params![
        record.id,
        record.date,
        record_index,
        record.account_from_id,
        record.payee_to_id,
        record.waived_by_account_id,
        record.r#type,
        record.amount,
        record.currency,
        record.detail,
        record.description,
        record.category,
        record.flagged.unwrap_or(false)
      ],
    )
    .map_err(|e| e.to_string())?;
  }

  tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
fn export_backup_csv(state: tauri::State<'_, AppState>) -> Result<String, String> {
  let db = state.db.lock().map_err(|e| e.to_string())?;
  let (out, _, _) = build_backup_csv(&db)?;
  Ok(out)
}

#[tauri::command]
fn export_backup_csv_to_path(
  payload: ExportBackupToPathPayload,
  state: tauri::State<'_, AppState>,
) -> Result<(), String> {
  let db = state.db.lock().map_err(|e| e.to_string())?;
  let (out, _, _) = build_backup_csv(&db)?;

  let export_path = PathBuf::from(payload.path.trim());
  if export_path.as_os_str().is_empty() {
    return Err("Export path is required".to_string());
  }
  if let Some(parent) = export_path.parent() {
    if !parent.as_os_str().is_empty() {
      fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
  }
  fs::write(export_path, out).map_err(|e| e.to_string())
}

#[tauri::command]
fn export_backup_csv_with_dialog(
  state: tauri::State<'_, AppState>,
) -> Result<Option<BackupResult>, String> {
  let db = state.db.lock().map_err(|e| e.to_string())?;
  let (out, accounts, records) = build_backup_csv(&db)?;
  let suggested_name = default_backup_filename()?;

  let Some(export_path) = FileDialog::new()
    .add_filter("CSV backup", &["csv"])
    .set_file_name(&suggested_name)
    .save_file()
  else {
    return Ok(None);
  };

  if let Some(parent) = export_path.parent() {
    if !parent.as_os_str().is_empty() {
      fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
  }
  fs::write(&export_path, out).map_err(|e| e.to_string())?;

  Ok(Some(BackupResult {
    path: export_path.to_string_lossy().into_owned(),
    accounts,
    records,
  }))
}

#[tauri::command]
fn restore_backup_csv(
  payload: RestoreBackupPayload,
  state: tauri::State<'_, AppState>,
) -> Result<(), String> {
  let (account_rows, record_rows) = parse_backup_csv(&payload.csv)?;
  restore_backup_rows(account_rows, record_rows, state)
}

#[tauri::command]
fn restore_backup_csv_with_dialog(
  state: tauri::State<'_, AppState>,
) -> Result<Option<BackupResult>, String> {
  let Some(import_path) = FileDialog::new()
    .add_filter("CSV backup", &["csv"])
    .pick_file()
  else {
    return Ok(None);
  };

  let csv = fs::read_to_string(&import_path).map_err(|e| e.to_string())?;
  let (account_rows, record_rows) = parse_backup_csv(&csv)?;
  let accounts = account_rows.len();
  let records = record_rows.len();

  restore_backup_rows(account_rows, record_rows, state)?;

  Ok(Some(BackupResult {
    path: import_path.to_string_lossy().into_owned(),
    accounts,
    records,
  }))
}

#[tauri::command]
fn get_data_source_info(state: tauri::State<'_, AppState>) -> DataSourceInfo {
  DataSourceInfo {
    method: "sqlite".to_string(),
    path: state.db_path.to_string_lossy().into_owned(),
  }
}

#[tauri::command]
fn login(
  payload: LoginPayload,
  state: tauri::State<'_, AppState>,
) -> Result<LoginResponse, String> {
  let db = state.db.lock().map_err(|e| e.to_string())?;
  let mut stmt = db
    .prepare("SELECT password, full_name, avatar_url FROM users WHERE email = ?1 LIMIT 1")
    .map_err(|e| e.to_string())?;
  let (stored_password, full_name, avatar_url): (String, String, String) = stmt
    .query_row(params![payload.email], |row| {
      Ok((row.get(0)?, row.get(1)?, row.get(2)?))
    })
    .map_err(|_| "Invalid email or password".to_string())?;

  if stored_password != payload.password {
    return Err("Invalid email or password".to_string());
  }

  let now_seconds = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map_err(|e| e.to_string())?
    .as_secs() as i64;
  let expires_at = now_seconds + SESSION_TTL_SECONDS;
  let token = format!("local-{}-{}", payload.email, now_seconds);

  Ok(LoginResponse {
    token,
    email: payload.email,
    full_name,
    avatar_url,
    expires_at,
  })
}

#[tauri::command]
fn get_user_profile(email: String, state: tauri::State<'_, AppState>) -> Result<UserProfile, String> {
  let db = state.db.lock().map_err(|e| e.to_string())?;
  let mut stmt = db
    .prepare("SELECT email, full_name, avatar_url FROM users WHERE email = ?1 LIMIT 1")
    .map_err(|e| e.to_string())?;
  stmt
    .query_row(params![email], |row| {
      Ok(UserProfile {
        email: row.get(0)?,
        full_name: row.get(1)?,
        avatar_url: row.get(2)?,
      })
    })
    .map_err(|_| "User not found".to_string())
}

#[tauri::command]
fn update_user_profile(
  payload: UpdateUserProfilePayload,
  state: tauri::State<'_, AppState>,
) -> Result<UserProfile, String> {
  let db = state.db.lock().map_err(|e| e.to_string())?;
  let updated = db
    .execute(
      "UPDATE users SET full_name = ?1 WHERE email = ?2",
      params![payload.full_name.trim(), payload.email],
    )
    .map_err(|e| e.to_string())?;

  if updated == 0 {
    return Err("User not found".to_string());
  }

  let mut stmt = db
    .prepare("SELECT email, full_name, avatar_url FROM users WHERE email = ?1 LIMIT 1")
    .map_err(|e| e.to_string())?;
  stmt
    .query_row(params![payload.email], |row| {
      Ok(UserProfile {
        email: row.get(0)?,
        full_name: row.get(1)?,
        avatar_url: row.get(2)?,
      })
    })
    .map_err(|_| "User not found".to_string())
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
      let db = Connection::open(&db_path)?;
      init_db(&db).map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;

      app.manage(AppState {
        db: Mutex::new(db),
        db_path,
      });
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      list_accounts,
      create_account,
      update_account,
      merge_accounts,
      delete_account,
      list_records,
      create_record,
      update_record,
      delete_record,
      update_record_category,
      import_ledger,
      export_backup_csv,
      export_backup_csv_to_path,
      export_backup_csv_with_dialog,
      restore_backup_csv,
      restore_backup_csv_with_dialog,
      get_data_source_info,
      login,
      get_user_profile,
      update_user_profile
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
