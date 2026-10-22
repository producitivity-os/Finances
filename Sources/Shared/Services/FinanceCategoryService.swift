import SwiftData

@MainActor
enum FinanceCategoryService {
    static let uncategorizedName = "Uncategorized"

    static func isUncategorized(_ category: FinanceCategory) -> Bool {
        category.name.caseInsensitiveCompare(uncategorizedName) == .orderedSame
    }

    static func delete(
        _ category: FinanceCategory,
        categories: [FinanceCategory],
        transactions: [FinancialTransaction],
        in context: ModelContext
    ) throws {
        guard !isUncategorized(category) else { return }

        let uncategorized: FinanceCategory
        if let existing = categories.first(where: { isUncategorized($0) }) {
            existing.archivedAt = nil
            uncategorized = existing
        } else {
            uncategorized = FinanceCategory(
                name: uncategorizedName,
                iconName: "tag",
                colorHex: "#828282",
                isBuiltin: true
            )
            context.insert(uncategorized)
        }

        for transaction in transactions where transaction.category?.id == category.id {
            transaction.category = uncategorized
            transaction.updatedAt = .now
        }
        category.archivedAt = .now
        try context.save()
    }
}
