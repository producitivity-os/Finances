import SwiftData
import SwiftUI

@main
struct FinancesIOSApp: App {
    private let container: ModelContainer
    @State private var controller: FinancesAppController

    init() {
        do {
            let schema = Schema(FinanceSchemaV1.models)
            let configuration = ModelConfiguration("Finances", schema: schema)
            let container = try ModelContainer(
                for: schema,
                migrationPlan: FinanceMigrationPlan.self,
                configurations: [configuration]
            )
            self.container = container
            _controller = State(initialValue: FinancesAppController(container: container))
        } catch {
            fatalError("Finances could not open its local store: \(error.localizedDescription)")
        }
    }

    var body: some Scene {
        WindowGroup {
            FinancesIOSRootView()
                .environment(controller)
                .modelContainer(container)
        }
    }
}
