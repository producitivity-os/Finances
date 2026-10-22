import ProductivityUI
import SwiftData
import SwiftUI

struct TransactionsView: View {
    @Environment(FinancesAppState.self) private var state
    @Environment(\.modelContext) private var context
    @Query(sort: [SortDescriptor(\FinancialTransaction.occurredAt, order: .reverse)]) private var transactions: [FinancialTransaction]
    @State private var search = ""
    @State private var direction: MoneyDirection?
    @State private var selectedID: UUID?

    private var visible: [FinancialTransaction] {
        transactions.filter { transaction in
            let inferredDirection = transaction.type.direction
            return transaction.archivedAt == nil
                && (direction == nil || inferredDirection == direction)
                && (search.isEmpty
                    || transaction.recipient.localizedCaseInsensitiveContains(search)
                    || transaction.transactionDetail.localizedCaseInsensitiveContains(search)
                    || transaction.category?.name.localizedCaseInsensitiveContains(search) == true)
        }
    }

    private var groups: [(date: Date, transactions: [FinancialTransaction])] {
        let calendar = Calendar.current
        let grouped = Dictionary(grouping: visible) { calendar.startOfDay(for: $0.occurredAt) }
        return grouped.keys.sorted(by: >).map { ($0, grouped[$0, default: []]) }
    }

    var body: some View {
        VStack(spacing: 0) {
            List(selection: $selectedID) {
                ForEach(groups, id: \.date) { group in
                    Section(group.date.formatted(date: .complete, time: .omitted)) {
                        ForEach(group.transactions) { transaction in
                            VStack(alignment: .leading, spacing: 8) {
                                TransactionRow(transaction: transaction)
                                if selectedID == transaction.id {
                                    selectionChips(for: transaction)
                                        .transition(.opacity.combined(with: .move(edge: .top)))
                                }
                            }
                            .padding(.vertical, 5)
                            .contentShape(Rectangle())
                            .tag(transaction.id)
                            .onTapGesture {
                                withAnimation(.snappy) {
                                    selectedID = selectedID == transaction.id ? nil : transaction.id
                                }
                            }
                            .onTapGesture(count: 2) { state.showTransactionPanel(id: transaction.id) }
                            .swipeActions(edge: .leading, allowsFullSwipe: false) {
                                Button { state.toggleFlag(transaction.id) } label: {
                                    Label(state.isFlagged(transaction.id) ? "Unflag" : "Flag", systemImage: "flag.fill")
                                        .labelStyle(.iconOnly)
                                        .frame(width: 24, height: 24, alignment: .center)
                                }
                                .tint(.orange)
                                Button { state.showTransactionPanel(id: transaction.id) } label: {
                                    Label("Edit", systemImage: "pencil")
                                        .labelStyle(.iconOnly)
                                        .frame(width: 24, height: 24, alignment: .center)
                                }
                                .tint(FinanceTheme.accent)
                            }
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) { archive(transaction) } label: {
                                    Label("Delete", systemImage: "trash")
                                        .labelStyle(.iconOnly)
                                        .frame(width: 24, height: 24, alignment: .center)
                                }
                            }
                            .contextMenu {
                                Button("Edit") { state.showTransactionPanel(id: transaction.id) }
                                Button(state.isFlagged(transaction.id) ? "Unflag" : "Flag") { state.toggleFlag(transaction.id) }
                                Button("Duplicate") { duplicate(transaction) }
                                Divider()
                                Button("Delete", role: .destructive) { archive(transaction) }
                            }
                        }
                    }
                }
            }
            .overlay {
                if visible.isEmpty {
                    ContentUnavailableView("No transactions", systemImage: "arrow.left.arrow.right", description: Text("Add a transaction or change the current filter."))
                }
            }
        }
        .searchable(text: $search, prompt: "Search transactions")
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
            Menu {
                Button { direction = nil } label: {
                    Label("All transactions", systemImage: direction == nil ? "checkmark" : "line.3.horizontal.decrease")
                }
                Divider()
                ForEach(MoneyDirection.allCases) { value in
                    Button { direction = value } label: {
                        Label(value.title, systemImage: direction == value ? "checkmark" : directionSymbol(value))
                    }
                }
            } label: {
                Image(systemName: direction == nil ? "line.3.horizontal.decrease" : "line.3.horizontal.decrease.circle.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .frame(width: 34, height: 34)
                    .background(Color.secondary.opacity(0.10), in: Circle())
            }
            .help("Filter Transactions")

            Button { state.showTransactionPanel(id: UUID()) } label: {
                Image(systemName: "plus")
            }
            .help("New Transaction")
            .accessibilityLabel("New Transaction")
            }
        }
    }

    private func selectionChips(for transaction: FinancialTransaction) -> some View {
        HStack(spacing: 7) {
            transactionChip(
                state.isFlagged(transaction.id) ? "Flagged" : "Flag",
                systemImage: state.isFlagged(transaction.id) ? "flag.fill" : "flag",
                tint: .orange
            ) { state.toggleFlag(transaction.id) }
            transactionChip("Edit", systemImage: "pencil", tint: FinanceTheme.accent) {
                state.showTransactionPanel(id: transaction.id)
            }
            if let category = transaction.category {
                transactionChip(category.name, systemImage: categorySystemImage(category), tint: Color(hex: category.colorHex)) {}
            }
            transactionChip(transaction.type.title, systemImage: transaction.type.systemImage, tint: directionColor(transaction.type.direction)) {}
        }
        .padding(.leading, 47)
    }

    private func transactionChip(_ title: String, systemImage: String, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(.caption.weight(.medium))
                .foregroundStyle(tint)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(tint.opacity(0.11), in: Capsule())
        }
        .buttonStyle(.plain)
    }

    private func archive(_ transaction: FinancialTransaction) {
        transaction.archivedAt = .now
        selectedID = nil
        try? context.save()
    }

    private func duplicate(_ transaction: FinancialTransaction) {
        let decoded = TransactionLineItemCodec.decode(transaction.notes)
        var draft = TransactionDraft(
            occurredAt: .now,
            recipient: transaction.recipient,
            detail: "\(transaction.transactionDetail) Copy",
            notes: decoded.notes,
            direction: transaction.type.direction,
            type: transaction.type,
            amount: FinanceCalculator.decimal(minor: transaction.amountMinor),
            currencyCode: transaction.currencyCode,
            categoryID: transaction.category?.id
        )
        draft.accountID = primaryAccountID(for: transaction)
        draft.destinationAccountID = transaction.postings.first(where: { $0.role == .destination && $0.account?.id != draft.accountID })?.account?.id
        draft.items = decoded.items
        Task { _ = try? await state.store.saveTransaction(draft) }
    }

    private func primaryAccountID(for transaction: FinancialTransaction) -> UUID? {
        let role: PostingRole = transaction.type.direction == .inbound ? .destination : .source
        return transaction.postings.first(where: { $0.role == role })?.account?.id
    }
}

