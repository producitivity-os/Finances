import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { DateRange } from "react-day-picker"
import { invoke } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { CommandIcon, UploadSimpleIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import { AppSidebar } from "@/components/app-sidebar"
import { CookieConsentBanner } from "@/components/cookie-consent-banner"
import { LoginForm } from "@/components/login-form"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import type { Account, AccountApi, CategoryDefinition, RecordApi, RecordItem, UploadedLedgerRow } from "@/lib/types"
import { defaultCategories, mapAccountFromApi, mapRecordFromApi } from "@/lib/types"
import { buildNotifications } from "@/lib/notifications"
import { AccountsPage } from "@/pages/AccountsPage"
import { CategoriesPage } from "@/pages/CategoriesPage"
import { NotificationsPage } from "@/pages/NotificationsPage"
import { LoansPage } from "@/pages/LoansPage"
import { ProfilePage } from "@/pages/ProfilePage"
import { RecurringPage } from "@/pages/RecurringPage"
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
  const noteHint = normalizeWhitespace(row.note).toLowerCase()
  const payeeHint = normalizeWhitespace(row.payee).toLowerCase()
  const refundHint = `${typeHint} ${categoryHint} ${detailHint} ${noteHint} ${payeeHint}`
  if (/\brefund(?:ed)?\b|\breimburs(?:e|ed|ement)\b/i.test(refundHint)) return "Deposit"
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

const buildImportPayload = (rows: UploadedLedgerRow[], ownerEmail: string) => {
  const accounts = new Map<
    string,
    {
      id: string
      display_name: string
      account_name: string
      type: "individual" | "restaurant" | "other"
      owner_email?: string | null
      default_category?: string | null
    }
  >()
  const ensureAccount = (label: string, accountOwnerEmail?: string | null) => {
    const rawName = normalizeWhitespace(label)
    const name = !rawName || rawName.toLowerCase() === "unknown" ? "n-a" : rawName
    const key = slugify(name)
    if (!accounts.has(key)) {
      accounts.set(key, {
        id: `acc-${key}`,
        display_name: key,
        account_name: name,
        type: "other",
        owner_email: accountOwnerEmail ?? null,
        default_category: null,
      })
    } else if (accountOwnerEmail) {
      const existing = accounts.get(key)!
      accounts.set(key, { ...existing, owner_email: accountOwnerEmail })
    }
    return accounts.get(key)!
  }
  const records = rows
    .filter((row) => normalizeWhitespace(row.date) && normalizeWhitespace(row.amount))
    .map((row, index) => {
      const accountFrom = ensureAccount(row.account, ownerEmail)
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
  { id: "acc-na", displayName: "n-a", accountName: "n-a", defaultCategory: null },
  { id: "acc-payroll", displayName: "Payroll Account", accountName: "Acme Payroll Account", defaultCategory: null },
  { id: "acc-freshmart", displayName: "Fresh Mart", accountName: "Fresh Mart Merchant", defaultCategory: null },
  { id: "acc-transit", displayName: "City Transport", accountName: "Transit Fare Collection", defaultCategory: null },
]

const withDefaultAccounts = (accounts: Account[]) => {
  const hasNAAccount = accounts.some(
    (account) =>
      account.id === "acc-na" ||
      account.displayName.toLowerCase() === "n-a" ||
      account.accountName.toLowerCase() === "n-a"
  )
  return hasNAAccount ? accounts : [initialAccounts[0], ...accounts]
}

type LoginPayload = {
  email: string
  password: string
}

type LoginResponse = {
  token: string
  email: string
  full_name: string
  avatar_url: string
  expires_at: number
}

type Session = {
  token: string
  email: string
  expiresAt: number
}

type DisplayCurrency = "MYR" | "USD"

type UserProfile = {
  email: string
  full_name: string
  avatar_url: string
}

const SESSION_STORAGE_KEY = "finance-session"

const readSession = (): Session | null => {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Session
    if (!parsed?.token || !parsed?.email || typeof parsed?.expiresAt !== "number") {
      return null
    }
    const nowSeconds = Math.floor(Date.now() / 1000)
    if (parsed.expiresAt <= nowSeconds) return null
    return parsed
  } catch {
    return null
  }
}

// ─── App ─────────────────────────────────────────────────────────────────────

export function App() {
  const [session, setSession] = useState<Session | null>(() => readSession())
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [currentRoute, setCurrentRoute] = useState(() => window.location.hash || "#/transactions")
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts)
  const [records, setRecords] = useState<RecordItem[]>([])
  const [spreadsheetMode, setSpreadsheetMode] = useState(false)
  const [pageSize, setPageSize] = useState(15)
  const [runningBalanceAccountIds, setRunningBalanceAccountIds] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("finance-running-balance-accounts") ?? "[]") as string[])
    } catch {
      return new Set()
    }
  })
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("finance-read-notifications") ?? "[]") as string[])
    } catch {
      return new Set()
    }
  })
  const [calendarRange, setCalendarRange] = useState<DateRange | undefined>(() => {
    const now = new Date()
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
    }
  })
  const [categories, setCategories] = useState<CategoryDefinition[]>(() => {
    try {
      const saved = localStorage.getItem("finance-categories")
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed as CategoryDefinition[]
      }
    } catch {
      // Ignore invalid local category data and use defaults.
    }
    return defaultCategories
  })
  const [currencyApi, setCurrencyApi] = useState(() =>
    localStorage.getItem("finance-currency-api") ?? "frankfurter"
  )
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>(() => {
    const saved = localStorage.getItem("finance-display-currency")
    return saved === "USD" ? "USD" : "MYR"
  })
  const csvInputRef = useRef<HTMLInputElement | null>(null)

  const notifications = useMemo(
    () => buildNotifications(records, readNotificationIds),
    [readNotificationIds, records]
  )
  const unreadNotificationCount = notifications.filter((item) => !item.read).length

  const markNotificationRead = (id: string) => {
    setReadNotificationIds((current) => {
      const next = new Set(current)
      next.add(id)
      localStorage.setItem("finance-read-notifications", JSON.stringify(Array.from(next)))
      return next
    })
  }

  const markAllNotificationsRead = () => {
    setReadNotificationIds((current) => {
      const next = new Set(current)
      notifications.forEach((item) => next.add(item.id))
      localStorage.setItem("finance-read-notifications", JSON.stringify(Array.from(next)))
      return next
    })
  }

  const saveSession = useCallback((next: Session | null) => {
    setSession(next)
    if (next) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next))
      return
    }
    localStorage.removeItem(SESSION_STORAGE_KEY)
  }, [])

  const handleLogin = async (values: LoginPayload) => {
    setIsLoggingIn(true)
    setLoginError(null)
    try {
      const response = await invoke<LoginResponse>("login", { payload: values })
      saveSession({
        token: response.token,
        email: response.email,
        expiresAt: response.expires_at,
      })
      setProfile({
        email: response.email,
        full_name: response.full_name,
        avatar_url: response.avatar_url,
      })
    } catch {
      setLoginError("Invalid email or password.")
    } finally {
      setIsLoggingIn(false)
    }
  }

  const handleLogout = useCallback(() => {
    saveSession(null)
    setProfile(null)
    setRecords([])
    setAccounts(initialAccounts)
    setCommandOpen(false)
  }, [saveSession])

  useEffect(() => {
    if (!session) return
    localStorage.setItem("finance-categories", JSON.stringify(categories))
  }, [categories, session])

  useEffect(() => {
    if (!session) return
    localStorage.setItem("finance-currency-api", currencyApi)
  }, [currencyApi, session])

  useEffect(() => {
    if (!session) return
    localStorage.setItem("finance-display-currency", displayCurrency)
  }, [displayCurrency, session])

  useEffect(() => {
    localStorage.setItem(
      "finance-running-balance-accounts",
      JSON.stringify(Array.from(runningBalanceAccountIds))
    )
  }, [runningBalanceAccountIds])

  useEffect(() => {
    setRunningBalanceAccountIds((current) => {
      const validIds = new Set(accounts.map((account) => account.id))
      const next = new Set(Array.from(current).filter((id) => validIds.has(id)))
      if (next.size === current.size) return current
      return next
    })
  }, [accounts])

  const loadAccounts = useCallback(async () => {
    try {
      const data = await invoke<AccountApi[]>("list_accounts")
      if (data.length === 0) return []
      const mapped = withDefaultAccounts(data.map(mapAccountFromApi))
      setAccounts(mapped)
      return mapped
    } catch {
      return []
    }
  }, [])

  const loadRecords = useCallback(async (accountList: Account[]) => {
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
  }, [])

  const loadAppData = useCallback(async () => {
    const nextAccounts = await loadAccounts()
    await loadRecords(nextAccounts.length > 0 ? nextAccounts : initialAccounts)
  }, [loadAccounts, loadRecords])

  const reloadData = useCallback(async () => {
    if (!session) return
    await loadAppData()
  }, [loadAppData, session])

  useEffect(() => {
    if (!session) return
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
  }, [session])

  useEffect(() => {
    if (!session) return
    void loadAppData()
  }, [loadAppData, session])

  useEffect(() => {
    if (!session) return
    const loadProfile = async () => {
      try {
        const result = await invoke<UserProfile>("get_user_profile", {
          email: session.email,
        })
        setProfile(result)
      } catch {
        setProfile({
          email: session.email,
          full_name: session.email.split("@")[0],
          avatar_url: "",
        })
      }
    }
    void loadProfile()
  }, [session])

  useEffect(() => {
    if (!session) return
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
  }, [session, handleLogout])

  useEffect(() => {
    if (!session) return
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
  }, [session])

  useEffect(() => {
    if (!session) return
    const checkSession = () => {
      const nowSeconds = Math.floor(Date.now() / 1000)
      if (session.expiresAt <= nowSeconds) {
        handleLogout()
      }
    }
    checkSession()
    const timer = window.setInterval(checkSession, 30_000)
    return () => window.clearInterval(timer)
  }, [session, handleLogout])

  if (!session) {
    return (
      <div className="h-svh w-screen bg-muted/50">
        <LoginForm
          className="h-svh w-screen"
          onSubmit={handleLogin}
          isSubmitting={isLoggingIn}
          errorMessage={loginError}
        />
      </div>
    )
  }

  const handleUploadCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const rows = parseLedgerCsv(text)
      const payload = buildImportPayload(rows, session.email)
      await invoke("import_ledger", { payload })
      await loadAppData()
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
      : currentRoute === "#/payees"
        ? "Payees"
      : currentRoute === "#/categories"
        ? "Categories"
        : currentRoute === "#/notifications"
          ? "Notifications"
        : currentRoute === "#/loans"
          ? "Loans"
        : currentRoute === "#/recurring"
          ? "Recurring"
        : currentRoute === "#/profile"
          ? "Profile"
        : currentRoute === "#/settings"
          ? "Settings"
          : "Transactions"

  const lastLoggedDate =
    records.length > 0
      ? [...records].map((r) => r.date).sort((a, b) => b.localeCompare(a))[0]
      : null

  return (
    <SidebarProvider defaultOpen={false}>
      <AppSidebar
        user={{
          name: profile?.full_name || session.email.split("@")[0],
          email: profile?.email || session.email,
          avatar: profile?.avatar_url || "",
        }}
        onLogout={handleLogout}
        notificationCount={unreadNotificationCount}
      />
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
            <div className="ml-auto flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 rounded-none px-2 text-[10px] uppercase tracking-wide"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden="true">{displayCurrency === "MYR" ? "🇲🇾" : "🇺🇸"}</span>
                      <span>{displayCurrency}</span>
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-28 rounded-none p-1">
                  <DropdownMenuItem onSelect={() => setDisplayCurrency("MYR")}>
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden="true">🇲🇾</span>
                      <span>MYR</span>
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setDisplayCurrency("USD")}>
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden="true">🇺🇸</span>
                      <span>USD</span>
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {profile?.email || session.email}
              </div>
            </div>
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
        <div className="no-scrollbar flex-1 overflow-y-auto bg-muted px-1 pt-4 md:px-2">
          {currentRoute === "#/accounts" ? (
            <AccountsPage
              accounts={accounts}
              setAccounts={setAccounts}
              records={records}
              setRecords={setRecords}
              currentUserEmail={session.email}
              categories={categories}
              mode="accounts"
            />
          ) : currentRoute === "#/payees" ? (
            <AccountsPage
              accounts={accounts}
              setAccounts={setAccounts}
              records={records}
              setRecords={setRecords}
              currentUserEmail={session.email}
              categories={categories}
              mode="payees"
            />
          ) : currentRoute === "#/categories" ? (
            <CategoriesPage
              categories={categories}
              setCategories={setCategories}
              records={records}
              setRecords={setRecords}
            />
          ) : currentRoute === "#/settings" ? (
            <SettingsPage
              spreadsheetMode={spreadsheetMode}
              setSpreadsheetMode={setSpreadsheetMode}
              pageSize={pageSize}
              calendarRange={calendarRange}
              currencyApi={currencyApi}
              setCurrencyApi={setCurrencyApi}
              accounts={accounts}
              currentUserEmail={session.email}
              runningBalanceAccountIds={runningBalanceAccountIds}
              setRunningBalanceAccountIds={setRunningBalanceAccountIds}
              onDataRestored={reloadData}
            />
          ) : currentRoute === "#/notifications" ? (
            <NotificationsPage
              notifications={notifications}
              onMarkRead={markNotificationRead}
              onMarkAllRead={markAllNotificationsRead}
            />
          ) : currentRoute === "#/loans" ? (
            <LoansPage records={records} currentUserEmail={session.email} />
          ) : currentRoute === "#/recurring" ? (
            <RecurringPage
              accounts={accounts}
              categories={categories}
              currentUserEmail={session.email}
            />
          ) : currentRoute === "#/profile" ? (
            <ProfilePage
              name={profile?.full_name || session.email.split("@")[0]}
              email={profile?.email || session.email}
              avatar={profile?.avatar_url || ""}
            />
          ) : (
            <TransactionsPage
              accounts={accounts}
              setAccounts={setAccounts}
              records={records}
              setRecords={setRecords}
              categories={categories}
              spreadsheetMode={spreadsheetMode}
              pageSize={pageSize}
              setPageSize={setPageSize}
              calendarRange={calendarRange}
              setCalendarRange={setCalendarRange}
              displayCurrency={displayCurrency}
              currencyApi={currencyApi}
              currentUserEmail={session.email}
              runningBalanceAccountIds={runningBalanceAccountIds}
            />
          )}
        </div>
        <CookieConsentBanner lastLoggedDate={lastLoggedDate} />
      </SidebarInset>
    </SidebarProvider>
  )
}

export default App
