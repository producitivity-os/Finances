import { useMemo } from "react"
import { BellIcon, CheckIcon, ClockIcon, EnvelopeSimpleOpenIcon } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import type { NotificationItem } from "@/lib/notifications"

type Props = {
  notifications: NotificationItem[]
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
}

export function NotificationsPage({
  notifications,
  onMarkRead,
  onMarkAllRead,
}: Props) {
  const unread = useMemo(
    () => notifications.filter((item) => !item.read),
    [notifications]
  )
  const read = useMemo(
    () => notifications.filter((item) => item.read),
    [notifications]
  )

  const NotificationCard = ({ item }: { item: NotificationItem }) => (
    <div className="border-y bg-card p-4 md:border">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{item.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{item.message}</p>
        </div>
        {!item.read ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 rounded-none px-2 text-[10px] uppercase tracking-wide"
            onClick={() => onMarkRead(item.id)}
          >
            <CheckIcon className="size-3.5" />
            Mark read
          </Button>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            <EnvelopeSimpleOpenIcon className="size-3.5" />
            Read
          </span>
        )}
      </div>
      <div className="mt-3 border-t pt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        {item.timestamp}
      </div>
    </div>
  )

  return (
    <div className="w-full pb-20 pt-4 md:mx-auto md:max-w-5xl md:px-1 md:pt-6">
      <div className="grid gap-4 px-1.5 md:px-0">
        <div className="border-y bg-card p-4 md:border">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Mailbox</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Read and manage account notifications.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="border border-foreground/15 px-2 py-1 text-[10px] uppercase tracking-wide">
                  {notifications.length} total
                </span>
                <span className="border border-foreground/15 px-2 py-1 text-[10px] uppercase tracking-wide">
                  {unread.length} unread
                </span>
                <span className="border border-foreground/15 px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {read.length} read
                </span>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-none px-2 text-xs"
              onClick={onMarkAllRead}
              disabled={unread.length === 0}
            >
              Mark all read
            </Button>
          </div>
        </div>

        <div className="border-y bg-card p-4 md:border">
          <div className="mb-3 flex items-center gap-2 border-b pb-2">
            <BellIcon className="size-4 text-foreground" />
            <h2 className="text-sm font-semibold">Unread ({unread.length})</h2>
          </div>
          <div className="grid gap-3">
            {unread.length > 0 ? (
              unread.map((item) => <NotificationCard key={item.id} item={item} />)
            ) : (
              <p className="text-xs text-muted-foreground">No unread notifications.</p>
            )}
          </div>
        </div>

        <div className="border-y bg-card p-4 md:border">
          <div className="mb-3 flex items-center gap-2 border-b pb-2">
            <ClockIcon className="size-4 text-foreground" />
            <h2 className="text-sm font-semibold">Read ({read.length})</h2>
          </div>
          <div className="grid gap-3">
            {read.length > 0 ? (
              read.map((item) => <NotificationCard key={item.id} item={item} />)
            ) : (
              <p className="text-xs text-muted-foreground">No read notifications yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
