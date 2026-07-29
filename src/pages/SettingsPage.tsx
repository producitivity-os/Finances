import { useEffect, useState, type Dispatch, type SetStateAction } from "react"
import type { DateRange } from "react-day-picker"
import { invoke } from "@tauri-apps/api/core"
import { SpinnerIcon } from "@phosphor-icons/react"
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
import { Button } from "@/components/ui/button"
import type { Account } from "@/lib/types"

const formatDateValue = (date: Date) => {
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, "0")
  const d = `${date.getDate()}`.padStart(2, "0")
  return `${y}-${m}-${d}`
}

const CURRENCY_APIS = [
  { value: "frankfurter", label: "Frankfurter", description: "Free · European Central Bank rates" },
  { value: "exchangerate-api", label: "ExchangeRate-API", description: "Free tier · 1,500 req/mo" },
  { value: "open-exchange-rates", label: "Open Exchange Rates", description: "Free tier · 1,000 req/mo" },
  { value: "fixer", label: "Fixer.io", description: "Paid · Real-time rates" },
  { value: "currency-api", label: "Currency API", description: "Free · Daily updates" },
] as const

type Props = {
  spreadsheetMode: boolean
  setSpreadsheetMode: Dispatch<SetStateAction<boolean>>
  pageSize: number
  calendarRange: DateRange | undefined
  currencyApi: string
  setCurrencyApi: Dispatch<SetStateAction<string>>
  accounts: Account[]
  currentUserEmail: string
  runningBalanceAccountIds: Set<string>
  setRunningBalanceAccountIds: Dispatch<SetStateAction<Set<string>>>
  onDataRestored: () => Promise<void>
  finverseCallbackCode?: string | null
}

type BackupResult = {
  path: string
  accounts: number
  records: number
}

type DataSourceInfo = {
  method: string
  path: string
}

type FinverseLinkTokenResponse = {
  access_token: string
  expires_in: number
  issued_at: string
  link_url: string
  token_type: string
}

type FinverseLoginIdentityTokenResponse = {
  access_token: string
  expires_in: number
  issued_at: string
  login_identity_id: string
  refresh_token: string
  token_type: string
}

const FINVERSE_SETTINGS_KEY = "finance-finverse-settings"
const FINVERSE_LOGIN_IDENTITY_KEY = "finance-finverse-login-identity"
const FINVERSE_DEFAULT_REDIRECT_URI = "finances://finverse/callback"

type FinverseSettings = {
  clientId: string
  clientSecret: string
  userId: string
  redirectUri: string
  state: string
  uiMode: string
  responseMode: string
  language: string
}

const loadFinverseSettings = (): FinverseSettings => {
  const defaults = {
    clientId: "",
    clientSecret: "",
    userId: "",
    redirectUri: FINVERSE_DEFAULT_REDIRECT_URI,
    state: `finance-${Date.now()}`,
    uiMode: "redirect",
    responseMode: "form_post",
    language: "en",
  }
  try {
    const saved = localStorage.getItem(FINVERSE_SETTINGS_KEY)
    if (saved) {
      const parsed = { ...defaults, ...JSON.parse(saved) } as FinverseSettings
      if (parsed.redirectUri.includes("localhost:1420") || parsed.redirectUri.includes("localhost:5173")) {
        parsed.redirectUri = FINVERSE_DEFAULT_REDIRECT_URI
      }
      return parsed
    }
  } catch {
    // Ignore invalid local settings.
  }
  return defaults
}

const normalizeFinverseRedirectUri = (value: string) => {
  const trimmed = value.trim() || FINVERSE_DEFAULT_REDIRECT_URI
  if (trimmed.includes("localhost:1420") || trimmed.includes("localhost:5173")) {
    return FINVERSE_DEFAULT_REDIRECT_URI
  }
  return trimmed
    .replace(/\/$/, "")
}

const getErrorMessage = (error: unknown) => {
  if (typeof error === "string") {
    return error
  }
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message)
  }
  try {
    return JSON.stringify(error)
  } catch {
    return "Operation failed"
  }
}