private struct TransactionRow: View {
    let transaction: FinancialTransaction

    var body: some View {
        let direction = transaction.type.direction
        HStack(spacing: 11) {
            TransactionDirectionBadge(direction: direction)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(transaction.recipient).font(.headline)
                    if let category = transaction.category {
                        FinanceIconView(name: category.iconName, size: 13)
                            .foregroundStyle(.secondary)
                    }
                }
                HStack(spacing: 4) {
                    Text(transaction.transactionDetail)
                    Text("·")
                    Label(transaction.type.title, systemImage: transaction.type.systemImage)
                    if let category = transaction.category { Text("· \(category.name)") }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            Spacer()
            Text(FinanceFormat.currency(minor: direction == .outbound ? -transaction.amountMinor : transaction.amountMinor, code: transaction.currencyCode))
                .font(.headline.monospacedDigit())
                .foregroundStyle(direction == .inbound ? Color.green : direction == .outbound ? Color.red : Color.primary)
        }
    }
}

struct TransactionDirectionBadge: View {
    let direction: MoneyDirection

    var body: some View {
        Image(systemName: directionSymbol(direction))
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(directionColor(direction))
            .frame(width: 36, height: 36)
            .background(directionColor(direction).opacity(0.13), in: Circle())
            .accessibilityLabel(direction.title)
    }
}

struct TransactionEditorView: View {
    let id: UUID
    var onClose: () -> Void = {}
    var onSave: () -> Void = {}

    @Environment(FinancesAppState.self) private var state
    @Query(sort: [SortDescriptor(\FinanceAccount.name)]) private var accounts: [FinanceAccount]
    @Query(sort: [SortDescriptor(\FinanceCategory.name)]) private var categories: [FinanceCategory]
    @Query(sort: [SortDescriptor(\FinancialTransaction.occurredAt, order: .reverse)]) private var transactions: [FinancialTransaction]
    @State private var draft = TransactionDraft(currencyCode: "MYR")
    @State private var error: String?

