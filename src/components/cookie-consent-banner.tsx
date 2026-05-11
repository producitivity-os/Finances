import * as React from "react"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"

const COOKIE_CONSENT_KEY = "finances.cookie-consent"

type CookieConsentBannerProps = {
  className?: string
  lastLoggedDate?: string | null
}

export function CookieConsentBanner({
  className,
  lastLoggedDate,
}: CookieConsentBannerProps) {
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    const stored = window.localStorage.getItem(COOKIE_CONSENT_KEY)
    if (!stored) {
      setVisible(true)
    }
  }, [])

  const closeBanner = React.useCallback((value: "accepted" | "rejected" | "dismissed") => {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, value)
    setVisible(false)
  }, [])

  const reminderText = React.useMemo(() => {
    if (!lastLoggedDate) {
      return "You haven't logged your finances recently."
    }

    const lastDate = new Date(`${lastLoggedDate}T00:00:00`)
    if (Number.isNaN(lastDate.getTime())) {
      return "You haven't logged your finances recently."
    }

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const diffMs = today.getTime() - lastDate.getTime()
    const diffDays = Math.max(0, Math.floor(diffMs / 86400000))
    const weekday = lastDate.toLocaleDateString("en-US", { weekday: "long" })
    const formatted = `${String(lastDate.getMonth() + 1).padStart(2, "0")}-${String(
      lastDate.getDate()
    ).padStart(2, "0")}-${lastDate.getFullYear()}`
    const suffix =
      diffDays === 0 ? "today" : diffDays === 1 ? "1 day ago" : `${diffDays} days ago`

    return `You haven't logged your finances since ${weekday} or ${formatted} (${suffix}).`
  }, [lastLoggedDate])

  if (!visible) return null

  return (
    <div
      className={[
        "pointer-events-none absolute inset-x-0 bottom-0 z-[90]",
        className ?? "",
      ].join(" ")}
    >
      <div className="pointer-events-auto w-full overflow-hidden border-t-[2px] border-foreground bg-background shadow-[0_-10px_24px_rgba(0,0,0,0.05)]">
        <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:gap-5 md:px-6">
          <div className="min-w-0 flex-1 text-[12px] leading-5 text-foreground md:text-[13px]">
            {reminderText}{" "}
            <button
              type="button"
              className="font-semibold text-blue-700 underline-offset-2 hover:underline"
            >
              Review transactions
            </button>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3 md:flex-nowrap">
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-none border-2 border-foreground px-4 text-[13px] font-semibold"
              onClick={() => closeBanner("rejected")}
            >
              Do not allow cookies
            </Button>
            <Button
              type="button"
              className="h-9 rounded-none bg-foreground px-4 text-[13px] font-semibold text-background hover:bg-foreground/90"
              onClick={() => closeBanner("accepted")}
            >
              Allow all cookies
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 rounded-none text-foreground hover:bg-transparent"
              onClick={() => closeBanner("dismissed")}
            >
              <X className="size-5" />
              <span className="sr-only">Dismiss cookie banner</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