export function SettingsPage({
  spreadsheetMode,
  setSpreadsheetMode,
  pageSize,
  calendarRange,
  currencyApi,
  setCurrencyApi,
  accounts,
  currentUserEmail,
  runningBalanceAccountIds,
  setRunningBalanceAccountIds,
  onDataRestored,
  finverseCallbackCode,
}: Props) {
  const [isExporting, setIsExporting] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false)
  const [taskProgress, setTaskProgress] = useState(0)
  const [dataSourceInfo, setDataSourceInfo] = useState<DataSourceInfo | null>(null)
  const [finverseSettings, setFinverseSettings] = useState<FinverseSettings>(() => {
    const settings = loadFinverseSettings()
    return {
      ...settings,
      userId: settings.userId.trim() || currentUserEmail || `finance-user-${Date.now()}`,
    }
  })
  const [finverseLinkUrl, setFinverseLinkUrl] = useState("")
  const [finverseCode, setFinverseCode] = useState("")
  const [finverseFrameOpen, setFinverseFrameOpen] = useState(false)
  const [finverseLoginIdentity, setFinverseLoginIdentity] =
    useState<FinverseLoginIdentityTokenResponse | null>(() => {
      try {
        const saved = localStorage.getItem(FINVERSE_LOGIN_IDENTITY_KEY)
        return saved ? JSON.parse(saved) as FinverseLoginIdentityTokenResponse : null
      } catch {
        return null
      }
    })
  const [isCreatingFinverseLink, setIsCreatingFinverseLink] = useState(false)
  const [isExchangingFinverseCode, setIsExchangingFinverseCode] = useState(false)
  const personalAccounts = accounts
    .filter((account) => account.ownerEmail?.toLowerCase() === currentUserEmail.toLowerCase())
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
  const isTrackingAllPersonalAccounts = runningBalanceAccountIds.size === 0
  const isTrackedForRunningBalance = (accountId: string) =>
    isTrackingAllPersonalAccounts || runningBalanceAccountIds.has(accountId)
  const toggleRunningBalanceAccount = (accountId: string) => {
    setRunningBalanceAccountIds((current) => {
      const next = new Set(
        current.size === 0 ? personalAccounts.map((account) => account.id) : current
      )
      if (next.has(accountId)) next.delete(accountId)
      else next.add(accountId)
      if (next.size === 0 && personalAccounts.length > 0) return current
      return next
    })
  }

  useEffect(() => {
    let cancelled = false
    const loadDataSourceInfo = async () => {
      try {
        const info = await invoke<DataSourceInfo>("get_data_source_info")
        if (!cancelled) setDataSourceInfo(info)
      } catch {
        if (!cancelled) setDataSourceInfo(null)
      }
    }
    void loadDataSourceInfo()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(FINVERSE_SETTINGS_KEY, JSON.stringify(finverseSettings))
  }, [finverseSettings])

  useEffect(() => {
    if (!finverseCallbackCode) return
    setFinverseCode(finverseCallbackCode)
    toast.success("Finverse callback code captured")
  }, [finverseCallbackCode])

  useEffect(() => {
    if (!isExporting && !isRestoring) {
      setTaskProgress(0)
      return
    }

    setTaskProgress(12)
    const interval = window.setInterval(() => {
      setTaskProgress((current) => (current >= 88 ? current : current + 11))
    }, 180)

    return () => window.clearInterval(interval)
  }, [isExporting, isRestoring])

  const handleExportBackup = async () => {
    setIsExporting(true)
    const toastId = toast.loading("Preparing backup export...")
    try {
      const result = await invoke<BackupResult | null>("export_backup_csv_with_dialog")
      if (!result) {
        toast.dismiss(toastId)
        return
      }
      setTaskProgress(100)
      toast.success(`Exported ${result.records} records to ${result.path}`, { id: toastId })
    } catch (error) {
      toast.error(getErrorMessage(error), { id: toastId })
    } finally {
      setIsExporting(false)
    }
  }

  const handleRestoreBackup = async () => {
    setIsRestoring(true)
    const toastId = toast.loading("Restoring backup...")
    try {
      const result = await invoke<BackupResult | null>("restore_backup_csv_with_dialog")
      if (!result) {
        toast.dismiss(toastId)
        return
      }
      setTaskProgress(100)
      await onDataRestored()
      toast.success(`Restored ${result.records} records from ${result.path}`, { id: toastId })
    } catch (error) {
      toast.error(getErrorMessage(error), { id: toastId })
    } finally {
      setIsRestoring(false)
    }
  }

  const updateFinverseSetting = <K extends keyof FinverseSettings>(
    key: K,
    value: FinverseSettings[K]
  ) => {
    setFinverseSettings((current) => ({ ...current, [key]: value }))
  }

  const handleCreateFinverseLink = async () => {
    const redirectUri = normalizeFinverseRedirectUri(finverseSettings.redirectUri)
    if (
      !finverseSettings.clientId.trim() ||
      !finverseSettings.clientSecret.trim() ||
      !finverseSettings.userId.trim() ||
      !redirectUri
    ) {
      toast.error("Client ID, client secret, user ID, and redirect URI are required")
      return
    }
    if (redirectUri !== finverseSettings.redirectUri) {
      updateFinverseSetting("redirectUri", redirectUri)
    }
    setIsCreatingFinverseLink(true)
    const toastId = toast.loading("Creating Finverse Link URL...")
    try {
      const result = await invoke<FinverseLinkTokenResponse>("finverse_create_link_token", {
        payload: {
          client_id: finverseSettings.clientId.trim(),
          client_secret: finverseSettings.clientSecret.trim(),
          user_id: finverseSettings.userId.trim(),
          redirect_uri: redirectUri,
          state: finverseSettings.state.trim() || `finance-${Date.now()}`,
          ui_mode: finverseSettings.uiMode.trim() || "redirect",
          response_mode: finverseSettings.responseMode.trim() || "form_post",
          language: finverseSettings.language.trim() || "en",
        },
      })
      setFinverseLinkUrl(result.link_url)
      toast.success("Finverse Link URL created", { id: toastId })
    } catch (error) {
      const message = getErrorMessage(error)
      toast.error(
        message.includes("Invalid redirect_uri value")
          ? `Finverse rejected the redirect URI. Register this exact callback URL in Finverse: ${redirectUri}`
          : message,
        { id: toastId }
      )
    } finally {
      setIsCreatingFinverseLink(false)
    }
  }

  const handleExchangeFinverseCode = async () => {
    const redirectUri = normalizeFinverseRedirectUri(finverseSettings.redirectUri)
    if (!finverseCode.trim()) {
      toast.error("Paste the redirect code first")
      return
    }
    setIsExchangingFinverseCode(true)
    const toastId = toast.loading("Exchanging Finverse code...")
    try {
      const result = await invoke<FinverseLoginIdentityTokenResponse>("finverse_exchange_code", {
        payload: {
          client_id: finverseSettings.clientId.trim(),
          client_secret: finverseSettings.clientSecret.trim(),
          redirect_uri: redirectUri,
          code: finverseCode.trim(),
        },
      })
      setFinverseLoginIdentity(result)
      localStorage.setItem(FINVERSE_LOGIN_IDENTITY_KEY, JSON.stringify(result))
      toast.success(`Connected login identity ${result.login_identity_id}`, { id: toastId })
    } catch (error) {
      toast.error(getErrorMessage(error), { id: toastId })
    } finally {
      setIsExchangingFinverseCode(false)
    }
  }

  return (
    <div className="w-full pb-20 pt-4 md:mx-auto md:max-w-5xl md:px-1 md:pt-6">
      <div className="grid gap-4 px-1.5 md:px-0">
        <div className="border-y bg-card p-4 md:border">
          <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Application-level preferences and workflow defaults.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="border-y bg-card p-4 md:border">
            <h2 className="text-sm font-semibold">Editing Mode</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Spreadsheet mode lets you edit cells inline with keyboard navigation.
            </p>
            <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs">
              <span className="text-muted-foreground">Spreadsheet mode</span>
              <Button
                variant={spreadsheetMode ? "default" : "outline"}
                size="sm"
                className="h-7 rounded-none px-2 text-xs"
                onClick={() => setSpreadsheetMode((current) => !current)}
              >
                {spreadsheetMode ? "Enabled" : "Disabled"}
              </Button>
            </div>
          </div>
          <div className="border-y bg-card p-4 md:border">
            <h2 className="text-sm font-semibold">Data Window</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Current filters are applied to the transactions page only.
            </p>
            <dl className="mt-4 grid gap-2 border-t pt-3 text-xs">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Rows per page</dt>
                <dd>{pageSize}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Selected range</dt>
                <dd>
                  {calendarRange?.from ? formatDateValue(calendarRange.from) : "-"} to{" "}
                  {calendarRange?.to ? formatDateValue(calendarRange.to) : "-"}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="border-y bg-card p-4 md:border">
          <h2 className="text-sm font-semibold">Running Balance Accounts</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose which personal accounts contribute to the transaction table running balance.
          </p>
          <div className="mt-4 grid gap-2 border-t pt-3">
            <button
              type="button"
              onClick={() => setRunningBalanceAccountIds(new Set())}
              className={`flex items-center justify-between gap-3 border px-3 py-2.5 text-left text-xs transition-colors hover:bg-muted ${
                isTrackingAllPersonalAccounts ? "border-foreground bg-muted" : "border-border"
              }`}
            >
              <span className="font-medium">All personal accounts</span>
              {isTrackingAllPersonalAccounts ? (
                <span className="text-[10px] uppercase tracking-wide">Selected</span>
              ) : null}
            </button>
            <div className="grid gap-2 md:grid-cols-2">
              {personalAccounts.map((account) => {
                const selected = isTrackedForRunningBalance(account.id)
                return (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => toggleRunningBalanceAccount(account.id)}
                    className={`flex items-center justify-between gap-3 border px-3 py-2.5 text-left text-xs transition-colors hover:bg-muted ${
                      selected ? "border-foreground bg-muted" : "border-border"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{account.displayName}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                        {account.id}
                      </span>
                    </span>
                    <span className="text-[10px] uppercase tracking-wide">
                      {selected ? "On" : "Off"}
                    </span>
                  </button>
                )
              })}
            </div>
            {personalAccounts.length === 0 ? (
              <p className="text-xs text-muted-foreground">No personal accounts available.</p>
            ) : null}
          </div>
        </div>

        <div className="border-y bg-card p-4 md:border">
          <h2 className="text-sm font-semibold">Currency Conversion API</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose the data source used to fetch live exchange rates.
          </p>
          <div className="mt-4 grid gap-2 border-t pt-3">
            {CURRENCY_APIS.map((api) => (
              <button
                key={api.value}
                type="button"
                onClick={() => setCurrencyApi(api.value)}
                className={`flex items-center justify-between gap-3 border px-3 py-2.5 text-left text-xs transition-colors hover:bg-muted ${
                  currencyApi === api.value
                    ? "border-foreground bg-muted"
                    : "border-border"
                }`}
              >
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">{api.label}</span>
                  <span className="text-[10px] text-muted-foreground">{api.description}</span>
                </span>
                {currencyApi === api.value && (
                  <span className="text-[10px] uppercase tracking-wide text-foreground">
                    Selected
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="border-y bg-card p-4 md:border">
          <h2 className="text-sm font-semibold">Finverse Test Bank Connection</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Create a Finverse Link URL, connect the Test Bank in the browser, then paste the
            returned code to store the login identity.
          </p>
          <div className="mt-4 grid gap-3 border-t pt-3">
            <div className="grid gap-2 md:grid-cols-2">
              <label className="grid gap-1 text-xs">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Client ID
                </span>
                <input
                  value={finverseSettings.clientId}
                  onChange={(event) => updateFinverseSetting("clientId", event.target.value)}
                  className="h-8 border bg-background px-2 text-xs"
                  placeholder="setup_on_developer_portal"
                />
              </label>
              <label className="grid gap-1 text-xs">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Client Secret
                </span>
                <input
                  type="password"
                  value={finverseSettings.clientSecret}
                  onChange={(event) => updateFinverseSetting("clientSecret", event.target.value)}
                  className="h-8 border bg-background px-2 text-xs"
                  placeholder="client_secret"
                />
              </label>
            </div>
            <label className="grid gap-1 text-xs">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                User ID
              </span>
              <input
                value={finverseSettings.userId}
                onChange={(event) => updateFinverseSetting("userId", event.target.value)}
                className="h-8 border bg-background px-2 text-xs"
                placeholder="Stable app user ID"
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Redirect URI
              </span>
              <input
                value={finverseSettings.redirectUri}
                onChange={(event) => updateFinverseSetting("redirectUri", event.target.value)}
                className="h-8 border bg-background px-2 text-xs"
                placeholder="Registered Finverse redirect URI"
              />
            </label>
            <div className="border bg-background px-2 py-2 text-[10px] text-muted-foreground">
              Register this exact callback URL in Finverse:{" "}
              <span className="font-mono text-foreground">
                {normalizeFinverseRedirectUri(finverseSettings.redirectUri)}
              </span>
            </div>
            <div className="grid gap-2 md:grid-cols-4">
              <label className="grid gap-1 text-xs md:col-span-2">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  State
                </span>
                <input
                  value={finverseSettings.state}
                  onChange={(event) => updateFinverseSetting("state", event.target.value)}
                  className="h-8 border bg-background px-2 text-xs"
                />
              </label>
              <label className="grid gap-1 text-xs">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  UI Mode
                </span>
                <select
                  value={finverseSettings.uiMode}
                  onChange={(event) => updateFinverseSetting("uiMode", event.target.value)}
                  className="h-8 border bg-background px-2 text-xs"
                >
                  <option value="redirect">redirect</option>
                  <option value="standalone">standalone</option>
                  <option value="iframe">iframe</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Response
                </span>
                <select
                  value={finverseSettings.responseMode}
                  onChange={(event) => updateFinverseSetting("responseMode", event.target.value)}
                  className="h-8 border bg-background px-2 text-xs"
                >
                  <option value="form_post">form_post</option>
                  <option value="query">query</option>
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="default"
                className="h-8 rounded-none text-xs"
                disabled={isCreatingFinverseLink || isExchangingFinverseCode}
                onClick={() => void handleCreateFinverseLink()}
              >
                {isCreatingFinverseLink ? <SpinnerIcon className="size-3.5 animate-spin" /> : null}
                Create Link URL
              </Button>
              {finverseLinkUrl ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 rounded-none text-xs"
                  onClick={() => setFinverseFrameOpen(true)}
                >
                  Open in App
                </Button>
              ) : null}
              {finverseLinkUrl ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 rounded-none text-xs"
                  onClick={() => window.open(finverseLinkUrl, "_blank", "noopener,noreferrer")}
                >
                  Open Browser
                </Button>
              ) : null}
            </div>
            {finverseLinkUrl ? (
              <div className="grid gap-1 text-xs">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Link URL
                </span>
                <div className="break-all border bg-background px-2 py-2 font-mono text-[10px]">
                  {finverseLinkUrl}
                </div>
              </div>
            ) : null}
            <div className="grid gap-2 border-t pt-3">
              <label className="grid gap-1 text-xs">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Redirect Code
                </span>
                <input
                  value={finverseCode}
                  onChange={(event) => setFinverseCode(event.target.value)}
                  className="h-8 border bg-background px-2 text-xs"
                  placeholder="Paste code from Finverse redirect"
                />
              </label>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 rounded-none text-xs"
                  disabled={isCreatingFinverseLink || isExchangingFinverseCode}
                  onClick={() => void handleExchangeFinverseCode()}
                >
                  {isExchangingFinverseCode ? <SpinnerIcon className="size-3.5 animate-spin" /> : null}
                  Exchange Code
                </Button>
              </div>
            </div>
            {finverseLoginIdentity ? (
              <dl className="grid gap-2 border-t pt-3 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Login identity</dt>
                  <dd className="font-mono text-[10px]">{finverseLoginIdentity.login_identity_id}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Token issued</dt>
                  <dd>{finverseLoginIdentity.issued_at}</dd>
                </div>
              </dl>
            ) : null}
            <p className="text-[10px] text-muted-foreground">
              Test Bank happy path credentials: User ID usergood, password datagood.
              These settings are stored locally for this first connection workflow.
            </p>
          </div>
        </div>

        {finverseFrameOpen && finverseLinkUrl ? (
          <div className="fixed inset-0 z-[100] grid bg-background">
            <div className="flex h-11 items-center justify-between border-b bg-card px-3">
              <div className="text-xs font-medium">Finverse Link</div>
              <Button
                type="button"
                variant="outline"
                className="h-7 rounded-none text-xs"
                onClick={() => setFinverseFrameOpen(false)}
              >
                Close
              </Button>
            </div>
            <iframe
              title="Finverse Link"
              src={finverseLinkUrl}
              className="h-[calc(100vh-2.75rem)] w-full border-0"
            />
          </div>
        ) : null}

        <div className="border-y bg-card p-4 md:border">
          <h2 className="text-sm font-semibold">Data Source Settings</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose where transaction data is stored and manage import/export.
          </p>
          <div className="mt-4 grid gap-4 border-t pt-3">
            <div className="grid gap-2 md:grid-cols-2">
              <button
                type="button"
                className="border border-foreground bg-muted px-3 py-2.5 text-left text-xs"
              >
                <span className="block font-medium">SQLite</span>
                <span className="mt-0.5 block text-[10px] text-muted-foreground">
                  Local database file
                </span>
              </button>
              <button
                type="button"
                disabled
                className="border border-border px-3 py-2.5 text-left text-xs opacity-45"
              >
                <span className="block font-medium">MySQL</span>
                <span className="mt-0.5 block text-[10px] text-muted-foreground">
                  Not configured yet
                </span>
              </button>
            </div>
            <dl className="grid gap-2 text-xs">
              <div className="grid gap-1">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Active method
                </dt>
                <dd className="font-medium uppercase">
                  {dataSourceInfo?.method ?? "sqlite"}
                </dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Data source file
                </dt>
                <dd className="break-all border bg-background px-2 py-2 font-mono text-[10px]">
                  {dataSourceInfo?.path ?? "Loading..."}
                </dd>
              </div>
            </dl>
            <p className="text-[10px] text-muted-foreground">
              Export opens a native save dialog. Import opens a native file picker and replaces all
              existing account and transaction data from the selected CSV backup.
            </p>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-8 rounded-none text-xs"
              disabled={isExporting || isRestoring}
              onClick={() => void handleExportBackup()}
            >
              {isExporting ? <SpinnerIcon className="size-3.5 animate-spin" /> : null}
              {isExporting ? "Exporting..." : "Export CSV"}
            </Button>
            <Button
              type="button"
              variant="default"
              className="h-8 rounded-none text-xs"
              disabled={isExporting || isRestoring}
              onClick={() => setRestoreConfirmOpen(true)}
            >
              {isRestoring ? <SpinnerIcon className="size-3.5 animate-spin" /> : null}
              {isRestoring ? "Importing..." : "Import CSV"}
            </Button>
          </div>
          {isExporting || isRestoring ? (
            <div className="mt-3 border border-border/70 bg-background/60 p-3">
              <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                <span>{isExporting ? "Export in progress" : "Import in progress"}</span>
                <span>{taskProgress}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden bg-muted">
                <div
                  className="h-full bg-foreground transition-[width] duration-200 ease-out"
                  style={{ width: `${taskProgress}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <AlertDialog open={restoreConfirmOpen} onOpenChange={setRestoreConfirmOpen}>
        <AlertDialogContent size="sm" className="rounded-none">
          <AlertDialogHeader className="place-items-start text-left">
            <AlertDialogTitle>Import backup?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete all current accounts and transactions before importing the backup
              file. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="h-8 rounded-none text-xs"
              disabled={isRestoring}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="h-8 rounded-none text-xs"
              disabled={isRestoring}
              onClick={(event) => {
                event.preventDefault()
                setRestoreConfirmOpen(false)
                void handleRestoreBackup()
              }}
            >
              Confirm import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