    private var activeAccounts: [FinanceAccount] { accounts.filter { $0.archivedAt == nil } }
    private var activeCategories: [FinanceCategory] { categories.filter { $0.archivedAt == nil } }
    private var recipients: [String] {
        Array(Set(transactions.filter { $0.archivedAt == nil }.map(\.recipient)))
            .filter { !$0.isEmpty }
            .sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }
    private var currencies: [String] {
        Array(Set(["MYR", "USD", "SGD", "EUR", "GBP", "AUD", "JPY"] + activeAccounts.map(\.currencyCode))).sorted()
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(draft.id == nil ? "New Transaction" : "Edit Transaction").font(.title2.bold())
                    Text("Direction is inferred from the transaction type.").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Button(action: onClose) { Image(systemName: "xmark").frame(width: 28, height: 28) }
                    .buttonStyle(.plain)
            }
            .padding(20)

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    editorCard {
                        editorRow("Type") { transactionTypePicker }
                        Divider()
                        editorRow("Date") {
                            DatePicker("", selection: $draft.occurredAt).labelsHidden()
                        }
                        Divider()
                        VStack(alignment: .leading, spacing: 7) {
                            Text("Recipient").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                            SearchableRecipientPicker(value: $draft.recipient, recipients: recipients)
                        }
                        Divider()
                        VStack(alignment: .leading, spacing: 7) {
                            Text("Transaction detail").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                            TextField("What was this transaction for?", text: $draft.detail, axis: .vertical)
                                .textFieldStyle(.plain)
                                .lineLimit(1...3)
                        }
                        Divider()
                        editorRow("Amount") { amountEditor }
                        Divider()
                        editorRow("Account") { accountPicker(selection: $draft.accountID, excluding: nil) }
                        if draft.type.direction == .transfer {
                            Divider()
                            editorRow("To account") { accountPicker(selection: $draft.destinationAccountID, excluding: draft.accountID) }
                        }
                        Divider()
                        editorRow("Category") { categoryPicker }
                        Divider()
                        VStack(alignment: .leading, spacing: 7) {
                            Text("Notes").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                            TextField("Optional notes", text: $draft.notes, axis: .vertical)
                                .textFieldStyle(.plain)
                                .lineLimit(2...5)
                        }
                    }

