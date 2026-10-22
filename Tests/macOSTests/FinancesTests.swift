import AppKit
import SwiftData
import Testing
@testable import Finances

@MainActor
struct FinancesTests {
    private func container() throws -> ModelContainer {
        let schema = Schema(FinanceSchemaV1.models)
        let configuration = ModelConfiguration("FinancesTests", schema: schema, isStoredInMemoryOnly: true)
        return try ModelContainer(for: schema, configurations: [configuration])
    }

    @Test func seedsCategoriesAndPreferencesOnce() async throws {
        let container = try container(); let store = FinanceStoreActor(modelContainer: container)
        try await store.seedIfNeeded(); try await store.seedIfNeeded()
        #expect(try ModelContext(container).fetchCount(FetchDescriptor<FinanceCategory>()) == FinanceSeedData.categories.count)
        #expect(try ModelContext(container).fetchCount(FetchDescriptor<FinancePreferences>()) == 1)
        let accounts = try ModelContext(container).fetch(FetchDescriptor<FinanceAccount>())
        #expect(accounts.count == 1)
        #expect(accounts.first?.name == "Maybank")
        #expect(accounts.first?.currencyCode == "MYR")
    }

    @Test func transactionTypesFollowDirection() {
        #expect(FinanceTransactionType.allowed(for: .inbound) == [.refund, .deposit, .income, .loan])
        #expect(FinanceTransactionType.allowed(for: .outbound).contains(.expense))
        #expect(FinanceTransactionType.allowed(for: .transfer) == [.transfer, .loan])
        #expect(FinanceTransactionType.income.direction == .inbound)
        #expect(FinanceTransactionType.expense.direction == .outbound)
        #expect(FinanceTransactionType.transfer.direction == .transfer)
    }

    @Test func simplifiedTransactionUsesOneAccountAndInfersDirection() async throws {
        let container = try container(); let context = ModelContext(container); let store = FinanceStoreActor(modelContainer: container)
        let account = FinanceAccount(name: "Maybank", type: .bank, currencyCode: "MYR")
        context.insert(account); try context.save()
        var draft = TransactionDraft(detail: "Village Grocer", direction: .inbound, type: .expense, amount: 42, currencyCode: "MYR")
        draft.accountID = account.id
        _ = try await store.saveTransaction(draft)

        let transaction = try ModelContext(container).fetch(FetchDescriptor<FinancialTransaction>()).first!
        #expect(transaction.direction == .outbound)
        #expect(transaction.postings.filter { $0.account != nil }.count == 1)
        #expect(transaction.postings.first { $0.account != nil }?.role == .source)
    }

    @Test func paymentItemsRoundTripAndSetTotal() async throws {
        let container = try container(); let context = ModelContext(container); let store = FinanceStoreActor(modelContainer: container)
        let account = FinanceAccount(name: "Maybank", type: .bank, currencyCode: "MYR")
        context.insert(account); try context.save()
        var draft = TransactionDraft(detail: "Cafe", notes: "Team lunch", type: .expense, amount: 1, currencyCode: "MYR")
        draft.accountID = account.id
        draft.items = [
            .init(name: "Meal", amount: 20, notes: "Main"),
            .init(name: "Drink", amount: 5, notes: "Tea")
        ]
        _ = try await store.saveTransaction(draft)

        let transaction = try ModelContext(container).fetch(FetchDescriptor<FinancialTransaction>()).first!
        let decoded = TransactionLineItemCodec.decode(transaction.notes)
        #expect(transaction.amountMinor == 2_500)
        #expect(decoded.notes == "Team lunch")
        #expect(decoded.items.map(\.name) == ["Meal", "Drink"])
    }

    @Test func recipientIsStoredSeparatelyFromTransactionDetail() async throws {
        let container = try container(); let context = ModelContext(container); let store = FinanceStoreActor(modelContainer: container)
        let account = FinanceAccount(name: "Maybank", type: .bank, currencyCode: "MYR")
        context.insert(account); try context.save()
        var draft = TransactionDraft(recipient: "Village Grocer", detail: "Weekly groceries", type: .expense, amount: 42, currencyCode: "MYR")
        draft.accountID = account.id
        _ = try await store.saveTransaction(draft)

        let transaction = try ModelContext(container).fetch(FetchDescriptor<FinancialTransaction>()).first!
        #expect(transaction.transactionDetail == "Weekly groceries")
        #expect(transaction.recipient == "Village Grocer")
    }

    @Test func transferRequiresBalancedAccountSplits() {
        let source = UUID(), destination = UUID()
        var draft = TransactionDraft(detail: "Move money", direction: .transfer, type: .transfer, amount: 100)
        draft.postings = [PostingDraft(accountID: source, role: .source, amount: 100, accountAmount: 100), PostingDraft(accountID: destination, role: .destination, amount: 90, accountAmount: 90)]
        #expect(throws: FinanceValidationError.unbalancedTransfer) { try FinanceCalculator.validate(draft) }
    }

