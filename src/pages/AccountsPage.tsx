import { useRef, useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import { invoke } from "@tauri-apps/api/core"
import { BankIcon, CameraIcon, HouseIcon, MagnifyingGlassIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
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
import type { Account, AccountApi, RecordItem } from "@/lib/types"

type Props = {
  accounts: Account[]
  setAccounts: Dispatch<SetStateAction<Account[]>>
  records: RecordItem[]
  setRecords: Dispatch<SetStateAction<RecordItem[]>>
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

const FallbackIcon = ({ accountId }: { accountId: string }) => {
  const Icon = accountId.startsWith("acc-payroll") ? BankIcon : HouseIcon
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
      <FallbackIcon accountId={account.id} />
    </span>
  )
}

export function AccountsPage({ accounts, setAccounts, records, setRecords }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [draft, setDraft] = useState<Account | null>(null)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState("")
  const [photos, setPhotos] = useState<Record<string, string>>(loadPhotos)
  const [draftPhoto, setDraftPhoto] = useState<string | undefined>(undefined)
  const [mergePrompt, setMergePrompt] = useState<{ conflictAccount: Account } | null>(null)
  const photoInputRef = useRef<HTMLInputElement | null>(null)

  const openSheet = (account: Account) => {
    setDraft({ ...account })
    setDraftPhoto(photos[account.id])
    setSheetOpen(true)
  }

  const closeSheet = () => {
    setSheetOpen(false)
    setDraft(null)
    setDraftPhoto(undefined)
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

    // Check for a local duplicate account name before hitting the backend
    const conflict = accounts.find(
      (a) => a.id !== draft.id && a.accountName.trim().toLowerCase() === draft.accountName.trim().toLowerCase()
    )
    if (conflict) {
      setMergePrompt({ conflictAccount: conflict })
      return
    }

    setSaving(true)
    try {
      await invoke<AccountApi>("update_account", {
        payload: {
          id: draft.id,
          display_name: draft.accountName,
          account_name: draft.displayName,
        },
      })
      setAccounts((current) => current.map((a) => (a.id === draft.id ? draft : a)))
      persistPhotoForAccount(draft.id)
      toast.success("Account updated")
      closeSheet()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[update_account] error:", err)
      // Surface UNIQUE constraint violations as a merge prompt too
      if (typeof msg === "string" && msg.toLowerCase().includes("unique")) {
        const conflict2 = accounts.find(
          (a) => a.id !== draft.id && a.accountName.trim().toLowerCase() === draft.accountName.trim().toLowerCase()
        )
        if (conflict2) { setMergePrompt({ conflictAccount: conflict2 }); return }
      }
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

  return (
    <>
      <div className="w-full pb-20 pt-4 md:mx-auto md:max-w-7xl md:px-2 md:pt-6">
        <div className="grid gap-4 px-3 md:px-0">
          <div className="border-y bg-card p-4 md:border">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-lg font-semibold tracking-tight">Accounts</h1>
                <p className="mt-1 text-xs text-muted-foreground">
                  Manage the accounts and counterparties used in your transactions.
                </p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <div>Total accounts</div>
                <div className="mt-1 text-lg font-semibold text-foreground">
                  {accounts.length}
                </div>
              </div>
            </div>
          </div>

          <div className="relative px-px md:px-0">
            <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground md:left-2" />
            <Input
              placeholder="Search accounts…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 rounded-none bg-white pl-8 text-xs"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {accounts
              .filter((a) => {
                const q = query.trim().toLowerCase()
                return (
                  !q ||
                  a.displayName.toLowerCase().includes(q) ||
                  a.accountName.toLowerCase().includes(q)
                )
              })
              .map((account) => {
              const usedIn = records.filter(
                (r) => r.accountFrom.id === account.id || r.payeeTo.id === account.id
              ).length

              return (
                <ContextMenu key={account.id}>
                  <ContextMenuTrigger asChild>
                    <div className="cursor-default border-y bg-card p-4 transition-colors hover:bg-muted/30 md:border">
                      <div className="flex items-start gap-3">
                        <AccountAvatar account={account} photo={photos[account.id]} />
                        <div>
                          <h2 className="text-sm font-semibold">{account.displayName}</h2>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {account.accountName}
                          </p>
                        </div>
                      </div>
                      <dl className="mt-4 grid gap-2 text-xs">
                        <div className="flex items-center justify-between gap-3 border-t pt-2">
                          <dt className="text-muted-foreground">Used in records</dt>
                          <dd className="text-foreground">{usedIn}</dd>
                        </div>
                      </dl>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-28">
                    <ContextMenuItem onClick={() => openSheet(account)}>Edit</ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              )
            })}
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
                    <SheetDescription className="font-mono text-[10px]">
                      {draft.accountName}
                    </SheetDescription>
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
                    <label className="text-xs text-muted-foreground">Account Name</label>
                    <Input
                      value={draft.accountName}
                      onChange={(e) =>
                        setDraft((d) => (d ? { ...d, accountName: e.target.value } : d))
                      }
                      className="h-8 text-xs"
                    />
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
    </>
  )
}
