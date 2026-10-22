import ProductivityRoutineKit

enum FinancesRoutineProvider {
    static let providerID = "com.productivitysuite.finances"

    @MainActor static var manifest: RoutineProviderManifest {
        var value = RoutineActionCatalog.provider(id: providerID)!
        value.iconPNGData = RoutineProviderIcon.currentApplicationPNGData()
        value.updatedAt = .now
        return value
    }

    @MainActor static func publish() async {
        await RoutineActionClient.shared.publish(manifest)
    }
}
