import { useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import { invoke } from "@tauri-apps/api/core"
import { DotsThreeVerticalIcon, PlusIcon } from "@phosphor-icons/react"
import { toast } from "sonner"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type { CategoryDefinition, RecordItem } from "@/lib/types"
import { CATEGORY_ICON_MAP, CATEGORY_ICON_KEYS, getCategoryIcon } from "@/lib/category-icons"

type Props = {
  categories: CategoryDefinition[]
  setCategories: Dispatch<SetStateAction<CategoryDefinition[]>>
  records: RecordItem[]
  setRecords: Dispatch<SetStateAction<RecordItem[]>>
}

const makeId = () => `cat-${Date.now()}-${Math.floor(Math.random() * 10000)}`

export function CategoriesPage({ categories, setCategories, records, setRecords }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<CategoryDefinition | null>(null)
  const [mergeSource, setMergeSource] = useState<CategoryDefinition | null>(null)
  const [mergeTargetName, setMergeTargetName] = useState("")
  const [mergeSaving, setMergeSaving] = useState(false)

  const startEdit = (cat: CategoryDefinition) => {
    setEditingId(cat.id)
    setDraft({ ...cat })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraft(null)
  }

  const updateRecordsCategory = async (fromCategory: string, toCategory: string) => {
    if (fromCategory === toCategory) return 0
    return invoke<number>("update_record_category", {
      payload: {
        from_category: fromCategory,
        to_category: toCategory,
      },
    })
  }

  const saveEdit = async () => {
    if (!draft) return
    const previous = categories.find((cat) => cat.id === draft.id)
    const previousName = previous?.name ?? draft.name
    const nextName = draft.name.trim()
    const nextDisplayName = draft.displayName.trim()
    if (!nextName || !nextDisplayName) {
      toast.error("Category name and display name are required")
      return
    }
    const nextDraft = {
      ...draft,
      name: nextName,
      displayName: nextDisplayName,
    }
    const previousCategories = categories
    const previousRecords = records
    setCategories((current) =>
      current.map((cat) => (cat.id === nextDraft.id ? nextDraft : cat))
    )
    if (previousName !== nextName) {
      setRecords((current) =>
        current.map((record) =>
          record.category === previousName ? { ...record, category: nextName } : record
        )
      )
      try {
        await updateRecordsCategory(previousName, nextName)
      } catch {
        setCategories(previousCategories)
        setRecords(previousRecords)
        toast.error("Failed to update transactions for this category")
        return
      }
    }
    setEditingId(null)
    setDraft(null)
  }

  const deleteCategory = (id: string) => {
    setCategories((current) => current.filter((cat) => cat.id !== id))
  }

  const openMergeDialog = (cat: CategoryDefinition) => {
    const firstTarget = categories.find((item) => item.id !== cat.id)
    setMergeSource(cat)
    setMergeTargetName(firstTarget?.name ?? "")
  }

  const closeMergeDialog = () => {
    setMergeSource(null)
    setMergeTargetName("")
    setMergeSaving(false)
  }

  const confirmMerge = async () => {
    if (!mergeSource || !mergeTargetName) return
    const target = categories.find((cat) => cat.name === mergeTargetName)
    if (!target || target.id === mergeSource.id) return

    const previousCategories = categories
    const previousRecords = records
    setMergeSaving(true)
    setCategories((current) => current.filter((cat) => cat.id !== mergeSource.id))
    setRecords((current) =>
      current.map((record) =>
        record.category === mergeSource.name
          ? { ...record, category: target.name }
          : record
      )
    )

    try {
      const updatedCount = await updateRecordsCategory(mergeSource.name, target.name)
      toast.success(`Merged ${updatedCount} transactions into ${target.displayName}`)
      closeMergeDialog()
    } catch {
      setCategories(previousCategories)
      setRecords(previousRecords)
      setMergeSaving(false)
      toast.error("Failed to merge category")
    }
  }

  const addCategory = () => {
    const next: CategoryDefinition = {
      id: makeId(),
      name: "New Category",
      displayName: "New Category",
      icon: "Question",
    }
    setCategories((current) => [...current, next])
    startEdit(next)
  }

  const handleEditKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return
    event.preventDefault()
    void saveEdit()
  }

  return (
    <div className="w-full pb-20 pt-4 md:mx-auto md:max-w-5xl md:px-1 md:pt-6">
      <div className="grid gap-4 px-1.5 md:px-0">
        <div className="border-y bg-card p-4 md:border">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Categories</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Manage categories used to classify your transactions.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 rounded-none px-2 text-xs"
              onClick={addCategory}
            >
              <PlusIcon className="mr-1 size-3.5" />
              Add
            </Button>
          </div>
        </div>

        <div className="border-y bg-card md:border">
          <div className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-0 border-b px-4 py-2 text-[10px] uppercase tracking-wide text-muted-foreground">
            <span className="w-10">Icon</span>
            <span className="px-2">Display Name</span>
            <span className="px-2">Category Key</span>
            <span className="w-8" />
          </div>

          {categories.map((cat) => {
            const Icon = getCategoryIcon(cat.icon)
            const isEditing = editingId === cat.id && draft !== null

            return (
              <ContextMenu key={cat.id}>
                <ContextMenuTrigger asChild>
                  <div className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-0 border-b px-4 py-2 last:border-b-0 text-xs transition-colors hover:bg-muted/40 data-[state=open]:bg-muted/40">
                    {/* Icon cell */}
                    <div className="w-10">
                      {isEditing ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="flex size-7 items-center justify-center border bg-muted hover:bg-muted/80"
                              title="Choose icon"
                            >
                              {(() => {
                                const DraftIcon = getCategoryIcon(draft.icon)
                                return <DraftIcon className="size-4" />
                              })()}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto rounded-none p-2" align="start">
                            <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                              Choose icon
                            </p>
                            <div className="grid grid-cols-7 gap-1">
                              {CATEGORY_ICON_KEYS.map((key) => {
                                const PickIcon = CATEGORY_ICON_MAP[key]!
                                return (
                                  <button
                                    key={key}
                                    type="button"
                                    title={key}
                                    onClick={() =>
                                      setDraft((d) => (d ? { ...d, icon: key } : d))
                                    }
                                    className={`flex size-8 items-center justify-center border text-xs hover:bg-muted ${
                                      draft.icon === key
                                        ? "border-foreground bg-muted"
                                        : "border-transparent"
                                    }`}
                                  >
                                    <PickIcon className="size-4" />
                                  </button>
                                )
                              })}
                            </div>
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <span className="flex size-7 items-center justify-center border bg-muted">
                          <Icon className="size-4" />
                        </span>
                      )}
                    </div>

                    {/* Display name */}
                    <div className="px-2">
                      {isEditing ? (
                        <Input
                          value={draft.displayName}
                          onChange={(e) =>
                            setDraft((d) => (d ? { ...d, displayName: e.target.value } : d))
                          }
                          onKeyDown={handleEditKeyDown}
                          className="h-7 text-xs"
                          placeholder="Display name"
                          autoFocus
                        />
                      ) : (
                        <span className="text-foreground/80">{cat.displayName}</span>
                      )}
                    </div>

                    {/* Category key / name */}
                    <div className="px-2">
                      {isEditing ? (
                        <Input
                          value={draft.name}
                          onChange={(e) =>
                            setDraft((d) => (d ? { ...d, name: e.target.value } : d))
                          }
                          onKeyDown={handleEditKeyDown}
                          className="h-7 font-mono text-xs"
                          placeholder="Category key"
                        />
                      ) : (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {cat.name}
                        </span>
                      )}
                    </div>

                    <div className="flex w-8 items-center justify-end text-muted-foreground">
                      <DotsThreeVerticalIcon className="size-4" />
                    </div>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-36">
                  {isEditing ? (
                    <>
                      <ContextMenuItem onClick={() => void saveEdit()}>Save</ContextMenuItem>
                      <ContextMenuItem onClick={cancelEdit}>Cancel</ContextMenuItem>
                    </>
                  ) : (
                    <>
                      <ContextMenuItem onClick={() => startEdit(cat)}>Edit</ContextMenuItem>
                      <ContextMenuItem
                        disabled={categories.length < 2}
                        onClick={() => openMergeDialog(cat)}
                      >
                        Merge with...
                      </ContextMenuItem>
                      <ContextMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => deleteCategory(cat.id)}
                      >
                        Delete
                      </ContextMenuItem>
                    </>
                  )}
                </ContextMenuContent>
              </ContextMenu>
            )
          })}

          {categories.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">
              No categories yet.{" "}
              <button
                type="button"
                className="underline hover:text-foreground"
                onClick={addCategory}
              >
                Add one
              </button>
            </div>
          )}
        </div>
      </div>
      {mergeSource ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/30 px-4">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close merge dialog"
            onClick={closeMergeDialog}
          />
          <div className="relative z-10 w-full max-w-sm border bg-card p-4">
            <h2 className="text-sm font-semibold">Merge Category</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Move all {mergeSource.displayName} transactions into another category.
            </p>
            <label className="mt-4 block text-[10px] uppercase tracking-wide text-muted-foreground">
              Merge into
            </label>
            <select
              value={mergeTargetName}
              onChange={(event) => setMergeTargetName(event.target.value)}
              className="mt-1 h-8 w-full border bg-background px-2 text-xs"
            >
              {categories
                .filter((cat) => cat.id !== mergeSource.id)
                .map((cat) => (
                  <option key={cat.id} value={cat.name}>
                    {cat.displayName}
                  </option>
                ))}
            </select>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-none px-2 text-xs"
                disabled={mergeSaving}
                onClick={closeMergeDialog}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 rounded-none px-2 text-xs"
                disabled={mergeSaving || !mergeTargetName}
                onClick={() => void confirmMerge()}
              >
                {mergeSaving ? "Merging..." : "Merge"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
