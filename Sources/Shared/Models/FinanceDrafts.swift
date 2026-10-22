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
    var recipient = ""
    var detail = ""
    var notes = ""
    var direction = MoneyDirection.outbound
    var type = FinanceTransactionType.expense
    var amount: Decimal = 0
    var currencyCode = Locale.current.currency?.identifier ?? "USD"
    var categoryID: UUID?
    var postings: [PostingDraft] = []
    var accountID: UUID?
    var destinationAccountID: UUID?
    var items: [TransactionLineItemDraft] = []

    var inferredDirection: MoneyDirection { type.direction }
}

struct TransactionLineItemDraft: Identifiable, Hashable, Codable, Sendable {
    var id = UUID()
    var name = ""
    var amount: Decimal = 0
    var notes = ""
}

enum TransactionLineItemCodec {
    private struct Envelope: Codable {
        var notes: String
        var items: [TransactionLineItemDraft]
    }

    private static let prefix = "finance-items-v1:"

    static func encode(notes: String, items: [TransactionLineItemDraft]) -> String {
        guard !items.isEmpty,
              let data = try? JSONEncoder().encode(Envelope(notes: notes, items: items)) else { return notes }
        return prefix + data.base64EncodedString()
    }

    static func decode(_ value: String) -> (notes: String, items: [TransactionLineItemDraft]) {
        guard value.hasPrefix(prefix),
              let data = Data(base64Encoded: String(value.dropFirst(prefix.count))),
              let envelope = try? JSONDecoder().decode(Envelope.self, from: data) else {
            return (value, [])
        }
        return (envelope.notes, envelope.items)
    }
}

struct AccountDraft: Hashable, Sendable {
    var id: UUID?
    var name = ""
    var type = FinanceAccountType.bank
    var currencyCode = Locale.current.currency?.identifier ?? "USD"
    var openingBalance: Decimal = 0
    var baseExchangeRate: Double?
    var colorHex = "#2F80ED"
    var isDefault = false
}
