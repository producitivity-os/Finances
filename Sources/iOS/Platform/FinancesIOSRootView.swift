import ProductivityUI
import SwiftUI

struct FinancesIOSRootView: View {
    @Environment(FinancesAppController.self) private var controller

    var body: some View {
        Group {
            if controller.isReady {
                TabView {
                    NavigationStack { FinanceIOSDashboardView() }
                        .tabItem { Label("Dashboard", systemImage: "chart.xyaxis.line") }
                    NavigationStack { FinanceIOSTransactionsView() }
                        .tabItem { Label("Transactions", systemImage: "arrow.left.arrow.right") }
                    NavigationStack { FinanceIOSAccountsView() }
                        .tabItem { Label("Accounts", systemImage: "wallet.bifold") }
                    NavigationStack { FinanceIOSDocumentsView() }
                        .tabItem { Label("Documents", systemImage: "doc.text.viewfinder") }
                    NavigationStack { FinanceIOSMoreView() }
                        .tabItem { Label("More", systemImage: "ellipsis.circle") }
                }
            } else if let startupError = controller.startupError {
                ProductivityErrorState(
                    title: "Finances could not start",
                    message: startupError,
                    retryTitle: "Try Again"
                ) { Task { await controller.prepare() } }
            } else {
                ProgressView("Preparing Finances…")
            }
        }
        .task { await controller.prepare() }
    }
}
