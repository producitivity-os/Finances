import { cn } from "@/lib/utils"
import { FileTextIcon } from "@phosphor-icons/react"

function Empty({
  className,
  title = "No records yet",
  description = "Create a new entry from the row below.",
}: {
  className?: string
  title?: string
  description?: string
}) {
  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center gap-1 py-6 text-center",
        className
      )}
    >
      <span className="inline-flex size-8 items-center justify-center border bg-muted text-muted-foreground">
        <FileTextIcon className="size-4" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  )
}

export { Empty }
