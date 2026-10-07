import Foundation
import SwiftData

enum MoneyDirection: String, Codable, CaseIterable, Identifiable, Sendable {
    case inbound, outbound, transfer
    var id: String { rawValue }
    var title: String { rawValue.capitalized }
}

enum FinanceTransactionType: String, Codable, CaseIterable, Identifiable, Sendable {
    case expense, refund, deposit, income, transfer, withdrawal, fee, loan
    var id: String { rawValue }
    var title: String { rawValue.capitalized }

    static func allowed(for direction: MoneyDirection) -> [Self] {
        switch direction {
        case .inbound: [.refund, .deposit, .income, .loan]
        case .outbound: [.expense, .withdrawal, .fee, .loan]
        case .transfer: [.transfer, .loan]
        }
    }
}

enum FinanceAccountType: String, Codable, CaseIterable, Identifiable, Sendable {
    case bank, cash, credit, loan, investment, eWallet, other
    var id: String { rawValue }
    var title: String { self == .eWallet ? "E-Wallet" : rawValue.capitalized }
}

enum PostingRole: String, Codable, CaseIterable, Identifiable, Sendable {
    case source, destination, external
    var id: String { rawValue }
}

enum FinanceDocumentKind: String, Codable, CaseIterable, Identifiable, Sendable {
    case receipt, statement
    var id: String { rawValue }
    var title: String { rawValue.capitalized }
}

enum OCRImportStatus: String, Codable, Sendable {
    case pending, recognizing, ready, imported, failed, ignored
}

@Model
final class FinancePreferences {
    @Attribute(.unique) var id: String
    var baseCurrencyCode: String
    var appearance: String

    init(baseCurrencyCode: String, appearance: String = "system") {
        id = "default"
        self.baseCurrencyCode = baseCurrencyCode
        self.appearance = appearance
    }
}

@Model
final class FinanceCategory {
    @Attribute(.unique) var id: UUID
    var name: String
    var iconName: String
    var colorHex: String
    var isBuiltin: Bool
    var archivedAt: Date?
    var createdAt: Date

    init(id: UUID = UUID(), name: String, iconName: String, colorHex: String, isBuiltin: Bool = false) {
        self.id = id
        self.name = name
        self.iconName = iconName
        self.colorHex = colorHex
        self.isBuiltin = isBuiltin
        createdAt = .now
    }
}

@Model
final class FinanceAccount {
    @Attribute(.unique) var id: UUID
    var name: String
    var typeRaw: String
    var currencyCode: String
    var openingBalanceMinor: Int64
    var baseExchangeRate: Double?
    var colorHex: String
    var archivedAt: Date?
    var createdAt: Date
    var updatedAt: Date
    @Relationship(deleteRule: .nullify, inverse: \TransactionPosting.account) var postings: [TransactionPosting]

    var type: FinanceAccountType {
        get { FinanceAccountType(rawValue: typeRaw) ?? .bank }
        set { typeRaw = newValue.rawValue }
    }

    init(id: UUID = UUID(), name: String, type: FinanceAccountType, currencyCode: String, openingBalanceMinor: Int64 = 0, baseExchangeRate: Double? = nil, colorHex: String = "#2F80ED") {
        self.id = id
        self.name = name
        typeRaw = type.rawValue
        self.currencyCode = currencyCode
        self.openingBalanceMinor = openingBalanceMinor
        self.baseExchangeRate = baseExchangeRate
        self.colorHex = colorHex
        createdAt = .now
        updatedAt = .now
        postings = []
    }
}

@Model
final class FinancialTransaction {
    @Attribute(.unique) var id: UUID
    var occurredAt: Date
    var transactionDetail: String
    var notes: String
    var directionRaw: String
    var typeRaw: String
    var amountMinor: Int64
    var currencyCode: String
    var archivedAt: Date?
    var createdAt: Date
    var updatedAt: Date
    var category: FinanceCategory?
    @Relationship(deleteRule: .cascade, inverse: \TransactionPosting.transaction) var postings: [TransactionPosting]
    @Relationship(deleteRule: .cascade, inverse: \TransactionDocumentLink.transaction) var documentLinks: [TransactionDocumentLink]

