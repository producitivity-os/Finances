import AppKit
import ProductivityRoutineKit
import SwiftData
import SwiftUI

@main
struct FinancesApp: App {
    @NSApplicationDelegateAdaptor(RoutineDockMenuApplicationDelegate.self) private var appDelegate
    private let container: ModelContainer
    @State private var state: FinancesAppState

    init() {
        do {
            let schema = Schema(FinanceSchemaV1.models)
            let configuration = ModelConfiguration("Finances", schema: schema)
            let container = try ModelContainer(for: schema, migrationPlan: FinanceMigrationPlan.self, configurations: [configuration])
            self.container = container
            let state = FinancesAppState(container: container)
            _state = State(initialValue: state)
            RoutineDockMenuController.shared.configure(items: { state.dockMenuItems() }) { request in
                Task {
                    await state.handleRoutineAction(request)
                    NSApp.activate(ignoringOtherApps: true)
                }
            }
        } catch { fatalError("Finances could not open its local store: \(error.localizedDescription)") }
    }

    var body: some Scene {
        WindowGroup {
            FinancesContentView().environment(state).modelContainer(container)
                .onOpenURL { url in Task { await state.handleRoutineInvocation(url) } }
        }
        .defaultSize(width: 840, height: 600)
        .commands { FinancesCommands(state: state) }

        WindowGroup("Editor", for: FinanceEditorRoute.self) { route in
            if let route = route.wrappedValue {
                FinanceEditorHost(route: route).environment(state).modelContainer(container)
            } else { ContentUnavailableView("Nothing to edit", systemImage: "square.and.pencil") }
        }.defaultSize(width: 700, height: 640)

        Settings { FinancesSettingsView().environment(state).modelContainer(container) }
    }
}

private struct FinancesCommands: Commands {
    let state: FinancesAppState

    var body: some Commands {
        CommandGroup(replacing: .newItem) {
            Button(state.newItemCommandTitle) { state.requestNewItem() }
                .keyboardShortcut("n", modifiers: .command)
        }
    }
}

