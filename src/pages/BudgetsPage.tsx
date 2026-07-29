import { useMemo, useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import { invoke } from "@tauri-apps/api/core"
import { CaretDownIcon, CheckIcon, PencilSimpleIcon, PlusIcon, TrashIcon, XIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import type { Budget, BudgetApi, BudgetPeriod, CategoryDefinition, RecordItem } from "@/lib/types"
import { mapBudgetFromApi } from "@/lib/types"

type Props = {
  budgets: Budget[]
  setBudgets: Dispatch<SetStateAction<Budget[]>>
  categories: CategoryDefinition[]
  records: RecordItem[]
}

type BudgetDraft = {
  category: string
  amount: string
  currency: string
  period: BudgetPeriod
}

const makeId = () => `budget-${Date.now()}-${Math.floor(Math.random() * 10000)}`

const periodOptions: { value: BudgetPeriod; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
]

const startOfPeriod = (period: BudgetPeriod, now = new Date()) => {
  if (period === "yearly") return new Date(now.getFullYear(), 0, 1)
  if (period === "monthly") return new Date(now.getFullYear(), now.getMonth(), 1)

  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const mondayOffset = (start.getDay() + 6) % 7
  start.setDate(start.getDate() - mondayOffset)
  return start
}

const formatCurrency = (currency: string, amount: number) => {
  const prefix = currency === "MYR" || currency === "RM" ? "RM" : currency
  return `${prefix} ${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

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

export function BudgetsPage({ budgets, setBudgets, categories, records }: Props) {
  const categoryOptions = useMemo(
    () =>
      categories.map((category) => ({
        value: category.name,
        label: category.displayName,
      })),
    [categories]
  )
  const [draft, setDraft] = useState<BudgetDraft>({
    category: categoryOptions[0]?.value ?? "Groceries",
    amount: "0.00",
    currency: "MYR",
    period: "monthly",
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<BudgetDraft | null>(null)

  const spentForBudget = (budget: Budget) => {
    const now = new Date()
    const periodStart = startOfPeriod(budget.period)
    return records
      .filter((record) => {
        if (record.type !== "Expense" || record.category !== budget.category) return false
        const recordDate = new Date(`${record.date}T00:00:00`)
        return recordDate >= periodStart && recordDate <= now
      })
      .reduce((total, record) => total + (Number.parseFloat(record.amount) || 0), 0)
  }

  const categoryLabel = (name: string) =>
    categories.find((category) => category.name === name)?.displayName ?? name

  const validateDraft = (value: BudgetDraft) => {
    const amount = Number.parseFloat(value.amount)
    if (!value.category) return "Category is required"
    if (!Number.isFinite(amount) || amount <= 0) return "Budget amount must be greater than zero"
    return null
  }

  const addBudget = async () => {
    const error = validateDraft(draft)
    if (error) {
      toast.error(error)
      return
    }

    try {
      const saved = await invoke<BudgetApi>("create_budget", {
        payload: {
          id: makeId(),
          category: draft.category,
          amount: Number.parseFloat(draft.amount).toFixed(2),
          currency: draft.currency.trim() || "MYR",
          period: draft.period,
        },
      })
      setBudgets((current) => [...current, mapBudgetFromApi(saved)])
      setDraft((current) => ({ ...current, amount: "0.00" }))
      toast.success("Budget added")
    } catch {
      toast.error("Failed to add budget")
    }
  }

  const startEdit = (budget: Budget) => {
    setEditingId(budget.id)
    setEditDraft({
      category: budget.category,
      amount: budget.amount,
      currency: budget.currency,
      period: budget.period,
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditDraft(null)
  }

  const saveEdit = async (budget: Budget) => {
    if (!editDraft) return
    const error = validateDraft(editDraft)
    if (error) {
      toast.error(error)
      return
    }

    try {
      const saved = await invoke<BudgetApi>("update_budget", {
        payload: {
          id: budget.id,
          category: editDraft.category,
          amount: Number.parseFloat(editDraft.amount).toFixed(2),
          currency: editDraft.currency.trim() || "MYR",
          period: editDraft.period,
        },
      })
      const mapped = mapBudgetFromApi(saved)
      setBudgets((current) => current.map((item) => (item.id === mapped.id ? mapped : item)))
      cancelEdit()
      toast.success("Budget updated")
    } catch {
      toast.error("Failed to update budget")
    }
  }

  const deleteBudget = async (budget: Budget) => {
    const previous = budgets
    setBudgets((current) => current.filter((item) => item.id !== budget.id))
    try {
      await invoke("delete_budget", { id: budget.id })
      toast.success("Budget deleted")
    } catch {
      setBudgets(previous)
      toast.error("Failed to delete budget")
    }
  }

  return (
    <div className="w-full pb-20 pt-4 md:mx-auto md:max-w-6xl md:px-1 md:pt-6">
      <div className="grid gap-4 px-1.5 md:px-0">
        <div className="border-y bg-card p-4 md:border">
          <h1 className="text-lg font-semibold tracking-tight">Budgets</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Set category limits and get mailbox warnings when current-period spending passes them.
          </p>
        </div>

        <div className="border-y bg-card p-4 md:border">
          <h2 className="text-sm font-semibold">New budget</h2>
          <div className="mt-4 grid gap-3 border-t pt-3 md:grid-cols-[1.2fr_1fr_1fr_100px_auto]">
            <SelectButton
              value={draft.category}
              label="Category"
              options={categoryOptions}
              onChange={(value) => setDraft((current) => ({ ...current, category: value }))}
            />
            <Input
              value={draft.amount}
              onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))}
              placeholder="Amount"
              className="h-8 text-xs"
            />
            <SelectButton
              value={draft.period}
              label="Period"
              options={periodOptions}
              onChange={(value) =>
                setDraft((current) => ({ ...current, period: value as BudgetPeriod }))
              }
            />
            <Input
              value={draft.currency}
              onChange={(event) => setDraft((current) => ({ ...current, currency: event.target.value }))}
              placeholder="Currency"
              className="h-8 text-xs"
            />
            <Button type="button" size="sm" className="h-8 rounded-none text-xs" onClick={addBudget}>
              <PlusIcon className="size-3.5" />
              Add
            </Button>
          </div>
        </div>

        <div className="border-y bg-card md:border">
          <div className="grid grid-cols-[1fr_1fr_1fr_auto] border-b px-4 py-2 text-[10px] uppercase tracking-wide text-muted-foreground md:grid-cols-[1.2fr_1fr_1fr_1fr_auto]">
            <span>Category</span>
            <span>Limit</span>
            <span>Period</span>
            <span className="hidden md:block">Spent</span>
            <span className="w-20" />
          </div>
          {budgets.map((budget) => {
            const isEditing = editingId === budget.id && editDraft
            const spent = spentForBudget(budget)
            const limit = Number.parseFloat(budget.amount) || 0
            const percentage = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0
            const overLimit = spent > limit

            return (
              <div
                key={budget.id}
                className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-3 border-b px-4 py-3 text-xs last:border-b-0 md:grid-cols-[1.2fr_1fr_1fr_1fr_auto]"
              >
                {isEditing ? (
                  <>
                    <SelectButton
                      value={editDraft.category}
                      label="Category"
                      options={categoryOptions}
                      onChange={(value) =>
                        setEditDraft((current) => current ? { ...current, category: value } : current)
                      }
                    />
                    <Input
                      value={editDraft.amount}
                      onChange={(event) =>
                        setEditDraft((current) => current ? { ...current, amount: event.target.value } : current)
                      }
                      className="h-8 text-xs"
                    />
                    <SelectButton
                      value={editDraft.period}
                      label="Period"
                      options={periodOptions}
                      onChange={(value) =>
                        setEditDraft((current) => current ? { ...current, period: value as BudgetPeriod } : current)
                      }
                    />
                    <Input
                      value={editDraft.currency}
                      onChange={(event) =>
                        setEditDraft((current) => current ? { ...current, currency: event.target.value } : current)
                      }
                      className="hidden h-8 text-xs md:block"
                    />
                    <div className="flex justify-end gap-1">
                      <Button type="button" variant="ghost" size="icon" className="size-7 rounded-none" onClick={() => saveEdit(budget)}>
                        <CheckIcon className="size-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="size-7 rounded-none" onClick={cancelEdit}>
                        <XIcon className="size-3.5" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{categoryLabel(budget.category)}</p>
                      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {budget.currency}
                      </p>
                    </div>
                    <span>{formatCurrency(budget.currency, limit)}</span>
                    <span className="capitalize text-muted-foreground">{budget.period}</span>
                    <div className="hidden md:block">
                      <div className="flex items-center justify-between gap-2">
                        <span className={overLimit ? "font-medium text-destructive" : ""}>
                          {formatCurrency(budget.currency, spent)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{Math.round(percentage)}%</span>
                      </div>
                      <div className="mt-1 h-1.5 bg-muted">
                        <div
                          className={`h-full ${overLimit ? "bg-destructive" : "bg-foreground"}`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-1">
                      <Button type="button" variant="ghost" size="icon" className="size-7 rounded-none" onClick={() => startEdit(budget)}>
                        <PencilSimpleIcon className="size-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="size-7 rounded-none" onClick={() => deleteBudget(budget)}>
                        <TrashIcon className="size-3.5" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )
          })}
          {budgets.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">
              No budgets yet.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
