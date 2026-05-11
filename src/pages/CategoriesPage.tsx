import { useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import { PlusIcon, TrashIcon } from "@phosphor-icons/react"
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
import type { CategoryDefinition } from "@/lib/types"
import { CATEGORY_ICON_MAP, CATEGORY_ICON_KEYS, getCategoryIcon } from "@/lib/category-icons"

type Props = {
  categories: CategoryDefinition[]
  setCategories: Dispatch<SetStateAction<CategoryDefinition[]>>
}

const makeId = () => `cat-${Date.now()}-${Math.floor(Math.random() * 10000)}`

export function CategoriesPage({ categories, setCategories }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<CategoryDefinition | null>(null)

  const startEdit = (cat: CategoryDefinition) => {
    setEditingId(cat.id)
    setDraft({ ...cat })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraft(null)
  }

  const saveEdit = () => {
    if (!draft) return
    setCategories((current) =>
      current.map((cat) => (cat.id === draft.id ? draft : cat))
    )
    setEditingId(null)
    setDraft(null)
  }

  const deleteCategory = (id: string) => {
    setCategories((current) => current.filter((cat) => cat.id !== id))
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

  return (
    <div className="w-full pb-20 pt-4 md:mx-auto md:max-w-5xl md:px-2 md:pt-6">
      <div className="grid gap-4 px-3 md:px-0">
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
                          className="h-7 font-mono text-xs"
                          placeholder="Category key"
                        />
                      ) : (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {cat.name}
                        </span>
                      )}
                    </div>

                    {/* Delete */}
                    <div className="flex w-8 items-center justify-end">
                      {!isEditing && (
                        <button
                          type="button"
                          title="Delete"
                          onClick={(e) => { e.stopPropagation(); deleteCategory(cat.id) }}
                          className="flex size-6 items-center justify-center border text-muted-foreground hover:border-destructive hover:text-destructive"
                        >
                          <TrashIcon className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-28">
                  {isEditing ? (
                    <>
                      <ContextMenuItem onClick={saveEdit}>Save</ContextMenuItem>
                      <ContextMenuItem onClick={cancelEdit}>Cancel</ContextMenuItem>
                    </>
                  ) : (
                    <ContextMenuItem onClick={() => startEdit(cat)}>Edit</ContextMenuItem>
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
    </div>
  )
}
