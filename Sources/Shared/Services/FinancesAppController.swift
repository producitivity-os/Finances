import Foundation
import Observation
import SwiftData

@MainActor @Observable
final class FinancesAppController {
    let container: ModelContainer
    let store: FinanceStoreActor
    let cloud: FinanceCloudSyncController
    var isReady = false
    var startupError: String?

    init(container: ModelContainer) {
        self.container = container
        store = FinanceStoreActor(modelContainer: container)
        cloud = FinanceCloudSyncController(store: store)
    }

    func prepare() async {
        guard !isReady else { return }
        do {
            try await store.seedIfNeeded()
            await cloud.synchronize()
            isReady = true
        } catch {
            startupError = error.localizedDescription
        }
    }
}
