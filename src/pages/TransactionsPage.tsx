import {
  Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent
} from "react"
import type { DateRange } from "react-day-picker"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, XAxis } from "recharts"
import { invoke } from "@tauri-apps/api/core"
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd"
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  BankIcon,
  CalendarBlankIcon,
  ChartBarIcon,
  FunnelSimpleIcon,
  RowsIcon,
  MagnifyingGlassIcon,
  HouseIcon,
  QuestionIcon,
  DotsSixVerticalIcon,
  ArrowsLeftRightIcon,
  FlagIcon,
  CaretLeftIcon,
  CaretRightIcon,
} from "@phosphor-icons/react"
import type { Dispatch, SetStateAction } from "react"

import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Empty } from "@/components/ui/empty"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { Calendar } from "@/components/ui/calendar"
import { CalendarDayButton, CalendarWithTotals } from "@/components/ui/calendar-with-totals"
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
import type {
  Account,
  AccountApi,
  Category,
  CategoryDefinition,
  NewRowForm,
  RecordApi,
  RecordItem,
  RecordType,
} from "@/lib/types"
import { mapAccountFromApi, mapRecordFromApi } from "@/lib/types"
import { getCategoryIcon } from "@/lib/category-icons"

const spreadsheetCellInputClass =
  "h-8 rounded-sm border-0 border-r border-b px-1 py-1 text-[10px] shadow-none outline-none focus-visible:ring-0 focus-visible:outline-[3px] focus-visible:outline-offset-[-3px] focus-visible:outline-blue-500"

const spreadsheetAmountInputClass =
  "h-8 w-24 rounded-sm border-0 border-r border-b bg-transparent px-1 py-1 text-right text-[10px] shadow-none outline-none focus-visible:bg-transparent focus-visible:ring-0 focus-visible:outline-[3px] focus-visible:outline-offset-[-3px] focus-visible:outline-blue-500 dark:bg-transparent dark:focus-visible:bg-transparent"

const transactionCheckboxClass =
  "size-3 appearance-none align-middle border border-border/40 bg-background checked:border-primary checked:bg-primary"

const defaultNewRow = (sourceAccounts: Account[], allAccounts = sourceAccounts): NewRowForm => ({
  date: new Date().toISOString().slice(0, 10),
  accountFromId: sourceAccounts[0]?.id ?? "",
  payeeToId: allAccounts[1]?.id ?? allAccounts[0]?.id ?? "",
  waivedByAccountId: "",
  type: "Expense",
  amount: "0.00",
  currency: "RM",
  detail: "",
  description: "",
  category: "Groceries",
})

const categoryAbbreviations: Record<string, string> = {
  Transfer: "Tx.",
  "Food & Dining": "Food",
  Groceries: "Food",
  Transportation: "Transport",
  Entertainment: "Fun",
  Utilities: "Bills",
}

const getCategoryDisplayLabel = (
  category: CategoryDefinition | undefined,
  fallback: string
) => {
  const label = category?.displayName ?? fallback
  return categoryAbbreviations[label] ?? categoryAbbreviations[fallback] ?? label
}

