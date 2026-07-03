import type { RecordItem } from "@/lib/types"

export type NotificationItem = {
  id: string
  title: string
  message: string
  timestamp: string
  read: boolean
  kind: "system" | "finance-log"
}

export const baseNotifications: Omit<NotificationItem, "read">[] = [
  {
    id: "notif-1",
    title: "Budget threshold reached",
    message: "Groceries spending crossed your weekly threshold.",
    timestamp: "2026-05-12 09:20",
    kind: "system",
  },
  {
    id: "notif-2",
    title: "Large transfer detected",
    message: "A transfer above RM 1,000 was logged.",
    timestamp: "2026-05-11 19:45",
    kind: "system",
  },
  {
    id: "notif-3",
    title: "Import completed",
    message: "Your latest CSV import finished successfully.",
    timestamp: "2026-05-10 14:10",
    kind: "system",
  },
]

const formatDateKey = (date: Date) => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

const formatDisplayDate = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number)
  if (!year || !month || !day) return dateKey
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}

export const buildFinanceLogNotifications = (
  records: RecordItem[],
  now = new Date()
): Omit<NotificationItem, "read">[] => {
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  if (yesterday < firstOfMonth) return []

  const loggedDates = new Set(records.map((record) => record.date))
  const missingDates: string[] = []
  for (
    let cursor = new Date(firstOfMonth);
    cursor <= yesterday;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    const key = formatDateKey(cursor)
    if (!loggedDates.has(key)) missingDates.push(key)
  }

  if (missingDates.length === 0) return []

  const monthKey = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}`
  const displayDates = missingDates.map(formatDisplayDate)
  const visibleDates = displayDates.slice(0, 8).join(", ")
  const overflow = displayDates.length > 8 ? `, +${displayDates.length - 8} more` : ""

  return [
    {
      id: `missing-finance-log-${monthKey}-${missingDates.join("_")}`,
      title: "Missing finance logs",
      message: `You haven't logged finances for dates ${visibleDates}${overflow}.`,
      timestamp: `${formatDateKey(now)} 08:00`,
      kind: "finance-log",
    },
  ]
}

export const buildNotifications = (
  records: RecordItem[],
  readIds: Set<string>
): NotificationItem[] =>
  [...buildFinanceLogNotifications(records), ...baseNotifications].map((item) => ({
    ...item,
    read: readIds.has(item.id) || item.id === "notif-3",
  }))

