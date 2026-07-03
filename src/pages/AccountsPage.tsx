import { useMemo, useRef, useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  BankIcon,
  CameraIcon,
  CaretDownIcon,
  HouseIcon,
  MagnifyingGlassIcon,
  QuestionIcon,
  SpinnerGapIcon,
  StarIcon,
} from "@phosphor-icons/react"
import { toast } from "sonner"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type { Account, AccountApi, CategoryDefinition, RecordItem } from "@/lib/types"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

type Props = {
  accounts: Account[]
  setAccounts: Dispatch<SetStateAction<Account[]>>
  records: RecordItem[]
  setRecords: Dispatch<SetStateAction<RecordItem[]>>
  currentUserEmail: string
  categories: CategoryDefinition[]
  mode?: "accounts" | "payees"
}

const loadPhotos = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem("account-photos") ?? "{}") as Record<string, string>
  } catch {
    return {}
  }
}

const savePhotos = (photos: Record<string, string>) => {
  localStorage.setItem("account-photos", JSON.stringify(photos))
}

const loadDetailRegexMap = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem("account-detail-regex-map") ?? "{}") as Record<string, string>
  } catch {
    return {}
  }
}

const saveDetailRegexMap = (map: Record<string, string>) => {
  localStorage.setItem("account-detail-regex-map", JSON.stringify(map))
}

const loadStarredPayeeIds = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem("starred-payee-ids") ?? "[]") as string[]
  } catch {
    return []
  }
}

const saveStarredPayeeIds = (ids: string[]) => {
  localStorage.setItem("starred-payee-ids", JSON.stringify(ids))
}

const isNAAccount = (account: Pick<Account, "id" | "displayName" | "accountName">) => {
  const values = [account.id, account.displayName, account.accountName].map((value) =>
    value.toLowerCase().trim()
  )
  return values.some((value) => value === "n-a" || value === "na" || value.includes("unknown"))
}

const FallbackIcon = ({ account }: { account: Account }) => {
  const Icon = isNAAccount(account)
    ? QuestionIcon
    : account.id.startsWith("acc-payroll")
    ? BankIcon
    : HouseIcon
  return <Icon className="size-5 text-muted-foreground" />
}

const AccountAvatar = ({
  account,
  photo,
  size = "sm",
}: {
  account: Account
  photo?: string
  size?: "sm" | "lg"
}) => {
  const dim = size === "lg" ? "size-16" : "size-8"
  if (photo) {
    return (
      <img
        src={photo}
        alt={account.displayName}
        className={`${dim} shrink-0 border object-cover`}
      />
    )
  }
  return (
    <span className={`${dim} shrink-0 inline-flex items-center justify-center border bg-muted`}>
        <FallbackIcon account={account} />
    </span>
  )
}

const parseAmount = (value: string) => {
  const parsed = Number.parseFloat(value.replace(/,/g, ""))
  return Number.isFinite(parsed) ? parsed : 0
}

const formatMoney = (value: number) =>
  new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)

const shortAccountNumber = (accountId: string) => {
  const normalized = accountId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
  const tail = normalized.slice(-8).padStart(8, "0")
  return `${tail.slice(0, 4)} ${tail.slice(4)}`
}

const sanitizeAccountIdInput = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")

const normalizeAccountId = (value: string) =>
  sanitizeAccountIdInput(value)
    .trim()
    .replace(/^-+|-+$/g, "")

