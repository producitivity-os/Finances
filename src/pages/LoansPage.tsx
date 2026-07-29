import { Fragment } from "react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import type { Account, RecordItem } from "@/lib/types"

type Props = {
  records: RecordItem[]
  currentUserEmail: string
}

const formatMoney = (value: number) =>
  value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

type LoanDirection = "owed-to-me" | "i-owe" | "neutral"

const getAmount = (record: RecordItem) => Number.parseFloat(record.amount || "0") || 0

const openTransactionInOverview = (record: RecordItem) => {
  sessionStorage.setItem("finance-open-record-id", record.id)
  window.location.hash = "/transactions"
}

export function LoansPage({ records, currentUserEmail }: Props) {
  const isPersonalAccount = (account?: Account | null) =>
    account?.ownerEmail?.toLowerCase() === currentUserEmail.toLowerCase()

  const getLoanDirection = (record: RecordItem): LoanDirection => {
    if (!record.waivedBy) return "neutral"
    const paidByMe = isPersonalAccount(record.accountFrom)
    const receivedByMe = isPersonalAccount(record.payeeTo)
    const reimbursedByMe = isPersonalAccount(record.waivedBy)
    if (receivedByMe && !paidByMe) return "owed-to-me"
    if (paidByMe && !reimbursedByMe) return "owed-to-me"
    if (!paidByMe && reimbursedByMe) return "i-owe"
    return "neutral"
  }

  const getSignedLoanAmount = (record: RecordItem) => {
    if (!record.waivedBy) return 0
    const amount = getAmount(record)
    const paidByMe = isPersonalAccount(record.accountFrom)
    const receivedByMe = isPersonalAccount(record.payeeTo)
    const reimbursedByMe = isPersonalAccount(record.waivedBy)

    if (receivedByMe && !paidByMe) return -amount
    if (paidByMe && !reimbursedByMe) return amount
    if (!paidByMe && reimbursedByMe) return -amount
    return 0
  }

  const getCounterparty = (record: RecordItem) => {
    const direction = getLoanDirection(record)
    if (record.waivedBy && isPersonalAccount(record.payeeTo) && !isPersonalAccount(record.accountFrom)) {
      return record.accountFrom
    }
    if (record.waivedBy && direction === "owed-to-me") return record.waivedBy
    if (record.waivedBy && direction === "i-owe") return record.accountFrom
    return record.waivedBy
  }

  const loanRecords = records.filter((record) => record.waivedBy)
  const loanGroups = Array.from(
    loanRecords.reduce((map, record) => {
      const counterparty = getCounterparty(record)
      const key = counterparty?.id ?? "unknown"
      const existing = map.get(key) ?? {
        id: key,
        name: counterparty?.displayName ?? "Unknown",
        records: [] as RecordItem[],
      }
      existing.records.push(record)
      map.set(key, existing)
      return map
    }, new Map<string, { id: string; name: string; records: RecordItem[] }>())
  )
    .map(([, group]) => ({
      ...group,
      records: group.records.sort((a, b) => b.date.localeCompare(a.date)),
      total: group.records.reduce((sum, record) => sum + getSignedLoanAmount(record), 0),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const owedToMeTotal = loanGroups
    .filter((group) => group.total > 0)
    .reduce((sum, group) => sum + group.total, 0)
  const iOweTotal = loanGroups
    .filter((group) => group.total < 0)
    .reduce((sum, group) => sum + Math.abs(group.total), 0)

  return (
    <div className="w-full pb-20 pt-4 md:mx-auto md:max-w-6xl md:px-1 md:pt-6">
      <div className="grid gap-4 px-1.5 md:px-0">
        <div className="border-y bg-card p-4 md:border">
          <h1 className="text-lg font-semibold tracking-tight">Loans</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Transactions marked as waived and expected to be reimbursed.
          </p>
          <div className="mt-3 flex flex-wrap gap-4 border-t pt-3 text-xs">
            <span>
              Owed to me:{" "}
              <span className="font-medium text-green-700">
                MYR {formatMoney(owedToMeTotal)}
              </span>
            </span>
            <span>
              I owe:{" "}
              <span className="font-medium text-red-700">
                MYR {formatMoney(iOweTotal)}
              </span>
            </span>
          </div>
        </div>

        <div className="overflow-hidden border-y bg-card md:border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
                <th>Date</th>
                <th>From</th>
                <th>To / Refunded By</th>
                <th>Category</th>
                <th>Detail</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {loanRecords.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-5 text-center text-muted-foreground">
                    No loan transactions yet.
                  </td>
                </tr>
              ) : (
                loanGroups.map((group) => (
                  <Fragment key={group.id}>
                    <tr className="border-t bg-muted/50">
                      <td colSpan={5} className="px-3 py-2 font-medium">
                        {group.name}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-medium ${
                          group.total > 0
                            ? "text-green-700"
                            : group.total < 0
                            ? "text-red-700"
                            : "text-muted-foreground"
                        }`}
                      >
                        MYR {formatMoney(Math.abs(group.total))}
                      </td>
                    </tr>
                    {group.records.map((record) => {
                      const signedAmount = getSignedLoanAmount(record)
                      const amountClass =
                        signedAmount > 0
                          ? "text-green-700"
                          : signedAmount < 0
                          ? "text-red-700"
                          : "text-muted-foreground"
                      return (
                        <ContextMenu key={record.id}>
                          <ContextMenuTrigger asChild>
                            <tr className="border-t bg-card hover:bg-muted/60">
                              <td className="px-3 py-2 pl-6">{record.date}</td>
                              <td className="px-3 py-2">{record.accountFrom.displayName}</td>
                              <td className="px-3 py-2">
                                {record.waivedBy?.displayName ?? record.payeeTo.displayName}
                              </td>
                              <td className="px-3 py-2">{record.category}</td>
                              <td className="px-3 py-2">{record.detail || "-"}</td>
                              <td className={`px-3 py-2 text-right font-medium ${amountClass}`}>
                                {record.currency} {formatMoney(getAmount(record))}
                              </td>
                            </tr>
                          </ContextMenuTrigger>
                          <ContextMenuContent className="w-44">
                            <ContextMenuItem onSelect={() => openTransactionInOverview(record)}>
                              Open in transactions
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
                      )
                    })}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
