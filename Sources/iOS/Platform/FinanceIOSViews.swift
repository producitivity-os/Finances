import PDFKit
import ProductivityUI
import SwiftData
import SwiftUI
import UniformTypeIdentifiers

struct FinanceIOSDashboardView: View {
    @Query private var accounts: [FinanceAccount]
    @Query(sort: [SortDescriptor(\FinancialTransaction.occurredAt, order: .reverse)]) private var transactions: [FinancialTransaction]

    private var activeAccounts: [FinanceAccount] { accounts.filter { $0.archivedAt == nil } }
    private var recent: [FinancialTransaction] { Array(transactions.filter { $0.archivedAt == nil }.prefix(6)) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ProductivitySpacing.section) {
                ProductivityPageHeader("Your finances", subtitle: "Balances and recent activity")
                LazyVGrid(columns: [.init(.flexible()), .init(.flexible())]) {
                    ProductivityMetricCard(
                        title: "Accounts",
                        value: activeAccounts.count.formatted(),
                        systemImage: "wallet.bifold"
                    )
                    ProductivityMetricCard(
                        title: "Transactions",
                        value: transactions.filter { $0.archivedAt == nil }.count.formatted(),
                        systemImage: "arrow.left.arrow.right"
                    )
                }
                ProductivitySectionCard("Recent") {
                    if recent.isEmpty {
                        Text("Your latest transactions will appear here.").foregroundStyle(.secondary)
                    } else {
                        ForEach(recent) { transaction in
                            FinanceIOSTransactionRow(transaction: transaction)
                            if transaction.id != recent.last?.id { Divider() }
                        }
                    }
                }
            }
            .padding()
        }
        .navigationTitle("Dashboard")
    }
}

struct FinanceIOSTransactionsView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: [SortDescriptor(\FinancialTransaction.occurredAt, order: .reverse)]) private var transactions: [FinancialTransaction]
    @State private var search = ""
    @State private var editorPresented = false
    @State private var editingID: UUID?

    private var visible: [FinancialTransaction] {
        transactions.filter {
            $0.archivedAt == nil && (search.isEmpty || $0.transactionDetail.localizedCaseInsensitiveContains(search))
        }
    }

    var body: some View {
        List(visible) { transaction in
            Button {
                editingID = transaction.id
                editorPresented = true
            } label: {
                FinanceIOSTransactionRow(transaction: transaction)
            }
            .buttonStyle(.plain)
            .contextMenu {
                Button("Edit") { editingID = transaction.id; editorPresented = true }
                Button("Archive", role: .destructive) {
                    transaction.archivedAt = .now
                    try? context.save()
                }
            }
        }
        .overlay {
            if visible.isEmpty {
                ContentUnavailableView("No transactions", systemImage: "arrow.left.arrow.right")
            }
        }
        .searchable(text: $search)
        .navigationTitle("Transactions")
        .toolbar {
            Button { editingID = nil; editorPresented = true } label: { Image(systemName: "plus") }
        }
        .sheet(isPresented: $editorPresented) {
            NavigationStack { FinanceIOSTransactionEditor(transactionID: editingID) }
        }
    }
}

struct FinanceIOSTransactionRow: View {
    let transaction: FinancialTransaction

    var body: some View {
        HStack {
            Image(systemName: transaction.direction == .outbound ? "arrow.up.right" : "arrow.down.left")
                .foregroundStyle(transaction.direction == .outbound ? .red : .green)
                .frame(width: 32, height: 32)
                .background(.quaternary, in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(transaction.transactionDetail).font(.headline)
                Text("\(transaction.type.title) · \(transaction.occurredAt.formatted(date: .abbreviated, time: .omitted))")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Text(FinanceFormat.currency(
                minor: transaction.direction == .outbound ? -transaction.amountMinor : transaction.amountMinor,
                code: transaction.currencyCode
            ))
            .font(.subheadline.monospacedDigit().weight(.semibold))
        }
    }
}

struct FinanceIOSTransactionEditor: View {
    let transactionID: UUID?
    @Environment(FinancesAppController.self) private var controller
    @Environment(\.dismiss) private var dismiss
    @Query(sort: [SortDescriptor(\FinanceAccount.name)]) private var accounts: [FinanceAccount]
    @Query(sort: [SortDescriptor(\FinanceCategory.name)]) private var categories: [FinanceCategory]
    @Query private var transactions: [FinancialTransaction]
    @State private var draft = TransactionDraft()
    @State private var fromAccountID: UUID?
    @State private var toAccountID: UUID?
    @State private var error: String?

