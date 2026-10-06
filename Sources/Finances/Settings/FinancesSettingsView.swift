import AppKit
import SwiftData
import SwiftUI

struct FinancesSettingsView: View {
    @Environment(FinancesAppState.self) private var state
    @Environment(\.modelContext) private var context
    @Query private var preferences: [FinancePreferences]

    var body: some View {
        Form {
            if let settings = preferences.first {
                Picker("Appearance", selection: Binding(get: { settings.appearance }, set: { settings.appearance = $0; apply($0); try? context.save() })) {
                    Text("System").tag("system"); Text("Light").tag("light"); Text("Dark").tag("dark")
                }.pickerStyle(.segmented)
                TextField("Base currency", text: Binding(get: { settings.baseCurrencyCode }, set: { settings.baseCurrencyCode = String($0.uppercased().prefix(3)); try? context.save() }))
                Text("Cross-currency accounts need a manual rate before they can be included in the combined balance chart.").font(.caption).foregroundStyle(.secondary)
            } else { ProgressView("Preparing settings…") }
        }.formStyle(.grouped).padding().frame(width: 520, height: 250).task { await state.prepare() }
    }

    private func apply(_ value: String) {
        NSApp.appearance = switch value { case "light": NSAppearance(named: .aqua); case "dark": NSAppearance(named: .darkAqua); default: nil }
    }
}
