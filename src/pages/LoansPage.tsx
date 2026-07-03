import { Fragment } from "react"
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

export function LoansPage({ records, currentUserEmail }: Props) {
  const isPersonalAccount = (account?: Account | null) =>
    account?.ownerEmail?.toLowerCase() === currentUserEmail.toLowerCase()

  const getLoanDirection = (record: RecordItem): LoanDirection => {
    if (record.waivedBy) {
      const paidByMe = isPersonalAccount(record.accountFrom)
      const reimbursedByMe = isPersonalAccount(record.waivedBy)
      if (paidByMe && !reimbursedByMe) return "owed-to-me"
      if (!paidByMe && reimbursedByMe) return "i-owe"
    }

    const fromPersonal = isPersonalAccount(record.accountFrom)
    const toPersonal = isPersonalAccount(record.payeeTo)
    if (fromPersonal && !toPersonal) return "owed-to-me"
    if (!fromPersonal && toPersonal) return "i-owe"
    return "neutral"
  }

  const getCounterparty = (record: RecordItem) => {
    const direction = getLoanDirection(record)
    if (record.waivedBy && direction === "owed-to-me") return record.waivedBy
    if (record.waivedBy && direction === "i-owe") return record.accountFrom
    if (direction === "owed-to-me") return record.payeeTo
    if (direction === "i-owe") return record.accountFrom
    return record.waivedBy ?? record.payeeTo
  }

  const loanRecords = records.filter(
    (record) => record.waivedBy || record.category.toLowerCase() === "loan"
  )
  const owedToMeTotal = loanRecords
    .filter((record) => getLoanDirection(record) === "owed-to-me")
    .reduce((sum, record) => sum + getAmount(record), 0)
  const iOweTotal = loanRecords
    .filter((record) => getLoanDirection(record) === "i-owe")
    .reduce((sum, record) => sum + getAmount(record), 0)
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
      total: group.records.reduce((sum, record) => {
        const direction = getLoanDirection(record)
        if (direction === "owed-to-me") return sum + getAmount(record)
        if (direction === "i-owe") return sum - getAmount(record)
        return sum
      }, 0),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="w-full pb-20 pt-4 md:mx-auto md:max-w-6xl md:px-1 md:pt-6">
      <div className="grid gap-4 px-1.5 md:px-0">
        <div className="border-y bg-card p-4 md:border">
          <h1 className="text-lg font-semibold tracking-tight">Loans</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Transactions marked as loans or expected to be reimbursed.
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
                      const direction = getLoanDirection(record)
                      const amountClass =
                        direction === "owed-to-me"
                          ? "text-green-700"
                          : direction === "i-owe"
                          ? "text-red-700"
                          : "text-muted-foreground"
                      return (
                        <tr key={record.id} className="border-t bg-card hover:bg-muted/60">
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
