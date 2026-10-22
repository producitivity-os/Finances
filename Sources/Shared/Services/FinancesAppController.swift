import Foundation
import Observation
import ProductivityRoutineKit
import SwiftData

@MainActor @Observable
final class FinancesAppController {
    let container: ModelContainer
    let store: FinanceStoreActor
    let cloud: FinanceCloudSyncController
    var isReady = false
    var startupError: String?
    var presentsRoutineTransaction = false
    private var routineRequest: RoutineActionRequest?

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
            await FinancesRoutineProvider.publish()
        } catch {
            startupError = error.localizedDescription
        }
    }

    func handleRoutineInvocation(_ url: URL) async {
        do {
            let request = try await RoutineActionClient.shared.request(from: url)
            guard request.providerID == FinancesRoutineProvider.providerID, request.actionID == "log-finances" else { return }
            await RoutineActionClient.shared.update(request, state: .running, message: "Transaction editor opened")
            routineRequest = request
            presentsRoutineTransaction = true
        } catch { startupError = error.localizedDescription }
    }

    func finishRoutineTransaction(completed: Bool) {
        presentsRoutineTransaction = false
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
}
