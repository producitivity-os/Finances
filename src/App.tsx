import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { addDays } from "date-fns"
import type { DateRange } from "react-day-picker"
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis } from "recharts"
import {
  BankIcon,
  CalendarBlankIcon,
  CarIcon,
  ChartBarIcon,
  FunnelSimpleIcon,
  HouseIcon,
  PiggyBankIcon,
  ShoppingCartIcon,
  WalletIcon,
} from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Input } from "@/components/ui/input"
import { Empty } from "@/components/ui/empty"
import { toast } from "sonner"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox"
import { Calendar, CalendarDayButton } from "@/components/ui/calendar"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type RecordType = "Transfer" | "Deposit" | "Expense"

type Account = {
  id: string
  displayName: string
  accountName: string
  type: "individual" | "restaurant" | "other"
}

type AccountApi = {
  id: string
  display_name: string
  account_name: string
  type: "individual" | "restaurant" | "other"
}

type Category = "Savings" | "Income" | "Groceries" | "Transportation"

type RecordItem = {
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

type RecordApi = {
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

const initialAccounts: Account[] = [
  {
    id: "acc-payroll",
    displayName: "Payroll Account",
    accountName: "Acme Payroll Account",
    type: "other",
  },
  {
    id: "acc-freshmart",
    displayName: "Fresh Mart",
    accountName: "Fresh Mart Merchant",
    type: "restaurant",
  },
  {
    id: "acc-transit",
    displayName: "City Transport",
    accountName: "Transit Fare Collection",
    type: "other",
  },
]

const categoryIcons = {
  Savings: PiggyBankIcon,
  Income: WalletIcon,
  Groceries: ShoppingCartIcon,
  Transportation: CarIcon,
} as const

const initialRecords: RecordItem[] = []

type NewRowForm = {
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

const defaultNewRow = (accounts: Account[]): NewRowForm => ({
  date: new Date().toISOString().slice(0, 10),
  accountFromId: accounts[0]?.id ?? "",
  payeeToId: accounts[1]?.id ?? accounts[0]?.id ?? "",
  type: "Expense",
  amount: "0.00",
  currency: "RM",
  detail: "",
  description: "",
  category: "Groceries",
})

export function App() {
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts)
  const [records, setRecords] = useState<RecordItem[]>(initialRecords)
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<RecordItem | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)
  const [spreadsheetMode, setSpreadsheetMode] = useState(false)
  const cellRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [spendingView, setSpendingView] = useState<
    "yearly" | "monthly" | "weekly" | "daily"
  >("monthly")
  const [selectedSpendingCategory, setSelectedSpendingCategory] =
    useState<Category>("Groceries")
  const [filters, setFilters] = useState({
    query: "",
    type: "",
    category: "",
    account: "",
    minAmount: "",
    maxAmount: "",
  })
  const [accountQueries, setAccountQueries] = useState({
    editFrom: "",
    editTo: "",
    newFrom: "",
    newTo: "",
  })
  const [categoryQueries, setCategoryQueries] = useState({
    edit: "",
    new: "",
  })
  const [calendarRange, setCalendarRange] = useState<DateRange | undefined>({
    from: addDays(new Date(), -14),
    to: new Date(),
  })
  const [newRow, setNewRow] = useState<NewRowForm>(() =>
    defaultNewRow(initialAccounts)
  )

  const mapAccountFromApi = (row: AccountApi): Account => ({
    id: row.id,
    displayName: row.display_name,
    accountName: row.account_name,
    type: row.type,
  })

  useEffect(() => {
    const loadAccounts = async () => {
      const response = await fetch("/api/accounts")
      if (!response.ok) return
      const data = (await response.json()) as AccountApi[]
      if (data.length === 0) return
      const mapped = data.map(mapAccountFromApi)
      setAccounts(mapped)
      setNewRow((current) => ({
        ...current,
        accountFromId: current.accountFromId || mapped[0]?.id || "",
        payeeToId: current.payeeToId || mapped[1]?.id || mapped[0]?.id || "",
      }))
    }

    void loadAccounts()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.metaKey && event.key.toLowerCase() === "e") {
        event.preventDefault()
        setSpreadsheetMode((current) => !current)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const mapRecordFromApi = (row: RecordApi, accountList: Account[]): RecordItem | null => {
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

  useEffect(() => {
    const loadRecords = async () => {
      const response = await fetch("/api/records")
      if (!response.ok) return
      const rows = (await response.json()) as RecordApi[]
      const mapped = rows
        .map((row) => mapRecordFromApi(row, accounts))
        .filter((row): row is RecordItem => row !== null)
      setRecords(mapped)
    }
    void loadRecords()
  }, [accounts])

  const startEdit = (record: RecordItem) => {
    setEditingId(record.id)
    setDraft({ ...record })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraft(null)
  }

  const saveEdit = async () => {
    if (!draft) return
    const normalizedDraft = { ...draft, amount: formatAmountFixed(draft.amount) }
    try {
      const response = await fetch(`/api/records/${normalizedDraft.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: normalizedDraft.date,
          account_from_id: normalizedDraft.accountFrom.id,
          payee_to_id: normalizedDraft.payeeTo.id,
          type: normalizedDraft.type,
          amount: normalizedDraft.amount,
          currency: normalizedDraft.currency,
          detail: normalizedDraft.detail,
          description: normalizedDraft.description,
          category: normalizedDraft.category,
        }),
      })
      if (!response.ok) {
        toast.error("Failed to update row")
        return
      }
    } catch {
      toast.error("Failed to update row")
      return
    }

    setRecords((current) =>
      current.map((record) =>
        record.id === normalizedDraft.id ? normalizedDraft : record
      )
    )
    window.dispatchEvent(
      new CustomEvent("record:update", {
        detail: normalizedDraft,
      })
    )
    setEditingId(null)
    setDraft(null)
    toast.success("Row updated")
  }

  const updateRecordCell = (
    recordId: string,
    key: "date" | "type" | "amount" | "currency" | "category",
    value: string
  ) => {
    setRecords((current) =>
      current.map((record) => {
        if (record.id !== recordId) return record
        if (key === "type") return { ...record, type: value as RecordType }
        if (key === "category") return { ...record, category: value as Category }
        if (key === "amount") return { ...record, amount: value }
        if (key === "currency") return { ...record, currency: value }
        return { ...record, date: value }
      })
    )
  }

  const updateRecordAccountCell = (
    recordId: string,
    side: "accountFrom" | "payeeTo",
    value: string
  ) => {
    setRecords((current) =>
      current.map((record) => {
        if (record.id !== recordId) return record
        return {
          ...record,
          [side]: {
            ...record[side],
            displayName: value,
            accountName: value.split(/\s+/).slice(0, 3).join(" "),
          },
        }
      })
    )
  }

  const updateDraft = <K extends keyof RecordItem>(
    key: K,
    value: RecordItem[K]
  ) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current))
  }

  const handleEditKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter") return
    event.preventDefault()
    void saveEdit()
  }

  const parseAmount = (value: string) => {
    const normalized = value.replace(/,/g, "")
    const parsed = Number.parseFloat(normalized)
    return Number.isFinite(parsed) ? parsed : 0
  }

  const formatAmountFixed = (value: string) => parseAmount(value).toFixed(2)

  const parseDateValue = (value: string) => {
    if (!value) return undefined
    const [y, m, d] = value.split("-").map(Number)
    if (!y || !m || !d) return undefined
    const date = new Date(y, m - 1, d)
    if (Number.isNaN(date.getTime())) return undefined
    return date
  }

  const formatDateValue = (date: Date) => {
    const y = date.getFullYear()
    const m = `${date.getMonth() + 1}`.padStart(2, "0")
    const d = `${date.getDate()}`.padStart(2, "0")
    return `${y}-${m}-${d}`
  }

  const signedAmount = (record: RecordItem) => {
    const value = parseAmount(record.amount)
    if (record.type === "Deposit") return value
    return -value
  }

  const recordsWithBalance = records.map((record, index) => {
    const balance = records
      .slice(0, index + 1)
      .reduce((total, current) => total + signedAmount(current), 0)
    return { ...record, runningBalance: balance }
  })

  const isWithinRange = (dateText: string) => {
    if (!calendarRange?.from || !calendarRange?.to) return true
    const value = parseDateValue(dateText)
    if (!value) return false
    const from = new Date(
      calendarRange.from.getFullYear(),
      calendarRange.from.getMonth(),
      calendarRange.from.getDate()
    )
    const to = new Date(
      calendarRange.to.getFullYear(),
      calendarRange.to.getMonth(),
      calendarRange.to.getDate()
    )
    const target = new Date(value.getFullYear(), value.getMonth(), value.getDate())
    return target >= from && target <= to
  }

  const dailyNet = records.reduce<Record<string, number>>((acc, record) => {
    const signed = signedAmount(record)
    acc[record.date] = (acc[record.date] ?? 0) + signed
    return acc
  }, {})

  const filteredRecords = recordsWithBalance.filter((record) => {
    const query = filters.query.trim().toLowerCase()
    const account = filters.account.trim().toLowerCase()
    const recordAmount = Math.abs(parseAmount(record.amount))
    const minAmount = filters.minAmount ? Number.parseFloat(filters.minAmount) : null
    const maxAmount = filters.maxAmount ? Number.parseFloat(filters.maxAmount) : null

    const matchesQuery =
      !query ||
      record.detail.toLowerCase().includes(query) ||
      record.description.toLowerCase().includes(query) ||
      record.payeeTo.displayName.toLowerCase().includes(query) ||
      record.accountFrom.displayName.toLowerCase().includes(query)
    const matchesType =
      !filters.type ||
      record.type.toLowerCase().includes(filters.type.trim().toLowerCase())
    const matchesCategory =
      !filters.category ||
      record.category.toLowerCase().includes(filters.category.trim().toLowerCase())
    const matchesAccount =
      !account ||
      record.accountFrom.displayName.toLowerCase().includes(account) ||
      record.payeeTo.displayName.toLowerCase().includes(account)
    const matchesMin = minAmount === null || recordAmount >= minAmount
    const matchesMax = maxAmount === null || recordAmount <= maxAmount
    const matchesRange = isWithinRange(record.date)

    return (
      matchesQuery &&
      matchesType &&
      matchesCategory &&
      matchesAccount &&
      matchesMin &&
      matchesMax &&
      matchesRange
    )
  })

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const startIndex = (currentPage - 1) * pageSize
  const endIndex = startIndex + pageSize
  const paginatedRecords = filteredRecords.slice(startIndex, endIndex)

  const formatMoney = (value: number) => {
    const sign = value < 0 ? "-" : ""
    return `${sign}${Math.abs(value).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }

  const getSpendingByView = () => {
    const now = new Date()
    const expenseRecords = records.filter((record) => record.type === "Expense")
    const map = new Map<string, number>()

    const add = (label: string, value: number) => {
      map.set(label, (map.get(label) ?? 0) + value)
    }

    expenseRecords.forEach((record) => {
      const d = parseDateValue(record.date)
      if (!d) return
      const value = Math.abs(parseAmount(record.amount))
      if (spendingView === "yearly") add(`${d.getFullYear()}`, value)
      if (spendingView === "monthly")
        add(
          d.toLocaleString(undefined, { month: "short" }),
          value
        )
      if (spendingView === "weekly") {
        const start = new Date(d)
        start.setDate(d.getDate() - d.getDay())
        add(
          `${start.toLocaleString(undefined, { month: "short" })} ${start.getDate()}`,
          value
        )
      }
      if (spendingView === "daily")
        add(
          d.toLocaleString(undefined, { month: "short", day: "numeric" }),
          value
        )
    })

    let labels: string[] = []
    if (spendingView === "yearly") {
      labels = Array.from({ length: 5 }, (_, i) => `${now.getFullYear() - 4 + i}`)
    } else if (spendingView === "monthly") {
      labels = Array.from({ length: 6 }, (_, i) => {
        const dt = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
        return dt.toLocaleString(undefined, { month: "short" })
      })
    } else if (spendingView === "weekly") {
      labels = Array.from({ length: 6 }, (_, i) => {
        const dt = new Date(now)
        dt.setDate(now.getDate() - (5 - i) * 7)
        const start = new Date(dt)
        start.setDate(dt.getDate() - dt.getDay())
        return `${start.toLocaleString(undefined, { month: "short" })} ${start.getDate()}`
      })
    } else {
      labels = Array.from({ length: 6 }, (_, i) => {
        const dt = new Date(now)
        dt.setDate(now.getDate() - (5 - i))
        return dt.toLocaleString(undefined, { month: "short", day: "numeric" })
      })
    }

    const values = labels.map((label) => map.get(label) ?? 0)
    const max = Math.max(...values, 1)
    return { labels, values, max }
  }

  const spending = getSpendingByView()
  const spendingData = spending.labels.map((label, index) => ({
    period: label,
    value: spending.values[index] ?? 0,
  }))
  const spendingChartConfig = {
    value: {
      label: "Spending",
      color: "oklch(0.55 0 0)",
    },
  } satisfies ChartConfig

  const monthLabels = Array.from({ length: 6 }, (_, i) => {
    const dt = new Date(new Date().getFullYear(), new Date().getMonth() - (5 - i), 1)
    return dt.toLocaleString(undefined, { month: "short" })
  })
  const lineData = monthLabels.map((label, index) => {
    const dt = new Date(new Date().getFullYear(), new Date().getMonth() - (5 - index), 1)
    const month = dt.getMonth()
    const year = dt.getFullYear()
    const value = records
      .filter(
        (record) =>
          record.type === "Expense" &&
          record.category === selectedSpendingCategory &&
          (() => {
            const d = parseDateValue(record.date)
            return d ? d.getMonth() === month && d.getFullYear() === year : false
          })()
      )
      .reduce((sum, record) => sum + Math.abs(parseAmount(record.amount)), 0)
    return {
      period: label,
      amount: value,
    }
  })
  const lineChartConfig = {
    amount: {
      label: `${selectedSpendingCategory} Spending`,
      color: "oklch(0.55 0 0)",
    },
  } satisfies ChartConfig

  const currencyToSymbol = (currency: string) => {
    const key = currency.trim().toUpperCase()
    if (key === "USD") return "$"
    if (key === "EUR") return "EUR"
    if (key === "GBP") return "GBP"
    if (key === "JPY") return "JPY"
    if (key === "RM" || key === "MYR") return "RM"
    return currency
  }

  const makeRecordId = () => `r${Date.now()}-${Math.floor(Math.random() * 10000)}`

  const createRecordFromNewRow = (): RecordItem | null => {
    const accountFrom = accounts.find((item) => item.id === newRow.accountFromId)
    const payeeTo = accounts.find((item) => item.id === newRow.payeeToId)
    if (!accountFrom || !payeeTo) return null

    return {
      id: makeRecordId(),
      date: newRow.date.trim(),
      accountFrom,
      payeeTo,
      type: newRow.type,
      amount: formatAmountFixed(newRow.amount.trim()),
      currency: newRow.currency.trim(),
      detail: newRow.detail.trim(),
      description: newRow.description.trim(),
      category: newRow.category,
    }
  }

  const appendNewRowRecord = async () => {
    const nextRecord = createRecordFromNewRow()
    if (!nextRecord) return
    if (!nextRecord.date || !nextRecord.amount) {
      toast.error("Date and amount are required")
      return
    }

    const nextCount = records.length + 1
    let created: RecordItem | null = null
    try {
      const response = await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: nextRecord.id,
          date: nextRecord.date,
          account_from_id: nextRecord.accountFrom.id,
          payee_to_id: nextRecord.payeeTo.id,
          type: nextRecord.type,
          amount: nextRecord.amount,
          currency: nextRecord.currency,
          detail: nextRecord.detail,
          description: nextRecord.description,
          category: nextRecord.category,
        }),
      })
      if (!response.ok) {
        toast.error("Failed to save row")
        return
      }
      created = mapRecordFromApi((await response.json()) as RecordApi, accounts)
    } catch {
      toast.error("Failed to save row")
      return
    }

    if (!created) {
      toast.error("Saved row could not be rendered")
      return
    }

    setRecords((current) => [...current, created])
    setSelectedRowId(created.id)
    window.dispatchEvent(
      new CustomEvent("record:update", {
        detail: created,
      })
    )
    setNewRow(defaultNewRow(accounts))
    setPage(Math.max(1, Math.ceil(nextCount / pageSize)))
    toast.success("Row saved")
  }

  const handleNewRowKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter") return
    event.preventDefault()
    void appendNewRowRecord()
  }

  const focusSpreadsheetCell = (row: number, col: number) => {
    const key = `${row}-${col}`
    const element = cellRefs.current[key]
    if (element && !element.disabled) {
      element.focus()
      element.select?.()
    }
  }

  const handleSpreadsheetNav =
    (row: number, col: number) => (event: KeyboardEvent<HTMLInputElement>) => {
      if (!spreadsheetMode) return
      if (event.key === "Tab" && event.shiftKey) {
        event.preventDefault()
        focusSpreadsheetCell(row, col - 1)
      } else if (event.key === "Tab" || event.key === "ArrowRight") {
        event.preventDefault()
        focusSpreadsheetCell(row, col + 1)
      } else if (event.key === "ArrowLeft") {
        event.preventDefault()
        focusSpreadsheetCell(row, col - 1)
      } else if (event.key === "Enter" && event.shiftKey) {
        event.preventDefault()
        focusSpreadsheetCell(row - 1, col)
      } else if (event.key === "Enter" || event.key === "ArrowDown") {
        event.preventDefault()
        focusSpreadsheetCell(row + 1, col)
      } else if (event.key === "ArrowUp") {
        event.preventDefault()
        focusSpreadsheetCell(row - 1, col)
      }
    }

  const registerCellRef = (row: number, col: number) => (el: HTMLInputElement | null) => {
    cellRefs.current[`${row}-${col}`] = el
  }

  const setNewRowAccountByName = (side: "accountFromId" | "payeeToId", name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const existing = accounts.find(
      (account) => account.displayName.toLowerCase() === trimmed.toLowerCase()
    )
    if (existing) {
      setNewRow((current) => ({ ...current, [side]: existing.id }))
      return
    }
    const created: Account = {
      id: `acc-local-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      displayName: trimmed,
      accountName: trimmed.split(/\s+/).slice(0, 3).join(" "),
      type: "other",
    }
    setAccounts((current) => [...current, created])
    setNewRow((current) => ({ ...current, [side]: created.id }))
  }

  const renderAccountDisplay = (account: Account) => {
    const LogoIcon = account.id === "acc-payroll" ? BankIcon : HouseIcon
    const shortAccountName = account.accountName.split(/\s+/).slice(0, 3).join(" ")
    return (
      <div className="inline-flex items-start gap-1.5">
        <span className="mt-0.5 inline-flex size-5 items-center justify-center border bg-muted">
          <LogoIcon className="size-3.5" />
        </span>
        <span className="pl-1 leading-tight">
          <span className="block">{account.displayName}</span>
          <span className="block text-[10px] text-muted-foreground">
            {shortAccountName}
          </span>
        </span>
      </div>
    )
  }

  const createAccount = async (name: string) => {
    const base = name.trim()
    if (!base) return null
    const next: Account = {
      id: `acc-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      displayName: base,
      accountName: `${base} Account`,
      type: "other",
    }
    const response = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: next.id,
        display_name: next.displayName,
        account_name: next.accountName,
        type: next.type,
      }),
    })
    if (!response.ok) return null
    const created = mapAccountFromApi((await response.json()) as AccountApi)
    setAccounts((current) => [...current, created])
    return created
  }

  const AccountCombobox = ({
    value,
    onChange,
    onKeyDown,
    query,
    setQuery,
    excludeId,
  }: {
    value: string
    onChange: (nextId: string) => void
    onKeyDown?: (event: KeyboardEvent) => void
    query: string
    setQuery: (value: string) => void
    excludeId?: string
  }) => {
    const availableAccounts = accounts.filter((account) => account.id !== excludeId)
    const selectedAccount = availableAccounts.find((account) => account.id === value)
    const normalizedQuery = query.trim().toLowerCase()
    const filtered = availableAccounts.filter((account) =>
      `${account.displayName} ${account.accountName}`.toLowerCase().includes(
        normalizedQuery
      )
    )
    const canCreate =
      normalizedQuery.length > 0 &&
      !availableAccounts.some(
        (account) =>
          account.displayName.toLowerCase() === normalizedQuery ||
          account.accountName.toLowerCase() === normalizedQuery
      )

    const handleCreateAccount = async () => {
      const created = await createAccount(query)
      if (!created) return
      onChange(created.id)
      setQuery("")
    }

    const grouped = {
      individual: filtered.filter((account) => account.type === "individual"),
      restaurant: filtered.filter((account) => account.type === "restaurant"),
      other: filtered.filter((account) => account.type === "other"),
    }

    const renderGroup = (
      label: string,
      group: Account[]
    ) =>
      group.length > 0 ? (
        <ComboboxGroup key={label}>
          <ComboboxLabel>{label}</ComboboxLabel>
          {group.map((account) => {
            const LogoIcon =
              account.id === "acc-payroll" ? BankIcon : HouseIcon
            return (
              <ComboboxItem key={account.id} value={account}>
                <span className="inline-flex size-5 items-center justify-center border bg-muted">
                  <LogoIcon className="size-3.5" />
                </span>
                <span className="pl-1 leading-tight">
                  <span className="block">{account.displayName}</span>
                  <span className="block text-[10px] text-muted-foreground">
                    {account.accountName}
                  </span>
                </span>
              </ComboboxItem>
            )
          })}
        </ComboboxGroup>
      ) : null

    return (
      <Combobox
        items={availableAccounts}
        itemToStringLabel={(item) => item.displayName}
        itemToStringValue={(item) => item.id}
        inputValue={query}
        onInputValueChange={(value) => setQuery(value)}
        value={selectedAccount ?? null}
        onValueChange={(item) => {
          if (item) onChange(item.id)
        }}
      >
        <ComboboxInput
          placeholder="Search account..."
          onKeyDown={(event) => {
            onKeyDown?.(event)
            if (event.key === "Enter" && canCreate) {
              event.preventDefault()
              void handleCreateAccount()
            }
          }}
          className="h-7 w-full text-xs"
          showClear={false}
          showTrigger
        />
        <ComboboxContent>
          <ComboboxList>
            {renderGroup("Individual", grouped.individual)}
            {renderGroup("Restaurant", grouped.restaurant)}
            {renderGroup("Other", grouped.other)}
            <ComboboxEmpty>No account found.</ComboboxEmpty>
            {canCreate ? (
              <ComboboxItem
                value={{
                  id: "__create__",
                  displayName: query.trim(),
                  accountName: `${query.trim()} Account`,
                }}
                onClick={(event) => {
                  event.preventDefault()
                  void handleCreateAccount()
                }}
              >
                + Create "{query.trim()}"
              </ComboboxItem>
            ) : null}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    )
  }

  const CategoryCombobox = ({
    value,
    onChange,
    onKeyDown,
    query,
    setQuery,
  }: {
    value: Category
    onChange: (next: Category) => void
    onKeyDown?: (event: KeyboardEvent) => void
    query: string
    setQuery: (value: string) => void
  }) => {
    const selected = value
    const categories: Category[] = [
      "Savings",
      "Income",
      "Groceries",
      "Transportation",
    ]
    const filtered = categories.filter((item) =>
      item.toLowerCase().includes(query.trim().toLowerCase())
    )

    return (
      <Combobox
        items={categories}
        itemToStringLabel={(item) => item}
        itemToStringValue={(item) => item}
        inputValue={query}
        onInputValueChange={(next) => setQuery(next)}
        value={selected}
        onValueChange={(item) => {
          if (item) onChange(item)
        }}
      >
        <ComboboxInput
          placeholder="Search category..."
          onKeyDown={(event) => onKeyDown?.(event)}
          className="h-7 w-full text-xs"
          showClear={false}
          showTrigger
        />
        <ComboboxContent>
          <ComboboxList>
            {filtered.map((item) => {
              const Icon = categoryIcons[item]
              return (
                <ComboboxItem key={item} value={item}>
                  <Icon className="size-3.5" />
                  <span>{item}</span>
                </ComboboxItem>
              )
            })}
            <ComboboxEmpty>No category found.</ComboboxEmpty>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    )
  }

  const TypeCombobox = ({
    value,
    onChange,
    onKeyDown,
  }: {
    value: RecordType
    onChange: (next: RecordType) => void
    onKeyDown?: (event: KeyboardEvent) => void
  }) => {
    const options: RecordType[] = ["Transfer", "Deposit", "Expense"]
    return (
      <Combobox
        items={options}
        itemToStringLabel={(item) => item}
        itemToStringValue={(item) => item}
        value={value}
        onValueChange={(item) => {
          if (item) onChange(item)
        }}
      >
        <ComboboxTrigger
          render={
            <Button
              variant="outline"
              className="h-7 w-full justify-between rounded-none px-2 text-xs font-normal"
            />
          }
          onKeyDown={(event) => onKeyDown?.(event)}
        >
          {value}
        </ComboboxTrigger>
        <ComboboxContent>
          <ComboboxList>
            {options.map((item) => (
              <ComboboxItem key={item} value={item}>
                {item}
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    )
  }

  const CurrencyCombobox = ({
    value,
    onChange,
    onKeyDown,
  }: {
    value: string
    onChange: (next: string) => void
    onKeyDown?: (event: KeyboardEvent) => void
  }) => {
    const currencies = ["RM", "USD", "EUR", "GBP", "JPY", "MYR"]

    return (
      <Combobox
        items={currencies}
        itemToStringLabel={(item) => item}
        itemToStringValue={(item) => item}
        value={value}
        onValueChange={(item) => {
          if (item) onChange(item)
        }}
      >
        <ComboboxTrigger
          render={
            <Button
              variant="outline"
              className="h-7 w-full justify-between rounded-none px-2 text-xs font-normal"
            />
          }
          onKeyDown={(event) => onKeyDown?.(event)}
        >
          {value || "Currency"}
        </ComboboxTrigger>
        <ComboboxContent>
          <ComboboxList>
            {currencies.map((item) => (
              <ComboboxItem key={item} value={item}>
                {item}
              </ComboboxItem>
            ))}
            <ComboboxEmpty>No currency found.</ComboboxEmpty>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    )
  }

  const DatePickerInput = ({
    value,
    onChange,
  }: {
    value: string
    onChange: (next: string) => void
  }) => {
    const selectedDate = parseDateValue(value)
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="h-7 w-full justify-start rounded-none px-2 text-left text-xs font-normal"
          >
            <CalendarBlankIcon className="mr-1 size-3.5 text-muted-foreground" />
            {value || "DD-MM-YYYY"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto rounded-none p-0" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => {
              if (!date) return
              onChange(formatDateValue(date))
            }}
          />
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <div className="min-h-svh bg-muted/50 pt-4 md:pt-6">
      <div className="w-full md:mx-auto md:max-w-7xl md:px-6">
        <div className="grid w-full gap-4 md:grid-cols-12">
        <div className="overflow-hidden border-y bg-card p-4 md:order-2 md:col-span-4 md:border">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold leading-none tracking-tight">
                Spending Overview
              </h2>
              <ChartBarIcon className="size-4 text-muted-foreground" />
            </div>
            <div className="mt-4 mb-3 grid grid-cols-4 border">
              {(["yearly", "monthly", "weekly", "daily"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setSpendingView(tab)}
                  className={`h-7 border-r text-[10px] uppercase tracking-wide last:border-r-0 ${
                    spendingView === tab ? "bg-foreground text-background" : "bg-card"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <ChartContainer config={spendingChartConfig} className="h-44 w-full border p-2">
              <BarChart data={spendingData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="period"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={6}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => (
                        <span>{`Spending ${Number(value).toLocaleString()}`}</span>
                      )}
                    />
                  }
                />
                <Bar dataKey="value" fill="var(--color-value)" radius={0} />
              </BarChart>
            </ChartContainer>
        </div>
        <div className="border-y bg-card p-4 md:order-3 md:col-span-4 md:border">
          <div className="mb-4">
            <h2 className="text-lg font-semibold leading-none tracking-tight">Spending</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              6-month category history.
            </p>
          </div>
          <div className="mb-4">
            <p className="mb-2 text-xs">Category</p>
            <Combobox
              items={["Savings", "Income", "Groceries", "Transportation"]}
              itemToStringLabel={(item) => item}
              itemToStringValue={(item) => item}
              value={selectedSpendingCategory}
              onValueChange={(item) => {
                if (item) setSelectedSpendingCategory(item as Category)
              }}
            >
              <ComboboxTrigger
                render={
                  <Button
                    variant="outline"
                    className="h-8 w-full justify-between rounded-none px-3 text-sm font-normal"
                  />
                }
              >
                {selectedSpendingCategory}
              </ComboboxTrigger>
              <ComboboxContent>
                <ComboboxList>
                  {(["Savings", "Income", "Groceries", "Transportation"] as const).map(
                    (category) => (
                    <ComboboxItem key={category} value={category}>
                      {category}
                    </ComboboxItem>
                    )
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>
          <div className="border-t pt-4">
            <ChartContainer config={lineChartConfig} className="h-44 w-full">
              <LineChart data={lineData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="period" tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  type="monotone"
                  dataKey="amount"
                  stroke="var(--color-amount)"
                  strokeWidth={2}
                  dot={false}
                  fill="var(--color-amount)"
                  fillOpacity={0.1}
                />
              </LineChart>
            </ChartContainer>
          </div>
        </div>
        <div className="overflow-hidden border-y bg-card p-4 md:order-1 md:col-span-3 md:border">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold leading-none tracking-tight">
              Net Activity Calendar
            </h2>
            <CalendarBlankIcon className="size-4 text-muted-foreground" />
          </div>
          <div className="pt-3">
          <Calendar
            mode="range"
            defaultMonth={calendarRange?.from}
            selected={calendarRange}
            onSelect={setCalendarRange}
            showWeekNumber
            numberOfMonths={1}
            captionLayout="dropdown"
            className="w-full"
            classNames={{
              root: "w-full",
              month: "w-full",
            }}
            formatters={{
              formatMonthDropdown: (date) =>
                date.toLocaleString("default", { month: "long" }),
            }}
            components={{
              DayButton: ({ children, modifiers, day, ...props }) => {
                const key = formatDateValue(day.date)
                const net = dailyNet[key] ?? 0
                const text =
                  net === 0
                    ? ""
                    : `${net > 0 ? "+" : "-"}${Math.abs(net).toFixed(0)} MYR`
                return (
                  <CalendarDayButton day={day} modifiers={modifiers} {...props}>
                    {children}
                    {!modifiers.outside && net !== 0 && (
                      <span
                        className={
                          net < 0
                            ? "text-red-700 dark:text-red-400"
                            : net > 0
                              ? "text-green-700 dark:text-green-400"
                              : "text-foreground/80"
                        }
                      >
                        {text}
                      </span>
                    )}
                  </CalendarDayButton>
                )
              },
            }}
          />
          </div>
        </div>
        </div>
        <div
          className={`mt-4 bg-card py-4 md:px-6 ${
            spreadsheetMode ? "" : "border-y md:border"
          }`}
        >
        <div className="mb-3 flex items-center justify-between px-3 md:px-0">
          <h1 className="text-sm font-semibold tracking-tight">Records</h1>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 rounded-none text-xs">
                <FunnelSimpleIcon className="size-3.5" />
                Filters
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 rounded-none p-3">
              <div className="grid gap-2">
                <Input
                  placeholder="Search detail/description..."
                  value={filters.query}
                  onChange={(event) => {
                    setFilters((current) => ({ ...current, query: event.target.value }))
                    setPage(1)
                  }}
                  className="h-8 text-xs"
                />
                <Input
                  placeholder="Type (Transfer/Deposit/Expense)"
                  value={filters.type}
                  onChange={(event) => {
                    setFilters((current) => ({ ...current, type: event.target.value }))
                    setPage(1)
                  }}
                  className="h-8 text-xs"
                />
                <Input
                  placeholder="Category"
                  value={filters.category}
                  onChange={(event) => {
                    setFilters((current) => ({ ...current, category: event.target.value }))
                    setPage(1)
                  }}
                  className="h-8 text-xs"
                />
                <Input
                  placeholder="Account"
                  value={filters.account}
                  onChange={(event) => {
                    setFilters((current) => ({ ...current, account: event.target.value }))
                    setPage(1)
                  }}
                  className="h-8 text-xs"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Min amount"
                    value={filters.minAmount}
                    onChange={(event) => {
                      setFilters((current) => ({ ...current, minAmount: event.target.value }))
                      setPage(1)
                    }}
                    className="h-8 text-xs"
                  />
                  <Input
                    placeholder="Max amount"
                    value={filters.maxAmount}
                    onChange={(event) => {
                      setFilters((current) => ({ ...current, maxAmount: event.target.value }))
                      setPage(1)
                    }}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <Table
          className={`text-[10px] ${
            spreadsheetMode
              ? "border-collapse [&_th]:h-7 [&_th]:px-1 [&_td]:p-0 [&_td]:align-middle"
              : ""
          }`}
        >
          <TableHeader>
            <TableRow className="bg-card">
              <TableHead className="sticky-date-cell top-0 left-0 z-40 h-8 min-w-24 bg-card uppercase tracking-wide text-muted-foreground md:sticky">
                Date
              </TableHead>
              <TableHead className="top-0 z-30 hidden min-w-32 bg-card uppercase tracking-wide text-muted-foreground md:table-cell md:sticky">
                Account (From)
              </TableHead>
              <TableHead className="top-0 z-30 min-w-32 bg-card uppercase tracking-wide text-muted-foreground">
                Payee (To)
              </TableHead>
              <TableHead className="top-0 z-30 hidden min-w-24 bg-card uppercase tracking-wide text-muted-foreground md:table-cell md:sticky">
                Type
              </TableHead>
              <TableHead className="top-0 z-30 hidden min-w-24 bg-card text-right uppercase tracking-wide text-muted-foreground md:table-cell">
                Amnt.
              </TableHead>
              <TableHead className="top-0 z-30 hidden min-w-16 bg-card uppercase tracking-wide text-muted-foreground md:table-cell md:sticky">
                Curr.
              </TableHead>
              <TableHead className="top-0 z-30 hidden min-w-28 bg-card uppercase tracking-wide text-muted-foreground md:table-cell md:sticky">
                Cat.
              </TableHead>
              <TableHead className="top-0 z-30 min-w-20 bg-card text-right uppercase tracking-wide text-muted-foreground">
                Bal.
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody
            className={
              spreadsheetMode ? "[&>tr:last-child_td]:border-b-0" : undefined
            }
          >
            {filteredRecords.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="p-0">
                  <Empty />
                </TableCell>
              </TableRow>
            ) : null}
            {paginatedRecords.map((record, rowIndex) => (
              <ContextMenu key={record.id}>
                <ContextMenuTrigger asChild>
                  <TableRow
                    className={
                      spreadsheetMode
                        ? "border-b-0 hover:bg-transparent data-[state=selected]:bg-transparent"
                        : undefined
                    }
                    data-state={selectedRowId === record.id ? "selected" : undefined}
                    onClick={() => setSelectedRowId(record.id)}
                    onDoubleClick={() => startEdit(record)}
                  >
                <TableCell className="sticky-date-cell bg-card group-hover:bg-muted/50 group-data-[state=selected]:bg-muted md:sticky md:left-0 md:z-20">
                  {spreadsheetMode ? (
                    <Input
                      ref={registerCellRef(rowIndex, 0)}
                      value={record.date}
                      onChange={(event) =>
                        updateRecordCell(record.id, "date", event.target.value)
                      }
                      onKeyDown={handleSpreadsheetNav(rowIndex, 0)}
                      className="h-6 border-0 border-r border-b rounded-none px-1 text-[10px] shadow-none"
                    />
                  ) : editingId === record.id && draft ? (
                    <DatePickerInput
                      value={draft.date}
                      onChange={(next) => updateDraft("date", next)}
                    />
                  ) : (
                    record.date
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {spreadsheetMode ? (
                    <Input
                      ref={registerCellRef(rowIndex, 1)}
                      value={record.accountFrom.displayName}
                      onChange={(event) =>
                        updateRecordAccountCell(
                          record.id,
                          "accountFrom",
                          event.target.value
                        )
                      }
                      onKeyDown={handleSpreadsheetNav(rowIndex, 1)}
                      className="h-6 border-0 border-r border-b rounded-none px-1 text-[10px] shadow-none"
                    />
                  ) : editingId === record.id && draft ? (
                    <AccountCombobox
                      value={draft.accountFrom.id}
                      onChange={(nextId) => {
                        const account = accounts.find((item) => item.id === nextId)
                        if (account) updateDraft("accountFrom", account)
                      }}
                      onKeyDown={handleEditKeyDown}
                      query={accountQueries.editFrom}
                      setQuery={(value) =>
                        setAccountQueries((current) => ({ ...current, editFrom: value }))
                      }
                    />
                  ) : (
                    renderAccountDisplay(record.accountFrom)
                  )}
                </TableCell>
                <TableCell>
                  {spreadsheetMode ? (
                    <Input
                      ref={registerCellRef(rowIndex, 2)}
                      value={record.payeeTo.displayName}
                      onChange={(event) =>
                        updateRecordAccountCell(record.id, "payeeTo", event.target.value)
                      }
                      onKeyDown={handleSpreadsheetNav(rowIndex, 2)}
                      className="h-6 border-0 border-r border-b rounded-none px-1 text-[10px] shadow-none"
                    />
                  ) : editingId === record.id && draft ? (
                    <AccountCombobox
                      value={draft.payeeTo.id}
                      onChange={(nextId) => {
                        const account = accounts.find((item) => item.id === nextId)
                        if (account) updateDraft("payeeTo", account)
                      }}
                      onKeyDown={handleEditKeyDown}
                      query={accountQueries.editTo}
                      setQuery={(value) =>
                        setAccountQueries((current) => ({ ...current, editTo: value }))
                      }
                      excludeId={draft.accountFrom.id}
                    />
                  ) : (
                    renderAccountDisplay(record.payeeTo)
                  )}
                </TableCell>
                {spreadsheetMode ? (
                  <TableCell className="hidden md:table-cell">
                    <Input
                      ref={registerCellRef(rowIndex, 3)}
                      value={record.type}
                      onChange={(event) =>
                        updateRecordCell(record.id, "type", event.target.value)
                      }
                      onKeyDown={handleSpreadsheetNav(rowIndex, 3)}
                      className="h-6 border-0 border-r border-b rounded-none px-1 text-[10px] shadow-none"
                    />
                  </TableCell>
                ) : editingId === record.id && draft ? (
                  <TableCell className="hidden md:table-cell">
                    <TypeCombobox
                      value={draft.type}
                      onChange={(next) => updateDraft("type", next)}
                      onKeyDown={handleEditKeyDown}
                    />
                  </TableCell>
                ) : (
                  <TableCell className="hidden md:table-cell">{record.type}</TableCell>
                )}
                {spreadsheetMode ? (
                  <TableCell className="hidden bg-card text-right group-hover:bg-muted/50 group-data-[state=selected]:bg-muted md:table-cell">
                    <Input
                      ref={registerCellRef(rowIndex, 4)}
                      type="text"
                      inputMode="decimal"
                      value={record.amount}
                      onChange={(event) =>
                        updateRecordCell(
                          record.id,
                          "amount",
                          event.target.value.replace(/[^0-9.]/g, "")
                        )
                      }
                      onKeyDown={handleSpreadsheetNav(rowIndex, 4)}
                      className="h-6 border-0 border-r border-b bg-transparent px-1 text-right text-[10px] shadow-none focus-visible:bg-transparent"
                    />
                  </TableCell>
                ) : editingId === record.id && draft ? (
                  <TableCell className="hidden bg-card text-right group-hover:bg-muted/50 group-data-[state=selected]:bg-muted md:table-cell">
                    <Input
                      type="number"
                      step="0.01"
                      value={draft.amount}
                      onChange={(event) => updateDraft("amount", event.target.value)}
                      onKeyDown={handleEditKeyDown}
                      className="h-7 bg-transparent text-right text-xs focus-visible:bg-transparent"
                    />
                  </TableCell>
                ) : (
                  <TableCell className="hidden bg-card text-right md:table-cell">
                    <span
                      className={
                        signedAmount(record) < 0
                          ? "text-red-700 dark:text-red-400"
                          : "text-green-700 dark:text-green-400"
                      }
                    >
                      {formatAmountFixed(record.amount)}
                    </span>
                  </TableCell>
                )}
                <TableCell className="hidden md:table-cell">
                  {spreadsheetMode ? (
                    <Input
                      ref={registerCellRef(rowIndex, 5)}
                      value={record.currency}
                      onChange={(event) =>
                        updateRecordCell(record.id, "currency", event.target.value)
                      }
                      onKeyDown={handleSpreadsheetNav(rowIndex, 5)}
                      className="h-6 border-0 border-r border-b rounded-none px-1 text-[10px] shadow-none"
                    />
                  ) : editingId === record.id && draft ? (
                    <CurrencyCombobox
                      value={draft.currency}
                      onChange={(next) => updateDraft("currency", next)}
                      onKeyDown={handleEditKeyDown}
                    />
                  ) : (
                    currencyToSymbol(record.currency)
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {spreadsheetMode ? (
                    <Input
                      ref={registerCellRef(rowIndex, 6)}
                      value={record.category}
                      onChange={(event) =>
                        updateRecordCell(record.id, "category", event.target.value)
                      }
                      onKeyDown={handleSpreadsheetNav(rowIndex, 6)}
                      className="h-6 border-0 border-r border-b rounded-none px-1 text-[10px] shadow-none"
                    />
                  ) : editingId === record.id && draft ? (
                    <CategoryCombobox
                      value={draft.category}
                      onChange={(next) => updateDraft("category", next)}
                      onKeyDown={handleEditKeyDown}
                      query={categoryQueries.edit}
                      setQuery={(value) =>
                        setCategoryQueries((current) => ({ ...current, edit: value }))
                      }
                    />
                  ) : (
                    (() => {
                      const Icon = categoryIcons[record.category]
                      return (
                        <span className="inline-flex items-center gap-1.5" title={record.category}>
                          <Icon className="size-3.5" />
                          <span>{record.category}</span>
                        </span>
                      )
                    })()
                  )}
                </TableCell>
                <TableCell className="bg-card text-right group-hover:bg-muted/50 group-data-[state=selected]:bg-muted">
                  <Input
                    value={formatMoney(record.runningBalance)}
                    disabled
                    className="h-6 border-0 border-b rounded-none px-1 text-right text-[10px] opacity-70 shadow-none"
                  />
                </TableCell>
                  </TableRow>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-28">
                  {editingId === record.id ? (
                    <>
                      <ContextMenuItem onClick={() => void saveEdit()}>Save</ContextMenuItem>
                      <ContextMenuItem onClick={cancelEdit}>Cancel</ContextMenuItem>
                    </>
                  ) : (
                    <ContextMenuItem onClick={() => startEdit(record)}>
                      Edit
                    </ContextMenuItem>
                  )}
                </ContextMenuContent>
              </ContextMenu>
            ))}
            {!spreadsheetMode ? (
            <TableRow className="bg-muted/20">
              {(() => {
                const newRowIndex = paginatedRecords.length
                return (
                  <>
              <TableCell className="sticky-date-cell bg-card group-hover:bg-muted/50 group-data-[state=selected]:bg-muted md:sticky md:left-0 md:z-20">
                {spreadsheetMode ? (
                  <Input
                    ref={registerCellRef(newRowIndex, 0)}
                    value={newRow.date}
                    onChange={(event) =>
                      setNewRow((current) => ({ ...current, date: event.target.value }))
                    }
                    onKeyDown={handleSpreadsheetNav(newRowIndex, 0)}
                    className="h-6 border-0 border-r border-b rounded-none px-1 text-[10px] shadow-none"
                  />
                ) : (
                  <DatePickerInput
                    value={newRow.date}
                    onChange={(next) =>
                      setNewRow((current) => ({ ...current, date: next }))
                    }
                  />
                )}
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {spreadsheetMode ? (
                  <Input
                    ref={registerCellRef(newRowIndex, 1)}
                    value={
                      accounts.find((item) => item.id === newRow.accountFromId)?.displayName ??
                      ""
                    }
                    onChange={(event) =>
                      setNewRowAccountByName("accountFromId", event.target.value)
                    }
                    onKeyDown={handleSpreadsheetNav(newRowIndex, 1)}
                    className="h-6 border-0 border-r border-b rounded-none px-1 text-[10px] shadow-none"
                  />
                ) : (
                  <AccountCombobox
                    value={newRow.accountFromId}
                    onChange={(nextId) =>
                      setNewRow((current) => ({
                        ...current,
                        accountFromId: nextId,
                      }))
                    }
                    onKeyDown={handleNewRowKeyDown}
                    query={accountQueries.newFrom}
                    setQuery={(value) =>
                      setAccountQueries((current) => ({ ...current, newFrom: value }))
                    }
                  />
                )}
              </TableCell>
              <TableCell>
                {spreadsheetMode ? (
                  <Input
                    ref={registerCellRef(newRowIndex, 2)}
                    value={
                      accounts.find((item) => item.id === newRow.payeeToId)?.displayName ?? ""
                    }
                    onChange={(event) =>
                      setNewRowAccountByName("payeeToId", event.target.value)
                    }
                    onKeyDown={handleSpreadsheetNav(newRowIndex, 2)}
                    className="h-6 border-0 border-r border-b rounded-none px-1 text-[10px] shadow-none"
                  />
                ) : (
                  <AccountCombobox
                    value={newRow.payeeToId}
                    onChange={(nextId) =>
                      setNewRow((current) => ({
                        ...current,
                        payeeToId: nextId,
                      }))
                    }
                    onKeyDown={handleNewRowKeyDown}
                    query={accountQueries.newTo}
                    setQuery={(value) =>
                      setAccountQueries((current) => ({ ...current, newTo: value }))
                    }
                    excludeId={newRow.accountFromId}
                  />
                )}
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {spreadsheetMode ? (
                  <Input
                    ref={registerCellRef(newRowIndex, 3)}
                    value={newRow.type}
                    onChange={(event) =>
                      setNewRow((current) => ({
                        ...current,
                        type: event.target.value as RecordType,
                      }))
                    }
                    onKeyDown={handleSpreadsheetNav(newRowIndex, 3)}
                    className="h-6 border-0 border-r border-b rounded-none px-1 text-[10px] shadow-none"
                  />
                ) : (
                  <TypeCombobox
                    value={newRow.type}
                    onChange={(next) =>
                      setNewRow((current) => ({
                        ...current,
                        type: next,
                      }))
                    }
                    onKeyDown={handleNewRowKeyDown}
                  />
                )}
              </TableCell>
              <TableCell className="hidden bg-card text-right group-hover:bg-muted/50 group-data-[state=selected]:bg-muted md:table-cell">
                <Input
                  ref={spreadsheetMode ? registerCellRef(newRowIndex, 4) : undefined}
                  type={spreadsheetMode ? "text" : "number"}
                  inputMode="decimal"
                  value={newRow.amount}
                  onChange={(event) =>
                    setNewRow((current) => ({
                      ...current,
                      amount: spreadsheetMode
                        ? event.target.value.replace(/[^0-9.]/g, "")
                        : event.target.value,
                    }))
                  }
                  onKeyDown={
                    spreadsheetMode ? handleSpreadsheetNav(newRowIndex, 4) : handleNewRowKeyDown
                  }
                  className={
                    spreadsheetMode
                      ? "h-6 border-0 border-r border-b bg-transparent px-1 text-right text-[10px] shadow-none focus-visible:bg-transparent"
                      : "h-7 text-right text-xs"
                  }
                />
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {spreadsheetMode ? (
                  <Input
                    ref={registerCellRef(newRowIndex, 5)}
                    value={newRow.currency}
                    onChange={(event) =>
                      setNewRow((current) => ({ ...current, currency: event.target.value }))
                    }
                    onKeyDown={handleSpreadsheetNav(newRowIndex, 5)}
                    className="h-6 border-0 border-r border-b rounded-none px-1 text-[10px] shadow-none"
                  />
                ) : (
                  <CurrencyCombobox
                    value={newRow.currency}
                    onChange={(next) =>
                      setNewRow((current) => ({ ...current, currency: next }))
                    }
                    onKeyDown={handleNewRowKeyDown}
                  />
                )}
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {spreadsheetMode ? (
                  <Input
                    ref={registerCellRef(newRowIndex, 6)}
                    value={newRow.category}
                    onChange={(event) =>
                      setNewRow((current) => ({
                        ...current,
                        category: event.target.value as Category,
                      }))
                    }
                    onKeyDown={handleSpreadsheetNav(newRowIndex, 6)}
                    className="h-6 border-0 border-r border-b rounded-none px-1 text-[10px] shadow-none"
                  />
                ) : (
                  <CategoryCombobox
                    value={newRow.category}
                    onChange={(next) =>
                      setNewRow((current) => ({
                        ...current,
                        category: next,
                      }))
                    }
                    onKeyDown={handleNewRowKeyDown}
                    query={categoryQueries.new}
                    setQuery={(value) =>
                      setCategoryQueries((current) => ({ ...current, new: value }))
                    }
                  />
                )}
              </TableCell>
              <TableCell className="bg-card text-right group-hover:bg-muted/50 group-data-[state=selected]:bg-muted">
                -
              </TableCell>
                  </>
                )
              })()}
            </TableRow>
            ) : null}
          </TableBody>
        </Table>
        <div className="mt-3 flex items-center justify-between px-3 text-xs md:px-0">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Rows per page</span>
            <Input
              type="number"
              min={1}
              value={pageSize}
              onChange={(event) => {
                const next = Number.parseInt(event.target.value, 10)
                if (!Number.isFinite(next) || next < 1) return
                setPageSize(next)
                setPage(1)
              }}
              className="h-7 w-16 text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 rounded-none px-2 text-xs"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 rounded-none px-2 text-xs"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}

export default App