    private var activeAccounts: [FinanceAccount] { accounts.filter { $0.archivedAt == nil } }

    var body: some View {
        Form {
            Picker("Direction", selection: $draft.direction) {
                ForEach(MoneyDirection.allCases) { Text($0.title).tag($0) }
            }
            .pickerStyle(.segmented)
            Picker("Type", selection: $draft.type) {
                ForEach(FinanceTransactionType.allowed(for: draft.direction)) { Text($0.title).tag($0) }
            }
            DatePicker("Date", selection: $draft.occurredAt, displayedComponents: [.date])
            TextField("Banking detail", text: $draft.detail)
            TextField("Amount", value: $draft.amount, format: .number)
                .keyboardType(.decimalPad)
            TextField("Currency", text: $draft.currencyCode)
                .textInputAutocapitalization(.characters)
            Picker("Category", selection: $draft.categoryID) {
                Text("No category").tag(UUID?.none)
                ForEach(categories.filter { $0.archivedAt == nil }) { Text($0.name).tag(Optional($0.id)) }
            }
            if draft.direction != .inbound {
                Picker("From", selection: $fromAccountID) {
                    Text("Choose account").tag(UUID?.none)
                    ForEach(activeAccounts) { Text($0.name).tag(Optional($0.id)) }
                }
            }
            if draft.direction != .outbound {
                Picker("To", selection: $toAccountID) {
                    Text("Choose account").tag(UUID?.none)
                    ForEach(activeAccounts) { Text($0.name).tag(Optional($0.id)) }
                }
            }
            TextField("Notes", text: $draft.notes, axis: .vertical)
        }
        .navigationTitle(transactionID == nil ? "New Transaction" : "Edit Transaction")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) { Button("Save") { save() }.disabled(!canSave) }
        }
        .onAppear { load() }
        .onChange(of: draft.direction) { _, direction in
            if !FinanceTransactionType.allowed(for: direction).contains(draft.type) {
                draft.type = FinanceTransactionType.allowed(for: direction)[0]
            }
        }
        .alert("Transaction could not be saved", isPresented: .init(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK") {}
        } message: { Text(error ?? "") }
    }

    private var canSave: Bool {
        !draft.detail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        draft.amount > 0 &&
        (draft.direction == .inbound || fromAccountID != nil) &&
        (draft.direction == .outbound || toAccountID != nil)
    }

    private func load() {
        guard let transactionID, let transaction = transactions.first(where: { $0.id == transactionID }) else { return }
        draft = TransactionDraft(
            id: transaction.id,
            occurredAt: transaction.occurredAt,
            detail: transaction.transactionDetail,
            notes: transaction.notes,
            direction: transaction.direction,
            type: transaction.type,
            amount: FinanceCalculator.decimal(minor: transaction.amountMinor),
            currencyCode: transaction.currencyCode,
            categoryID: transaction.category?.id
        )
        fromAccountID = transaction.postings.first(where: { $0.role == .source })?.account?.id
        toAccountID = transaction.postings.first(where: { $0.role == .destination })?.account?.id
    }

