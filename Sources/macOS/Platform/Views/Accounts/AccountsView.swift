import SwiftData
import SwiftUI

struct AccountsView: View {
    @Environment(FinancesAppState.self) private var state
    @Environment(\.modelContext) private var context
    @Environment(\.openWindow) private var openWindow
    @Query(sort: [SortDescriptor(\FinanceAccount.name)]) private var accounts: [FinanceAccount]
    @State private var search = ""

    private var visible: [FinanceAccount] { accounts.filter { $0.archivedAt == nil && (search.isEmpty || $0.name.localizedCaseInsensitiveContains(search)) } }

    var body: some View {
        VStack(spacing: 0) {
            FinancePageHeader(eyebrow: "Your money", title: "Accounts", actionTitle: "Add Account") { openWindow(value: FinanceEditorRoute.account(UUID())) }.padding(20)
            List(visible) { account in
                HStack(spacing: 12) {
                    AccountBadge(account: account, size: 38)
                    VStack(alignment: .leading) { Text(account.name).font(.headline); Text("\(account.type.title) · \(account.currencyCode)").font(.caption).foregroundStyle(.secondary) }
                    if state.defaultAccountID == account.id {
                        Label("Default", systemImage: "star.fill").font(.caption).foregroundStyle(.orange)
                    }
                    Spacer()
                    Text(FinanceFormat.currency(minor: FinanceCalculator.accountBalance(account), code: account.currencyCode)).font(.headline.monospacedDigit())
                }.padding(.vertical, 5)
                .contentShape(Rectangle()).onTapGesture(count: 2) { openWindow(value: FinanceEditorRoute.account(account.id)) }
                .contextMenu {
                    Button("Edit") { openWindow(value: FinanceEditorRoute.account(account.id)) }
                    Button("Set as Default") { state.setDefaultAccount(account.id) }
                    Button("Archive", role: .destructive) { account.archivedAt = .now; try? context.save() }
                }
            }
        }.searchable(text: $search)
    }
}

struct AccountEditorView: View {
    let id: UUID
    @Environment(FinancesAppState.self) private var state
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Query private var accounts: [FinanceAccount]
    @State private var draft = AccountDraft()
    @State private var error: String?

    var body: some View {
        Form {
            Section("Account") {
                TextField("Name", text: $draft.name)
                Picker("Type", selection: $draft.type) { ForEach(FinanceAccountType.allCases) { Text($0.title).tag($0) } }
                TextField("Currency", text: $draft.currencyCode)
                TextField("Opening balance", value: $draft.openingBalance, format: .number)
                TextField("Rate to base currency", value: $draft.baseExchangeRate, format: .number).help("Required only when this account uses a different currency from Settings.")
                LabeledContent("Color") {
                    FinanceColorPicker(hex: $draft.colorHex)
                        .frame(maxWidth: 260)
                }
                Toggle("Use for new transactions", isOn: $draft.isDefault)
            }
            HStack { Button("Cancel") { dismiss() }; Spacer(); Button("Save") { save() }.keyboardShortcut(.defaultAction).disabled(draft.name.trimmingCharacters(in: .whitespaces).isEmpty) }
        }.formStyle(.grouped).padding().frame(minWidth: 480, minHeight: 340)
        .task { load() }
        .alert("Account could not be saved", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) { Button("OK") {} } message: { Text(error ?? "") }
    }

    private func load() {
        guard let account = accounts.first(where: { $0.id == id }) else { return }
        draft = AccountDraft(id: account.id, name: account.name, type: account.type, currencyCode: account.currencyCode, openingBalance: FinanceCalculator.decimal(minor: account.openingBalanceMinor), baseExchangeRate: account.baseExchangeRate, colorHex: account.colorHex, isDefault: state.defaultAccountID == account.id)
    }
    private func save() {
        Task {
            do {
                let id = try await state.store.saveAccount(draft)
                if draft.isDefault { await MainActor.run { state.setDefaultAccount(id) } }
                await state.cloud.synchronize()
                await MainActor.run { dismiss() }
            } catch { await MainActor.run { self.error = error.localizedDescription } }
        }
    }
}
