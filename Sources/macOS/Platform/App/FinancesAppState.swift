import AppKit
import Foundation
import Observation
import ProductivityRoutineKit
import ProductivityUI
import SwiftData
import SwiftUI

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
    case account(UUID)
    case category(UUID)
    case document(UUID)
}

private final class FinanceTransactionPanelDelegate: NSObject, NSWindowDelegate {
    var onClose: () -> Void = {}
    func windowWillClose(_ notification: Notification) { onClose() }
}

@MainActor @Observable
final class FinancesAppState {
    let container: ModelContainer
    let store: FinanceStoreActor
    let cloud: FinanceCloudSyncController
    var selection = FinanceDestination.dashboard
    var createRequestID: UUID?
    var isReady = false
    var startupError: String?
    private(set) var defaultAccountID: UUID?
    private(set) var flaggedTransactionIDs: Set<UUID>
    @ObservationIgnored private var transactionPanel: NSPanel?
    @ObservationIgnored private let transactionPanelDelegate = FinanceTransactionPanelDelegate()
    @ObservationIgnored private var routineRequest: RoutineActionRequest?

    private static let defaultAccountKey = "finances.default-account-id"
    private static let flaggedTransactionsKey = "finances.flagged-transaction-ids"

    init(container: ModelContainer) {
        self.container = container
        store = FinanceStoreActor(modelContainer: container)
        cloud = FinanceCloudSyncController(store: store)
        defaultAccountID = UserDefaults.standard.string(forKey: Self.defaultAccountKey).flatMap(UUID.init(uuidString:))
        flaggedTransactionIDs = Set(
            UserDefaults.standard.stringArray(forKey: Self.flaggedTransactionsKey)?.compactMap(UUID.init(uuidString:)) ?? []
        )
    }

    func prepare() async {
        guard !isReady else { return }
        do {
            try await store.seedIfNeeded()
            await cloud.synchronize()
            if defaultAccountID == nil {
                let context = ModelContext(container)
                let accounts = try context.fetch(FetchDescriptor<FinanceAccount>())
                    .filter { $0.archivedAt == nil }
                let initial = accounts.first { $0.name.localizedCaseInsensitiveContains("Maybank") }
                    ?? accounts.first
                setDefaultAccount(initial?.id)
            }
            isReady = true
            await FinancesRoutineProvider.publish()
        }
        catch { startupError = error.localizedDescription }
    }

    func setDefaultAccount(_ id: UUID?) {
        defaultAccountID = id
        UserDefaults.standard.set(id?.uuidString, forKey: Self.defaultAccountKey)
    }

    func isFlagged(_ id: UUID) -> Bool {
        flaggedTransactionIDs.contains(id)
    }

    func toggleFlag(_ id: UUID) {
        if flaggedTransactionIDs.contains(id) {
            flaggedTransactionIDs.remove(id)
        } else {
            flaggedTransactionIDs.insert(id)
        }
        UserDefaults.standard.set(flaggedTransactionIDs.map(\.uuidString).sorted(), forKey: Self.flaggedTransactionsKey)
    }

    var newItemCommandTitle: String {
        switch selection {
        case .dashboard, .transactions: "New Transaction"
        case .accounts: "New Account"
        case .documents: "Import Document"
        case .categories: "New Category"
        }
    }

    func requestNewItem() {
        createRequestID = UUID()
    }

    func showTransactionPanel(id: UUID, onSave: @escaping () -> Void = {}, onCancel: @escaping () -> Void = {}) {
        transactionPanelDelegate.onClose = onCancel
        let root = TransactionEditorView(id: id, onClose: { [weak self] in
            onCancel()
            self?.closeTransactionPanel()
        }, onSave: { [weak self] in
            onSave()
            self?.closeTransactionPanel()
        })
        .environment(self)
        .modelContainer(container)

        let panel: NSPanel
        if let transactionPanel {
            panel = transactionPanel
            panel.contentViewController = NSHostingController(rootView: root)
        } else {
            panel = NSPanel(
                contentRect: NSRect(x: 0, y: 0, width: 680, height: 720),
                styleMask: [.titled, .closable, .miniaturizable, .resizable, .utilityWindow],
                backing: .buffered,
                defer: false
            )
            panel.title = "Transaction"
            panel.isReleasedWhenClosed = false
            panel.hidesOnDeactivate = false
            panel.isFloatingPanel = false
            panel.minSize = NSSize(width: 560, height: 540)
            panel.setFrameAutosaveName("Finances.TransactionPanel")
            panel.contentViewController = NSHostingController(rootView: root)
            panel.delegate = transactionPanelDelegate
            transactionPanel = panel
        }

        panel.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func closeTransactionPanel() {
        transactionPanel?.orderOut(nil)
    }

    func handleRoutineInvocation(_ url: URL) async {
        do {
            await handleRoutineAction(try await RoutineActionClient.shared.request(from: url))
        } catch { startupError = error.localizedDescription }
    }

    func handleRoutineAction(_ request: RoutineActionRequest) async {
        guard request.providerID == FinancesRoutineProvider.providerID, request.actionID == "log-finances" else { return }
        if !isReady { await prepare() }
        await RoutineActionClient.shared.update(request, state: .running, message: "Transaction editor opened")
        routineRequest = request
        showTransactionPanel(
            id: UUID(),
            onSave: { [weak self] in self?.finishRoutineInvocation(completed: true) },
            onCancel: { [weak self] in self?.finishRoutineInvocation(completed: false) }
        )
    }

    private func finishRoutineInvocation(completed: Bool) {
        guard let request = routineRequest else { return }
        routineRequest = nil
        Task {
            await RoutineActionClient.shared.update(
                request,
                state: completed ? .completed : .cancelled,
                message: completed ? "Transaction saved" : "Transaction cancelled"
            )
        }
    }

    func dockMenuItems() -> [RoutineDockMenuItem] {
        [RoutineDockMenuItem(providerID: FinancesRoutineProvider.providerID, actionID: "log-finances")]
    }
}