    private func save() {
        draft.postings = []
        if let fromAccountID {
            draft.postings.append(.init(accountID: fromAccountID, role: .source, amount: draft.amount, accountAmount: draft.amount))
        }
        if let toAccountID {
            draft.postings.append(.init(accountID: toAccountID, role: .destination, amount: draft.amount, accountAmount: draft.amount))
        }
        Task {
            do {
                _ = try await controller.store.saveTransaction(draft)
                await controller.cloud.synchronize()
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

struct FinanceIOSAccountsView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: [SortDescriptor(\FinanceAccount.name)]) private var accounts: [FinanceAccount]
    @State private var editorPresented = false
    @State private var editingID: UUID?

    var body: some View {
        List(accounts.filter { $0.archivedAt == nil }) { account in
            Button { editingID = account.id; editorPresented = true } label: {
                HStack {
                    Image(systemName: "wallet.bifold")
                    VStack(alignment: .leading) {
                        Text(account.name).font(.headline)
                        Text("\(account.type.title) · \(account.currencyCode)").font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(FinanceFormat.currency(minor: FinanceCalculator.accountBalance(account), code: account.currencyCode))
                        .font(.subheadline.monospacedDigit().weight(.semibold))
                }
            }
            .buttonStyle(.plain)
            .contextMenu {
                Button("Edit") { editingID = account.id; editorPresented = true }
                Button("Archive", role: .destructive) { account.archivedAt = .now; try? context.save() }
            }
        }
        .overlay { if accounts.filter({ $0.archivedAt == nil }).isEmpty { ContentUnavailableView("No accounts", systemImage: "wallet.bifold") } }
        .navigationTitle("Accounts")
        .toolbar { Button { editingID = nil; editorPresented = true } label: { Image(systemName: "plus") } }
        .sheet(isPresented: $editorPresented) {
            NavigationStack { FinanceIOSAccountEditor(accountID: editingID) }
        }
    }
}

struct FinanceIOSAccountEditor: View {
    let accountID: UUID?
    @Environment(FinancesAppController.self) private var controller
    @Environment(\.dismiss) private var dismiss
    @Query private var accounts: [FinanceAccount]
    @State private var draft = AccountDraft()
    @State private var error: String?

    var body: some View {
        Form {
            TextField("Name", text: $draft.name)
            Picker("Type", selection: $draft.type) { ForEach(FinanceAccountType.allCases) { Text($0.title).tag($0) } }
            TextField("Currency", text: $draft.currencyCode).textInputAutocapitalization(.characters)
            TextField("Opening balance", value: $draft.openingBalance, format: .number).keyboardType(.decimalPad)
        }
        .navigationTitle(accountID == nil ? "New Account" : "Edit Account")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) { Button("Save") { save() }.disabled(draft.name.isEmpty) }
        }
        .onAppear {
            guard let accountID, let account = accounts.first(where: { $0.id == accountID }) else { return }
            draft = .init(
                id: account.id,
                name: account.name,
                type: account.type,
                currencyCode: account.currencyCode,
                openingBalance: FinanceCalculator.decimal(minor: account.openingBalanceMinor),
                baseExchangeRate: account.baseExchangeRate,
                colorHex: account.colorHex
            )
        }
        .alert("Account could not be saved", isPresented: .init(get: { error != nil }, set: { if !$0 { error = nil } })) { Button("OK") {} } message: { Text(error ?? "") }
    }

    private func save() {
        Task {
            do { _ = try await controller.store.saveAccount(draft); await controller.cloud.synchronize(); dismiss() }
            catch { self.error = error.localizedDescription }
        }
    }
}

struct FinanceIOSDocumentsView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: [SortDescriptor(\FinanceDocument.createdAt, order: .reverse)]) private var documents: [FinanceDocument]
    @State private var scanning = false
    @State private var importing = false
    @State private var selected: FinanceDocument?
    @State private var importKind = FinanceDocumentKind.receipt
    @State private var error: String?

    var body: some View {
        List(documents.filter { $0.archivedAt == nil }) { document in
            Button { selected = document } label: {
                HStack {
                    Image(systemName: document.mimeType == "application/pdf" ? "doc.richtext" : "photo")
                    VStack(alignment: .leading) {
                        Text(document.originalName).font(.headline)
                        Text("\(document.kind.title) · \(document.ocrStatus.rawValue.capitalized)")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            .buttonStyle(.plain)
            .contextMenu {
                Button("Open") { selected = document }
                Button("Archive", role: .destructive) { document.archivedAt = .now; try? context.save() }
            }
        }
        .overlay { if documents.filter({ $0.archivedAt == nil }).isEmpty { ContentUnavailableView("No documents", systemImage: "doc.text.viewfinder") } }
        .navigationTitle("Documents")
        .toolbar {
            Menu {
                Button("Scan Receipt") { importKind = .receipt; scanning = true }
                Button("Scan Statement") { importKind = .statement; scanning = true }
                Button("Choose File") { importing = true }
            } label: { Image(systemName: "plus") }
        }
        .fullScreenCover(isPresented: $scanning) {
            DocumentScannerView { result in
                do {
                    let data = try result.get()
                    selected = try DocumentService.importDocument(
                        data: data,
                        originalName: "Scan \(Date.now.formatted(date: .numeric, time: .omitted)).pdf",
                        mimeType: "application/pdf",
                        kind: importKind,
                        context: context
                    )
                } catch { self.error = error.localizedDescription }
                scanning = false
            }
            .ignoresSafeArea()
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.pdf, .image]) { result in
            do {
                let url = try result.get()
                let access = url.startAccessingSecurityScopedResource()
                defer { if access { url.stopAccessingSecurityScopedResource() } }
                selected = try DocumentService.importDocument(from: url, kind: importKind, context: context)
            } catch { self.error = error.localizedDescription }
        }
        .sheet(item: $selected) { FinanceIOSDocumentViewer(document: $0) }
        .alert("Document error", isPresented: .init(get: { error != nil }, set: { if !$0 { error = nil } })) { Button("OK") {} } message: { Text(error ?? "") }
    }
}

struct FinanceIOSDocumentViewer: View {
    let document: FinanceDocument
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @State private var recognizing = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if document.mimeType == "application/pdf" {
                    FinancePDFView(data: document.originalData)
                } else if let image = UIImage(data: document.originalData) {
                    ScrollView([.horizontal, .vertical]) { Image(uiImage: image).resizable().scaledToFit() }
                }
                if !document.recognizedText.isEmpty {
                    TextEditor(text: .constant(document.recognizedText)).frame(height: 170).padding()
                }
            }
            .navigationTitle(document.originalName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(recognizing ? "Recognizing…" : "Run OCR") { recognize() }.disabled(recognizing)
                }
            }
            .alert("OCR failed", isPresented: .init(get: { error != nil }, set: { if !$0 { error = nil } })) { Button("OK") {} } message: { Text(error ?? "") }
        }
    }

    private func recognize() {
        recognizing = true
        let data = document.originalData
        let mime = document.mimeType
        Task {
            do {
                let text = try await Task.detached {
                    try OCRService.recognize(data: data, mimeType: mime)
                }.value
                document.recognizedText = text
                document.ocrStatus = .ready
                try? context.save()
            } catch {
                self.error = error.localizedDescription
            }
            recognizing = false
        }
    }
}

