import Foundation
import SwiftData

@ModelActor
actor FinanceStoreActor {
    func seedIfNeeded() throws {
        if try modelContext.fetchCount(FetchDescriptor<FinancePreferences>()) == 0 {
            modelContext.insert(FinancePreferences(baseCurrencyCode: Locale.current.currency?.identifier ?? "USD"))
        }
        if try modelContext.fetchCount(FetchDescriptor<FinanceCategory>()) == 0 {
            FinanceSeedData.categories.forEach { seed in
                modelContext.insert(FinanceCategory(name: seed.name, iconName: seed.icon, colorHex: seed.color, isBuiltin: true))
            }
        }
        if try modelContext.fetchCount(FetchDescriptor<FinanceAccount>()) == 0 {
            modelContext.insert(FinanceAccount(
                name: "Maybank",
                type: .bank,
                currencyCode: "MYR",
                colorHex: "#FFCC00"
            ))
        }
        try modelContext.save()
    }

    func saveAccount(_ draft: AccountDraft) throws -> UUID {
        let account: FinanceAccount
        if let id = draft.id, let existing = try modelContext.fetch(FetchDescriptor<FinanceAccount>(predicate: #Predicate { $0.id == id })).first {
            account = existing
        } else {
            account = FinanceAccount(name: draft.name, type: draft.type, currencyCode: draft.currencyCode)
            modelContext.insert(account)
        }
        account.name = draft.name.trimmingCharacters(in: .whitespacesAndNewlines)
        account.type = draft.type
        account.currencyCode = draft.currencyCode.uppercased()
        account.openingBalanceMinor = FinanceCalculator.minorUnits(draft.openingBalance)
        account.baseExchangeRate = draft.baseExchangeRate
        account.colorHex = draft.colorHex
        account.updatedAt = .now
        try modelContext.save()
        return account.id
    }

    func saveTransaction(_ draft: TransactionDraft) throws -> UUID {
        try FinanceCalculator.validate(draft)
        let direction = draft.type.direction
        let amount = draft.items.isEmpty ? draft.amount : draft.items.reduce(Decimal.zero) { $0 + $1.amount }
        let amountMinor = FinanceCalculator.minorUnits(amount)
        let transaction: FinancialTransaction
        if let id = draft.id, let existing = try modelContext.fetch(FetchDescriptor<FinancialTransaction>(predicate: #Predicate { $0.id == id })).first {
            transaction = existing
            existing.postings.forEach(modelContext.delete)
            existing.postings.removeAll()
        } else {
            transaction = FinancialTransaction(detail: draft.detail, direction: direction, type: draft.type, amountMinor: amountMinor, currencyCode: draft.currencyCode)
            modelContext.insert(transaction)
        }
        transaction.occurredAt = draft.occurredAt
        transaction.transactionDetail = draft.detail.trimmingCharacters(in: .whitespacesAndNewlines)
        transaction.notes = TransactionLineItemCodec.encode(notes: draft.notes, items: draft.items)
        transaction.direction = direction
        transaction.type = draft.type
        transaction.amountMinor = amountMinor
        transaction.currencyCode = draft.currencyCode.uppercased()
        transaction.updatedAt = .now
        if let categoryID = draft.categoryID {
            transaction.category = try modelContext.fetch(FetchDescriptor<FinanceCategory>(predicate: #Predicate { $0.id == categoryID })).first
        } else { transaction.category = nil }

        var rows = draft.postings
        if let accountID = draft.accountID {
            rows = [PostingDraft(
                accountID: accountID,
                role: direction == .inbound ? .destination : .source,
                amount: amount,
                accountAmount: amount
            )]
            if direction == .transfer, let destinationAccountID = draft.destinationAccountID {
                rows.append(PostingDraft(
                    accountID: destinationAccountID,
                    role: .destination,
                    amount: amount,
                    accountAmount: amount
                ))
            }
        }

        var signedTotal: Int64 = 0
        for row in rows where row.accountID != nil {
            guard let accountID = row.accountID,
                  let account = try modelContext.fetch(FetchDescriptor<FinanceAccount>(predicate: #Predicate { $0.id == accountID })).first else { continue }
            let transactionMinor = FinanceCalculator.minorUnits(row.amount)
            let accountMinor = FinanceCalculator.minorUnits(row.accountAmount == 0 ? row.amount : row.accountAmount)
            let sign: Int64 = row.role == .source ? -1 : 1
            let posting = TransactionPosting(role: row.role, transactionAmountMinor: sign * transactionMinor, accountAmountMinor: sign * accountMinor, accountCurrencyCode: account.currencyCode, exchangeRate: row.exchangeRate, transaction: transaction, account: account)
            transaction.postings.append(posting)
            signedTotal += sign * transactionMinor
        }
        if signedTotal != 0 {
            let recipient = draft.recipient.trimmingCharacters(in: .whitespacesAndNewlines)
            transaction.postings.append(TransactionPosting(
                role: .external,
                transactionAmountMinor: -signedTotal,
                accountAmountMinor: -signedTotal,
                accountCurrencyCode: transaction.currencyCode,
                counterparty: recipient.isEmpty ? transaction.transactionDetail : recipient,
                transaction: transaction
            ))
        }
        try modelContext.save()
        return transaction.id
    }
}
