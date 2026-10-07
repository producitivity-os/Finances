import Foundation
import ProductivityCloudKit
import SwiftData

private struct CategoryArchive: Codable {
    let id: UUID; var name: String; var icon: String; var color: String; var archivedAt: Date?; var createdAt: Date
}
private struct AccountArchive: Codable {
    let id: UUID; var name: String; var type: FinanceAccountType; var currency: String; var openingBalance: Int64
    var exchangeRate: Double?; var color: String; var archivedAt: Date?; var createdAt: Date; var updatedAt: Date
}
private struct TransactionArchive: Codable {
    struct Posting: Codable {
        let id: UUID; var role: PostingRole; var transactionAmount: Int64; var accountAmount: Int64
        var accountCurrency: String; var baseAmount: Int64?; var exchangeRate: Double?; var counterparty: String; var accountID: UUID?
    }
    let id: UUID; var occurredAt: Date; var detail: String; var notes: String; var direction: MoneyDirection
    var type: FinanceTransactionType; var amount: Int64; var currency: String; var archivedAt: Date?
    var createdAt: Date; var updatedAt: Date; var categoryID: UUID?; var categoryName: String?; var postings: [Posting]
}
private struct DocumentArchive: Codable {
    let id: UUID; var hash: String; var name: String; var mimeType: String; var kind: FinanceDocumentKind
    var thumbnail: Data?; var pageCount: Int; var recognizedText: String; var status: OCRImportStatus
    var archivedAt: Date?; var createdAt: Date; var transactionIDs: [UUID]
}

extension FinanceStoreActor {
    func cloudRecords() throws -> [CloudSyncRecord] {
        var result: [CloudSyncRecord] = []
        for category in try modelContext.fetch(FetchDescriptor<FinanceCategory>()) where !category.isBuiltin {
            let value = CategoryArchive(id: category.id, name: category.name, icon: category.iconName, color: category.colorHex, archivedAt: category.archivedAt, createdAt: category.createdAt)
            result.append(.init(id: category.id.uuidString, recordType: "Category", updatedAt: category.createdAt, archivedAt: category.archivedAt, payload: try JSONEncoder().encode(value)))
        }
        for account in try modelContext.fetch(FetchDescriptor<FinanceAccount>()) {
            let value = AccountArchive(id: account.id, name: account.name, type: account.type, currency: account.currencyCode, openingBalance: account.openingBalanceMinor, exchangeRate: account.baseExchangeRate, color: account.colorHex, archivedAt: account.archivedAt, createdAt: account.createdAt, updatedAt: account.updatedAt)
            result.append(.init(id: account.id.uuidString, recordType: "Account", updatedAt: account.updatedAt, archivedAt: account.archivedAt, payload: try JSONEncoder().encode(value)))
        }
        for transaction in try modelContext.fetch(FetchDescriptor<FinancialTransaction>()) {
            let value = TransactionArchive(
                id: transaction.id, occurredAt: transaction.occurredAt, detail: transaction.transactionDetail,
                notes: transaction.notes, direction: transaction.direction, type: transaction.type,
                amount: transaction.amountMinor, currency: transaction.currencyCode, archivedAt: transaction.archivedAt,
                createdAt: transaction.createdAt, updatedAt: transaction.updatedAt, categoryID: transaction.category?.id,
                categoryName: transaction.category?.name,
                postings: transaction.postings.map { .init(id: $0.id, role: $0.role, transactionAmount: $0.transactionAmountMinor, accountAmount: $0.accountAmountMinor, accountCurrency: $0.accountCurrencyCode, baseAmount: $0.baseAmountMinor, exchangeRate: $0.exchangeRate, counterparty: $0.counterparty, accountID: $0.account?.id) }
            )
            result.append(.init(id: transaction.id.uuidString, recordType: "Transaction", updatedAt: transaction.updatedAt, archivedAt: transaction.archivedAt, payload: try JSONEncoder().encode(value)))
        }
        for document in try modelContext.fetch(FetchDescriptor<FinanceDocument>()) {
            let value = DocumentArchive(id: document.id, hash: document.contentHash, name: document.originalName, mimeType: document.mimeType, kind: document.kind, thumbnail: document.thumbnailData, pageCount: document.pageCount, recognizedText: document.recognizedText, status: document.ocrStatus, archivedAt: document.archivedAt, createdAt: document.createdAt, transactionIDs: document.transactionLinks.compactMap { $0.transaction?.id })
            let directory = URL.applicationSupportDirectory.appending(path: "Finances/CloudAssets", directoryHint: .isDirectory)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let url = directory.appending(path: document.contentHash)
            if !FileManager.default.fileExists(atPath: url.path) { try document.originalData.write(to: url, options: .atomic) }
            result.append(.init(id: document.id.uuidString, recordType: "Document", updatedAt: document.createdAt, archivedAt: document.archivedAt, payload: try JSONEncoder().encode(value), assets: ["document": url]))
        }
        return result
    }

