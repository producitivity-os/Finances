export type RecordType = "Transfer" | "Deposit" | "Expense"

export type Account = {
  id: string
  displayName: string
  accountName: string
}

export type AccountApi = {
  id: string
  display_name: string
  account_name: string
}

export type Category = string

export type RecordItem = {
  id: string
  date: string
  accountFrom: Account
  payeeTo: Account
  type: RecordType
  amount: string
  currency: string
  detail: string
  description: string
  category: Category
}

export type RecordApi = {
  id: string
  date: string
  account_from_id: string
  payee_to_id: string
  type: RecordType
  amount: string
  currency: string
  detail: string
  description: string
  category: Category
}

export type ImportLedgerPayload = {
  accounts: {
    id: string
    display_name: string
    account_name: string
  }[]
  records: {
    id: string
    date: string
    account_from_id: string
    payee_to_id: string
    type: RecordType
    amount: string
    currency: string
    detail: string
    description: string
    category: string
  }[]
}

export type UploadedLedgerRow = {
  rowNumber: string
  date: string
  account: string
  detail: string
  payee: string
  category: string
  type: string
  amount: string
  balance: string
  waived: string
  note: string
}

export type NewRowForm = {
  date: string
  accountFromId: string
  payeeToId: string
  type: RecordType
  amount: string
  currency: string
  detail: string
  description: string
  category: Category
}

export type CategoryDefinition = {
  id: string
  name: string
  displayName: string
  icon: string
}

export const defaultCategories: CategoryDefinition[] = [
  { id: "cat-savings", name: "Savings", displayName: "Savings", icon: "PiggyBank" },
  { id: "cat-income", name: "Income", displayName: "Income", icon: "Wallet" },
  { id: "cat-groceries", name: "Groceries", displayName: "Groceries", icon: "ShoppingCart" },
  { id: "cat-transportation", name: "Transportation", displayName: "Transportation", icon: "Car" },
  { id: "cat-food", name: "Food", displayName: "Food & Dining", icon: "ForkKnife" },
  { id: "cat-shopping", name: "Shopping", displayName: "Shopping", icon: "ShoppingCart" },
  { id: "cat-salary", name: "Salary", displayName: "Salary", icon: "Wallet" },
  { id: "cat-transfer", name: "Transfer", displayName: "Transfer", icon: "ArrowsLeftRight" },
  { id: "cat-loan", name: "Loan", displayName: "Loan", icon: "Bank" },
  { id: "cat-petrol", name: "Petrol", displayName: "Petrol", icon: "Car" },
  { id: "cat-car-fuel", name: "Car Fuel", displayName: "Car Fuel", icon: "Car" },
  { id: "cat-utilities", name: "Utilities", displayName: "Utilities", icon: "Lightning" },
  { id: "cat-health", name: "Health", displayName: "Health", icon: "Heart" },
  { id: "cat-education", name: "Education", displayName: "Education", icon: "BookOpen" },
  { id: "cat-travel", name: "Travel", displayName: "Travel", icon: "AirplaneTilt" },
  { id: "cat-entertainment", name: "Entertainment", displayName: "Entertainment", icon: "GameController" },
  { id: "cat-rent", name: "Rent", displayName: "Rent / Housing", icon: "House" },
  { id: "cat-uncategorized", name: "Uncategorized", displayName: "Uncategorized", icon: "Question" },
]

export const mapAccountFromApi = (row: AccountApi): Account => ({
  id: row.id,
  displayName: row.account_name,
  accountName: row.display_name,
})

export const mapRecordFromApi = (row: RecordApi, accountList: Account[]): RecordItem | null => {
  const accountFrom = accountList.find((item) => item.id === row.account_from_id)
  const payeeTo = accountList.find((item) => item.id === row.payee_to_id)
  if (!accountFrom || !payeeTo) return null
  return {
    id: row.id,
    date: row.date,
    accountFrom,
    payeeTo,
    type: row.type,
    amount: row.amount,
    currency: row.currency,
    detail: row.detail,
    description: row.description,
    category: row.category,
  }
}
