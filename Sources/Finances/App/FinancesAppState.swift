import Foundation
import Observation
import SwiftData

enum FinanceDestination: String, CaseIterable, Identifiable {
    case dashboard, transactions, accounts, documents, categories
    var id: String { rawValue }
    var title: String { rawValue.capitalized }
    var icon: LucideIconName {
        switch self {
        case .dashboard: .chartArea
        case .transactions: .receipt
        case .accounts: .wallet
        case .documents: .fileText
        case .categories: .tags
        }
    }
}

enum FinanceEditorRoute: Codable, Hashable {
    case transaction(UUID)
    case account(UUID)
    case category(UUID)
    case document(UUID)
}

@MainActor @Observable
final class FinancesAppState {
    let container: ModelContainer
    let store: FinanceStoreActor
    var selection = FinanceDestination.dashboard
    var isReady = false
    var startupError: String?

    init(container: ModelContainer) {
        self.container = container
        store = FinanceStoreActor(modelContainer: container)
    }

    func prepare() async {
        guard !isReady else { return }
        do { try await store.seedIfNeeded(); isReady = true }
        catch { startupError = error.localizedDescription }
    }
}