export function AccountsPage({
  accounts,
  setAccounts,
  records,
  setRecords,
  currentUserEmail,
  categories,
  mode = "accounts",
}: Props) {
  const accountChartConfig = {
    balance: {
      label: "Balance",
      color: "oklch(0.58 0.2 24)",
    },
  } satisfies ChartConfig

  const [sheetOpen, setSheetOpen] = useState(false)
  const [contextMenuAccountId, setContextMenuAccountId] = useState<string | null>(null)
  const [contextActionArmed, setContextActionArmed] = useState(false)
  const [draft, setDraft] = useState<Account | null>(null)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState("")
  const [photos, setPhotos] = useState<Record<string, string>>(loadPhotos)
  const [draftPhoto, setDraftPhoto] = useState<string | undefined>(undefined)
  const [mergePrompt, setMergePrompt] = useState<{ conflictAccount: Account } | null>(null)
  const [targetAccountId, setTargetAccountId] = useState("")
  const [idQuery, setIdQuery] = useState("")
  const [idInputFocused, setIdInputFocused] = useState(false)
  const [detailRegexMap, setDetailRegexMap] = useState<Record<string, string>>(loadDetailRegexMap)
  const [draftDetailRegex, setDraftDetailRegex] = useState("")
  const [creatingAccountId, setCreatingAccountId] = useState(false)
  const [mergeDialogAccount, setMergeDialogAccount] = useState<Account | null>(null)
  const [mergeTargetId, setMergeTargetId] = useState("")
  const [mergeSaving, setMergeSaving] = useState(false)
  const [deleteDialogAccount, setDeleteDialogAccount] = useState<Account | null>(null)
  const [deleteSaving, setDeleteSaving] = useState(false)
  const [starredPayeeIds, setStarredPayeeIds] = useState<Set<string>>(
    () => new Set(loadStarredPayeeIds())
  )
  const photoInputRef = useRef<HTMLInputElement | null>(null)

  const openSheet = (account: Account) => {
    setDraft({ ...account })
    setDraftPhoto(photos[account.id])
    setTargetAccountId(account.id)
    setIdQuery(account.id)
    setDraftDetailRegex(detailRegexMap[account.id] ?? "")
    setSheetOpen(true)
  }

  const closeSheet = () => {
    setSheetOpen(false)
    setDraft(null)
    setDraftPhoto(undefined)
    setTargetAccountId("")
    setIdQuery("")
    setDraftDetailRegex("")
  }

  const persistRegexForAccount = (id: string, pattern: string) => {
    const next = { ...detailRegexMap }
    const trimmed = pattern.trim()
    if (trimmed) next[id] = trimmed
    else delete next[id]
    setDetailRegexMap(next)
    saveDetailRegexMap(next)
  }

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      setDraftPhoto(dataUrl)
    }
    reader.readAsDataURL(file)
    e.target.value = ""
  }

  const persistPhotoForAccount = (id: string) => {
    const next = { ...photos }
    if (draftPhoto) {
      next[id] = draftPhoto
    } else {
      delete next[id]
    }
    setPhotos(next)
    savePhotos(next)
  }

  const saveAccount = async () => {
    if (!draft) return
    const normalizedTargetId = normalizeAccountId(targetAccountId)
    if (!normalizedTargetId) {
      toast.error("Account ID is required")
      return
    }
    const mergeTarget = accounts.find((a) => a.id === normalizedTargetId && a.id !== draft.id)

    if (mergeTarget) {
      setSaving(true)
      try {
        await invoke("merge_accounts", {
          payload: { from_id: draft.id, into_id: mergeTarget.id },
        })
        setRecords((current) =>
          current.map((r) => ({
            ...r,
            accountFrom: r.accountFrom.id === draft.id ? mergeTarget : r.accountFrom,
            payeeTo: r.payeeTo.id === draft.id ? mergeTarget : r.payeeTo,
            waivedBy: r.waivedBy?.id === draft.id ? mergeTarget : r.waivedBy,
          }))
        )
        setAccounts((current) => current.filter((a) => a.id !== draft.id))
        persistRegexForAccount(mergeTarget.id, draftDetailRegex)
        toast.success(`Merged into "${mergeTarget.displayName}"`)
        closeSheet()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        toast.error(`Merge failed: ${msg}`)
      } finally {
        setSaving(false)
      }
      return
    }

    if (normalizedTargetId !== draft.id) {
      setSaving(true)
      setCreatingAccountId(true)
      try {
        const createdApi = await invoke<AccountApi>("create_account", {
          payload: {
            id: normalizedTargetId,
            display_name: normalizedTargetId,
            account_name: draft.displayName,
            type: "other",
            owner_email: draft.ownerEmail ?? null,
            default_category: draft.defaultCategory ?? null,
          },
        })
        const created: Account = {
          id: createdApi.id,
          displayName: createdApi.account_name,
          accountName: createdApi.display_name,
          ownerEmail: createdApi.owner_email ?? null,
          defaultCategory: createdApi.default_category ?? null,
        }
        await invoke("merge_accounts", {
          payload: { from_id: draft.id, into_id: normalizedTargetId },
        })
        setRecords((current) =>
          current.map((r) => ({
            ...r,
            accountFrom: r.accountFrom.id === draft.id ? created : r.accountFrom,
            payeeTo: r.payeeTo.id === draft.id ? created : r.payeeTo,
            waivedBy: r.waivedBy?.id === draft.id ? created : r.waivedBy,
          }))
        )
        setAccounts((current) =>
          [...current.filter((a) => a.id !== draft.id), created].sort((a, b) =>
            a.displayName.localeCompare(b.displayName)
          )
        )
        setTargetAccountId(created.id)
        setIdQuery(created.id)
        persistRegexForAccount(created.id, draftDetailRegex)
        toast.success("Account ID updated")
        closeSheet()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        toast.error(`Failed to update account id: ${msg}`)
      } finally {
        setCreatingAccountId(false)
        setSaving(false)
      }
      return
    }

    setSaving(true)
    try {
      const nextDraft: Account = { ...draft, id: normalizedTargetId, accountName: normalizedTargetId }
      await invoke<AccountApi>("update_account", {
        payload: {
          id: nextDraft.id,
          display_name: nextDraft.accountName,
          account_name: nextDraft.displayName,
          owner_email: nextDraft.ownerEmail ?? null,
          default_category: nextDraft.defaultCategory ?? null,
        },
      })
      setAccounts((current) => current.map((a) => (a.id === nextDraft.id ? nextDraft : a)))
      persistPhotoForAccount(nextDraft.id)
      persistRegexForAccount(nextDraft.id, draftDetailRegex)
      toast.success("Account updated")
      closeSheet()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[update_account] error:", err)
      toast.error(`Failed to update account: ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  // Merge: reassign all records from draft account to conflict account, then delete draft account
  const confirmMerge = async () => {
    if (!draft || !mergePrompt) return
    const fromId = draft.id
    const intoAccount = mergePrompt.conflictAccount
    setSaving(true)
    try {
      console.log("[merge_accounts] calling invoke", { from_id: fromId, into_id: intoAccount.id })
      await invoke("merge_accounts", {
        payload: { from_id: fromId, into_id: intoAccount.id },
      })
      console.log("[merge_accounts] success")

      // Update records in state: replace any reference to the old account
      setRecords((current) =>
        current.map((r) => ({
          ...r,
          accountFrom: r.accountFrom.id === fromId ? intoAccount : r.accountFrom,
          payeeTo: r.payeeTo.id === fromId ? intoAccount : r.payeeTo,
          waivedBy: r.waivedBy?.id === fromId ? intoAccount : r.waivedBy,
        }))
      )

      setAccounts((current) => current.filter((a) => a.id !== fromId))
      persistPhotoForAccount(intoAccount.id)
      toast.success(`Merged into "${intoAccount.accountName}"`)
      setMergePrompt(null)
      closeSheet()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[merge_accounts] error:", err)
      toast.error(`Merge failed: ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  const openMergeDialog = (account: Account) => {
    const firstTarget = accounts.find((item) => item.id !== account.id)
    setMergeDialogAccount(account)
    setMergeTargetId(firstTarget?.id ?? "")
  }

  const closeMergeDialog = () => {
    if (mergeSaving) return
    setMergeDialogAccount(null)
    setMergeTargetId("")
  }

  const confirmContextMerge = async () => {
    if (!mergeDialogAccount || !mergeTargetId) return
    const sourceAccount = mergeDialogAccount
    const targetAccount = accounts.find(
      (account) => account.id === mergeTargetId && account.id !== sourceAccount.id
    )
    if (!targetAccount) {
      toast.error("Select another account to merge into")
      return
    }

    setMergeSaving(true)
    try {
      await invoke("merge_accounts", {
        payload: { from_id: sourceAccount.id, into_id: targetAccount.id },
      })
      setRecords((current) =>
        current.map((record) => ({
          ...record,
          accountFrom:
            record.accountFrom.id === sourceAccount.id ? targetAccount : record.accountFrom,
          payeeTo: record.payeeTo.id === sourceAccount.id ? targetAccount : record.payeeTo,
          waivedBy:
            record.waivedBy?.id === sourceAccount.id ? targetAccount : record.waivedBy,
        }))
      )
      setAccounts((current) => current.filter((account) => account.id !== sourceAccount.id))
      toast.success(`Merged "${sourceAccount.displayName}" into "${targetAccount.displayName}"`)
      setMergeDialogAccount(null)
      setMergeTargetId("")
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Merge failed: ${msg}`)
    } finally {
      setMergeSaving(false)
    }
  }

  const getAccountReferenceCount = (accountId: string) =>
    records.filter(
      (record) =>
        record.accountFrom.id === accountId ||
        record.payeeTo.id === accountId ||
        record.waivedBy?.id === accountId
    ).length

  const closeDeleteDialog = () => {
    if (deleteSaving) return
    setDeleteDialogAccount(null)
  }

  const confirmDeleteAccount = async () => {
    if (!deleteDialogAccount) return
    const account = deleteDialogAccount
    setDeleteSaving(true)
    try {
      await invoke("delete_account", {
        payload: { id: account.id },
      })
      setAccounts((current) => current.filter((item) => item.id !== account.id))
      setPhotos((current) => {
        const next = { ...current }
        delete next[account.id]
        savePhotos(next)
        return next
      })
      setDetailRegexMap((current) => {
        const next = { ...current }
        delete next[account.id]
        saveDetailRegexMap(next)
        return next
      })
      toast.success(`Deleted "${account.displayName}"`)
      setDeleteDialogAccount(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Delete failed: ${msg}`)
    } finally {
      setDeleteSaving(false)
    }
  }

  const toggleStarredPayee = (accountId: string) => {
    setStarredPayeeIds((current) => {
      const next = new Set(current)
      if (next.has(accountId)) next.delete(accountId)
      else next.add(accountId)
      saveStarredPayeeIds(Array.from(next))
      return next
    })
  }

  const normalizedCurrentUserEmail = currentUserEmail.toLowerCase()
  const isOwnAccount = (account: Account) =>
    account.ownerEmail?.toLowerCase() === normalizedCurrentUserEmail
  const isPayeesView = mode === "payees"
  const pageAccounts = useMemo(
    () =>
      accounts.filter((account) => {
        const owned = account.ownerEmail?.toLowerCase() === normalizedCurrentUserEmail
        return isPayeesView ? !owned : owned
      }),
    [accounts, isPayeesView, normalizedCurrentUserEmail]
  )
  const visibleAccounts = useMemo(() => {
    const q = query.trim().toLowerCase()
    return pageAccounts
      .filter((a) => {
        return (
          !q ||
          a.displayName.toLowerCase().includes(q) ||
          a.accountName.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => {
        if (isPayeesView) {
          const starredDiff = Number(starredPayeeIds.has(b.id)) - Number(starredPayeeIds.has(a.id))
          if (starredDiff !== 0) return starredDiff
        }
        return a.displayName.localeCompare(b.displayName)
      })
  }, [isPayeesView, pageAccounts, query, starredPayeeIds])
  const idSuggestions = useMemo(
    () =>
      Array.from(new Set(accounts.map((a) => a.id)))
        .filter((id) => id.toLowerCase().includes(idQuery.trim().toLowerCase()))
        .slice(0, 8),
    [accounts, idQuery]
  )
  const accountSummaries = useMemo(() => {
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - 3)

    return new Map(
      pageAccounts.map((account) => {
        const detailRegexPattern = detailRegexMap[account.id]?.trim()
        const detailRegex = (() => {
          if (!detailRegexPattern) return null
          try {
            return new RegExp(detailRegexPattern, "i")
          } catch {
            return null
          }
        })()
        const accountRecords = records
          .filter((r) => r.accountFrom.id === account.id || r.payeeTo.id === account.id)
          .concat(
            detailRegex
              ? records.filter(
                  (r) =>
                    detailRegex.test(r.detail || "") ||
                    detailRegex.test(r.description || "")
                )
              : []
          )
          .filter((record, index, arr) => arr.findIndex((r) => r.id === record.id) === index)
          .sort((a, b) => b.date.localeCompare(a.date))
        const balance = accountRecords.reduce((sum, record) => {
          const amount = parseAmount(record.amount)
          if (record.accountFrom.id === account.id) return sum - amount
          if (record.payeeTo.id === account.id) return sum + amount
          return sum
        }, 0)
        const dailyRecords = [...accountRecords]
          .sort((a, b) => a.date.localeCompare(b.date))
          .filter((record) => {
            const [year, month, day] = record.date.split("-").map(Number)
            if (!year || !month || !day) return false
            const recordDate = new Date(year, month - 1, day)
            return recordDate >= cutoff
          })
        const chartData = dailyRecords.reduce<{ date: string; balance: number }[]>(
          (acc, record) => {
            const prev = acc[acc.length - 1]?.balance ?? 0
            const amount = parseAmount(record.amount)
            const nextBalance =
              record.accountFrom.id === account.id
                ? prev - amount
                : record.payeeTo.id === account.id
                  ? prev + amount
                  : prev
            acc.push({
              date: record.date,
              balance: nextBalance,
            })
            return acc
          },
          []
        )
        if (chartData.length === 0) {
          chartData.push({
            date: new Date().toISOString().slice(0, 10),
            balance: 0,
          })
        }
        return [
          account.id,
          {
            balance,
            chartData,
            isNegativeTrend: (chartData[chartData.length - 1]?.balance ?? 0) < 0,
            recent: accountRecords.slice(0, 3),
          },
        ] as const
      })
    )
  }, [detailRegexMap, pageAccounts, records])

  return (
    <>
      <div className="w-full pb-20 pt-4 md:mx-auto md:max-w-7xl md:px-1 md:pt-6">
        <div className="grid gap-4 px-1.5 md:px-0">
          <div className="border-y bg-card p-4 md:border">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-lg font-semibold tracking-tight">
                  {isPayeesView ? "Payees" : "Accounts"}
                </h1>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isPayeesView
                    ? "Manage merchants, people, and counterparties used in your transactions."
                    : "Manage your personal accounts used as transaction sources."}
                </p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <div>{isPayeesView ? "Total payees" : "Total accounts"}</div>
                <div className="mt-1 text-lg font-semibold text-foreground">
                  {pageAccounts.length}
                </div>
              </div>
            </div>
          </div>

          <div className="relative px-px md:px-0">
            <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground md:left-2" />
            <Input
              placeholder={isPayeesView ? "Search payees..." : "Search accounts..."}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 rounded-none bg-white pl-8 text-xs"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleAccounts.map((account) => {
              const isOwned = isOwnAccount(account)
              const summary = accountSummaries.get(account.id)
              const balance = summary?.balance ?? 0
              const chartData = summary?.chartData ?? []
              const isNegativeTrend = summary?.isNegativeTrend ?? false
              const recent = summary?.recent ?? []
              const isStarredPayee = starredPayeeIds.has(account.id)

              return (
                <ContextMenu
                  key={account.id}
                  onOpenChange={(open) => {
                    setContextActionArmed(false)
                    setContextMenuAccountId(open ? account.id : null)
                  }}
                >
                  <ContextMenuTrigger asChild>
                    <div
                      className={`cursor-default border-y p-4 transition-colors md:border ${
                        isOwned
                          ? "bg-gradient-to-br from-card to-muted/20 shadow-sm hover:bg-muted/40"
                          : "bg-card hover:bg-muted/30"
                      } ${isOwned ? "md:col-span-2 xl:col-span-3" : ""}`}
                      onClick={(event) => {
                        if (event.button !== 0 || event.ctrlKey) return
                        if (contextMenuAccountId === account.id) return
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <AccountAvatar account={account} photo={photos[account.id]} />
                        <div className="min-w-0">
                          <h2 className="text-sm font-semibold">{account.displayName}</h2>
                          <p className="mt-0.5 text-xs text-muted-foreground">{account.id}</p>
                          <p className="mt-1 text-[10px] tracking-widest text-muted-foreground">
                            {shortAccountNumber(account.id)}
                          </p>
                        </div>
                        {isPayeesView ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={`ml-auto size-7 rounded-none ${
                              isStarredPayee
                                ? "text-amber-500 hover:text-amber-600"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                            aria-label={
                              isStarredPayee ? "Unstar payee" : "Star payee"
                            }
                            title={isStarredPayee ? "Unstar payee" : "Star payee"}
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              toggleStarredPayee(account.id)
                            }}
                            onContextMenu={(event) => event.stopPropagation()}
                          >
                            <StarIcon
                              className="size-4"
                              weight={isStarredPayee ? "fill" : "regular"}
                            />
                          </Button>
                        ) : isOwned ? (
                          <span className="ml-auto border border-foreground/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-foreground">
                            You
                          </span>
                        ) : null}
                      </div>
                      <dl className="mt-4 grid gap-2 text-xs">
                        <div className="grid gap-1 border-t border-foreground/10 pt-2">
                          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Balance
                          </dt>
                          <dd className="text-base font-semibold tabular-nums text-foreground">
                            RM {formatMoney(balance)}
                          </dd>
                        </div>
                        {isOwned ? (
                          <div className="-mx-4 h-24 overflow-hidden border-y border-foreground/10 bg-background/50 px-2 py-1">
                            <ChartContainer config={accountChartConfig} className="h-full w-full">
                              <AreaChart data={chartData} margin={{ top: 6, right: 8, left: 8, bottom: 6 }}>
                                <CartesianGrid vertical={false} strokeDasharray="2 2" />
                                <XAxis
                                  dataKey="date"
                                  tickLine={false}
                                  axisLine={false}
                                  tickMargin={6}
                                  className="text-[10px]"
                                  tickFormatter={(value) => {
                                    const [year, month, day] = String(value).split("-").map(Number)
                                    if (!year || !month || !day) return ""
                                    return new Date(year, month - 1, day).toLocaleString(undefined, {
                                      month: "short",
                                      day: "numeric",
                                    })
                                  }}
                                />
                                <ChartTooltip
                                  content={
                                    <ChartTooltipContent
                                      formatter={(value) => (
                                        <span>Balance RM {formatMoney(Number(value))}</span>
                                      )}
                                    />
                                  }
                                />
                                <Area
                                  type="monotone"
                                  dataKey="balance"
                                  stroke={isNegativeTrend ? "rgba(190, 18, 60, 0.85)" : "rgba(22, 163, 74, 0.85)"}
                                  fill={isNegativeTrend ? "rgba(190, 18, 60, 0.22)" : "rgba(22, 163, 74, 0.22)"}
                                  fillOpacity={0.14}
                                  strokeWidth={1.8}
                                  dot={false}
                                />
                              </AreaChart>
                            </ChartContainer>
                          </div>
                        ) : null}
                        <div className="mt-1 border-t border-foreground/10 pt-2">
                          <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                            Recent transactions
                          </p>
                          <div className="grid gap-1.5">
                            {recent.length === 0 ? (
                              <p className="text-[11px] text-muted-foreground">No recent activity</p>
                            ) : (
                              recent.map((item) => {
                                const outgoing = item.accountFrom.id === account.id
                                const sign = outgoing ? "-" : "+"
                                const amount = formatMoney(parseAmount(item.amount))
                                const counterparty = outgoing
                                  ? item.payeeTo.displayName
                                  : item.accountFrom.displayName
                                return (
                                  <div key={item.id} className="flex items-center justify-between gap-2 text-[11px]">
                                    <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-muted-foreground">
                                      <span className="shrink-0 text-[10px] text-muted-foreground/70">
                                        {item.date}
                                      </span>
                                      {outgoing ? (
                                        <ArrowUpRightIcon className="size-3.5 text-rose-600" />
                                      ) : (
                                        <ArrowDownLeftIcon className="size-3.5 text-emerald-600" />
                                      )}
                                      <span className="truncate">{counterparty}</span>
                                    </span>
                                    <span className={`tabular-nums ${outgoing ? "text-rose-700" : "text-emerald-700"}`}>
                                      {sign}RM {amount}
                                    </span>
                                  </div>
                                )
                              })
                            )}
                          </div>
                        </div>
                      </dl>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent
                    className="w-32"
                    onPointerDown={(event) => {
                      setContextActionArmed(event.button === 0)
                    }}
                  >
                    <ContextMenuItem
                      onSelect={(event) => {
                        if (!contextActionArmed) {
                          event.preventDefault()
                          return
                        }
                        openSheet(account)
                      }}
                    >
                      Edit
                    </ContextMenuItem>
                    <ContextMenuItem
                      disabled={accounts.length <= 1}
                      onSelect={(event) => {
                        if (!contextActionArmed) {
                          event.preventDefault()
                          return
                        }
                        openMergeDialog(account)
                      }}
                    >
                      Merge to
                    </ContextMenuItem>
                    <ContextMenuItem
                      variant="destructive"
                      onSelect={(event) => {
                        if (!contextActionArmed) {
                          event.preventDefault()
                          return
                        }
                        setDeleteDialogAccount(account)
                      }}
                    >
                      Delete
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              )
            })}
            {visibleAccounts.length === 0 ? (
              <div className="border-y bg-card p-6 text-xs text-muted-foreground md:col-span-2 md:border xl:col-span-3">
                {query.trim()
                  ? isPayeesView
                    ? "No payees match your search."
                    : "No accounts match your search."
                  : isPayeesView
                    ? "No payees yet."
                    : "No personal accounts yet. Mark an account as yours from Payees or import a ledger."}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <Sheet open={sheetOpen} onOpenChange={(open) => { if (!open) closeSheet() }}>
        <SheetContent
          side="right"
          className="flex w-full flex-col sm:max-w-md overflow-hidden pt-8"
        >
          {draft && (
            <>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoChange}
              />

              <SheetHeader className="border-b pb-4">
                <div className="flex items-center gap-4">
                  {/* Photo / avatar with upload button */}
                  <div className="group relative">
                    <AccountAvatar account={draft} photo={draftPhoto} size="lg" />
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
                      title="Upload photo"
                    >
                      <CameraIcon className="size-5 text-white" />
                    </button>
                  </div>
                  <div className="min-w-0">
                    <SheetTitle className="truncate">{draft.displayName}</SheetTitle>
                    <SheetDescription className="font-mono text-[10px]">{draft.id}</SheetDescription>
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      className="mt-1 text-[10px] text-muted-foreground underline hover:text-foreground"
                    >
                      {draftPhoto ? "Change photo" : "Upload photo"}
                    </button>
                    {draftPhoto && (
                      <button
                        type="button"
                        onClick={() => setDraftPhoto(undefined)}
                        className="ml-2 text-[10px] text-muted-foreground underline hover:text-destructive"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto p-4">
                <p className="mb-3 text-[10px] uppercase tracking-wide text-muted-foreground">
                  Account Details
                </p>
                <div className="grid gap-3">
                  <div className="grid gap-1.5">
                    <label className="text-xs text-muted-foreground">Display Name</label>
                    <Input
                      value={draft.displayName}
                      onChange={(e) =>
                        setDraft((d) => (d ? { ...d, displayName: e.target.value } : d))
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-xs text-muted-foreground">Account ID</label>
                    <div className="relative">
                      <Input
                        value={idQuery}
                        onChange={(e) => {
                          const sanitized = sanitizeAccountIdInput(e.target.value)
                          setIdQuery(sanitized)
                          setTargetAccountId(sanitized)
                        }}
                        onFocus={() => setIdInputFocused(true)}
                        onBlur={() => {
                          window.setTimeout(() => setIdInputFocused(false), 100)
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === "Escape") {
                            event.preventDefault()
                            const normalized = normalizeAccountId(idQuery)
                            setIdQuery(normalized)
                            setTargetAccountId(normalized)
                            ;(event.currentTarget as HTMLInputElement).blur()
                          }
                        }}
                        className="h-8 text-xs"
                      />
                      {idInputFocused && idSuggestions.length > 0 ? (
                        <div className="absolute z-50 mt-1 w-full border bg-popover shadow-md">
                          {idSuggestions.map((id) => (
                            <button
                              key={id}
                              type="button"
                              className="block w-full px-2 py-1.5 text-left text-xs hover:bg-accent"
                              onMouseDown={(event) => {
                                event.preventDefault()
                                setIdQuery(id)
                                setTargetAccountId(id)
                                setIdInputFocused(false)
                              }}
                            >
                              {id}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Existing ID merges into it. New ID creates and moves transactions into it.
                    </p>
                    {creatingAccountId ? (
                      <div className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                        <SpinnerGapIcon className="size-3 animate-spin" />
                        Creating account id...
                      </div>
                    ) : null}
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-xs text-muted-foreground">Detail Regex Mapping</label>
                    <Input
                      value={draftDetailRegex}
                      onChange={(e) => setDraftDetailRegex(e.target.value)}
                      placeholder="e.g. ^tng\\s*(reload|ewallet)$"
                      className="h-8 text-xs"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Optional regex to include matching detail/description under this account.
                    </p>
                  </div>
                  {mode === "payees" ? (
                    <div className="grid gap-1.5">
                      <label className="text-xs text-muted-foreground">Default Category</label>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 w-full justify-between rounded-none px-2 text-xs font-normal"
                          >
                            <span className="truncate">
                              {draft.defaultCategory
                                ? categories.find((category) => category.name === draft.defaultCategory)
                                    ?.displayName ?? draft.defaultCategory
                                : "No default"}
                            </span>
                            <CaretDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)">
                          <DropdownMenuRadioGroup
                            value={draft.defaultCategory ?? "__none__"}
                            onValueChange={(value) =>
                              setDraft((d) =>
                                d
                                  ? {
                                      ...d,
                                      defaultCategory: value === "__none__" ? null : value,
                                    }
                                  : d
                              )
                            }
                          >
                            <DropdownMenuRadioItem value="__none__">
                              No default
                            </DropdownMenuRadioItem>
                            {categories.map((category) => (
                              <DropdownMenuRadioItem key={category.id} value={category.name}>
                                {category.displayName}
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <p className="text-[10px] text-muted-foreground">
                        New transactions to this payee will start with this category.
                      </p>
                    </div>
                  ) : null}
                  <div className="grid gap-1.5 border-t pt-3">
                    <label className="text-xs text-muted-foreground">Ownership</label>
                    <Button
                      type="button"
                      variant={draft.ownerEmail?.toLowerCase() === currentUserEmail.toLowerCase() ? "default" : "outline"}
                      size="sm"
                      className="h-8 rounded-none justify-start text-[11px]"
                      onClick={() =>
                        setDraft((d) =>
                          d
                            ? {
                                ...d,
                                ownerEmail:
                                  d.ownerEmail?.toLowerCase() === currentUserEmail.toLowerCase()
                                    ? null
                                    : currentUserEmail,
                              }
                            : d
                        )
                      }
                    >
                      This is my account
                    </Button>
                    <p className="text-[10px] text-muted-foreground">
                      Toggle on to mark this account as personal.
                    </p>
                  </div>
                </div>
              </div>

              <SheetFooter className="border-t pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-none text-xs"
                  onClick={closeSheet}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-8 rounded-none text-xs"
                  onClick={saveAccount}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save"}
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Merge confirmation dialog */}
      {mergePrompt && draft && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/20">
          <div className="w-full max-w-sm border bg-background p-6 shadow-2xl">
            <h2 className="text-sm font-semibold">Account name already exists</h2>
            <p className="mt-2 text-xs text-muted-foreground">
              An account named{" "}
              <span className="font-medium text-foreground">
                "{mergePrompt.conflictAccount.accountName}"
              </span>{" "}
              already exists. Would you like to merge{" "}
              <span className="font-medium text-foreground">"{draft.accountName}"</span> into it?
              All records referencing this account will be moved to the existing one.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-none text-xs"
                onClick={() => setMergePrompt(null)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 rounded-none text-xs"
                onClick={confirmMerge}
                disabled={saving}
              >
                {saving ? "Merging…" : "Merge"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {mergeDialogAccount ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/20 px-4">
          <div className="w-full max-w-sm border bg-background p-6 shadow-2xl">
            <h2 className="text-sm font-semibold">Merge account</h2>
            <p className="mt-2 text-xs text-muted-foreground">
              Move every transaction from{" "}
              <span className="font-medium text-foreground">
                "{mergeDialogAccount.displayName}"
              </span>{" "}
              into another account, then remove the original account.
            </p>
            <div className="mt-4 grid gap-1.5">
              <label className="text-xs text-muted-foreground">Merge to</label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-full justify-between rounded-none px-2 text-xs font-normal"
                    disabled={mergeSaving}
                  >
                    <span className="truncate">
                      {(() => {
                        const target = accounts.find((account) => account.id === mergeTargetId)
                        return target ? `${target.displayName} (${target.id})` : "Select account"
                      })()}
                    </span>
                    <CaretDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)">
                  <DropdownMenuRadioGroup
                    value={mergeTargetId}
                    onValueChange={(value) => setMergeTargetId(value)}
                  >
                    {accounts
                      .filter((account) => account.id !== mergeDialogAccount.id)
                      .sort((a, b) => a.displayName.localeCompare(b.displayName))
                      .map((account) => (
                        <DropdownMenuRadioItem key={account.id} value={account.id}>
                          {account.displayName} ({account.id})
                        </DropdownMenuRadioItem>
                      ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-none text-xs"
                onClick={closeMergeDialog}
                disabled={mergeSaving}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 rounded-none text-xs"
                onClick={() => void confirmContextMerge()}
                disabled={mergeSaving || !mergeTargetId}
              >
                {mergeSaving ? "Merging..." : "Merge"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteDialogAccount ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/20 px-4">
          <div className="w-full max-w-sm border bg-background p-6 shadow-2xl">
            <h2 className="text-sm font-semibold">Delete account</h2>
            {(() => {
              const referenceCount = getAccountReferenceCount(deleteDialogAccount.id)
              return (
                <>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Delete{" "}
                    <span className="font-medium text-foreground">
                      "{deleteDialogAccount.displayName}"
                    </span>
                    ?
                  </p>
                  {referenceCount > 0 ? (
                    <p className="mt-2 text-xs text-destructive">
                      This account is used by {referenceCount} transaction
                      {referenceCount === 1 ? "" : "s"}. Merge it into another account before
                      deleting.
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      This account has no linked transactions. This action cannot be undone.
                    </p>
                  )}
                  <div className="mt-4 flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-none text-xs"
                      onClick={closeDeleteDialog}
                      disabled={deleteSaving}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-8 rounded-none text-xs"
                      onClick={() => void confirmDeleteAccount()}
                      disabled={deleteSaving || referenceCount > 0}
                    >
                      {deleteSaving ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      ) : null}
    </>
  )
}
