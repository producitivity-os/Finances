import Foundation
import Observation
import ProductivityCloudKit

@MainActor @Observable
final class FinanceCloudSyncController {
    private let store: FinanceStoreActor
    private var engine: ProductivityCloudSyncEngine?
    private(set) var status = "Local only"

    init(store: FinanceStoreActor) { self.store = store }

    func synchronize() async {
        guard ProductivityCloudSyncEngine.isCloudKitAvailable else {
            status = "Local only"
            return
        }
        do {
            let engine = engine ?? makeEngine()
            self.engine = engine
            try await engine.queue(store.cloudRecords())
            try await engine.synchronize()
            status = "Up to date"
        } catch { status = "Local only" }
    }

    private func makeEngine() -> ProductivityCloudSyncEngine {
        let store = store
        return ProductivityCloudSyncEngine(
            containerIdentifier: "iCloud.com.productivitysuite.finances",
            zoneName: "Finances",
            stateURL: URL.applicationSupportDirectory.appending(path: "Finances/CloudKit/state.json"),
            onRemoteChanges: { records, deletions in try? await store.applyCloudRecords(records, deletions: deletions) }
        )
    }
}
