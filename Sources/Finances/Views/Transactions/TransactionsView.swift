import SwiftData
import SwiftUI

struct TransactionsView: View {
    @Environment(FinancesAppState.self) private var state
    @Environment(\.modelContext) private var context
    @Environment(\.openWindow) private var openWindow
    @Query(sort: [SortDescriptor(\FinancialTransaction.occurredAt, order: .reverse)]) private var transactions: [FinancialTransaction]
    @State private var search = ""
    @State private var direction: MoneyDirection?

    private var visible: [FinancialTransaction] {
        transactions.filter { transaction in
            transaction.archivedAt == nil && (direction == nil || transaction.direction == direction) && (search.isEmpty || transaction.transactionDetail.localizedCaseInsensitiveContains(search) || transaction.category?.name.localizedCaseInsensitiveContains(search) == true)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            FinancePageHeader(eyebrow: "Ledger", title: "Transactions", actionTitle: "Add Transaction") { openWindow(value: FinanceEditorRoute.transaction(UUID())) }.padding(20)
            List(visible) { transaction in
                HStack(spacing: 11) {
                    Circle().fill(transaction.direction == .outbound ? Color.red.opacity(0.14) : transaction.direction == .inbound ? Color.green.opacity(0.14) : Color.blue.opacity(0.14)).frame(width: 36, height: 36).overlay {
                        LucideIcon(name: transaction.direction == .outbound ? .arrowUpRight : transaction.direction == .inbound ? .arrowDownLeft : .arrowLeftRight, size: 16)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(transaction.transactionDetail).font(.headline)
                        HStack { Text(transaction.type.title); if let category = transaction.category { Text("· \(category.name)") }; Text("·"); Text(transaction.occurredAt, style: .date) }.font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(FinanceFormat.currency(minor: signedAmount(transaction), code: transaction.currencyCode)).font(.headline.monospacedDigit()).foregroundStyle(transaction.direction == .inbound ? .green : .primary)
                }.padding(.vertical, 4).contentShape(Rectangle()).onTapGesture(count: 2) { openWindow(value: FinanceEditorRoute.transaction(transaction.id)) }
                .contextMenu {
                    Button("Edit") { openWindow(value: FinanceEditorRoute.transaction(transaction.id)) }
                    Button("Duplicate") { duplicate(transaction) }
                    Button("Archive", role: .destructive) { transaction.archivedAt = .now; try? context.save() }
                }
            }
        }
        .searchable(text: $search)
        .toolbar { Picker("Direction", selection: $direction) { Text("All").tag(MoneyDirection?.none); ForEach(MoneyDirection.allCases) { Text($0.title).tag(Optional($0)) } }.frame(width: 140) }
    }

    private func signedAmount(_ transaction: FinancialTransaction) -> Int64 { transaction.direction == .outbound ? -transaction.amountMinor : transaction.amountMinor }

    private func duplicate(_ transaction: FinancialTransaction) {
        var draft = TransactionDraft(occurredAt: .now, detail: "\(transaction.transactionDetail) Copy", notes: transaction.notes, direction: transaction.direction, type: transaction.type, amount: FinanceCalculator.decimal(minor: transaction.amountMinor), currencyCode: transaction.currencyCode, categoryID: transaction.category?.id)
        draft.postings = transaction.postings.compactMap { posting in
            guard let account = posting.account else { return nil }
            return PostingDraft(accountID: account.id, role: posting.role, amount: FinanceCalculator.decimal(minor: abs(posting.transactionAmountMinor)), accountAmount: FinanceCalculator.decimal(minor: abs(posting.accountAmountMinor)), exchangeRate: posting.exchangeRate)
        }
        Task { _ = try? await state.store.saveTransaction(draft) }
    }
}

struct TransactionEditorView: View {
    let id: UUID
    @Environment(FinancesAppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    @Query(sort: [SortDescriptor(\FinanceAccount.name)]) private var accounts: [FinanceAccount]
    @Query(sort: [SortDescriptor(\FinanceCategory.name)]) private var categories: [FinanceCategory]
    @Query private var transactions: [FinancialTransaction]
    @State private var draft = TransactionDraft()
    @State private var error: String?

    private var activeAccounts: [FinanceAccount] { accounts.filter { $0.archivedAt == nil } }

    var body: some View {
        Form {
            Section("Transaction") {
                Picker("Direction", selection: $draft.direction) { ForEach(MoneyDirection.allCases) { Text($0.title).tag($0) } }.pickerStyle(.segmented)
                Picker("Type", selection: $draft.type) { ForEach(FinanceTransactionType.allowed(for: draft.direction)) { Text($0.title).tag($0) } }
                DatePicker("Date", selection: $draft.occurredAt)
                TextField("Banking detail", text: $draft.detail)
                HStack { TextField("Amount", value: $draft.amount, format: .number); TextField("Currency", text: $draft.currencyCode).frame(width: 75) }
                Picker("Category", selection: $draft.categoryID) {
                    Text("No category").tag(UUID?.none)
                    ForEach(categories.filter { $0.archivedAt == nil }) { Text($0.name).tag(Optional($0.id)) }
                }
                TextField("Notes", text: $draft.notes, axis: .vertical).lineLimit(2...4)
            }
            if draft.direction != .inbound { postingsSection(role: .source, title: "From accounts") }
            if draft.direction != .outbound { postingsSection(role: .destination, title: "To accounts") }
            HStack { Button("Cancel") { dismiss() }; Spacer(); Button("Save") { save() }.keyboardShortcut(.defaultAction) }
        }
        .formStyle(.grouped).padding().frame(minWidth: 580, minHeight: 540)
        .task { load() }
        .onChange(of: draft.direction) { _, direction in
            if !FinanceTransactionType.allowed(for: direction).contains(draft.type) { draft.type = FinanceTransactionType.allowed(for: direction)[0] }
            ensureRows()
        }
        .onChange(of: draft.amount) { _, amount in
            for index in draft.postings.indices where draft.postings[index].amount == 0 { draft.postings[index].amount = amount; draft.postings[index].accountAmount = amount }
        }
        .alert("Transaction could not be saved", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) { Button("OK") {} } message: { Text(error ?? "") }
    }

    @ViewBuilder
    private func postingsSection(role: PostingRole, title: String) -> some View {
        Section(title) {
            ForEach($draft.postings) { $row in
                if row.role == role {
                    HStack {
                        Picker("Account", selection: $row.accountID) { Text("Choose account").tag(UUID?.none); ForEach(activeAccounts) { Text($0.name).tag(Optional($0.id)) } }.labelsHidden()
                        TextField("Transaction amount", value: $row.amount, format: .number).frame(width: 115)
                        if let accountID = row.accountID, let account = activeAccounts.first(where: { $0.id == accountID }), account.currencyCode != draft.currencyCode {
                            TextField(account.currencyCode, value: $row.accountAmount, format: .number).frame(width: 90)
                        }
                        Button(role: .destructive) { draft.postings.removeAll { $0.id == row.id } } label: { LucideIcon(name: .trash, size: 14) }.buttonStyle(.borderless)
                    }
                }
            }
            Button { draft.postings.append(PostingDraft(role: role, amount: draft.amount, accountAmount: draft.amount)) } label: { Label("Add account split", systemImage: "plus") }
        }
    }

    private func load() {
        if let transaction = transactions.first(where: { $0.id == id }) {
            draft = TransactionDraft(id: transaction.id, occurredAt: transaction.occurredAt, detail: transaction.transactionDetail, notes: transaction.notes, direction: transaction.direction, type: transaction.type, amount: FinanceCalculator.decimal(minor: transaction.amountMinor), currencyCode: transaction.currencyCode, categoryID: transaction.category?.id, postings: transaction.postings.compactMap { posting in
                guard let account = posting.account else { return nil }
                return PostingDraft(accountID: account.id, role: posting.role, amount: FinanceCalculator.decimal(minor: abs(posting.transactionAmountMinor)), accountAmount: FinanceCalculator.decimal(minor: abs(posting.accountAmountMinor)), exchangeRate: posting.exchangeRate)
            })
        }
        ensureRows()
    }

    private func ensureRows() {
        if draft.direction != .inbound && !draft.postings.contains(where: { $0.role == .source }) { draft.postings.append(PostingDraft(role: .source, amount: draft.amount, accountAmount: draft.amount)) }
        if draft.direction != .outbound && !draft.postings.contains(where: { $0.role == .destination }) { draft.postings.append(PostingDraft(role: .destination, amount: draft.amount, accountAmount: draft.amount)) }
    }

    private func save() {
        Task {
            do { _ = try await state.store.saveTransaction(draft); await MainActor.run { dismiss() } }
            catch { await MainActor.run { self.error = error.localizedDescription } }
        }
    }
}