    var direction: MoneyDirection {
        get { MoneyDirection(rawValue: directionRaw) ?? .outbound }
        set { directionRaw = newValue.rawValue }
    }
    var type: FinanceTransactionType {
        get { FinanceTransactionType(rawValue: typeRaw) ?? .expense }
        set { typeRaw = newValue.rawValue }
    }

    init(id: UUID = UUID(), occurredAt: Date = .now, detail: String, notes: String = "", direction: MoneyDirection, type: FinanceTransactionType, amountMinor: Int64, currencyCode: String, category: FinanceCategory? = nil) {
        self.id = id
        self.occurredAt = occurredAt
        transactionDetail = detail
        self.notes = notes
        directionRaw = direction.rawValue
        typeRaw = type.rawValue
        self.amountMinor = amountMinor
        self.currencyCode = currencyCode
        self.category = category
        createdAt = .now
        updatedAt = .now
        postings = []
        documentLinks = []
    }
}

@Model
final class TransactionPosting {
    @Attribute(.unique) var id: UUID
    var roleRaw: String
    var transactionAmountMinor: Int64
    var accountAmountMinor: Int64
    var accountCurrencyCode: String
    var baseAmountMinor: Int64?
    var exchangeRate: Double?
    var counterparty: String
    var transaction: FinancialTransaction?
    var account: FinanceAccount?

    var role: PostingRole {
        get { PostingRole(rawValue: roleRaw) ?? .external }
        set { roleRaw = newValue.rawValue }
    }

    init(id: UUID = UUID(), role: PostingRole, transactionAmountMinor: Int64, accountAmountMinor: Int64, accountCurrencyCode: String, baseAmountMinor: Int64? = nil, exchangeRate: Double? = nil, counterparty: String = "", transaction: FinancialTransaction? = nil, account: FinanceAccount? = nil) {
        self.id = id
        roleRaw = role.rawValue
        self.transactionAmountMinor = transactionAmountMinor
        self.accountAmountMinor = accountAmountMinor
        self.accountCurrencyCode = accountCurrencyCode
        self.baseAmountMinor = baseAmountMinor
        self.exchangeRate = exchangeRate
        self.counterparty = counterparty
        self.transaction = transaction
        self.account = account
    }
}

@Model
final class FinanceDocument {
    @Attribute(.unique) var id: UUID
    @Attribute(.unique) var contentHash: String
    var originalName: String
    var mimeType: String
    var kindRaw: String
    @Attribute(.externalStorage) var originalData: Data
    @Attribute(.externalStorage) var thumbnailData: Data?
    var pageCount: Int
    var recognizedText: String
    var ocrStatusRaw: String
    var archivedAt: Date?
    var createdAt: Date
    @Relationship(deleteRule: .cascade, inverse: \TransactionDocumentLink.document) var transactionLinks: [TransactionDocumentLink]
    @Relationship(deleteRule: .cascade, inverse: \OCRImportBatch.document) var importBatches: [OCRImportBatch]

    var kind: FinanceDocumentKind {
        get { FinanceDocumentKind(rawValue: kindRaw) ?? .receipt }
        set { kindRaw = newValue.rawValue }
    }
    var ocrStatus: OCRImportStatus {
        get { OCRImportStatus(rawValue: ocrStatusRaw) ?? .pending }
        set { ocrStatusRaw = newValue.rawValue }
    }

