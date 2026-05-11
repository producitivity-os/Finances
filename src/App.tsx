import { useEffect, useRef, useState } from "react"
import { startOfMonth } from "date-fns"
import type { DateRange } from "react-day-picker"
import { invoke } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { CommandIcon, UploadSimpleIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import { AppSidebar } from "@/components/app-sidebar"
import { CookieConsentBanner } from "@/components/cookie-consent-banner"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import type { Account, AccountApi, CategoryDefinition, RecordApi, RecordItem, UploadedLedgerRow } from "@/lib/types"
import { defaultCategories, mapAccountFromApi, mapRecordFromApi } from "@/lib/types"
import { AccountsPage } from "@/pages/AccountsPage"
import { CategoriesPage } from "@/pages/CategoriesPage"
import { SettingsPage } from "@/pages/SettingsPage"
import { TransactionsPage } from "@/pages/TransactionsPage"

// ─── CSV parsing ─────────────────────────────────────────────────────────────

const normalizeWhitespace = (value: string) =>
  value.replace(/\s+/g, " ").replace(/\r/g, "").trim()

const slugify = (value: string) =>
  normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "entry"

const parseFlexibleDate = (value: string) => {
  const normalized = normalizeWhitespace(value)
  const shortMatch = normalized.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/)
  if (shortMatch) {
    const [, day, mon, yy] = shortMatch
    const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"]
    const monthIndex = months.indexOf(mon.toLowerCase())
    if (monthIndex >= 0) {
      return `20${yy}-${String(monthIndex + 1).padStart(2, "0")}-${day.padStart(2, "0")}`
    }
  }
  const longMatch = normalized.match(/^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/)
  if (longMatch) {
    const [, day, mon, year] = longMatch
    const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"]
    const monthIndex = months.indexOf(mon.toLowerCase())
    if (monthIndex >= 0) {
      return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${day.padStart(2, "0")}`
    }
  }
  return normalized
}

const parseLedgerAmount = (value: string) => {
  const normalized = normalizeWhitespace(value)
    .replace(/^MYR\s*/i, "")
    .replace(/,/g, "")
    .replace(/^\+/, "")
  const sign = normalized.startsWith("-") ? -1 : 1
  const numeric = normalized.replace(/^-/, "")
  const parsed = Number.parseFloat(numeric)
  return Number.isFinite(parsed) ? sign * parsed : 0
}

const parseCsvLine = (line: string) => {
  const result: string[] = []
  let current = ""
  let inQuotes = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]
    if (char === '"') {
      if (inQuotes && next === '"') { current += '"'; index += 1 }
      else inQuotes = !inQuotes
      continue
    }
    if (char === "," && !inQuotes) { result.push(current); current = ""; continue }
    current += char
  }
  result.push(current)
  return result.map((value) => value.trim())
}

const parseLedgerCsv = (text: string): UploadedLedgerRow[] => {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0)
  if (lines.length <= 1) return []
  return lines.slice(1).map((line) => {
    const [
      rowNumber = "", date = "", account = "", detail = "", payee = "",
      category = "", type = "", amount = "", balance = "", waived = "", note = "",
    ] = parseCsvLine(line)
    return { rowNumber, date, account, detail, payee, category, type, amount, balance, waived, note }
  })
}

const inferPayee = (row: UploadedLedgerRow) => {
  if (normalizeWhitespace(row.payee)) return normalizeWhitespace(row.payee)
  const detail = normalizeWhitespace(row.detail)
  if (!detail) return "Unknown Payee"
  const stripped = detail.replace(/^\d+\s*/, "")
  const [firstSegment] = stripped.split("*")
  return normalizeWhitespace(firstSegment || stripped)
}

const inferRecordType = (
  row: UploadedLedgerRow,
  signedAmount: number
): "Transfer" | "Deposit" | "Expense" => {
  const typeHint = normalizeWhitespace(row.type).toLowerCase()
  const categoryHint = normalizeWhitespace(row.category).toLowerCase()
  const detailHint = normalizeWhitespace(row.detail).toLowerCase()
  if (typeHint.includes("transfer") || categoryHint === "transfer" || detailHint.includes("fund transfer")) return "Transfer"
  if (signedAmount >= 0) return "Deposit"
  return "Expense"
}

const inferCategory = (
  row: UploadedLedgerRow,
  recordType: "Transfer" | "Deposit" | "Expense"
) => {
  const explicit = normalizeWhitespace(row.category)
  if (explicit) return explicit
  if (recordType === "Transfer") return "Transfer"
  if (recordType === "Deposit") return "Income"
  return "Uncategorized"
}

const buildImportPayload = (rows: UploadedLedgerRow[]) => {
  const accounts = new Map<
    string,
    { id: string; display_name: string; account_name: string; type: "individual" | "restaurant" | "other" }
  >()
  const ensureAccount = (label: string) => {
    const name = normalizeWhitespace(label) || "Unknown Account"
    const key = slugify(name)
    if (!accounts.has(key)) {
      accounts.set(key, { id: `acc-${key}`, display_name: key, account_name: name })
    }
    return accounts.get(key)!
  }
  const records = rows
    .filter((row) => normalizeWhitespace(row.date) && normalizeWhitespace(row.amount))
    .map((row, index) => {
      const accountFrom = ensureAccount(row.account)
      const payeeTo = ensureAccount(inferPayee(row))
      const signedAmount = parseLedgerAmount(row.amount)
      const recordType = inferRecordType(row, signedAmount)
      const category = inferCategory(row, recordType)
      const note = normalizeWhitespace(row.note)
      const waived = normalizeWhitespace(row.waived)
      const description = [waived, note].filter(Boolean).join(" | ")
      return {
        id: `import-${String(index + 1).padStart(4, "0")}`,
        date: parseFlexibleDate(row.date),
        account_from_id: accountFrom.id,
        payee_to_id: payeeTo.id,
        type: recordType,
        amount: Math.abs(signedAmount).toFixed(2),
        currency: "MYR",
        detail: normalizeWhitespace(row.detail),
        description,
        category,
      }
    })
  return { accounts: Array.from(accounts.values()), records }
}

// ─── Initial data ─────────────────────────────────────────────────────────────

const initialAccounts: Account[] = [
  { id: "acc-payroll", displayName: "Payroll Account", accountName: "Acme Payroll Account" },
  { id: "acc-freshmart", displayName: "Fresh Mart", accountName: "Fresh Mart Merchant" },
  { id: "acc-transit", displayName: "City Transport", accountName: "Transit Fare Collection" },
]

// ─── App ─────────────────────────────────────────────────────────────────────

export function App() {
  const [currentRoute, setCurrentRoute] = useState(() => window.location.hash || "#/transactions")
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts)
  const [records, setRecords] = useState<RecordItem[]>([])
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null)
  const [spreadsheetMode, setSpreadsheetMode] = useState(false)
  const [pageSize, setPageSize] = useState(15)
  const [calendarRange, setCalendarRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: new Date(),
  })
  const [categories, setCategories] = useState<CategoryDefinition[]>(() => {
    try {
      const saved = localStorage.getItem("finance-categories")
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed as CategoryDefinition[]
      }
    } catch {}
    return defaultCategories
  })
  const [currencyApi, setCurrencyApi] = useState(() =>
    localStorage.getItem("finance-currency-api") ?? "frankfurter"
  )
  const csvInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    localStorage.setItem("finance-categories", JSON.stringify(categories))
  }, [categories])

  useEffect(() => {
    localStorage.setItem("finance-currency-api", currencyApi)
  }, [currencyApi])

  const loadAccounts = async () => {
    try {
      const data = await invoke<AccountApi[]>("list_accounts")
      if (data.length === 0) return []
      const mapped = data.map(mapAccountFromApi)
      setAccounts(mapped)
      return mapped
    } catch {
      return []
    }
  }

  const loadRecords = async (accountList: Account[]) => {
    try {
      const rows = await invoke<RecordApi[]>("list_records")
      const mapped = rows
        .map((row) => mapRecordFromApi(row, accountList))
        .filter((row): row is RecordItem => row !== null)
      setRecords(mapped)
      return mapped
    } catch {
      return []
    }
  }

  useEffect(() => {
    const syncRoute = () => {
      if (!window.location.hash) {
        window.location.hash = "/transactions"
        return
      }
      setCurrentRoute(window.location.hash)
    }
    syncRoute()
    window.addEventListener("hashchange", syncRoute)
    return () => window.removeEventListener("hashchange", syncRoute)
  }, [])

  useEffect(() => {
    void loadAccounts()
  }, [])

  useEffect(() => {
    const win = getCurrentWindow()
    let unlisten: (() => void) | undefined

    const checkFullscreen = async () => {
      const fs = await win.isFullscreen()
      setIsFullscreen(fs)
    }

    const setup = async () => {
      await checkFullscreen()
      unlisten = await win.listen("tauri://resize", checkFullscreen)
    }

    void setup()
    return () => { unlisten?.() }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.metaKey && event.key.toLowerCase() === "e") {
        event.preventDefault()
        setSpreadsheetMode((current) => !current)
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "p") {
        event.preventDefault()
        setCommandOpen((current) => !current)
        return
      }
      if (event.key === "Escape") setCommandOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  useEffect(() => {
    void loadRecords(accounts)
  }, [accounts])

  const handleUploadCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const rows = parseLedgerCsv(text)
      const payload = buildImportPayload(rows)
      await invoke("import_ledger", { payload })
      const nextAccounts = await loadAccounts()
      await loadRecords(nextAccounts.length > 0 ? nextAccounts : accounts)
      setSelectedRowId(null)
      setCommandOpen(false)
      toast.success(`Imported ${payload.records.length} records from CSV`)
    } catch {
      toast.error("Failed to import CSV")
    } finally {
      event.target.value = ""
    }
  }

  const breadcrumbLabel =
    currentRoute === "#/accounts"
      ? "Accounts"
      : currentRoute === "#/categories"
        ? "Categories"
        : currentRoute === "#/settings"
          ? "Settings"
          : "Transactions"

  const lastLoggedDate =
    records.length > 0
      ? [...records].map((r) => r.date).sort((a, b) => b.localeCompare(a))[0]
      : null

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="h-svh overflow-hidden">
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleUploadCsv}
        />
        <header className="fixed inset-x-0 top-0 z-[80] flex h-8 items-center border-b border-border bg-background/95 backdrop-blur-sm">
          <div className={`flex w-full items-center gap-1.5 pr-4 text-xs ${isFullscreen ? "pl-4" : "pl-[88px]"}`}>
            <SidebarTrigger className="-ml-1 h-6 w-6" />
            <Separator
              orientation="vertical"
              className="mx-1 my-auto data-[orientation=vertical]:h-3"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="#/transactions">Finances</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>{breadcrumbLabel}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        {commandOpen ? (
          <div className="fixed inset-0 z-[95] flex items-start justify-center bg-black/10 pt-24">
            <button
              type="button"
              className="absolute inset-0"
              aria-label="Close command palette"
              onClick={() => setCommandOpen(false)}
            />
            <div className="relative z-10 w-full max-w-xl border bg-background shadow-2xl">
              <div className="flex items-center gap-2 border-b px-4 py-3">
                <CommandIcon className="size-4 text-muted-foreground" />
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Command
                </span>
              </div>
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-4 text-left text-sm hover:bg-muted"
                onClick={() => {
                  setCommandOpen(false)
                  csvInputRef.current?.click()
                }}
              >
                <UploadSimpleIcon className="size-4" />
                <span>Upload CSV</span>
                <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                  Import ledger
                </span>
              </button>
            </div>
          </div>
        ) : null}
        <div className="no-scrollbar flex-1 overflow-y-auto bg-muted pt-8">
          {currentRoute === "#/accounts" ? (
            <AccountsPage accounts={accounts} setAccounts={setAccounts} records={records} setRecords={setRecords} />
          ) : currentRoute === "#/categories" ? (
            <CategoriesPage categories={categories} setCategories={setCategories} />
          ) : currentRoute === "#/settings" ? (
            <SettingsPage
              spreadsheetMode={spreadsheetMode}
              setSpreadsheetMode={setSpreadsheetMode}
              pageSize={pageSize}
              calendarRange={calendarRange}
              currencyApi={currencyApi}
              setCurrencyApi={setCurrencyApi}
            />
          ) : (
            <TransactionsPage
              accounts={accounts}
              setAccounts={setAccounts}
              records={records}
              setRecords={setRecords}
              categories={categories}
              spreadsheetMode={spreadsheetMode}
              selectedRowId={selectedRowId}
              setSelectedRowId={setSelectedRowId}
              pageSize={pageSize}
              setPageSize={setPageSize}
              calendarRange={calendarRange}
              setCalendarRange={setCalendarRange}
            />
          )}
        </div>
        <CookieConsentBanner lastLoggedDate={lastLoggedDate} />
      </SidebarInset>
    </SidebarProvider>
  )
}

export default App
