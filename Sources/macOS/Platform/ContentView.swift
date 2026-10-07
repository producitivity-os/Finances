import SwiftUI

struct FinancesContentView: View {
    @Environment(FinancesAppState.self) private var state

    var body: some View {
        @Bindable var state = state
        NavigationSplitView {
            List(FinanceDestination.allCases, selection: $state.selection) { destination in
                Label { Text(destination.title) } icon: { LucideIcon(name: destination.icon) }.tag(destination)
            }.navigationSplitViewColumnWidth(min: 150, ideal: 176, max: 205)
        } detail: {
            Group {
                if state.isReady {
                    switch state.selection {
                    case .dashboard: FinanceDashboardView()
                    case .transactions: TransactionsView()
                    case .accounts: AccountsView()
                    case .documents: DocumentsView()
                    case .categories: CategoriesView()
                    }
                } else if let error = state.startupError {
                    ContentUnavailableView("Finances could not start", systemImage: "exclamationmark.triangle", description: Text(error))
                } else { ProgressView("Preparing Finances…") }
            }.frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(minWidth: 700, minHeight: 520)
        .task { await state.prepare() }
    }
}

