import Foundation

struct PostingDraft: Identifiable, Hashable, Sendable {
    var id = UUID()
    var accountID: UUID? = nil
    var role: PostingRole
    var amount: Decimal
    var accountAmount: Decimal
    var exchangeRate: Double?
}

struct TransactionDraft: Hashable, Sendable {
    var id: UUID?
    var occurredAt = Date.now
    var detail = ""
    var notes = ""
    var direction = MoneyDirection.outbound
    var type = FinanceTransactionType.expense
    var amount: Decimal = 0
    var currencyCode = Locale.current.currency?.identifier ?? "USD"
    var categoryID: UUID?
    var postings: [PostingDraft] = []
}

struct AccountDraft: Hashable, Sendable {
    var id: UUID?
    var name = ""
    var type = FinanceAccountType.bank
    var currencyCode = Locale.current.currency?.identifier ?? "USD"
    var openingBalance: Decimal = 0
    var baseExchangeRate: Double?
    var colorHex = "#2F80ED"
}
