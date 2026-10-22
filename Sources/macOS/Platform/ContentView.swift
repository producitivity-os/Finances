import ProductivityUI
import SwiftUI

struct FinancesContentView: View {
    @Environment(FinancesAppState.self) private var state
    @Environment(\.openWindow) private var openWindow
    @State private var columnVisibility: NavigationSplitViewVisibility = .all

    var body: some View {
        @Bindable var state = state
        NavigationSplitView(columnVisibility: $columnVisibility) {
            VStack(alignment: .leading, spacing: 14) {
                Text("Finances")
                    .font(.title2.bold())

                ProductivityNavigationGrid(
                    FinanceDestination.allCases,
                    selection: $state.selection,
                    accentColor: FinanceTheme.accent,
                    title: \.title
                ) { destination in
                    LucideIcon(name: destination.icon, size: 20)
                }
                Spacer()
            }
            .padding(14)
            .navigationSplitViewColumnWidth(min: 190, ideal: 210, max: 235)
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
                } else {
                    ProgressView("Preparing Finances…")
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .navigationTitle(state.selection.title)
        }
        .frame(minWidth: 700, minHeight: 520)
        .tint(FinanceTheme.accent)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text(state.selection.title)
                    .font(.headline)
            }
        }
        .task { await state.prepare() }
        .onChange(of: state.createRequestID) { _, requestID in
            guard requestID != nil else { return }
            switch state.selection {
            case .dashboard, .transactions:
                state.showTransactionPanel(id: UUID())
            case .accounts:
                openWindow(value: FinanceEditorRoute.account(UUID()))
            case .categories:
                openWindow(value: FinanceEditorRoute.category(UUID()))
            case .documents:
                break
            }
        }
    }
}
