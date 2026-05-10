This is a minimal app to track my finances, built with tauri and react.

# Revision 1

The app will feature a table that resembles a bank statement table. Each record will contain Date, Account (From), Payee (To), type (Transfer, Deposit, Expense), Amount, Currency, Detail and Description, and Cateogry.

It will connect to a sqlite db and persist changes there.

It will have simple charts to show how much i spent per category, and how much i spent each week and month.

- [ ] Import csv file
- [ ] Import maybank screenshots and send to OCR
- [ ] Setup Tauri build workflow
- [ ] Setup Sqlite in Tauri

Components to use:
Avatar, Chart, Command, Empty, Hover card on accounts in non edit mode, pagination.