                    lineItemsEditor
                }
                .padding(20)
            }

            Divider()
            HStack {
                Button("Cancel", action: onClose)
                Spacer()
                Button("Save") { save() }
                    .buttonStyle(.borderedProminent)
                    .tint(FinanceTheme.accent)
                    .keyboardShortcut(.defaultAction)
                    .disabled(!canSave)
            }
            .padding(16)
        }
        .frame(minWidth: 560, minHeight: 540)
        .task { load() }
        .onChange(of: draft.accountID) { _, id in
            if draft.destinationAccountID == id { draft.destinationAccountID = nil }
            guard draft.id == nil, let id, let account = activeAccounts.first(where: { $0.id == id }) else { return }
            draft.currencyCode = account.currencyCode
        }
        .onChange(of: draft.items) { _, items in
            guard !items.isEmpty else { return }
            draft.amount = items.reduce(Decimal.zero) { $0 + $1.amount }
        }
        .alert("Transaction could not be saved", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK") {}
        } message: { Text(error ?? "") }
    }

    private var canSave: Bool {
        !draft.recipient.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !draft.detail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && draft.amount > 0
            && draft.accountID != nil
            && (draft.type.direction != .transfer || draft.destinationAccountID != nil)
    }

    private var transactionTypePicker: some View {
        Menu {
            ForEach(FinanceTransactionType.allCases) { type in
                Button {
                    draft.type = type
                    if type.direction != .transfer { draft.destinationAccountID = nil }
                } label: {
                    Label(type.title, systemImage: type.systemImage)
                }
            }
        } label: {
            HStack(spacing: 7) {
                Image(systemName: draft.type.systemImage).foregroundStyle(directionColor(draft.type.direction))
                Text(draft.type.title)
                Text("· \(draft.type.direction.title)").foregroundStyle(.secondary)
                Image(systemName: "chevron.up.chevron.down").font(.caption2).foregroundStyle(.secondary)
            }
        }
        .menuStyle(.borderlessButton)
    }

    private var amountEditor: some View {
        HStack(spacing: 8) {
            TextField("0.00", value: $draft.amount, format: .number)
                .textFieldStyle(.roundedBorder)
                .multilineTextAlignment(.trailing)
                .frame(width: 150)
                .disabled(!draft.items.isEmpty)
            Menu(draft.currencyCode) {
                ForEach(currencies, id: \.self) { currency in
                    Button(currency) { draft.currencyCode = currency }
                }
            }
            .menuStyle(.borderlessButton)
            .frame(width: 68)
        }
    }

    private func accountPicker(selection: Binding<UUID?>, excluding excludedID: UUID?) -> some View {
        Menu {
            ForEach(activeAccounts.filter { $0.id != excludedID }) { account in
                Button { selection.wrappedValue = account.id } label: {
                    Label(account.name, systemImage: account.type.systemImage)
                }
            }
        } label: {
            if let id = selection.wrappedValue, let account = activeAccounts.first(where: { $0.id == id }) {
                HStack(spacing: 8) {
                    AccountBadge(account: account, size: 28)
                    Text(account.name)
                    if state.defaultAccountID == account.id { Image(systemName: "star.fill").foregroundStyle(.yellow) }
                    Image(systemName: "chevron.up.chevron.down").font(.caption2).foregroundStyle(.secondary)
                }
            } else {
                Label("Choose account", systemImage: "wallet.bifold")
            }
        }
        .menuStyle(.borderlessButton)
    }

    private var categoryPicker: some View {
        Menu {
            Button { draft.categoryID = nil } label: { Label("No category", systemImage: "minus.circle") }
            Divider()
            ForEach(activeCategories) { category in
                Button { draft.categoryID = category.id } label: {
                    Label(category.name, systemImage: categorySystemImage(category))
                }
            }
        } label: {
            if let id = draft.categoryID, let category = activeCategories.first(where: { $0.id == id }) {
                Label(category.name, systemImage: categorySystemImage(category))
                    .foregroundStyle(Color(hex: category.colorHex))
            } else {
                Label("No category", systemImage: "tag")
            }
        }
        .menuStyle(.borderlessButton)
    }

    private var lineItemsEditor: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Payment items").font(.headline)
                    Text("Optionally split this payment into named items with notes.").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Button { draft.items.append(TransactionLineItemDraft()) } label: { Label("Add Item", systemImage: "plus") }
            }

            ForEach($draft.items) { $item in
                HStack(alignment: .top, spacing: 8) {
                    VStack(spacing: 7) {
                        TextField("Item", text: $item.name)
                        TextField("Item notes", text: $item.notes)
                    }
                    TextField("0.00", value: $item.amount, format: .number)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 110)
                    Button(role: .destructive) { draft.items.removeAll { $0.id == item.id } } label: {
                        Image(systemName: "trash")
                    }
                    .buttonStyle(.borderless)
                }
            }

            if !draft.items.isEmpty {
                HStack {
                    Spacer()
                    Text("Total")
                    Text(draft.amount, format: .currency(code: draft.currencyCode))
                        .font(.headline.monospacedDigit())
                }
            }
        }
        .padding(16)
        .background(Color.secondary.opacity(0.07), in: RoundedRectangle(cornerRadius: 14))
    }

    private func editorCard<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(spacing: 13, content: content)
            .padding(16)
            .background(Color.secondary.opacity(0.07), in: RoundedRectangle(cornerRadius: 14))
    }

    private func editorRow<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        HStack {
            Text(label).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            Spacer()
            content()
        }
    }

    private func load() {
        if let transaction = transactions.first(where: { $0.id == id }) {
            let decoded = TransactionLineItemCodec.decode(transaction.notes)
            draft.id = transaction.id
            draft.occurredAt = transaction.occurredAt
            draft.recipient = transaction.recipient
            draft.detail = transaction.transactionDetail
            draft.notes = decoded.notes
            draft.type = transaction.type
            draft.direction = transaction.type.direction
            draft.amount = FinanceCalculator.decimal(minor: transaction.amountMinor)
            draft.currencyCode = transaction.currencyCode
            draft.categoryID = transaction.category?.id
            draft.items = decoded.items
            let primaryRole: PostingRole = transaction.type.direction == .inbound ? .destination : .source
            draft.accountID = transaction.postings.first(where: { $0.role == primaryRole })?.account?.id
            if transaction.type.direction == .transfer {
                draft.destinationAccountID = transaction.postings.first(where: { $0.role == .destination })?.account?.id
            }
            return
        }

        let defaultAccount = state.defaultAccountID.flatMap { id in activeAccounts.first { $0.id == id } }
            ?? activeAccounts.first { $0.name.localizedCaseInsensitiveContains("Maybank") }
            ?? activeAccounts.first
        draft.accountID = defaultAccount?.id
        draft.currencyCode = defaultAccount?.currencyCode ?? "MYR"
    }

    private func save() {
        Task {
            do {
                _ = try await state.store.saveTransaction(draft)
                await state.cloud.synchronize()
                await MainActor.run { onSave() }
            } catch {
                await MainActor.run { self.error = error.localizedDescription }
            }
        }
    }
}

