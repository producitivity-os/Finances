import type { Dispatch, SetStateAction } from "react"
import type { DateRange } from "react-day-picker"
import { Button } from "@/components/ui/button"

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
}

export function SettingsPage({
  spreadsheetMode,
  setSpreadsheetMode,
  pageSize,
  calendarRange,
  currencyApi,
  setCurrencyApi,
}: Props) {
  return (
    <div className="w-full pb-20 pt-4 md:mx-auto md:max-w-5xl md:px-2 md:pt-6">
      <div className="grid gap-4 px-3 md:px-0">
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
      </div>
    </div>
  )
}