    func applyCloudRecords(_ records: [CloudSyncRecord], deletions: [String]) throws {
        for record in records where record.recordType == "Category" { try applyCategory(record) }
        for record in records where record.recordType == "Account" { try applyAccount(record) }
        for record in records where record.recordType == "Transaction" { try applyTransaction(record) }
        for record in records where record.recordType == "Document" { try applyDocument(record) }
        for value in deletions { try archiveCloudObject(id: value) }
        try modelContext.save()
    }

    private func applyCategory(_ record: CloudSyncRecord) throws {
        let value = try JSONDecoder().decode(CategoryArchive.self, from: record.payload)
        let id = value.id
        let descriptor = FetchDescriptor<FinanceCategory>(predicate: #Predicate { $0.id == id })
        let category = try modelContext.fetch(descriptor).first ?? FinanceCategory(id: id, name: value.name, iconName: value.icon, colorHex: value.color)
        guard category.modelContext == nil || value.createdAt >= category.createdAt else { return }
        if category.modelContext == nil { modelContext.insert(category) }
        category.name = value.name; category.iconName = value.icon; category.colorHex = value.color; category.archivedAt = value.archivedAt; category.createdAt = value.createdAt
    }

    private func applyAccount(_ record: CloudSyncRecord) throws {
        let value = try JSONDecoder().decode(AccountArchive.self, from: record.payload)
        let id = value.id
        let descriptor = FetchDescriptor<FinanceAccount>(predicate: #Predicate { $0.id == id })
        let account = try modelContext.fetch(descriptor).first ?? FinanceAccount(id: id, name: value.name, type: value.type, currencyCode: value.currency)
        guard account.modelContext == nil || value.updatedAt > account.updatedAt else { return }
        if account.modelContext == nil { modelContext.insert(account) }
        account.name = value.name; account.type = value.type; account.currencyCode = value.currency
        account.openingBalanceMinor = value.openingBalance; account.baseExchangeRate = value.exchangeRate
        account.colorHex = value.color; account.archivedAt = value.archivedAt; account.createdAt = value.createdAt; account.updatedAt = value.updatedAt
    }

    private func applyTransaction(_ record: CloudSyncRecord) throws {
        let value = try JSONDecoder().decode(TransactionArchive.self, from: record.payload)
        let id = value.id
        let descriptor = FetchDescriptor<FinancialTransaction>(predicate: #Predicate { $0.id == id })
        let transaction = try modelContext.fetch(descriptor).first ?? FinancialTransaction(id: id, occurredAt: value.occurredAt, detail: value.detail, direction: value.direction, type: value.type, amountMinor: value.amount, currencyCode: value.currency)
        guard transaction.modelContext == nil || value.updatedAt > transaction.updatedAt else { return }
        if transaction.modelContext == nil { modelContext.insert(transaction) }
        transaction.occurredAt = value.occurredAt; transaction.transactionDetail = value.detail; transaction.notes = value.notes
        transaction.direction = value.direction; transaction.type = value.type; transaction.amountMinor = value.amount
        transaction.currencyCode = value.currency; transaction.archivedAt = value.archivedAt; transaction.createdAt = value.createdAt; transaction.updatedAt = value.updatedAt
        if let categoryID = value.categoryID {
            let descriptor = FetchDescriptor<FinanceCategory>(predicate: #Predicate { $0.id == categoryID })
            transaction.category = try modelContext.fetch(descriptor).first
        }
        if transaction.category == nil, let name = value.categoryName {
            let descriptor = FetchDescriptor<FinanceCategory>(predicate: #Predicate { $0.name == name })
            transaction.category = try modelContext.fetch(descriptor).first
        }
        transaction.postings.forEach(modelContext.delete)
        transaction.postings = try value.postings.map { posting in
            let account: FinanceAccount?
            if let accountID = posting.accountID {
                let descriptor = FetchDescriptor<FinanceAccount>(predicate: #Predicate { $0.id == accountID })
                account = try modelContext.fetch(descriptor).first
            } else { account = nil }
            return TransactionPosting(id: posting.id, role: posting.role, transactionAmountMinor: posting.transactionAmount, accountAmountMinor: posting.accountAmount, accountCurrencyCode: posting.accountCurrency, baseAmountMinor: posting.baseAmount, exchangeRate: posting.exchangeRate, counterparty: posting.counterparty, transaction: transaction, account: account)
        }
    }

    private func applyDocument(_ record: CloudSyncRecord) throws {
        let value = try JSONDecoder().decode(DocumentArchive.self, from: record.payload)
        guard let url = record.assets["document"], let data = try? Data(contentsOf: url) else { return }
        let id = value.id
        let descriptor = FetchDescriptor<FinanceDocument>(predicate: #Predicate { $0.id == id })
        let document = try modelContext.fetch(descriptor).first ?? FinanceDocument(id: id, contentHash: value.hash, originalName: value.name, mimeType: value.mimeType, kind: value.kind, originalData: data, thumbnailData: value.thumbnail, pageCount: value.pageCount)
        if document.modelContext == nil { modelContext.insert(document) }
        document.originalName = value.name; document.mimeType = value.mimeType; document.kind = value.kind; document.originalData = data
        document.thumbnailData = value.thumbnail; document.pageCount = value.pageCount; document.recognizedText = value.recognizedText
        document.ocrStatus = value.status; document.archivedAt = value.archivedAt; document.createdAt = value.createdAt
        document.transactionLinks.forEach(modelContext.delete)
        document.transactionLinks = try value.transactionIDs.compactMap { transactionID in
            let descriptor = FetchDescriptor<FinancialTransaction>(predicate: #Predicate { $0.id == transactionID })
            guard let transaction = try modelContext.fetch(descriptor).first else { return nil }
            return TransactionDocumentLink(transaction: transaction, document: document)
        }
    }

    private func archiveCloudObject(id value: String) throws {
        guard let id = UUID(uuidString: value) else { return }
        if let account = try modelContext.fetch(FetchDescriptor<FinanceAccount>(predicate: #Predicate { $0.id == id })).first { account.archivedAt = account.archivedAt ?? .now }
        if let transaction = try modelContext.fetch(FetchDescriptor<FinancialTransaction>(predicate: #Predicate { $0.id == id })).first { transaction.archivedAt = transaction.archivedAt ?? .now }
        if let category = try modelContext.fetch(FetchDescriptor<FinanceCategory>(predicate: #Predicate { $0.id == id })).first { category.archivedAt = category.archivedAt ?? .now }
        if let document = try modelContext.fetch(FetchDescriptor<FinanceDocument>(predicate: #Predicate { $0.id == id })).first { document.archivedAt = document.archivedAt ?? .now }
    }
}