    init(id: UUID = UUID(), contentHash: String, originalName: String, mimeType: String, kind: FinanceDocumentKind, originalData: Data, thumbnailData: Data? = nil, pageCount: Int = 1) {
        self.id = id
        self.contentHash = contentHash
        self.originalName = originalName
        self.mimeType = mimeType
        kindRaw = kind.rawValue
        self.originalData = originalData
        self.thumbnailData = thumbnailData
        self.pageCount = pageCount
        recognizedText = ""
        ocrStatusRaw = OCRImportStatus.pending.rawValue
        createdAt = .now
        transactionLinks = []
        importBatches = []
    }
}

@Model
final class TransactionDocumentLink {
    @Attribute(.unique) var id: UUID
    var transaction: FinancialTransaction?
    var document: FinanceDocument?

    init(id: UUID = UUID(), transaction: FinancialTransaction? = nil, document: FinanceDocument? = nil) {
        self.id = id
        self.transaction = transaction
        self.document = document
    }
}

@Model
final class OCRImportBatch {
    @Attribute(.unique) var id: UUID
    var statusRaw: String
    var createdAt: Date
    var completedAt: Date?
    var errorMessage: String?
    var document: FinanceDocument?
    @Relationship(deleteRule: .cascade, inverse: \OCRTransactionCandidate.batch) var candidates: [OCRTransactionCandidate]

    var status: OCRImportStatus {
        get { OCRImportStatus(rawValue: statusRaw) ?? .pending }
        set { statusRaw = newValue.rawValue }
    }

    init(id: UUID = UUID(), document: FinanceDocument? = nil) {
        self.id = id
        statusRaw = OCRImportStatus.pending.rawValue
        createdAt = .now
        self.document = document
        candidates = []
    }
}

@Model
final class OCRTransactionCandidate {
    @Attribute(.unique) var id: UUID
    var occurredAt: Date?
    var transactionDetail: String
    var amountMinor: Int64?
    var currencyCode: String
    var directionRaw: String
    var typeRaw: String
    var sourceText: String
    var fingerprint: String
    var isLikelyDuplicate: Bool
    var statusRaw: String
    var batch: OCRImportBatch?

    var direction: MoneyDirection {
        get { MoneyDirection(rawValue: directionRaw) ?? .outbound }
        set { directionRaw = newValue.rawValue }
    }
    var type: FinanceTransactionType {
        get { FinanceTransactionType(rawValue: typeRaw) ?? .expense }
        set { typeRaw = newValue.rawValue }
    }
    var status: OCRImportStatus {
        get { OCRImportStatus(rawValue: statusRaw) ?? .pending }
        set { statusRaw = newValue.rawValue }
    }

    init(id: UUID = UUID(), occurredAt: Date?, detail: String, amountMinor: Int64?, currencyCode: String, direction: MoneyDirection, type: FinanceTransactionType, sourceText: String, fingerprint: String, isLikelyDuplicate: Bool = false, batch: OCRImportBatch? = nil) {
        self.id = id
        self.occurredAt = occurredAt
        transactionDetail = detail
        self.amountMinor = amountMinor
        self.currencyCode = currencyCode
        directionRaw = direction.rawValue
        typeRaw = type.rawValue
        self.sourceText = sourceText
        self.fingerprint = fingerprint
        self.isLikelyDuplicate = isLikelyDuplicate
        statusRaw = OCRImportStatus.pending.rawValue
        self.batch = batch
    }
}

enum FinanceSchemaV1: VersionedSchema {
    static let versionIdentifier = Schema.Version(1, 0, 0)
    static var models: [any PersistentModel.Type] {
        [FinancePreferences.self, FinanceCategory.self, FinanceAccount.self, FinancialTransaction.self, TransactionPosting.self, FinanceDocument.self, TransactionDocumentLink.self, OCRImportBatch.self, OCRTransactionCandidate.self]
    }
}

enum FinanceMigrationPlan: SchemaMigrationPlan {
    static var schemas: [any VersionedSchema.Type] { [FinanceSchemaV1.self] }
    static var stages: [MigrationStage] { [] }
}
