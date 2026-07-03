# Finances

![Build Status](https://img.shields.io/badge/build-passing-brightgreen)
![TypeScript](https://img.shields.io/badge/frontend-React%20%2B%20TypeScript-3178C6)
![Desktop](https://img.shields.io/badge/desktop-Tauri-24C8DB)

![Finances logo](assets/logo.png)

Finances is a desktop app for tracking accounts, money in, money out, and transfers between people or businesses. It is built for quick personal bookkeeping with a local database, a spreadsheet-style workflow, and CSV backup and restore tools.

## What it does

- Keeps a local list of accounts.
- Stores transactions such as deposits, expenses, and transfers.
- Lets you edit data in a more table-like workflow.
- Supports CSV import, export, backup, and restore.
- Runs as a desktop app using Tauri.

## Tech stack

- React
- TypeScript
- Vite
- Tauri
- Rust
- SQLite
- Tailwind CSS

## Backup and restore

- Export opens a native save dialog so you can choose the folder and filename.
- Restore opens a native file picker and imports a backup CSV into the local database.
- Restore replaces the current accounts and transactions, so the app asks for confirmation first.

## Local development

```bash
npm install
npm run dev
```

To run the desktop app during development:

```bash
npx tauri dev
```

## Current status

The latest local checks run on May 13, 2026 passed:

- `npm run typecheck`
- `cargo check`