    @Test func storeCreatesManyToManyAccountPostings() async throws {
        let container = try container(); let context = ModelContext(container); let store = FinanceStoreActor(modelContainer: container)
        let first = FinanceAccount(name: "Checking", type: .bank, currencyCode: "USD")
        let second = FinanceAccount(name: "Cash", type: .cash, currencyCode: "USD")
        context.insert(first); context.insert(second); try context.save()
        var draft = TransactionDraft(detail: "Split purchase", direction: .outbound, type: .expense, amount: 30)
        draft.postings = [PostingDraft(accountID: first.id, role: .source, amount: 20, accountAmount: 20), PostingDraft(accountID: second.id, role: .source, amount: 10, accountAmount: 10)]
        _ = try await store.saveTransaction(draft)
        let transaction = try ModelContext(container).fetch(FetchDescriptor<FinancialTransaction>()).first!
        #expect(transaction.postings.filter { $0.account != nil }.count == 2)
        #expect(transaction.postings.reduce(0) { $0 + $1.transactionAmountMinor } == 0)
    }

    @Test func balancesIncludeOpeningAndExcludeArchivedTransactions() throws {
        let account = FinanceAccount(name: "Bank", type: .bank, currencyCode: "USD", openingBalanceMinor: 10_000)
        let income = FinancialTransaction(detail: "Salary", direction: .inbound, type: .income, amountMinor: 5_000, currencyCode: "USD")
        let posting = TransactionPosting(role: .destination, transactionAmountMinor: 5_000, accountAmountMinor: 5_000, accountCurrencyCode: "USD", transaction: income, account: account)
        income.postings = [posting]; account.postings = [posting]
        #expect(FinanceCalculator.accountBalance(account) == 15_000)
        income.archivedAt = .now
        #expect(FinanceCalculator.accountBalance(account) == 10_000)
    }

    @Test func deletingCategoryReassignsTransactionsToUncategorized() throws {
        let container = try container()
        let context = ModelContext(container)
        let groceries = FinanceCategory(name: "Groceries", iconName: "shopping-basket", colorHex: "#27AE60")
        let transaction = FinancialTransaction(
            detail: "Market",
            direction: .outbound,
            type: .expense,
            amountMinor: 4_200,
            currencyCode: "MYR",
            category: groceries
        )
        context.insert(groceries)
        context.insert(transaction)
        try context.save()

        try FinanceCategoryService.delete(groceries, categories: [groceries], transactions: [transaction], in: context)

        #expect(groceries.archivedAt != nil)
        #expect(transaction.category?.name == FinanceCategoryService.uncategorizedName)
        #expect(transaction.updatedAt >= transaction.createdAt)
    }

    @Test func balanceSeriesTracksDailyChanges() {
        let account = FinanceAccount(name: "Bank", type: .bank, currencyCode: "USD", openingBalanceMinor: 1_000)
        let today = Calendar.current.startOfDay(for: .now)
        let expense = FinancialTransaction(occurredAt: today, detail: "Lunch", direction: .outbound, type: .expense, amountMinor: 250, currencyCode: "USD")
        let posting = TransactionPosting(role: .source, transactionAmountMinor: -250, accountAmountMinor: -250, accountCurrencyCode: "USD", transaction: expense, account: account)
        expense.postings = [posting]; account.postings = [posting]
        #expect(FinanceCalculator.balanceSeries(account: account, start: today, end: today).last?.balanceMinor == 750)
    }

    @Test func statementOCRParserProducesReviewCandidates() {
        let text = "01/10/2026 Grocery Store -42.50\n02/10/2026 Salary 2000.00"
        let values = OCRService.parseCandidates(text: text, defaultCurrency: "USD", kind: .statement)
        #expect(values.count == 2)
        #expect(values[0].direction == .outbound)
        #expect(values[1].amountMinor == 200_000)
    }

    @Test func documentImportsAreDeduplicatedByHash() throws {
        let container = try container(); let context = ModelContext(container)
        let image = NSImage(size: NSSize(width: 10, height: 10)); image.lockFocus(); NSColor.orange.setFill(); NSRect(x: 0, y: 0, width: 10, height: 10).fill(); image.unlockFocus()
        let data = NSBitmapImageRep(data: image.tiffRepresentation!)!.representation(using: .png, properties: [:])!
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("finance-test-\(UUID()).png")
        try data.write(to: url); defer { try? FileManager.default.removeItem(at: url) }
        let first = try DocumentService.importDocument(from: url, kind: .receipt, context: context)
        let second = try DocumentService.importDocument(from: url, kind: .statement, context: context)
        #expect(first.id == second.id)
        #expect(try context.fetchCount(FetchDescriptor<FinanceDocument>()) == 1)
    }
}
