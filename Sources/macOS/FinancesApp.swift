import SwiftData
import SwiftUI

@main
struct FinancesApp: App {
    private let container: ModelContainer
    @State private var state: FinancesAppState

    init() {
        do {
            let schema = Schema(FinanceSchemaV1.models)
            let configuration = ModelConfiguration("Finances", schema: schema)
            let container = try ModelContainer(for: schema, migrationPlan: FinanceMigrationPlan.self, configurations: [configuration])
            self.container = container
            _state = State(initialValue: FinancesAppState(container: container))
        } catch { fatalError("Finances could not open its local store: \(error.localizedDescription)") }
    }

    var body: some Scene {
        WindowGroup {
            FinancesContentView().environment(state).modelContainer(container)
        }.defaultSize(width: 840, height: 600)

        WindowGroup("Editor", for: FinanceEditorRoute.self) { route in
            if let route = route.wrappedValue {
                FinanceEditorHost(route: route).environment(state).modelContainer(container)
            } else { ContentUnavailableView("Nothing to edit", systemImage: "square.and.pencil") }
        }.defaultSize(width: 700, height: 640)

        Settings { FinancesSettingsView().environment(state).modelContainer(container) }
    }
}