const getAccountCode = (account: Account) => {
  const source = account.displayName || account.accountName || account.id
  const searchable = `${account.displayName} ${account.accountName} ${account.id}`.toLowerCase()
  if (/\bzest[-\s]?i\b/.test(searchable)) return "zest-i"
  if (/\bwise\b/.test(searchable)) return "wise-1"

  const genericWords = new Set([
    "account",
    "accounts",
    "bank",
    "card",
    "cash",
    "checking",
    "current",
    "maybank",
    "personal",
    "saving",
    "savings",
    "wallet",
  ])
  const token = source
    .toLowerCase()
    .replace(/^acc-/, "")
    .split(/[^a-z0-9-]+/)
    .find((part) => part && !genericWords.has(part))

  const fallback = account.id
    .toLowerCase()
    .replace(/^acc-/, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return token ?? (fallback || source.toLowerCase())
}

const isNAAccount = (account: Account) => {
  const values = [account.id, account.displayName, account.accountName].map((value) =>
    value.toLowerCase().trim()
  )
  return values.some((value) => value === "n-a" || value === "na" || value.includes("unknown"))
}

type Props = {
  accounts: Account[]
  setAccounts: Dispatch<SetStateAction<Account[]>>
  records: RecordItem[]
  setRecords: Dispatch<SetStateAction<RecordItem[]>>
  categories: CategoryDefinition[]
  spreadsheetMode: boolean
  pageSize: number
  setPageSize: Dispatch<SetStateAction<number>>
  calendarRange: DateRange | undefined
  setCalendarRange: Dispatch<SetStateAction<DateRange | undefined>>
  displayCurrency: "MYR" | "USD"
  currencyApi: string
  currentUserEmail: string
  runningBalanceAccountIds: Set<string>
}

type SplitDraftItem = {
  id: string
  amount: string
  type: RecordType
  detail: string
  waivedByAccountId: string
}

type AccountComboboxProps = {
  accounts: Account[]
  value: string
  onChange: (nextId: string) => void
  onKeyDown?: (event: KeyboardEvent) => void
  excludeId?: string
  createAccount: (name: string) => Promise<Account | null>
}

function AccountCombobox({
  accounts,
  value,
  onChange,
  onKeyDown,
  excludeId,
  createAccount,
}: AccountComboboxProps) {
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState(value)

  useEffect(() => {
    setSelectedId(value)
  }, [value])

  const normalizedQuery = query.trim().toLowerCase()
  const availableAccounts = useMemo(
    () => accounts.filter((account) => account.id !== excludeId),
    [accounts, excludeId]
  )
  const selectedAccount = useMemo(
    () => availableAccounts.find((account) => account.id === selectedId),
    [availableAccounts, selectedId]
  )
  const selectedAccountCode = selectedAccount ? getAccountCode(selectedAccount) : ""

  useEffect(() => {
    setQuery(selectedAccountCode)
  }, [selectedAccountCode])

  const filtered = useMemo(
    () =>
      availableAccounts.filter((account) =>
        `${getAccountCode(account)} ${account.displayName} ${account.accountName}`
          .toLowerCase()
          .includes(normalizedQuery)
      ),
    [availableAccounts, normalizedQuery]
  )
  const SelectedAccountIcon = selectedAccount
    ? isNAAccount(selectedAccount)
      ? QuestionIcon
      : selectedAccount.id === "acc-payroll"
      ? BankIcon
      : HouseIcon
    : HouseIcon
  const canCreate =
    normalizedQuery.length > 0 &&
    !availableAccounts.some(
      (account) =>
        getAccountCode(account).toLowerCase() === normalizedQuery ||
        account.displayName.toLowerCase() === normalizedQuery ||
        account.accountName.toLowerCase() === normalizedQuery
    )

  const handleCreateAccount = async () => {
    const created = await createAccount(query)
    if (!created) return
    setSelectedId(created.id)
    onChange(created.id)
    setQuery(getAccountCode(created))
  }

  return (
    <Combobox
      items={availableAccounts}
      itemToStringLabel={(item) => getAccountCode(item)}
      itemToStringValue={(item) => item.id}
      inputValue={query}
      onInputValueChange={(next) => setQuery(next)}
      value={selectedAccount ?? null}
      onValueChange={(item) => {
        if (!item) return
        if (item.id === "__create__") {
          void handleCreateAccount()
          return
        }
        setSelectedId(item.id)
        onChange(item.id)
        setQuery(getAccountCode(item))
      }}
    >
      <ComboboxInput
        placeholder="Search account..."
        leadingIcon={
          selectedAccount ? (
            <span className="inline-flex size-5 items-center justify-center border bg-muted">
              <SelectedAccountIcon className="size-3.5" />
            </span>
          ) : null
        }
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => {
          if (event.key === "Enter" && canCreate) {
            event.preventDefault()
            void handleCreateAccount()
            return
          }
          if (event.key === "Enter") {
            event.stopPropagation()
            return
          }
          onKeyDown?.(event)
        }}
        className="h-7 w-full text-xs"
        showClear={false}
        showTrigger
      />
      <ComboboxContent>
        <ComboboxList>
          {filtered.map((account) => {
            const LogoIcon = isNAAccount(account)
              ? QuestionIcon
              : account.id === "acc-payroll"
              ? BankIcon
              : HouseIcon
            return (
              <ComboboxItem key={account.id} value={account}>
                <span className="inline-flex size-5 items-center justify-center border bg-muted">
                  <LogoIcon className="size-3.5" />
                </span>
                <span className="pl-1 leading-tight">
                  <span className="block">{getAccountCode(account)}</span>
                </span>
              </ComboboxItem>
            )
          })}
          <ComboboxEmpty>No account found.</ComboboxEmpty>
          {canCreate ? (
            <ComboboxItem
              value={{ id: "__create__", displayName: query.trim(), accountName: `${query.trim()} Account` }}
            >
              + Create "{query.trim()}"
            </ComboboxItem>
          ) : null}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

type CategoryComboboxProps = {
  categories: CategoryDefinition[]
  categoryOptions: Category[]
  value: Category
  onChange: (next: Category) => void
  onKeyDown?: (event: KeyboardEvent) => void
}

function CategoryCombobox({
  categories,
  categoryOptions,
  value,
  onChange,
  onKeyDown,
}: CategoryComboboxProps) {
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(value)

  useEffect(() => {
    setSelected(value)
  }, [value])

  const normalizedQuery = query.trim().toLowerCase()
  const getCategoryInputLabel = (next: Category) => {
    const category = categories.find((item) => item.name === next)
    return getCategoryDisplayLabel(category, next)
  }

  useEffect(() => {
    setQuery(getCategoryInputLabel(value))
  }, [categories, value])

  const filtered = useMemo(
    () =>
      categoryOptions.filter((item) => {
        const category = categories.find((candidate) => candidate.name === item)
        return `${item} ${getCategoryDisplayLabel(category, item)}`
          .toLowerCase()
          .includes(normalizedQuery)
      }),
    [categories, categoryOptions, normalizedQuery]
  )
  const selectedCategoryDefinition = categories.find((category) => category.name === selected)
  const SelectedCategoryIcon = getCategoryIcon(selectedCategoryDefinition?.icon ?? "")

  return (
    <Combobox
      items={categoryOptions}
      itemToStringLabel={(item) => item}
      itemToStringValue={(item) => item}
      inputValue={query}
      onInputValueChange={(next) => setQuery(next)}
      value={selected}
      onValueChange={(item) => {
        if (!item) return
        setSelected(item)
        onChange(item)
        setQuery(getCategoryInputLabel(item))
      }}
    >
      <ComboboxInput
        placeholder="Search category..."
        leadingIcon={<SelectedCategoryIcon className="size-3.5" />}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.stopPropagation()
            return
          }
          onKeyDown?.(event)
        }}
        className="h-7 w-full text-xs"
        showClear={false}
        showTrigger
      />
      <ComboboxContent>
        <ComboboxList>
          {filtered.map((item) => {
            const catDef = categories.find((c) => c.name === item)
            const Icon = getCategoryIcon(catDef?.icon ?? "")
            return (
              <ComboboxItem key={item} value={item}>
                <Icon className="size-3.5" />
                <span>{getCategoryDisplayLabel(catDef, item)}</span>
              </ComboboxItem>
            )
          })}
          <ComboboxEmpty>No category found.</ComboboxEmpty>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

export function TransactionsPage({
  accounts,
  setAccounts,
  records,
  setRecords,
  categories = [],
  spreadsheetMode,
  pageSize,
  setPageSize,
  calendarRange,
  setCalendarRange,
  displayCurrency,
  currencyApi,
  currentUserEmail,
  runningBalanceAccountIds,
}: Props) {
  const personalAccounts = useMemo(
    () =>
      accounts.filter(
        (account) => account.ownerEmail?.toLowerCase() === currentUserEmail.toLowerCase()
      ),
    [accounts, currentUserEmail]
  )
  const [accountPhotos] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("account-photos") ?? "{}") as Record<string, string> }
    catch { return {} }
  })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [contextActionArmed, setContextActionArmed] = useState(false)
  const [draft, setDraft] = useState<RecordItem | null>(null)
  const [page, setPage] = useState(1)
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(() => new Set())
  const cellRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({})
  const [spendingView, setSpendingView] = useState<
    "yearly" | "monthly" | "weekly" | "daily"
  >("monthly")
  const [filters, setFilters] = useState({
    query: "",
    type: "",
    category: "",
    account: "",
    minAmount: "",
    maxAmount: "",
  })
  const [groupBy, setGroupBy] = useState<"none" | "date">("date")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear())
  const [newRow, setNewRow] = useState<NewRowForm>(() =>
    defaultNewRow(personalAccounts, accounts)
  )
  const newRowTransientRef = useRef<
    Partial<Pick<NewRowForm, "accountFromId" | "payeeToId" | "category">>
  >({})
  const [waiveDialogOpen, setWaiveDialogOpen] = useState(false)
  const [waiveDialogRecord, setWaiveDialogRecord] = useState<RecordItem | null>(null)
  const [waiveDialogAccountId, setWaiveDialogAccountId] = useState("")
  const [waiveDialogSaving, setWaiveDialogSaving] = useState(false)
  const [splitDialogOpen, setSplitDialogOpen] = useState(false)
  const [splitDialogRecord, setSplitDialogRecord] = useState<RecordItem | null>(null)
  const [splitRows, setSplitRows] = useState<SplitDraftItem[]>([])
  const [splitSaving, setSplitSaving] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteDialogRecord, setDeleteDialogRecord] = useState<RecordItem | null>(null)
  const [deleteSaving, setDeleteSaving] = useState(false)
  const [flaggedCalendarDates, setFlaggedCalendarDates] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("finance-flagged-calendar-dates")
      return saved ? JSON.parse(saved) as string[] : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    localStorage.setItem(
      "finance-flagged-calendar-dates",
      JSON.stringify(flaggedCalendarDates)
    )
  }, [flaggedCalendarDates])

  useEffect(() => {
    setNewRow((current) => ({
      ...current,
      accountFromId: (() => {
        const currentId = newRowTransientRef.current.accountFromId ?? current.accountFromId
        return personalAccounts.some((account) => account.id === currentId)
          ? currentId
          : personalAccounts[0]?.id || ""
      })(),
      payeeToId: (() => {
        const currentId = newRowTransientRef.current.payeeToId ?? current.payeeToId
        return accounts.some((account) => account.id === currentId)
          ? currentId
          : accounts[1]?.id || accounts[0]?.id || ""
      })(),
    }))
    newRowTransientRef.current = {}
  }, [accounts, personalAccounts])

  const parseAmount = (value: string) => {
    const normalized = value.replace(/,/g, "")
    const parsed = Number.parseFloat(normalized)
    return Number.isFinite(parsed) ? parsed : 0
  }

  const formatAmountFixed = (value: string) => parseAmount(value).toFixed(2)
  const [rateByFromCurrency, setRateByFromCurrency] = useState<Record<string, number>>({})
  const getFallbackRate = (fromCurrency: string, toCurrency: string) => {
    if (fromCurrency === toCurrency) return 1
    if (fromCurrency === "MYR" && toCurrency === "USD") return 0.213
    if (fromCurrency === "USD" && toCurrency === "MYR") return 4.695
    return 1
  }

  const normalizeCurrency = (value: string) => {
    const trimmed = value.trim().toUpperCase()
    if (!trimmed || trimmed === "RM") return "MYR"
    if (trimmed === "$") return "USD"
    return trimmed
  }

  const convertAmount = (value: number, fromCurrencyRaw: string) => {
    const fromCurrency = normalizeCurrency(fromCurrencyRaw)
    if (fromCurrency === displayCurrency) return value
    const rate = rateByFromCurrency[fromCurrency]
    if (!rate || !Number.isFinite(rate) || rate <= 0) return value
    return value * rate
  }

  useEffect(() => {
    let cancelled = false

    const fetchRate = async (fromCurrency: string, toCurrency: string) => {
      const provider = currencyApi
      const fallback = async () => {
        const response = await fetch(
          `https://api.frankfurter.app/latest?from=${fromCurrency}&to=${toCurrency}`
        )
        if (!response.ok) return getFallbackRate(fromCurrency, toCurrency)
        const data = await response.json() as { rates?: Record<string, number> }
        return data.rates?.[toCurrency] ?? getFallbackRate(fromCurrency, toCurrency)
      }

      try {
        if (provider === "frankfurter") {
          const response = await fetch(
            `https://api.frankfurter.app/latest?from=${fromCurrency}&to=${toCurrency}`
          )
          if (!response.ok) throw new Error("frankfurter failed")
          const data = await response.json() as { rates?: Record<string, number> }
          return data.rates?.[toCurrency] ?? getFallbackRate(fromCurrency, toCurrency)
        }
        if (provider === "exchangerate-api") {
          const response = await fetch(`https://open.er-api.com/v6/latest/${fromCurrency}`)
          if (!response.ok) throw new Error("exchangerate-api failed")
          const data = await response.json() as { rates?: Record<string, number> }
          return data.rates?.[toCurrency] ?? getFallbackRate(fromCurrency, toCurrency)
        }
        if (provider === "currency-api") {
          const response = await fetch(
            `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${fromCurrency.toLowerCase()}.json`
          )
          if (!response.ok) throw new Error("currency-api failed")
          const data = await response.json() as Record<string, Record<string, number>>
          return data[fromCurrency.toLowerCase()]?.[toCurrency.toLowerCase()] ?? getFallbackRate(fromCurrency, toCurrency)
        }
        return await fallback()
      } catch {
        try {
          return await fallback()
        } catch {
          return getFallbackRate(fromCurrency, toCurrency)
        }
      }
    }

    const loadRates = async () => {
      const sourceCurrencies = Array.from(
        new Set(
          records
            .map((record) => normalizeCurrency(record.currency))
            .filter((currency) => currency && currency !== displayCurrency)
        )
      )
      if (sourceCurrencies.length === 0) {
        if (!cancelled) setRateByFromCurrency({})
        return
      }
      if (!cancelled) {
        setRateByFromCurrency(
          Object.fromEntries(
            sourceCurrencies.map((fromCurrency) => [
              fromCurrency,
              getFallbackRate(fromCurrency, displayCurrency),
            ])
          )
        )
      }
      const entries = await Promise.all(
        sourceCurrencies.map(async (fromCurrency) => [
          fromCurrency,
          await fetchRate(fromCurrency, displayCurrency),
        ] as const)
      )
      if (!cancelled) setRateByFromCurrency(Object.fromEntries(entries))
    }

    void loadRates()
    return () => {
      cancelled = true
    }
  }, [records, displayCurrency, currencyApi])

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

  const isRefundRecord = (record: RecordItem) =>
    /\brefund(?:ed)?\b|\breimburs(?:e|ed|ement)\b/i.test(
      `${record.category} ${record.detail} ${record.description}`
    )
  const isPersonalAccount = (account: Account) =>
    account.ownerEmail?.toLowerCase() === currentUserEmail.toLowerCase()
  const isPersonalAccountTransfer = (accountFrom?: Account | null, payeeTo?: Account | null) =>
    Boolean(accountFrom && payeeTo && isPersonalAccount(accountFrom) && isPersonalAccount(payeeTo))
  const getOwnershipDirection = (record: RecordItem): "incoming" | "outgoing" | "neutral" | null => {
    const fromPersonal = isPersonalAccount(record.accountFrom)
    const toPersonal = isPersonalAccount(record.payeeTo)
    if (fromPersonal && toPersonal) return "neutral"
    if (fromPersonal && !toPersonal) return "outgoing"
    if (!fromPersonal && toPersonal) return "incoming"
    return null
  }

  const signedAmount = (record: RecordItem) => {
    const value = parseAmount(record.amount)
    const ownershipDirection = getOwnershipDirection(record)
    if (ownershipDirection === "incoming") return value
    if (ownershipDirection === "outgoing") return -value
    if (ownershipDirection === "neutral") return 0
    if (record.type === "Deposit" || isRefundRecord(record)) return value
    return -value
  }
  const displaySignedAmount = (record: RecordItem) =>
    convertAmount(signedAmount(record), record.currency)
  const displayAmountMagnitude = (record: RecordItem) =>
    convertAmount(parseAmount(record.amount), record.currency)
  const runningBalanceAccountKey = useMemo(
    () => Array.from(runningBalanceAccountIds).sort().join("|"),
    [runningBalanceAccountIds]
  )
  const isRunningBalanceAccount = (account: Account) =>
    runningBalanceAccountIds.size === 0
      ? isPersonalAccount(account)
      : runningBalanceAccountIds.has(account.id)
  const runningBalanceSignedAmount = (record: RecordItem) => {
    const value = parseAmount(record.amount)
    const fromTracked = isRunningBalanceAccount(record.accountFrom)
    const toTracked = isRunningBalanceAccount(record.payeeTo)
    if (fromTracked && toTracked) return 0
    if (toTracked) return value
    if (fromTracked) return -value
    return 0
  }

  const recordsWithBalance = useMemo(() => {
    let runningBalance = 0
    return records.map((record) => {
      runningBalance += convertAmount(runningBalanceSignedAmount(record), record.currency)
      return { ...record, runningBalance }
    })
  }, [records, displayCurrency, rateByFromCurrency, currentUserEmail, runningBalanceAccountKey])

  const getMonthRange = (date: Date) => {
    const from = new Date(date.getFullYear(), date.getMonth(), 1)
    const to = new Date(date.getFullYear(), date.getMonth() + 1, 0)
    return { from, to }
  }

  const getYearRange = (year: number) => ({
    from: new Date(year, 0, 1),
    to: new Date(year, 11, 31),
  })

  const isSameCalendarDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()

  const isCalendarYearRange = Boolean(
    calendarRange?.from &&
    calendarRange?.to &&
    calendarRange.from.getFullYear() === calendarRange.to.getFullYear() &&
    calendarRange.from.getMonth() === 0 &&
    calendarRange.from.getDate() === 1 &&
    calendarRange.to.getMonth() === 11 &&
    calendarRange.to.getDate() === 31
  )
  const selectedCalendarDay =
    !isCalendarYearRange &&
    calendarRange?.from &&
    calendarRange?.to &&
    isSameCalendarDay(calendarRange.from, calendarRange.to)
      ? calendarRange.from
      : undefined
  const selectedCalendarMonth = isCalendarYearRange ? undefined : calendarRange?.from
  const selectedCalendarYear = calendarYear
  const monthButtons = useMemo(
    () =>
      Array.from({ length: 12 }, (_, month) => ({
        month,
        date: new Date(selectedCalendarYear, month, 1),
        label: new Date(selectedCalendarYear, month, 1).toLocaleString(undefined, {
          month: "short",
        }),
      })),
    [selectedCalendarYear]
  )
  const flaggedCalendarDateSet = useMemo(
    () => new Set(flaggedCalendarDates),
    [flaggedCalendarDates]
  )

  const setCalendarYearSelection = (nextYear: number) => {
    if (!Number.isFinite(nextYear)) return
    const normalizedYear = Math.min(9999, Math.max(1900, Math.trunc(nextYear)))
    setCalendarYear(normalizedYear)
    if (!selectedCalendarMonth) {
      setCalendarRange(getYearRange(normalizedYear))
      setPage(1)
      return
    }

    const month = selectedCalendarMonth.getMonth()
    if (selectedCalendarDay) {
      const maxDay = new Date(normalizedYear, month + 1, 0).getDate()
      const day = Math.min(selectedCalendarDay.getDate(), maxDay)
      const nextDate = new Date(normalizedYear, month, day)
      setCalendarRange({ from: nextDate, to: nextDate })
    } else {
      setCalendarRange(getMonthRange(new Date(normalizedYear, month, 1)))
    }
    setPage(1)
  }

  const toggleFlaggedCalendarDate = (date: Date) => {
    const value = formatDateValue(date)
    setFlaggedCalendarDates((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value].sort()
    )
  }

  const showCalendarDate = (date: Date) => {
    setCalendarRange({ from: date, to: date })
    setGroupBy("date")
    setPage(1)
  }

  useEffect(() => {
    if (!selectedCalendarDay) return
    const nextDate = formatDateValue(selectedCalendarDay)
    setNewRow((current) =>
      current.date === nextDate ? current : { ...current, date: nextDate }
    )
  }, [selectedCalendarDay])

  useEffect(() => {
    if (!calendarRange?.from) return
    setCalendarYear(calendarRange.from.getFullYear())
  }, [calendarRange?.from])

  const isWithinDateFilter = (dateText: string) => {
    if (!calendarRange?.from || !calendarRange?.to) return true
    const value = parseDateValue(dateText)
    if (!value) return false
    const from = new Date(calendarRange.from.getFullYear(), calendarRange.from.getMonth(), calendarRange.from.getDate())
    const to = new Date(calendarRange.to.getFullYear(), calendarRange.to.getMonth(), calendarRange.to.getDate())
    const target = new Date(value.getFullYear(), value.getMonth(), value.getDate())
    return target >= from && target <= to
  }

  const filteredRecords = useMemo(() => {
    const query = filters.query.trim().toLowerCase()
    const account = filters.account.trim().toLowerCase()
    const type = filters.type.trim().toLowerCase()
    const category = filters.category.trim().toLowerCase()
    const minAmount = filters.minAmount ? Number.parseFloat(filters.minAmount) : null
    const maxAmount = filters.maxAmount ? Number.parseFloat(filters.maxAmount) : null

    return recordsWithBalance.filter((record) => {
      const recordAmount = Math.abs(parseAmount(record.amount))

      const matchesQuery =
        !query ||
        record.detail.toLowerCase().includes(query) ||
        record.description.toLowerCase().includes(query) ||
        record.payeeTo.displayName.toLowerCase().includes(query) ||
        record.accountFrom.displayName.toLowerCase().includes(query)
      const matchesType = !type || record.type.toLowerCase().includes(type)
      const matchesCategory =
        !category || record.category.toLowerCase().includes(category)
      const matchesAccount =
        !account ||
        record.accountFrom.displayName.toLowerCase().includes(account) ||
        record.payeeTo.displayName.toLowerCase().includes(account)
      const matchesMin = minAmount === null || recordAmount >= minAmount
      const matchesMax = maxAmount === null || recordAmount <= maxAmount
      const matchesRange = isWithinDateFilter(record.date)

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
  }, [calendarRange, filters, recordsWithBalance])

  const sortedRecords = useMemo(
    () =>
      [...filteredRecords].sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date)
        if (dateCompare !== 0) {
          return sortDirection === "asc" ? dateCompare : -dateCompare
        }
        const indexCompare = a.index - b.index
        if (indexCompare !== 0) return indexCompare
        const createdAtCompare = a.createdAt.localeCompare(b.createdAt)
        if (createdAtCompare !== 0) return createdAtCompare
        return a.id.localeCompare(b.id)
      }),
    [filteredRecords, sortDirection]
  )

  const captureRowRects = (ids: string[]) => {
    const rects = new Map<string, DOMRect>()
    ids.forEach((id) => {
      const row = rowRefs.current[id]
      if (row) rects.set(id, row.getBoundingClientRect())
    })
    return rects
  }

  const animateRowsFrom = (previousRects: Map<string, DOMRect>) => {
    requestAnimationFrame(() => {
      previousRects.forEach((previousRect, id) => {
        const row = rowRefs.current[id]
        if (!row) return
        const nextRect = row.getBoundingClientRect()
        const deltaX = previousRect.left - nextRect.left
        const deltaY = previousRect.top - nextRect.top
        if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return

        row.animate(
          [
            {
              transform: `translate(${deltaX}px, ${deltaY}px)`,
              opacity: 0.92,
            },
            {
              transform: "translate(0, 0)",
              opacity: 1,
            },
          ],
          {
            duration: 240,
            easing: "cubic-bezier(0.2, 0, 0, 1)",
          }
        )
      })
    })
  }

  const recordToPayload = (record: RecordItem) => ({
    id: record.id,
    date: record.date,
    index: record.index,
    account_from_id: record.accountFrom.id,
    payee_to_id: record.payeeTo.id,
    waived_by_account_id: record.waivedBy?.id ?? null,
    type: record.type,
    amount: record.amount,
    currency: record.currency,
    detail: record.detail,
    description: record.description,
    category: record.category,
    flagged: record.flagged,
  })

  const persistRecordIndexes = async (items: RecordItem[]) => {
    const updatedApis = await Promise.all(
      items.map((record) =>
        invoke<RecordApi>("update_record", {
          payload: recordToPayload(record),
        })
      )
    )
    return updatedApis
      .map((record) => mapRecordFromApi(record, accounts))
      .filter((record): record is RecordItem => Boolean(record))
  }

  const reorderRecordsWithinDate = async (fromId: string, toId: string) => {
    if (fromId === toId) return
    const fromRecord = records.find((record) => record.id === fromId)
    const toRecord = records.find((record) => record.id === toId)
    if (!fromRecord || !toRecord || fromRecord.date !== toRecord.date) {
      toast.error("Rows can only be reordered within the same date")
      return
    }

    const dateRecords = [...records]
      .filter((record) => record.date === fromRecord.date)
      .sort((a, b) => {
        const indexCompare = a.index - b.index
        if (indexCompare !== 0) return indexCompare
        const createdAtCompare = a.createdAt.localeCompare(b.createdAt)
        if (createdAtCompare !== 0) return createdAtCompare
        return a.id.localeCompare(b.id)
      })
    const fromIndex = dateRecords.findIndex((record) => record.id === fromId)
    const toIndex = dateRecords.findIndex((record) => record.id === toId)
    if (fromIndex < 0 || toIndex < 0) return

    const [moved] = dateRecords.splice(fromIndex, 1)
    dateRecords.splice(toIndex, 0, moved)
    const reindexed = dateRecords.map((record, index) => ({
      ...record,
      index: index + 1,
    }))
    const changedRecords = reindexed.filter((next) => {
      const previous = records.find((record) => record.id === next.id)
      return previous?.index !== next.index
    })
    if (changedRecords.length === 0) return
    const animationIds = reindexed.map((record) => record.id)
    const previousRects = captureRowRects(animationIds)

    setRecords((current) =>
      current.map((record) => reindexed.find((item) => item.id === record.id) ?? record)
    )
    animateRowsFrom(previousRects)

    try {
      await persistRecordIndexes(changedRecords)
    } catch {
      const animationIds = changedRecords.map((record) => record.id)
      const rollbackRects = captureRowRects(animationIds)
      setRecords((current) =>
        current.map((record) =>
          changedRecords.some((item) => item.id === record.id)
            ? records.find((item) => item.id === record.id) ?? record
            : record
        )
      )
      animateRowsFrom(rollbackRects)
      toast.error("Could not save new row order. Reverted the change.")
    }
  }

  const handleTransactionDragEnd = (result: DropResult) => {
    if (!result.destination) return
    if (result.source.index === result.destination.index) return

    const fromRecord = paginatedRecords[result.source.index]
    const toRecord = paginatedRecords[result.destination.index]
    if (!fromRecord || !toRecord) return

    void reorderRecordsWithinDate(fromRecord.id, toRecord.id)
  }

  const totalPages = Math.max(1, Math.ceil(sortedRecords.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])
  const pageJumpItems = useMemo(() => {
    const windowSize = 5
    const start = Math.max(
      1,
      Math.min(currentPage - 2, Math.max(1, totalPages - windowSize + 1))
    )
    const end = Math.min(totalPages, start + windowSize - 1)
    return Array.from({ length: end - start + 1 }, (_, index) => start + index)
  }, [currentPage, totalPages])
  const startIndex = (currentPage - 1) * pageSize
  const endIndex = startIndex + pageSize
  const paginatedRecords = useMemo(
    () => sortedRecords.slice(startIndex, endIndex),
    [endIndex, sortedRecords, startIndex]
  )
  const isGroupedByDate = !spreadsheetMode && groupBy === "date"
  const visibleColumnCount = 9
  const selectedRecords = useMemo(
    () => records.filter((record) => selectedRecordIds.has(record.id)),
    [records, selectedRecordIds]
  )
  const selectedCount = selectedRecordIds.size
  const allFilteredRecordsSelected =
    filteredRecords.length > 0 &&
    filteredRecords.every((record) => selectedRecordIds.has(record.id))

  useEffect(() => {
    setSelectedRecordIds((current) => {
      const existingIds = new Set(records.map((record) => record.id))
      const next = new Set([...current].filter((id) => existingIds.has(id)))
      return next.size === current.size ? current : next
    })
  }, [records])

  const toggleRecordSelection = (id: string) => {
    setSelectedRecordIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleFilteredSelection = () => {
    setSelectedRecordIds((current) => {
      const next = new Set(current)
      if (allFilteredRecordsSelected) {
        filteredRecords.forEach((record) => next.delete(record.id))
      } else {
        filteredRecords.forEach((record) => next.add(record.id))
      }
      return next
    })
  }

  const clearSelection = () => setSelectedRecordIds(new Set())

  const bulkSetFlag = async (flagged: boolean) => {
    if (selectedRecords.length === 0) return
    const previousRecords = records
    const nextRecords = records.map((record) =>
      selectedRecordIds.has(record.id) ? { ...record, flagged } : record
    )
    setRecords(nextRecords)
    try {
      await Promise.all(
        nextRecords
          .filter((record) => selectedRecordIds.has(record.id))
          .map((record) =>
            invoke<RecordApi>("update_record", { payload: recordToPayload(record) })
          )
      )
      toast.success(flagged ? "Transactions flagged" : "Transactions unflagged")
    } catch {
      setRecords(previousRecords)
      toast.error("Failed to update selected transactions")
    }
  }

  const bulkDeleteSelected = async () => {
    if (selectedRecords.length === 0) return
    const previousRecords = records
    const selectedIds = new Set(selectedRecordIds)
    setRecords((current) => current.filter((record) => !selectedIds.has(record.id)))
    clearSelection()
    try {
      await Promise.all(
        [...selectedIds].map((id) => invoke("delete_record", { id }))
      )
      toast.success("Selected transactions deleted")
    } catch {
      setRecords(previousRecords)
      setSelectedRecordIds(selectedIds)
      toast.error("Failed to delete selected transactions")
    }
  }

  const dateSpentByDay = useMemo(
    () =>
      paginatedRecords.reduce<Record<string, number>>((acc, record) => {
        if (record.type !== "Expense" || isRefundRecord(record)) return acc
        acc[record.date] = (acc[record.date] ?? 0) + Math.abs(displaySignedAmount(record))
        return acc
      }, {}),
    [paginatedRecords, displayCurrency, rateByFromCurrency, currentUserEmail]
  )
  const dateCountByDay = useMemo(
    () =>
      paginatedRecords.reduce<Record<string, number>>((acc, record) => {
        acc[record.date] = (acc[record.date] ?? 0) + 1
        return acc
      }, {}),
    [paginatedRecords]
  )

  const formatMoney = (value: number) => {
    const sign = value < 0 ? "-" : ""
    return `${sign}${Math.abs(value).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }

  const getSpendingByView = () => {
    const now = new Date()
    const expenseRecords = records.filter(
      (record) => record.type === "Expense" && !isRefundRecord(record)
    )
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
        add(d.toLocaleString(undefined, { month: "short" }), value)
      if (spendingView === "weekly") {
        const start = new Date(d)
        start.setDate(d.getDate() - d.getDay())
        add(
          `${start.toLocaleString(undefined, { month: "short" })} ${start.getDate()}`,
          value
        )
      }
      if (spendingView === "daily")
        add(d.toLocaleString(undefined, { month: "short", day: "numeric" }), value)
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

  const spendingData = useMemo(() => {
    const spending = getSpendingByView()
    return spending.labels.map((label, index) => ({
      period: label,
      value: spending.values[index] ?? 0,
    }))
  }, [records, spendingView])
  const spendingChartConfig = {
    value: {
      label: "Spending",
      color: "oklch(0.55 0 0)",
    },
  } satisfies ChartConfig

  const lineData = useMemo(() => {
    const groupedDaily = filteredRecords.reduce<Record<string, number>>((acc, record) => {
      acc[record.date] = (acc[record.date] ?? 0) + signedAmount(record)
      return acc
    }, {})
    return Object.entries(groupedDaily)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({
        period: date.slice(5),
        amount,
        pos: amount > 0 ? amount : 0,
        neg: amount < 0 ? amount : 0,
      }))
  }, [filteredRecords, currentUserEmail])
  const lineChartConfig = {
    amount: {
      label: "Net Flow",
      color: "oklch(0.55 0 0)",
    },
  } satisfies ChartConfig

  const makeRecordId = () => `r${Date.now()}-${Math.floor(Math.random() * 10000)}`

  const startEdit = (record: RecordItem) => {
    setEditingId(record.id)
    setDraft(
      isPersonalAccountTransfer(record.accountFrom, record.payeeTo)
        ? { ...record, category: "Transfer" }
        : { ...record }
    )
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraft(null)
  }

  const saveEdit = async () => {
    if (!draft) return
    const previousRecord = records.find((record) => record.id === draft.id)
    const normalizedDraft = {
      ...draft,
      amount: formatAmountFixed(draft.amount),
      category: isPersonalAccountTransfer(draft.accountFrom, draft.payeeTo)
        ? "Transfer"
        : draft.category,
    }
    let updatedRecord = normalizedDraft
    try {
      const updatedApi = await invoke<RecordApi>("update_record", {
        payload: {
          ...recordToPayload(normalizedDraft),
          index:
            previousRecord?.date === normalizedDraft.date ? normalizedDraft.index : undefined,
        },
      })
      updatedRecord = mapRecordFromApi(updatedApi, accounts) ?? normalizedDraft
    } catch {
      toast.error("Failed to update row")
      return
    }
    setRecords((current) =>
      current.map((record) =>
        record.id === updatedRecord.id ? updatedRecord : record
      )
    )
    window.dispatchEvent(new CustomEvent("record:update", { detail: updatedRecord }))
    setEditingId(null)
    setDraft(null)
    toast.success("Row updated")
  }

  const swapRecordParties = async (record: RecordItem) => {
    if (editingId === record.id && draft) {
      setDraft((current) =>
        current
          ? {
              ...current,
              accountFrom: current.payeeTo,
              payeeTo: current.accountFrom,
            }
          : current
      )
      return
    }

    const swappedRecord = {
      ...record,
      accountFrom: record.payeeTo,
      payeeTo: record.accountFrom,
    }

    try {
      const updatedApi = await invoke<RecordApi>("update_record", {
        payload: recordToPayload(swappedRecord),
      })
      const updatedRecord = mapRecordFromApi(updatedApi, accounts) ?? swappedRecord
      setRecords((current) =>
        current.map((item) => (item.id === updatedRecord.id ? updatedRecord : item))
      )
      window.dispatchEvent(new CustomEvent("record:update", { detail: updatedRecord }))
    } catch {
      toast.error("Failed to switch sender and recipient")
    }
  }

  const toggleRecordFlag = async (record: RecordItem) => {
    const nextRecord = { ...record, flagged: !record.flagged }
    setRecords((current) =>
      current.map((item) => (item.id === nextRecord.id ? nextRecord : item))
    )

    try {
      const updatedApi = await invoke<RecordApi>("update_record", {
        payload: recordToPayload(nextRecord),
      })
      const updatedRecord = mapRecordFromApi(updatedApi, accounts) ?? nextRecord
      setRecords((current) =>
        current.map((item) => (item.id === updatedRecord.id ? updatedRecord : item))
      )
      window.dispatchEvent(new CustomEvent("record:update", { detail: updatedRecord }))
    } catch {
      setRecords((current) =>
        current.map((item) => (item.id === record.id ? record : item))
      )
      toast.error("Failed to update flag")
    }
  }

  const confirmDeleteRecord = async () => {
    if (!deleteDialogRecord) return

    setDeleteSaving(true)
    try {
      await invoke("delete_record", { id: deleteDialogRecord.id })
      setRecords((current) => current.filter((item) => item.id !== deleteDialogRecord.id))
      setDeleteDialogOpen(false)
      setDeleteDialogRecord(null)
      toast.success("Transaction deleted")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete transaction")
    } finally {
      setDeleteSaving(false)
    }
  }

  const updateRecordCell = (
    recordId: string,
    key: "date" | "type" | "amount" | "currency" | "category" | "detail",
    value: string
  ) => {
    setRecords((current) =>
      current.map((record) => {
        if (record.id !== recordId) return record
        if (key === "type") return { ...record, type: value as RecordType }
        if (key === "category") return { ...record, category: value as Category }
        if (key === "amount") return { ...record, amount: value }
        if (key === "currency") return { ...record, currency: value }
        if (key === "detail") return { ...record, detail: value }
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

  const updateDraft = <K extends keyof RecordItem>(key: K, value: RecordItem[K]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current))
  }

  const updateDraftAccount = (side: "accountFrom" | "payeeTo", account: Account) => {
    setDraft((current) => {
      if (!current) return current
      const next = { ...current, [side]: account }
      return isPersonalAccountTransfer(next.accountFrom, next.payeeTo)
        ? { ...next, category: "Transfer" }
        : next
    })
  }

  const handleEditKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter") return
    event.preventDefault()
    void saveEdit()
  }

  const createRecordFromNewRow = (): RecordItem | null => {
    const committedNewRow = { ...newRow, ...newRowTransientRef.current }
    const accountFrom = accounts.find((item) => item.id === committedNewRow.accountFromId)
    const payeeTo = accounts.find((item) => item.id === committedNewRow.payeeToId)
    if (!accountFrom || !payeeTo) return null
    const lockedCategory = isPersonalAccountTransfer(accountFrom, payeeTo)
      ? "Transfer"
      : committedNewRow.category
    const date = committedNewRow.date.trim()
    return {
      id: makeRecordId(),
      date,
      createdAt: new Date().toISOString(),
      index:
        Math.max(
          0,
          ...records.filter((record) => record.date === date).map((record) => record.index)
        ) + 1,
      accountFrom,
      payeeTo,
      type: committedNewRow.type,
      amount: formatAmountFixed(committedNewRow.amount.trim()),
      currency: committedNewRow.currency.trim(),
      waivedBy: committedNewRow.waivedByAccountId
        ? accounts.find((item) => item.id === committedNewRow.waivedByAccountId) ?? null
        : null,
      detail: committedNewRow.detail.trim(),
      description: committedNewRow.description.trim(),
      category: lockedCategory,
      flagged: false,
    }
  }

  const appendNewRowRecord = async () => {
    const nextRecord = createRecordFromNewRow()
    if (!nextRecord) return
    if (!nextRecord.date || !nextRecord.amount) {
      toast.error("Date and amount are required")
      return
    }
    let created: RecordItem | null = null
    try {
      const createdApi = await invoke<RecordApi>("create_record", {
        payload: {
          id: nextRecord.id,
          date: nextRecord.date,
          index: nextRecord.index,
          account_from_id: nextRecord.accountFrom.id,
          payee_to_id: nextRecord.payeeTo.id,
          waived_by_account_id: nextRecord.waivedBy?.id ?? null,
          type: nextRecord.type,
          amount: nextRecord.amount,
          currency: nextRecord.currency,
          detail: nextRecord.detail,
          description: nextRecord.description,
          category: nextRecord.category,
          flagged: nextRecord.flagged,
        },
      })
      created = mapRecordFromApi(createdApi, accounts)
    } catch {
      toast.error("Failed to save row")
      return
    }
    if (!created) {
      toast.error("Saved row could not be rendered")
      return
    }
    setRecords((current) => [...current, created])
    window.dispatchEvent(new CustomEvent("record:update", { detail: created }))
    const previousSelection = {
      date: nextRecord.date,
      accountFromId: nextRecord.accountFrom.id,
      payeeToId: nextRecord.payeeTo.id,
      category: nextRecord.category,
    }
    newRowTransientRef.current = {}
    setNewRow({
      ...defaultNewRow(personalAccounts, accounts),
      ...previousSelection,
    })
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
        if (event.key === "Enter" && row >= paginatedRecords.length) {
          void appendNewRowRecord()
          return
        }
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
    const accountPool = side === "accountFromId" ? personalAccounts : accounts
    const existing = accountPool.find(
      (account) => account.displayName.toLowerCase() === trimmed.toLowerCase()
    )
    if (existing) {
      const nextFromId = side === "accountFromId" ? existing.id : newRow.accountFromId
      const nextPayeeId = side === "payeeToId" ? existing.id : newRow.payeeToId
      const nextFrom = accounts.find((account) => account.id === nextFromId)
      const nextPayee = accounts.find((account) => account.id === nextPayeeId)
      setNewRow((current) => ({
        ...current,
        [side]: existing.id,
        category: isPersonalAccountTransfer(nextFrom, nextPayee)
          ? "Transfer"
          : nextPayee?.defaultCategory ?? current.category,
      }))
      return
    }
    const created: Account = {
      id: `acc-local-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      displayName: trimmed,
      accountName: trimmed.split(/\s+/).slice(0, 3).join(" "),
      ownerEmail: side === "accountFromId" ? currentUserEmail : null,
      defaultCategory: null,
    }
    setAccounts((current) => [...current, created])
    const nextFromId = side === "accountFromId" ? created.id : newRow.accountFromId
    const nextPayeeId = side === "payeeToId" ? created.id : newRow.payeeToId
    const nextFrom = side === "accountFromId" ? created : accounts.find((account) => account.id === nextFromId)
    const nextPayee = side === "payeeToId" ? created : accounts.find((account) => account.id === nextPayeeId)
    setNewRow((current) => ({
      ...current,
      [side]: created.id,
      category: isPersonalAccountTransfer(nextFrom, nextPayee)
        ? "Transfer"
        : nextPayee?.defaultCategory ?? current.category,
    }))
  }

  const renderAccountDisplay = (account: Account) => {
    const photo = accountPhotos[account.id]
    const LogoIcon = isNAAccount(account)
      ? QuestionIcon
      : account.id === "acc-payroll"
      ? BankIcon
      : HouseIcon
    return (
      <div className="inline-flex min-w-0 max-w-full items-center gap-1.5 px-1">
        {photo ? (
          <img
            src={photo}
            alt={account.displayName}
            className="size-5 shrink-0 border object-cover"
          />
        ) : (
          <span className="inline-flex size-5 shrink-0 items-center justify-center border bg-muted">
            <LogoIcon className="size-3.5" />
          </span>
        )}
        <span className="min-w-0 truncate">{account.displayName}</span>
      </div>
    )
  }

  const applyWaiveAccount = async (record: RecordItem, waivedAccountId: string) => {
    const waivedAccount =
      waivedAccountId.trim().length > 0
        ? accounts.find((item) => item.id === waivedAccountId.trim()) ?? null
        : null
    if (waivedAccountId.trim().length > 0 && !waivedAccount) {
      toast.error("Account not found")
      return
    }
    const nextRecord = { ...record, waivedBy: waivedAccount }
    setWaiveDialogSaving(true)
    try {
      await invoke<RecordApi>("update_record", {
        payload: recordToPayload(nextRecord),
      })
      setRecords((current) =>
        current.map((item) => (item.id === nextRecord.id ? nextRecord : item))
      )
      toast.success(nextRecord.waivedBy ? "Waive updated" : "Waive cleared")
      setWaiveDialogOpen(false)
      setWaiveDialogRecord(null)
      setWaiveDialogAccountId("")
    } catch {
      toast.error("Failed to update waive")
    } finally {
      setWaiveDialogSaving(false)
    }
  }

  const openSplitDialog = (record: RecordItem) => {
    const total = Math.abs(parseAmount(record.amount))
    const first = (total / 2).toFixed(2)
    const second = (total - Number.parseFloat(first)).toFixed(2)
    setSplitDialogRecord(record)
    setSplitRows([
      {
        id: `split-${Date.now()}-1`,
        amount: first,
        type: record.type,
        detail: record.detail,
        waivedByAccountId: record.waivedBy?.id ?? "",
      },
      {
        id: `split-${Date.now()}-2`,
        amount: second,
        type: record.type,
        detail: record.detail,
        waivedByAccountId: record.waivedBy?.id ?? "",
      },
    ])
    setSplitDialogOpen(true)
  }

  const applySplit = async () => {
    if (!splitDialogRecord) return
    const expectedTotal = Math.abs(parseAmount(splitDialogRecord.amount))
    const splitTotal = splitRows.reduce((sum, row) => sum + parseAmount(row.amount), 0)
    if (splitRows.length < 2) {
      toast.error("Add at least 2 split rows")
      return
    }
    if (splitRows.some((row) => parseAmount(row.amount) <= 0)) {
      toast.error("Each split amount must be greater than 0")
      return
    }
    if (Math.abs(splitTotal - expectedTotal) > 0.01) {
      toast.error(`Split total must equal ${expectedTotal.toFixed(2)}`)
      return
    }
    setSplitSaving(true)
    try {
      const first = splitRows[0]
      const firstPayload = {
        id: splitDialogRecord.id,
        date: splitDialogRecord.date,
        index: splitDialogRecord.index,
        account_from_id: splitDialogRecord.accountFrom.id,
        payee_to_id: splitDialogRecord.payeeTo.id,
        waived_by_account_id: first.waivedByAccountId || null,
        type: first.type,
        amount: parseAmount(first.amount).toFixed(2),
        currency: splitDialogRecord.currency,
        detail: first.detail.trim() || splitDialogRecord.detail,
        description: splitDialogRecord.description,
        category: splitDialogRecord.category,
        flagged: splitDialogRecord.flagged,
      }
      const updatedApi = await invoke<RecordApi>("update_record", { payload: firstPayload })
      const createdItems: RecordItem[] = []
      for (const row of splitRows.slice(1)) {
        const createdApi = await invoke<RecordApi>("create_record", {
          payload: {
            id: makeRecordId(),
            date: splitDialogRecord.date,
            account_from_id: splitDialogRecord.accountFrom.id,
            payee_to_id: splitDialogRecord.payeeTo.id,
            waived_by_account_id: row.waivedByAccountId || null,
            type: row.type,
            amount: parseAmount(row.amount).toFixed(2),
            currency: splitDialogRecord.currency,
            detail: row.detail.trim() || splitDialogRecord.detail,
            description: splitDialogRecord.description,
            category: splitDialogRecord.category,
            flagged: splitDialogRecord.flagged,
          },
        })
        const mapped = mapRecordFromApi(createdApi, accounts)
        if (mapped) createdItems.push(mapped)
      }
      const updatedMapped = mapRecordFromApi(updatedApi, accounts)
      setRecords((current) => {
        const base = current.map((item) =>
          item.id === splitDialogRecord.id && updatedMapped ? updatedMapped : item
        )
        return [...base, ...createdItems]
      })
      toast.success("Transaction split saved")
      setSplitDialogOpen(false)
      setSplitDialogRecord(null)
      setSplitRows([])
    } catch {
      toast.error("Failed to split transaction")
    } finally {
      setSplitSaving(false)
    }
  }

  const createAccount = async (name: string, ownerEmail?: string | null) => {
    const base = name.trim()
    if (!base) return null
    const next: Account = {
      id: `acc-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      displayName: base,
      accountName: `${base} Account`,
      ownerEmail: ownerEmail ?? null,
      defaultCategory: null,
    }
    try {
      const createdApi = await invoke<AccountApi>("create_account", {
        payload: {
          id: next.id,
          display_name: next.accountName,
          account_name: next.displayName,
          type: "other",
          owner_email: next.ownerEmail,
          default_category: next.defaultCategory,
        },
      })
      const created = mapAccountFromApi(createdApi)
      setAccounts((current) => [...current, created])
      return created
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : `Failed to create account: ${String(error)}`
      )
      return null
    }
  }

  const categoryOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...categories.map((c) => c.name),
          ...records.map((record) => record.category).filter(Boolean),
          newRow.category,
          draft?.category ?? "",
        ])
      ).filter(Boolean),
    [categories, draft?.category, newRow.category, records]
  )

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
            className="h-7 w-32 justify-start rounded-none px-1.5 text-left text-xs font-normal"
          >
            <CalendarBlankIcon className="mr-1 size-3.5 text-muted-foreground" />
            {value || "DD-MM-YYYY"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto rounded-none p-0" align="start">
          <Calendar
            mode="single"
            defaultMonth={selectedDate}
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

  const newRowAccountFrom = accounts.find(
    (item) => item.id === (newRowTransientRef.current.accountFromId ?? newRow.accountFromId)
  )
  const newRowPayeeTo = accounts.find(
    (item) => item.id === (newRowTransientRef.current.payeeToId ?? newRow.payeeToId)
  )
  const newRowCategoryLocked = isPersonalAccountTransfer(newRowAccountFrom, newRowPayeeTo)

  return (
    <div className="w-full pb-20 pt-4 md:mx-auto md:max-w-7xl md:px-1 md:pt-6">
      <div className="mb-3 flex items-center justify-start gap-2 px-1.5 md:px-0">
        <div className="relative w-full max-w-sm">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search records..."
            value={filters.query}
            onChange={(event) => {
              setFilters((current) => ({ ...current, query: event.target.value }))
              setPage(1)
            }}
            className="h-8 rounded-none bg-white pr-14 pl-7 text-xs"
          />
          <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10px] text-muted-foreground">
            {filteredRecords.length}
          </span>
        </div>
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-none" aria-label="Group by">
              <RowsIcon className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36 rounded-none p-1">
            <DropdownMenuCheckboxItem
              checked={groupBy === "none"}
              onSelect={(event) => {
                event.preventDefault()
                setGroupBy("none")
              }}
            >
              None
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={groupBy === "date"}
              onSelect={(event) => {
                event.preventDefault()
                setGroupBy("date")
              }}
            >
              Date
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-none px-2 text-[10px] uppercase tracking-wide"
          onClick={() => {
            setSortDirection((current) => (current === "desc" ? "asc" : "desc"))
            setPage(1)
          }}
        >
          {sortDirection === "desc" ? "Newest first" : "Oldest first"}
        </Button>
      </div>
      <div className="flex w-full flex-col gap-4 lg:grid lg:grid-cols-2">
        <div className="hidden overflow-hidden border-y bg-card p-4 lg:block lg:border">
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
              <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={6} />
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
        <div className="w-full border-y bg-card p-4 md:col-span-1 md:border">
          <div className="mb-4">
            <h2 className="text-lg font-semibold leading-none tracking-tight">Spending</h2>
            <p className="mt-1 text-xs text-muted-foreground">6-month category history.</p>
          </div>
          <div className="border-t pt-4">
            <ChartContainer config={lineChartConfig} className="h-44 w-full">
              <AreaChart data={lineData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="tx-positive" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#15803d" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#15803d" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="tx-negative" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#b91c1c" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#b91c1c" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="period" tickLine={false} axisLine={false} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => (
                        <span>{`${name} ${Number(value).toLocaleString()}`}</span>
                      )}
                    />
                  }
                />
                <Area type="monotone" dataKey="pos" stroke="none" fill="url(#tx-positive)" />
                <Area type="monotone" dataKey="neg" stroke="none" fill="url(#tx-negative)" />
                <Line type="monotone" dataKey="amount" stroke="#d4d4d8" strokeOpacity={0.55} strokeWidth={2} dot={false} />
              </AreaChart>
            </ChartContainer>
          </div>
        </div>
        <div className="w-full overflow-hidden border-y bg-card p-4 md:border lg:col-span-2">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-center">
            <div className="flex flex-col items-center gap-2">
              <div className="flex w-56 items-center border">
                <button
                  type="button"
                  onClick={() => setCalendarYearSelection(selectedCalendarYear - 1)}
                  className="inline-flex h-7 w-8 items-center justify-center hover:bg-muted"
                  aria-label="Previous year"
                >
                  <CaretLeftIcon size={14} weight="bold" />
                </button>
                <Input
                  type="number"
                  min={1900}
                  max={9999}
                  value={selectedCalendarYear}
                  onChange={(event) =>
                    setCalendarYearSelection(Number.parseInt(event.target.value, 10))
                  }
                  className="h-7 flex-1 rounded-none border-0 border-x px-2 text-center text-xs shadow-none [appearance:textfield] focus-visible:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  aria-label="Selected year"
                />
                <button
                  type="button"
                  onClick={() => setCalendarYearSelection(selectedCalendarYear + 1)}
                  className="inline-flex h-7 w-8 items-center justify-center hover:bg-muted"
                  aria-label="Next year"
                >
                  <CaretRightIcon size={14} weight="bold" />
                </button>
              </div>
              <div className="grid w-56 grid-cols-3 border [&>button:not(:nth-child(3n))]:border-r [&>button:nth-child(-n+9)]:border-b">
                {monthButtons.map((item) => {
                  const selected =
                    selectedCalendarMonth?.getFullYear() === selectedCalendarYear &&
                    selectedCalendarMonth?.getMonth() === item.month
                  const now = new Date()
                  const isCurrentMonth =
                    item.date.getFullYear() === now.getFullYear() &&
                    item.date.getMonth() === now.getMonth()
                  return (
                    <button
                      key={item.month}
                      type="button"
                      onClick={() => {
                        setCalendarRange(
                          selected
                            ? getYearRange(selectedCalendarYear)
                            : getMonthRange(item.date)
                        )
                        setGroupBy("date")
                        setPage(1)
                      }}
                      className={`h-7 px-3 text-[10px] uppercase tracking-wide ${
                        selected
                          ? "bg-black text-white"
                          : isCurrentMonth
                          ? "bg-violet-100/70 text-violet-900 hover:bg-violet-100"
                          : "hover:bg-muted"
                      }`}
                    >
                      {item.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div
              className={`flex justify-center border-t pt-3 md:border-t-0 md:border-l md:pt-0 md:pl-3 ${
                selectedCalendarMonth ? "" : "pointer-events-none opacity-40"
              }`}
            >
              <CalendarWithTotals
                mode="single"
                month={selectedCalendarMonth}
                selected={selectedCalendarDay}
                onSelect={(next) => {
                  if (!next) {
                    if (selectedCalendarDay) {
                      setCalendarRange(getMonthRange(selectedCalendarDay))
                      setGroupBy("date")
                      setPage(1)
                    }
                    return
                  }
                  if (!selectedCalendarMonth) return
                  setCalendarRange(
                    selectedCalendarDay && isSameCalendarDay(selectedCalendarDay, next)
                      ? getMonthRange(next)
                      : { from: next, to: next }
                  )
                  setGroupBy("date")
                  setPage(1)
                }}
                numberOfMonths={1}
                captionLayout="dropdown"
                formatters={{
                  formatMonthDropdown: (date) =>
                    date.toLocaleString("default", { month: "long" }),
                }}
                classNames={{
                  nav: "hidden",
                  month_caption: "hidden",
                  dropdowns: "hidden",
                  caption_label: "hidden",
                }}
                components={{
                  DayButton: (props: any) => {
                    const dateValue = formatDateValue(props.day.date)
                    const isFlagged = flaggedCalendarDateSet.has(dateValue)
                    return (
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <CalendarDayButton
                            {...props}
                            className={`${
                              isFlagged
                                ? "after:absolute after:top-0 after:right-0 after:z-20 after:size-0 after:border-t-[10px] after:border-l-[10px] after:border-t-red-600 after:border-l-transparent"
                                : ""
                            }`}
                          />
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-32">
                          <ContextMenuItem
                            onSelect={() => toggleFlaggedCalendarDate(props.day.date)}
                          >
                            {isFlagged ? "Unflag date" : "Flag date"}
                          </ContextMenuItem>
                          <ContextMenuItem onSelect={() => showCalendarDate(props.day.date)}>
                            Show date
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    )
                  },
                }}
              />
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-2">
        <div className="w-full border-y bg-card px-3 py-2 text-xs md:border md:px-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allFilteredRecordsSelected}
              onChange={toggleFilteredSelection}
              aria-label={
                allFilteredRecordsSelected
                  ? "Deselect filtered transactions"
                  : "Select filtered transactions"
              }
              className={transactionCheckboxClass}
            />
            <span className={selectedCount > 0 ? "font-medium" : "text-muted-foreground"}>
              {selectedCount > 0 ? `${selectedCount} selected` : "Select all"}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-none px-2 text-xs"
                  disabled={selectedCount === 0}
                >
                  Actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-36 rounded-none">
                <DropdownMenuItem
                  disabled={selectedCount !== 1}
                  onSelect={() => {
                    const [record] = selectedRecords
                    if (record) startEdit(record)
                  }}
                >
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={selectedCount === 0}
                  onSelect={() => void bulkSetFlag(true)}
                >
                  Flag
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={selectedCount === 0}
                  onSelect={() => void bulkSetFlag(false)}
                >
                  Unflag
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={selectedCount === 0}
                  variant="destructive"
                  onSelect={() => void bulkDeleteSelected()}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {selectedCount > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto h-7 rounded-none px-2 text-xs"
                onClick={clearSelection}
              >
                Clear
              </Button>
            ) : null}
          </div>
        </div>
        <div
          className={`no-scrollbar overflow-x-auto bg-card py-6 ${
            spreadsheetMode ? "" : "border-y md:border"
          }`}
        >
          <div className="w-max min-w-full px-3 md:px-4">
            <Table
              className={`text-[10px] ${
                spreadsheetMode
                  ? "border-collapse [&_th]:h-7 [&_th]:px-1 [&_td]:px-0 [&_td]:py-1 [&_td]:align-middle"
                  : ""
              }`}
            >
              <TableHeader>
              <TableRow className="bg-card">
                <TableHead className="top-0 z-30 w-8 min-w-8 max-w-8 bg-card text-center md:sticky">
              </TableHead>
              <TableHead className="sticky-date-cell top-0 left-0 z-40 h-8 min-w-40 bg-card uppercase tracking-wide text-muted-foreground md:sticky">
                {isGroupedByDate ? "" : "Date"}
              </TableHead>
              <TableHead className="top-0 z-30 min-w-32 max-w-36 bg-card uppercase tracking-wide text-muted-foreground md:sticky">
                Account (From)
              </TableHead>
              <TableHead className="top-0 z-30 w-7 min-w-7 max-w-7 bg-card uppercase tracking-wide text-muted-foreground" />
              <TableHead className="top-0 z-30 min-w-32 max-w-36 bg-card uppercase tracking-wide text-muted-foreground">
                Payee (To)
              </TableHead>
              <TableHead className="top-0 z-30 hidden min-w-28 max-w-32 bg-card uppercase tracking-wide text-muted-foreground md:table-cell md:sticky">
                Cat.
              </TableHead>
              <TableHead className="top-0 z-30 hidden min-w-48 max-w-64 bg-card uppercase tracking-wide text-muted-foreground md:table-cell">
                Detail
              </TableHead>
              <TableHead className="top-0 z-30 min-w-20 max-w-24 bg-card text-right uppercase tracking-wide text-muted-foreground">
                Amnt.
              </TableHead>
              <TableHead className="top-0 z-30 w-28 min-w-28 max-w-28 bg-card text-right uppercase tracking-wide text-muted-foreground">
                Bal.
              </TableHead>
            </TableRow>
          </TableHeader>
          <DragDropContext onDragEnd={handleTransactionDragEnd}>
            <Droppable droppableId="transactions-table" direction="vertical">
              {(droppableProvided) => (
          <TableBody
            ref={droppableProvided.innerRef}
            {...droppableProvided.droppableProps}
            className={spreadsheetMode ? "[&>tr:last-child_td]:border-b-0" : undefined}
          >
            {filteredRecords.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumnCount} className="p-0">
                  <Empty />
                </TableCell>
              </TableRow>
            ) : null}
            {paginatedRecords.map((record, rowIndex) => (
              <Fragment key={record.id}>
                {isGroupedByDate && (
                  (rowIndex === 0 || paginatedRecords[rowIndex - 1]?.date !== record.date) ? (
                    <TableRow className="bg-muted/40">
                      <TableCell colSpan={visibleColumnCount} className="py-2 text-xs uppercase tracking-wide text-muted-foreground">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-foreground">{record.date}</span>
                          <span className="text-right">
                            <span className="mr-3">{dateCountByDay[record.date] ?? 0} txns</span>
                            <span>
                              Spent: {formatMoney(dateSpentByDay[record.date] ?? 0)} {displayCurrency}
                            </span>
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null
                )}
                <Draggable
                  draggableId={record.id}
                  index={rowIndex}
                  isDragDisabled={spreadsheetMode || editingId === record.id}
                >
                  {(dragProvided, dragSnapshot) => (
                <ContextMenu
                  onOpenChange={() => {
                    setContextActionArmed(false)
                  }}
                >
                  <ContextMenuTrigger asChild>
                    <TableRow
                      ref={(node) => {
                        rowRefs.current[record.id] = node
                        dragProvided.innerRef(node)
                      }}
                      {...dragProvided.draggableProps}
                      className={
                        spreadsheetMode
                          ? "group border-b-0 hover:bg-transparent"
                          : `group hover:bg-muted/60 ${
                              record.flagged
                                ? "[&_td]:!bg-red-950/10 dark:[&_td]:!bg-red-950/30 [&_td:first-child]:border-l-4 [&_td:first-child]:border-l-red-900"
                                : ""
                            } ${
                              dragSnapshot.isDragging
                                ? "relative z-50 bg-card opacity-90 shadow-2xl ring-2 ring-blue-500"
                                : ""
                            }`
                      }
                    >
                    <TableCell className="w-8 min-w-8 max-w-8 bg-card text-center group-hover:bg-muted/60">
                      <input
                        type="checkbox"
                        checked={selectedRecordIds.has(record.id)}
                        onChange={() => toggleRecordSelection(record.id)}
                        onClick={(event) => event.stopPropagation()}
                        aria-label="Select transaction"
                        className={transactionCheckboxClass}
                      />
                    </TableCell>
                    <TableCell className="sticky-date-cell min-w-40 bg-card group-hover:bg-muted/60 md:sticky md:left-0 md:z-20">
                      <div className="flex items-center gap-1.5">
                        {!spreadsheetMode ? (
                          <div className="flex shrink-0 items-center gap-1">
                            {editingId !== record.id ? (
                              <button
                                type="button"
                                {...dragProvided.dragHandleProps}
                                className="inline-flex size-5 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing"
                                aria-label="Reorder transaction"
                                title="Reorder"
                              >
                                <DotsSixVerticalIcon className="size-4" />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className={`inline-flex size-5 items-center justify-center ${
                                record.flagged
                                  ? "text-red-900 dark:text-red-300"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                              aria-label={record.flagged ? "Unflag transaction" : "Flag transaction"}
                              title={record.flagged ? "Unflag" : "Flag"}
                              onClick={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                void toggleRecordFlag(record)
                              }}
                            >
                              <FlagIcon className="size-3.5" weight={record.flagged ? "fill" : "regular"} />
                            </button>
                          </div>
                        ) : null}
                        <div className="min-w-0 flex-1">
                          {isGroupedByDate && editingId !== record.id ? null : spreadsheetMode ? (
                            <Input
                              ref={registerCellRef(rowIndex, 0)}
                              value={record.date}
                              onChange={(event) =>
                                updateRecordCell(record.id, "date", event.target.value)
                              }
                              onKeyDown={handleSpreadsheetNav(rowIndex, 0)}
                              className={spreadsheetCellInputClass}
                            />
                          ) : editingId === record.id && draft ? (
                            <DatePickerInput
                              value={draft.date}
                              onChange={(next) => updateDraft("date", next)}
                            />
                          ) : (
                            record.date
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-36">
                      {spreadsheetMode ? (
                        <Input
                          ref={registerCellRef(rowIndex, 1)}
                          value={record.accountFrom.displayName}
                          onChange={(event) =>
                            updateRecordAccountCell(record.id, "accountFrom", event.target.value)
                          }
                          onKeyDown={handleSpreadsheetNav(rowIndex, 1)}
                          className={spreadsheetCellInputClass}
                        />
                      ) : editingId === record.id && draft ? (
                        <AccountCombobox
                          accounts={accounts}
                          value={draft.accountFrom.id}
                          onChange={(nextId) => {
                            const account = accounts.find((item) => item.id === nextId)
                            if (account) updateDraftAccount("accountFrom", account)
                          }}
                          onKeyDown={handleEditKeyDown}
                          createAccount={(name) => createAccount(name, currentUserEmail)}
                        />
                      ) : (
                        <span className="block truncate text-[11px]">{renderAccountDisplay(record.accountFrom)}</span>
                      )}
                    </TableCell>
                    <TableCell className="w-7 min-w-7 max-w-7 bg-card px-1 text-center group-hover:bg-muted/60">
                      {!spreadsheetMode ? (
                        <button
                          type="button"
                          className="inline-flex size-5 items-center justify-center text-muted-foreground hover:text-foreground"
                          aria-label="Switch sender and recipient"
                          title="Switch sender and recipient"
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            void swapRecordParties(record)
                          }}
                        >
                          <ArrowsLeftRightIcon className="size-3.5" />
                        </button>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-36">
                      {spreadsheetMode ? (
                        <Input
                          ref={registerCellRef(rowIndex, 2)}
                          value={record.payeeTo.displayName}
                          onChange={(event) =>
                            updateRecordAccountCell(record.id, "payeeTo", event.target.value)
                          }
                          onKeyDown={handleSpreadsheetNav(rowIndex, 2)}
                          className={spreadsheetCellInputClass}
                        />
                      ) : editingId === record.id && draft ? (
                        <AccountCombobox
                          accounts={accounts}
                          value={draft.payeeTo.id}
                          onChange={(nextId) => {
                            const account = accounts.find((item) => item.id === nextId)
                            if (account) updateDraftAccount("payeeTo", account)
                          }}
                          onKeyDown={handleEditKeyDown}
                          excludeId={draft.accountFrom.id}
                          createAccount={(name) => createAccount(name)}
                        />
                      ) : (
                        <span className="block truncate text-[11px]">{renderAccountDisplay(record.payeeTo)}</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden max-w-32 md:table-cell">
                      {spreadsheetMode ? (
                        <Input
                          ref={registerCellRef(rowIndex, 3)}
                          value={
                            isPersonalAccountTransfer(record.accountFrom, record.payeeTo)
                              ? "Transfer"
                              : record.category
                          }
                          onChange={(event) =>
                            updateRecordCell(record.id, "category", event.target.value)
                          }
                          onKeyDown={handleSpreadsheetNav(rowIndex, 3)}
                          disabled={isPersonalAccountTransfer(record.accountFrom, record.payeeTo)}
                          className={spreadsheetCellInputClass}
                        />
                      ) : editingId === record.id && draft ? (
                        isPersonalAccountTransfer(draft.accountFrom, draft.payeeTo) ? (
                          <Input
                            value="Transfer"
                            disabled
                            className="h-7 text-xs opacity-80"
                          />
                        ) : (
                          <CategoryCombobox
                            categories={categories}
                            categoryOptions={categoryOptions}
                            value={draft.category}
                            onChange={(next) => updateDraft("category", next)}
                            onKeyDown={handleEditKeyDown}
                          />
                        )
                      ) : (
                        (() => {
                          const category = isPersonalAccountTransfer(
                            record.accountFrom,
                            record.payeeTo
                          )
                            ? "Transfer"
                            : record.category
                          const catDef = categories.find((c) => c.name === category)
                          const Icon = getCategoryIcon(catDef?.icon ?? "")
                          return (
                            <span
                              className="inline-flex max-w-32 items-center gap-1.5 text-[11px]"
                              title={category}
                            >
                              <Icon className="size-3.5" />
                              <span className="truncate">
                                {getCategoryDisplayLabel(catDef, category)}
                              </span>
                            </span>
                          )
                        })()
                      )}
                    </TableCell>
                    <TableCell className="hidden max-w-64 md:table-cell">
                      {spreadsheetMode ? (
                        <Input
                          ref={registerCellRef(rowIndex, 4)}
                          value={record.detail}
                          onChange={(event) =>
                            updateRecordCell(record.id, "detail", event.target.value)
                          }
                          onKeyDown={handleSpreadsheetNav(rowIndex, 4)}
                          className={spreadsheetCellInputClass}
                        />
                      ) : editingId === record.id && draft ? (
                        <Input
                          value={draft.detail}
                          onChange={(event) => updateDraft("detail", event.target.value)}
                          onKeyDown={handleEditKeyDown}
                          className="h-7 text-xs"
                        />
                      ) : (
                        <span className="block max-w-64 truncate text-[11px]" title={record.detail}>
                          {record.detail || "-"}
                        </span>
                      )}
                    </TableCell>
                    {spreadsheetMode ? (
                      <TableCell className="max-w-24 bg-card text-right group-hover:bg-muted/60">
                        <Input
                          ref={registerCellRef(rowIndex, 5)}
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
                          onKeyDown={handleSpreadsheetNav(rowIndex, 5)}
                          className={spreadsheetAmountInputClass}
                        />
                      </TableCell>
                    ) : editingId === record.id && draft ? (
                      <TableCell className="max-w-24 bg-card text-right group-hover:bg-muted/60">
                        <Input
                          type="number"
                          step="0.01"
                          value={draft.amount}
                          onChange={(event) => updateDraft("amount", event.target.value)}
                          onKeyDown={handleEditKeyDown}
                          className="h-7 w-24 border-0 bg-transparent dark:bg-transparent shadow-none text-right text-xs focus-visible:bg-transparent dark:focus-visible:bg-transparent"
                        />
                      </TableCell>
                    ) : (
                      <TableCell className="max-w-24 bg-card text-right group-hover:bg-muted/60">
                        {(() => {
                          const ownershipDirection = getOwnershipDirection(record)
                          const displayValue = displayAmountMagnitude(record)
                          const isNeutral = ownershipDirection === "neutral"
                          const isOutgoing =
                            ownershipDirection === "outgoing" ||
                            (!ownershipDirection && displaySignedAmount(record) < 0)
                          return (
                            <span
                              className={`inline-flex flex-col items-end leading-none ${
                                isNeutral
                                  ? "text-neutral-500 dark:text-neutral-400"
                                  : isOutgoing
                                  ? "text-red-700 dark:text-red-400"
                                  : "text-green-700 dark:text-green-400"
                              }`}
                            >
                              <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                                {isNeutral ? (
                                  <span className="inline-flex size-3.5 items-center justify-center text-xs leading-none">
                                    -
                                  </span>
                                ) : isOutgoing ? (
                                  <ArrowUpRightIcon className="size-3.5" />
                                ) : (
                                  <ArrowDownLeftIcon className="size-3.5" />
                                )}
                                {displayValue.toFixed(2)}
                              </span>
                              <span className="mt-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                                {displayCurrency}
                              </span>
                            </span>
                          )
                        })()}
                      </TableCell>
                    )}
                    <TableCell className="w-28 min-w-28 max-w-28 bg-card text-right group-hover:bg-muted/60">
                      <Input
                        value={formatMoney(record.runningBalance)}
                        disabled
                        className="h-6 border-0 border-b rounded-none px-1 text-right text-[10px] opacity-70 shadow-none"
                      />
                    </TableCell>
                    </TableRow>
                  </ContextMenuTrigger>
                  <ContextMenuContent
                    className="w-28"
                    onPointerDown={(event) => {
                      setContextActionArmed(event.button === 0)
                    }}
                  >
                    {editingId === record.id ? (
                      <>
                        <ContextMenuItem
                          onSelect={(event) => {
                            if (!contextActionArmed) {
                              event.preventDefault()
                              return
                            }
                            void saveEdit()
                          }}
                        >
                          Save
                        </ContextMenuItem>
                        <ContextMenuItem
                          onSelect={(event) => {
                            if (!contextActionArmed) {
                              event.preventDefault()
                              return
                            }
                            cancelEdit()
                          }}
                        >
                          Cancel
                        </ContextMenuItem>
                      </>
                    ) : (
                      <>
                        <ContextMenuItem
                          onSelect={(event) => {
                            if (!contextActionArmed) {
                              event.preventDefault()
                              return
                            }
                            startEdit(record)
                          }}
                        >
                          Edit
                        </ContextMenuItem>
                        <ContextMenuItem
                          onSelect={(event) => {
                            if (!contextActionArmed) {
                              event.preventDefault()
                              return
                            }
                            openSplitDialog(record)
                          }}
                        >
                          Split
                        </ContextMenuItem>
                        <ContextMenuItem
                          onSelect={(event) => {
                            if (!contextActionArmed) {
                              event.preventDefault()
                              return
                            }
                            setWaiveDialogRecord(record)
                            setWaiveDialogAccountId(record.waivedBy?.id ?? "")
                            setWaiveDialogOpen(true)
                          }}
                        >
                          {record.waivedBy ? "Edit Waive" : "Waive"}
                        </ContextMenuItem>
                        <ContextMenuItem
                          variant="destructive"
                          onSelect={(event) => {
                            if (!contextActionArmed) {
                              event.preventDefault()
                              return
                            }
                            setDeleteDialogRecord(record)
                            setDeleteDialogOpen(true)
                          }}
                        >
                          Delete
                        </ContextMenuItem>
                      </>
                    )}
                  </ContextMenuContent>
                </ContextMenu>
                  )}
                </Draggable>
              </Fragment>
            ))}
            {(
              <TableRow className="sticky bottom-0 z-30 bg-card shadow-[0_-6px_12px_rgba(0,0,0,0.08)]">
                {(() => {
                  const newRowIndex = paginatedRecords.length
                  return (
                    <>
                      <TableCell className="w-8 min-w-8 max-w-8 bg-card" />
                      <TableCell className="sticky-date-cell min-w-40 bg-card md:sticky md:left-0 md:z-20">
                        {spreadsheetMode ? (
                          <Input
                            ref={registerCellRef(newRowIndex, 0)}
                            value={newRow.date}
                            onChange={(event) =>
                              setNewRow((current) => ({ ...current, date: event.target.value }))
                            }
                            onKeyDown={handleSpreadsheetNav(newRowIndex, 0)}
                            className={spreadsheetCellInputClass}
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
                      <TableCell className="max-w-36">
                        {spreadsheetMode ? (
                          <Input
                            ref={registerCellRef(newRowIndex, 1)}
                            value={
                              accounts.find((item) => item.id === newRow.accountFromId)
                                ?.displayName ?? ""
                            }
                            onChange={(event) =>
                              setNewRowAccountByName("accountFromId", event.target.value)
                            }
                            onKeyDown={handleSpreadsheetNav(newRowIndex, 1)}
                            className={spreadsheetCellInputClass}
                          />
                        ) : (
                          <AccountCombobox
                            accounts={accounts}
                            value={
                              newRowTransientRef.current.accountFromId ?? newRow.accountFromId
                            }
                            onChange={(nextId) => {
                              newRowTransientRef.current.accountFromId = nextId
                              const accountFrom = accounts.find((item) => item.id === nextId)
                              const payeeTo = accounts.find(
                                (item) =>
                                  item.id ===
                                  (newRowTransientRef.current.payeeToId ?? newRow.payeeToId)
                              )
                              setNewRow((current) => ({
                                ...current,
                                accountFromId: nextId,
                                category: isPersonalAccountTransfer(accountFrom, payeeTo)
                                  ? "Transfer"
                                  : payeeTo?.defaultCategory ?? current.category,
                              }))
                            }}
                            onKeyDown={handleNewRowKeyDown}
                            createAccount={(name) => createAccount(name, currentUserEmail)}
                          />
                        )}
                      </TableCell>
                      <TableCell className="w-7 min-w-7 max-w-7 bg-card" />
                      <TableCell className="max-w-36">
                        {spreadsheetMode ? (
                          <Input
                            ref={registerCellRef(newRowIndex, 2)}
                            value={
                              accounts.find((item) => item.id === newRow.payeeToId)
                                ?.displayName ?? ""
                            }
                            onChange={(event) =>
                              setNewRowAccountByName("payeeToId", event.target.value)
                            }
                            onKeyDown={handleSpreadsheetNav(newRowIndex, 2)}
                            className={spreadsheetCellInputClass}
                          />
                        ) : (
                          <AccountCombobox
                            accounts={accounts}
                            value={newRowTransientRef.current.payeeToId ?? newRow.payeeToId}
                            onChange={(nextId) => {
                              newRowTransientRef.current.payeeToId = nextId
                              const accountFrom = accounts.find(
                                (item) =>
                                  item.id ===
                                  (newRowTransientRef.current.accountFromId ?? newRow.accountFromId)
                              )
                              const payeeTo = accounts.find((item) => item.id === nextId)
                              setNewRow((current) => ({
                                ...current,
                                payeeToId: nextId,
                                category: isPersonalAccountTransfer(accountFrom, payeeTo)
                                  ? "Transfer"
                                  : payeeTo?.defaultCategory ?? current.category,
                              }))
                            }}
                            onKeyDown={handleNewRowKeyDown}
                            createAccount={(name) => createAccount(name)}
                          />
                        )}
                      </TableCell>
                      <TableCell className="hidden max-w-32 md:table-cell">
                        {spreadsheetMode ? (
                          <Input
                            ref={registerCellRef(newRowIndex, 3)}
                            value={newRowCategoryLocked ? "Transfer" : newRow.category}
                            onChange={(event) =>
                              setNewRow((current) => ({
                                ...current,
                                category: event.target.value as Category,
                              }))
                            }
                            onKeyDown={handleSpreadsheetNav(newRowIndex, 3)}
                            disabled={newRowCategoryLocked}
                            className={spreadsheetCellInputClass}
                          />
                        ) : newRowCategoryLocked ? (
                          <Input
                            value="Transfer"
                            disabled
                            className="h-7 text-xs opacity-80"
                          />
                        ) : (
                          <CategoryCombobox
                            categories={categories}
                            categoryOptions={categoryOptions}
                            value={newRowTransientRef.current.category ?? newRow.category}
                            onChange={(next) => {
                              newRowTransientRef.current.category = next
                            }}
                            onKeyDown={handleNewRowKeyDown}
                          />
                        )}
                      </TableCell>
                      <TableCell className="hidden max-w-64 md:table-cell">
                        <Input
                          ref={spreadsheetMode ? registerCellRef(newRowIndex, 4) : undefined}
                          value={newRow.detail}
                          onChange={(event) =>
                            setNewRow((current) => ({ ...current, detail: event.target.value }))
                          }
                          onKeyDown={
                            spreadsheetMode
                              ? handleSpreadsheetNav(newRowIndex, 4)
                              : handleNewRowKeyDown
                          }
                          className={
                            spreadsheetMode
                              ? spreadsheetCellInputClass
                              : "h-7 text-xs"
                          }
                          placeholder="Detail"
                        />
                      </TableCell>
                      <TableCell className="max-w-24 bg-card text-right">
                        <Input
                          ref={spreadsheetMode ? registerCellRef(newRowIndex, 5) : undefined}
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
                            spreadsheetMode
                              ? handleSpreadsheetNav(newRowIndex, 5)
                              : handleNewRowKeyDown
                          }
                          className={
                            spreadsheetMode
                              ? spreadsheetAmountInputClass
                              : "h-7 w-24 text-right text-xs"
                          }
                        />
                      </TableCell>
                      <TableCell className="w-28 min-w-28 max-w-28 bg-card text-right">
                        -
                      </TableCell>
                    </>
                  )
                })()}
              </TableRow>
            )}
            {droppableProvided.placeholder}
            </TableBody>
              )}
            </Droppable>
          </DragDropContext>
          </Table>
        </div>
      </div>
      </div>
      <div className="mt-4 border-y bg-card px-3 py-4 text-xs md:border md:px-6">
        <div className="flex items-center justify-between">
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
              }}
              className="h-7 w-16 text-xs"
            />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <span className="text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 rounded-none px-2 text-xs"
              onClick={() => setPage(1)}
              disabled={currentPage <= 1}
            >
              First
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 rounded-none px-2 text-xs"
              onClick={() => setPage(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
            >
              Previous
            </Button>
            {pageJumpItems.map((pageNumber) => (
              <Button
                key={pageNumber}
                variant={pageNumber === currentPage ? "default" : "outline"}
                size="sm"
                className="h-7 min-w-7 rounded-none px-2 text-xs"
                onClick={() => setPage(pageNumber)}
                disabled={pageNumber === currentPage}
              >
                {pageNumber}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="h-7 rounded-none px-2 text-xs"
              onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage >= totalPages}
            >
              Next
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 rounded-none px-2 text-xs"
              onClick={() => setPage(totalPages)}
              disabled={currentPage >= totalPages}
            >
              Last
            </Button>
          </div>
        </div>
      </div>
      {waiveDialogOpen && waiveDialogRecord ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-md border bg-card p-4">
            <h3 className="text-sm font-semibold">Set Waive Account</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Select which account will reimburse this expense.
            </p>
            <div className="mt-3">
              <AccountCombobox
                accounts={accounts}
                value={waiveDialogAccountId}
                onChange={(nextId) => setWaiveDialogAccountId(nextId)}
                createAccount={(name) => createAccount(name)}
              />
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-none px-2 text-xs"
                disabled={waiveDialogSaving}
                onClick={() => {
                  setWaiveDialogOpen(false)
                  setWaiveDialogRecord(null)
                  setWaiveDialogAccountId("")
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-none px-2 text-xs"
                disabled={waiveDialogSaving}
                onClick={() => void applyWaiveAccount(waiveDialogRecord, "")}
              >
                Clear
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 rounded-none px-2 text-xs"
                disabled={waiveDialogSaving}
                onClick={() => void applyWaiveAccount(waiveDialogRecord, waiveDialogAccountId)}
              >
                {waiveDialogSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {splitDialogOpen && splitDialogRecord ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-2xl border bg-card p-4">
            <h3 className="text-sm font-semibold">Split Transaction</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Split {splitDialogRecord.currency} {formatAmountFixed(splitDialogRecord.amount)} into multiple transactions.
            </p>
            <div className="mt-3 grid gap-2">
              {splitRows.map((row, index) => (
                <div key={row.id} className="grid grid-cols-12 gap-2 border p-2">
                  <Input
                    value={row.amount}
                    onChange={(event) =>
                      setSplitRows((current) =>
                        current.map((item) =>
                          item.id === row.id
                            ? { ...item, amount: event.target.value.replace(/[^0-9.]/g, "") }
                            : item
                        )
                      )
                    }
                    className="col-span-2 h-8 rounded-none text-xs"
                    placeholder="Amount"
                  />
                  <select
                    value={row.type}
                    onChange={(event) =>
                      setSplitRows((current) =>
                        current.map((item) =>
                          item.id === row.id
                            ? { ...item, type: event.target.value as RecordType }
                            : item
                        )
                      )
                    }
                    className="col-span-3 h-8 border bg-background px-2 text-xs"
                  >
                    <option value="Expense">Expense</option>
                    <option value="Deposit">Income</option>
                    <option value="Transfer">Transfer</option>
                  </select>
                  <Input
                    value={row.detail}
                    onChange={(event) =>
                      setSplitRows((current) =>
                        current.map((item) =>
                          item.id === row.id ? { ...item, detail: event.target.value } : item
                        )
                      )
                    }
                    className="col-span-4 h-8 rounded-none text-xs"
                    placeholder="Detail"
                  />
                  <select
                    value={row.waivedByAccountId}
                    onChange={(event) =>
                      setSplitRows((current) =>
                        current.map((item) =>
                          item.id === row.id
                            ? { ...item, waivedByAccountId: event.target.value }
                            : item
                        )
                      )
                    }
                    className="col-span-2 h-8 border bg-background px-2 text-xs"
                  >
                    <option value="">No waive</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.displayName}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    className="col-span-1 h-8 rounded-none px-0 text-xs"
                    disabled={splitRows.length <= 2}
                    onClick={() =>
                      setSplitRows((current) => current.filter((item) => item.id !== row.id))
                    }
                  >
                    X
                  </Button>
                  <div className="col-span-12 text-[10px] text-muted-foreground">
                    Split {index + 1}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-none px-2 text-xs"
                onClick={() =>
                  setSplitRows((current) => [
                    ...current,
                    {
                      id: `split-${Date.now()}-${current.length + 1}`,
                      amount: "0.00",
                      type: splitDialogRecord.type,
                      detail: splitDialogRecord.detail,
                      waivedByAccountId: splitDialogRecord.waivedBy?.id ?? "",
                    },
                  ])
                }
              >
                Add split
              </Button>
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-none px-2 text-xs"
                disabled={splitSaving}
                onClick={() => {
                  setSplitDialogOpen(false)
                  setSplitDialogRecord(null)
                  setSplitRows([])
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 rounded-none px-2 text-xs"
                disabled={splitSaving}
                onClick={() => void applySplit()}
              >
                {splitSaving ? "Saving..." : "Save split"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open)
          if (!open && !deleteSaving) {
            setDeleteDialogRecord(null)
          }
        }}
      >
        <AlertDialogContent size="sm" className="rounded-none">
          <AlertDialogHeader className="place-items-start text-left">
            <AlertDialogTitle>Delete transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDialogRecord
                ? `This will permanently delete '${deleteDialogRecord.detail}' from ${deleteDialogRecord.date}.`
                : "This will permanently delete the selected transaction."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 rounded-none text-xs" disabled={deleteSaving}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="h-8 rounded-none text-xs"
              disabled={deleteSaving}
              onClick={(event) => {
                event.preventDefault()
                void confirmDeleteRecord()
              }}
            >
              {deleteSaving ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