private struct FinancePDFView: UIViewRepresentable {
    let data: Data
    func makeUIView(context: Context) -> PDFView {
        let view = PDFView()
        view.autoScales = true
        view.document = PDFDocument(data: data)
        return view
    }
    func updateUIView(_ uiView: PDFView, context: Context) {}
}

struct FinanceIOSMoreView: View {
    var body: some View {
        List {
            NavigationLink("Categories") { FinanceIOSCategoriesView() }
            NavigationLink("Settings") { FinanceIOSSettingsView() }
        }
        .navigationTitle("More")
    }
}

struct FinanceIOSCategoriesView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: [SortDescriptor(\FinanceCategory.name)]) private var categories: [FinanceCategory]
    @State private var name = ""

    var body: some View {
        List {
            Section("New category") {
                HStack { TextField("Name", text: $name); Button("Add") { add() }.disabled(name.trimmingCharacters(in: .whitespaces).isEmpty) }
            }
            Section("Categories") {
                ForEach(categories.filter { $0.archivedAt == nil }) { category in
                    Label(category.name, systemImage: category.iconName)
                        .contextMenu { Button("Archive", role: .destructive) { category.archivedAt = .now; try? context.save() } }
                }
            }
        }
        .navigationTitle("Categories")
    }

    private func add() {
        context.insert(FinanceCategory(name: name.trimmingCharacters(in: .whitespaces), iconName: "tag", colorHex: "#2F80ED"))
        try? context.save()
        name = ""
    }
}

struct FinanceIOSSettingsView: View {
    @Environment(FinancesAppController.self) private var controller
    @Environment(\.modelContext) private var context
    @Query private var preferences: [FinancePreferences]

    var body: some View {
        Form {
            if let preference = preferences.first {
                TextField("Base currency", text: .init(get: { preference.baseCurrencyCode }, set: { preference.baseCurrencyCode = $0.uppercased(); try? context.save() }))
                Picker("Appearance", selection: .init(get: { preference.appearance }, set: { preference.appearance = $0; try? context.save() })) {
                    Text("System").tag("system")
                    Text("Light").tag("light")
                    Text("Dark").tag("dark")
                }
                LabeledContent("Cloud sync", value: controller.cloud.status)
                Button("Sync Now") { Task { await controller.cloud.synchronize() } }
            }
        }
        .navigationTitle("Settings")
    }
}