private struct SearchableRecipientPicker: View {
    @Binding var value: String
    let recipients: [String]
    @State private var isPresented = false
    @FocusState private var isFocused: Bool

    private var matches: [String] {
        guard !value.isEmpty else { return recipients }
        return recipients.filter { $0.localizedCaseInsensitiveContains(value) }
    }

    private var hasExactMatch: Bool {
        recipients.contains { $0.localizedCaseInsensitiveCompare(value) == .orderedSame }
    }

    var body: some View {
        HStack(spacing: 10) {
            RecipientBadge(name: value)
            TextField("Search or create a recipient", text: $value)
                .textFieldStyle(.plain)
                .focused($isFocused)
                .onSubmit {
                    value = value.trimmingCharacters(in: .whitespacesAndNewlines)
                    isPresented = false
                }
            Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
        }
        .padding(.horizontal, 10)
        .frame(height: 40)
        .background(Color.primary.opacity(0.055), in: RoundedRectangle(cornerRadius: 9))
        .onChange(of: isFocused) { _, focused in
            if focused { isPresented = true }
        }
        .onChange(of: value) { _, newValue in
            let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
            if isFocused && !trimmed.isEmpty && !matches.isEmpty {
                isPresented = true
            }
        }
        .popover(isPresented: $isPresented, arrowEdge: .bottom) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 2) {
                    ForEach(matches, id: \.self) { recipient in
                        Button {
                            value = recipient
                            isPresented = false
                        } label: {
                            HStack(spacing: 10) {
                                RecipientBadge(name: recipient)
                                Text(recipient)
                                Spacer()
                            }
                            .padding(8)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                    if !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !hasExactMatch {
                        Button {
                            value = value.trimmingCharacters(in: .whitespacesAndNewlines)
                            isPresented = false
                        } label: {
                            Label("Create “\(value)”", systemImage: "plus.circle.fill")
                                .foregroundStyle(FinanceTheme.accent)
                                .padding(8)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(6)
            }
            .frame(width: 360, height: min(260, CGFloat(max(1, matches.count + 1)) * 48))
        }
    }
}

private struct RecipientBadge: View {
    let name: String

    var body: some View {
        RoundedRectangle(cornerRadius: 6)
            .fill(FinanceTheme.accent.opacity(0.12))
            .frame(width: 32, height: 26)
            .overlay {
                Image(systemName: "person.crop.rectangle")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(FinanceTheme.accent)
            }
            .accessibilityLabel(name.isEmpty ? "Recipient" : name)
    }
}

struct AccountBadge: View {
    let account: FinanceAccount
    var size: CGFloat = 36

    var body: some View {
        RoundedRectangle(cornerRadius: size * 0.22, style: .continuous)
            .fill(Color(hex: account.colorHex).opacity(0.15))
            .frame(width: size * 1.18, height: size)
            .overlay {
                Image(systemName: account.type.systemImage)
                    .font(.system(size: size * 0.42, weight: .semibold))
                    .foregroundStyle(Color(hex: account.colorHex))
            }
    }
}

func directionColor(_ direction: MoneyDirection) -> Color {
    switch direction {
    case .inbound: .green
    case .outbound: .red
    case .transfer: .blue
    }
}

func directionSymbol(_ direction: MoneyDirection) -> String {
    switch direction {
    case .inbound: "arrow.down.left"
    case .outbound: "arrow.up.right"
    case .transfer: "arrow.left.arrow.right"
    }
}

func categorySystemImage(_ category: FinanceCategory) -> String {
    FinanceIconCatalog.fallbackSymbol(for: category.iconName)
}
