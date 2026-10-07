import Foundation

struct BalancePoint: Identifiable, Equatable, Sendable {
    let date: Date
    let balanceMinor: Int64
    let isComplete: Bool
    var id: Date { date }
}

enum FinanceValidationError: LocalizedError, Equatable {
    case emptyDetail, invalidAmount, incompatibleType, missingSource, missingDestination, unbalancedTransfer

    var errorDescription: String? {
        switch self {
        case .emptyDetail: "Add a banking detail or description."
        case .invalidAmount: "Amount must be greater than zero."
        case .incompatibleType: "The transaction type does not match its direction."
        case .missingSource: "Choose at least one source account."
        case .missingDestination: "Choose at least one destination account."
        case .unbalancedTransfer: "Transfer source and destination totals must match."
        }
    }
}

enum FinanceCalculator {
    static func minorUnits(_ value: Decimal) -> Int64 {
        let rounded = value * 100
        return NSDecimalNumber(decimal: rounded).int64Value
    }

    static func decimal(minor: Int64) -> Decimal { Decimal(minor) / 100 }

    static func validate(_ draft: TransactionDraft) throws {
        if draft.detail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { throw FinanceValidationError.emptyDetail }
        if minorUnits(draft.amount) <= 0 { throw FinanceValidationError.invalidAmount }
        if !FinanceTransactionType.allowed(for: draft.direction).contains(draft.type) { throw FinanceValidationError.incompatibleType }
        let sources = draft.postings.filter { $0.role == .source && $0.accountID != nil }
        let destinations = draft.postings.filter { $0.role == .destination && $0.accountID != nil }
        if draft.direction != .inbound && sources.isEmpty { throw FinanceValidationError.missingSource }
        if draft.direction != .outbound && destinations.isEmpty { throw FinanceValidationError.missingDestination }
        if draft.direction == .transfer {
            let source = sources.reduce(Int64(0)) { $0 + minorUnits($1.amount) }
            let destination = destinations.reduce(Int64(0)) { $0 + minorUnits($1.amount) }
            if source != destination { throw FinanceValidationError.unbalancedTransfer }
        }
    }

    static func accountBalance(_ account: FinanceAccount, through date: Date = .distantFuture) -> Int64 {
        account.openingBalanceMinor + account.postings.reduce(into: Int64(0)) { result, posting in
            guard let transaction = posting.transaction, transaction.archivedAt == nil, transaction.occurredAt <= date else { return }
            result += posting.accountAmountMinor
        }
    }

    static func balanceSeries(account: FinanceAccount, start: Date, end: Date, calendar: Calendar = .current) -> [BalancePoint] {
        let startDay = calendar.startOfDay(for: start)
        let endDay = calendar.startOfDay(for: end)
        var balance = account.openingBalanceMinor
        for posting in account.postings {
            guard let transaction = posting.transaction, transaction.archivedAt == nil, transaction.occurredAt < startDay else { continue }
            balance += posting.accountAmountMinor
        }
        var result: [BalancePoint] = []
        var day = startDay
        while day <= endDay {
            let next = calendar.date(byAdding: .day, value: 1, to: day) ?? day
            for posting in account.postings {
                guard let transaction = posting.transaction, transaction.archivedAt == nil, transaction.occurredAt >= day, transaction.occurredAt < next else { continue }
                balance += posting.accountAmountMinor
            }
            result.append(BalancePoint(date: day, balanceMinor: balance, isComplete: true))
            day = next
        }
        return result
    }

    static func fingerprint(date: Date?, amountMinor: Int64?, currency: String, detail: String) -> String {
        let day = date.map { Calendar.current.startOfDay(for: $0).timeIntervalSince1970.description } ?? "none"
        let normalized = detail.lowercased().filter { $0.isLetter || $0.isNumber }
        return "\(day)|\(amountMinor ?? 0)|\(currency.uppercased())|\(normalized)"
    }
}

enum FinanceFormat {
    static func currency(minor: Int64, code: String) -> String {
        let value = Decimal(minor) / 100
        return value.formatted(.currency(code: code))
    }
}

