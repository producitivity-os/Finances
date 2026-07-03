export type RecordType = "Transfer" | "Deposit" | "Expense"

export type Account = {
  id: string
  displayName: string
  accountName: string
  ownerEmail?: string | null
  defaultCategory?: string | null
}

export type AccountApi = {
  id: string
  display_name: string
  account_name: string
  owner_email?: string | null
  default_category?: string | null
}

export type Category = string

export type RecordItem = {
  id: string
  date: string
  createdAt: string
  index: number
  accountFrom: Account
  payeeTo: Account
  waivedBy?: Account | null
  type: RecordType
  amount: string
  currency: string
  detail: string
  description: string
  category: Category
  flagged: boolean
}

export type RecordApi = {
  id: string
  date: string
  created_at: string
  index: number
  account_from_id: string
  payee_to_id: string
  waived_by_account_id?: string | null
  type: RecordType
  amount: string
  currency: string
  detail: string
  description: string
  category: Category
  flagged: boolean
}

export type ImportLedgerPayload = {
  accounts: {
    id: string
    display_name: string
    account_name: string
    type: "individual" | "restaurant" | "other"
    owner_email?: string | null
    default_category?: string | null
  }[]
  records: {
    id: string
    date: string
    index?: number
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
  waivedByAccountId: string
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
  ownerEmail: row.owner_email ?? null,
  defaultCategory: row.default_category ?? null,
})

export const mapRecordFromApi = (row: RecordApi, accountList: Account[]): RecordItem | null => {
  const accountFrom = accountList.find((item) => item.id === row.account_from_id)
  const payeeTo = accountList.find((item) => item.id === row.payee_to_id)
  if (!accountFrom || !payeeTo) return null
  const waivedBy = row.waived_by_account_id
    ? accountList.find((item) => item.id === row.waived_by_account_id) ?? null
    : null
  return {
    id: row.id,
    date: row.date,
    createdAt: row.created_at,
    index: row.index,
    accountFrom,
    payeeTo,
    waivedBy,
    type: row.type,
    amount: row.amount,
    currency: row.currency,
    detail: row.detail,
    description: row.description,
    category: row.category,
    flagged: row.flagged,
  }
}
