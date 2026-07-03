import { useMemo, useState } from "react"
import { CaretDownIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import type { Account, CategoryDefinition, RecordType } from "@/lib/types"

type RecurringPeriodUnit = "day" | "week" | "month" | "year"
type RecurringRule =
  | {
      mode: "interval"
      every: number
      unit: RecurringPeriodUnit
    }
  | {
      mode: "monthly-day"
      dayOfMonth: number
    }

type RecurringTransaction = {
  id: string
  name: string
  accountFromId: string
  payeeToId: string
  type: RecordType
  amount: string
  currency: string
  category: string
  nextDate: string
  rule: RecurringRule
}

type Props = {
  accounts: Account[]
  categories: CategoryDefinition[]
  currentUserEmail: string
}

const storageKey = "finance-recurring-transactions"

const loadRecurringTransactions = (): RecurringTransaction[] => {
  try {
    const saved = localStorage.getItem(storageKey)
    return saved ? JSON.parse(saved) as RecurringTransaction[] : []
  } catch {
    return []
  }
}

const saveRecurringTransactions = (items: RecurringTransaction[]) => {
  localStorage.setItem(storageKey, JSON.stringify(items))
}

const todayValue = () => new Date().toISOString().slice(0, 10)

function SelectButton({
  value,
  label,
  options,
  onChange,
}: {
  value: string
  label: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  const selectedLabel = options.find((option) => option.value === value)?.label ?? label
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-full justify-between rounded-none px-2 text-xs font-normal"
        >
          <span className="truncate">{selectedLabel}</span>
          <CaretDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function RecurringPage({ accounts, categories, currentUserEmail }: Props) {
  const personalAccounts = useMemo(
    () =>
      accounts.filter(
        (account) => account.ownerEmail?.toLowerCase() === currentUserEmail.toLowerCase()
      ),
    [accounts, currentUserEmail]
  )
  const sourceAccounts = personalAccounts.length > 0 ? personalAccounts : accounts
  const [items, setItems] = useState<RecurringTransaction[]>(loadRecurringTransactions)
  const [ruleMode, setRuleMode] = useState<RecurringRule["mode"]>("interval")
  const [draft, setDraft] = useState({
    name: "",
    accountFromId: sourceAccounts[0]?.id ?? "",
    payeeToId: accounts[0]?.id ?? "",
    type: "Expense" as RecordType,
    amount: "0.00",
    currency: "RM",
    category: categories[0]?.name ?? "Groceries",
    nextDate: todayValue(),
    every: "1",
    unit: "month" as RecurringPeriodUnit,
    dayOfMonth: "1",
  })

  const updateItems = (next: RecurringTransaction[]) => {
    setItems(next)
    saveRecurringTransactions(next)
  }

  const addRecurring = () => {
    const name = draft.name.trim()
    if (!name || !draft.accountFromId || !draft.payeeToId) return
    const every = Math.max(1, Number.parseInt(draft.every, 10) || 1)
    const dayOfMonth = Math.min(31, Math.max(1, Number.parseInt(draft.dayOfMonth, 10) || 1))
    const next: RecurringTransaction = {
      id: `recurring-${Date.now()}`,
      name,
      accountFromId: draft.accountFromId,
      payeeToId: draft.payeeToId,
      type: draft.type,
      amount: draft.amount,
      currency: draft.currency,
      category: draft.category,
      nextDate: draft.nextDate || todayValue(),
      rule:
        ruleMode === "interval"
          ? { mode: "interval", every, unit: draft.unit }
          : { mode: "monthly-day", dayOfMonth },
    }
    updateItems([next, ...items])
    setDraft((current) => ({ ...current, name: "", amount: "0.00" }))
  }

  const removeRecurring = (id: string) => {
    updateItems(items.filter((item) => item.id !== id))
  }

  const accountLabel = (id: string) =>
    accounts.find((account) => account.id === id)?.displayName ?? id

  const ruleLabel = (rule: RecurringRule) =>
    rule.mode === "interval"
      ? `Every ${rule.every} ${rule.unit}${rule.every === 1 ? "" : "s"}`
      : `The ${rule.dayOfMonth} of every month`

  return (
    <div className="w-full pb-20 pt-4 md:mx-auto md:max-w-6xl md:px-1 md:pt-6">
      <div className="grid gap-4 px-1.5 md:px-0">
        <div className="border-y bg-card p-4 md:border">
          <h1 className="text-lg font-semibold tracking-tight">Recurring</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Set up recurring bills, salary, allowance, and repeated transfers.
          </p>
        </div>

        <div className="border-y bg-card p-4 md:border">
          <h2 className="text-sm font-semibold">New recurring transaction</h2>
          <div className="mt-4 grid gap-3 border-t pt-3 md:grid-cols-3">
            <Input
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="Name"
              className="h-8 text-xs"
            />
            <Input
              value={draft.amount}
              onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))}
              placeholder="Amount"
              className="h-8 text-xs"
            />
            <Input
              type="date"
              value={draft.nextDate}
              onChange={(event) => setDraft((current) => ({ ...current, nextDate: event.target.value }))}
              className="h-8 text-xs"
            />
            <SelectButton
              value={draft.accountFromId}
              label="From account"
              options={sourceAccounts.map((account) => ({
                value: account.id,
                label: `From: ${account.displayName}`,
              }))}
              onChange={(value) => setDraft((current) => ({ ...current, accountFromId: value }))}
            />
            <SelectButton
              value={draft.payeeToId}
              label="To account"
              options={accounts.map((account) => ({
                value: account.id,
                label: `To: ${account.displayName}`,
              }))}
              onChange={(value) => setDraft((current) => ({ ...current, payeeToId: value }))}
            />
            <SelectButton
              value={draft.category}
              label="Category"
              options={categories.map((category) => ({
                value: category.name,
                label: category.displayName,
              }))}
              onChange={(value) => setDraft((current) => ({ ...current, category: value }))}
            />
          </div>
          <div className="mt-3 grid gap-3 border-t pt-3 md:grid-cols-[auto_1fr_auto] md:items-center">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={ruleMode === "interval" ? "default" : "outline"}
                size="sm"
                className="h-8 rounded-none text-xs"
                onClick={() => setRuleMode("interval")}
              >
                Every interval
              </Button>
              <Button
                type="button"
                variant={ruleMode === "monthly-day" ? "default" : "outline"}
                size="sm"
                className="h-8 rounded-none text-xs"
                onClick={() => setRuleMode("monthly-day")}
              >
                Day of month
              </Button>
            </div>
            {ruleMode === "interval" ? (
              <div className="grid grid-cols-[80px_1fr] gap-2">
                <Input
                  type="number"
                  min={1}
                  value={draft.every}
                  onChange={(event) => setDraft((current) => ({ ...current, every: event.target.value }))}
                  className="h-8 text-xs"
                />
                <SelectButton
                  value={draft.unit}
                  label="Period"
                  options={[
                    { value: "day", label: "day" },
                    { value: "week", label: "week" },
                    { value: "month", label: "month" },
                    { value: "year", label: "year" },
                  ]}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      unit: value as RecurringPeriodUnit,
                    }))
                  }
                />
              </div>
            ) : (
              <div className="grid grid-cols-[1fr_120px] items-center gap-2 text-xs">
                <span className="text-muted-foreground">The</span>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={draft.dayOfMonth}
                  onChange={(event) => setDraft((current) => ({ ...current, dayOfMonth: event.target.value }))}
                  className="h-8 text-xs"
                />
              </div>
            )}
            <Button
              type="button"
              size="sm"
              className="h-8 rounded-none text-xs"
              onClick={addRecurring}
              disabled={!draft.name.trim()}
            >
              <PlusIcon className="size-3.5" />
              Add
            </Button>
          </div>
        </div>

        <div className="border-y bg-card md:border">
          <div className="grid grid-cols-[1fr_1fr_1fr_auto] border-b px-4 py-2 text-[10px] uppercase tracking-wide text-muted-foreground">
            <span>Name</span>
            <span>Rule</span>
            <span>Next</span>
            <span className="w-8" />
          </div>
          {items.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[1fr_1fr_1fr_auto] items-center border-b px-4 py-3 text-xs last:border-b-0"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{item.name}</p>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {accountLabel(item.accountFromId)} to {accountLabel(item.payeeToId)} · {item.currency} {item.amount}
                </p>
              </div>
              <span className="text-muted-foreground">{ruleLabel(item.rule)}</span>
              <span>{item.nextDate}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 rounded-none"
                onClick={() => removeRecurring(item.id)}
                aria-label="Delete recurring transaction"
              >
                <TrashIcon className="size-3.5" />
              </Button>
            </div>
          ))}
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">
              No recurring transactions yet.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
