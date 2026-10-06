import SwiftData
import SwiftUI
import UniformTypeIdentifiers

struct DocumentsView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.openWindow) private var openWindow
    @Query(sort: [SortDescriptor(\FinanceDocument.createdAt, order: .reverse)]) private var documents: [FinanceDocument]
    @State private var importing = false
    @State private var importKind = FinanceDocumentKind.receipt
    @State private var error: String?

    var body: some View {
        VStack(spacing: 0) {
            FinancePageHeader(eyebrow: "Receipts and statements", title: "Documents").padding(20)
            if documents.filter({ $0.archivedAt == nil }).isEmpty {
                EmptyFinanceView(icon: .fileText, title: "No documents", message: "Import a receipt or statement, then run on-device text recognition.")
            } else {
                List(documents.filter { $0.archivedAt == nil }) { document in
                    HStack(spacing: 11) {
                        if let data = document.thumbnailData, let image = NSImage(data: data) { Image(nsImage: image).resizable().scaledToFill().frame(width: 45, height: 45).clipShape(RoundedRectangle(cornerRadius: 6)) }
                        else { RoundedRectangle(cornerRadius: 6).fill(.quaternary).frame(width: 45, height: 45).overlay { LucideIcon(name: document.mimeType == "application/pdf" ? .fileText : .fileImage) } }
                        VStack(alignment: .leading) { Text(document.originalName).font(.headline); Text("\(document.kind.title) · \(document.pageCount) page\(document.pageCount == 1 ? "" : "s") · \(document.ocrStatus.rawValue.capitalized)").font(.caption).foregroundStyle(.secondary) }
                        Spacer()
                        if !document.transactionLinks.isEmpty { Text("\(document.transactionLinks.count) linked").font(.caption).foregroundStyle(.secondary) }
                    }.contentShape(Rectangle()).onTapGesture(count: 2) { openWindow(value: FinanceEditorRoute.document(document.id)) }
                    .contextMenu { Button("Open") { openWindow(value: FinanceEditorRoute.document(document.id)) }; Button("Archive", role: .destructive) { document.archivedAt = .now; try? context.save() } }
                }
            }
        }
        .toolbar {
            Menu("Import") {
                Button("Receipt") { importKind = .receipt; importing = true }
                Button("Bank Statement") { importKind = .statement; importing = true }
            }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.pdf, .image], allowsMultipleSelection: true) { result in
            do {
                for url in try result.get() {
                    let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }
                    let document = try DocumentService.importDocument(from: url, kind: importKind, context: context)
                    openWindow(value: FinanceEditorRoute.document(document.id))
                }
            } catch { self.error = error.localizedDescription }
        }
        .alert("Document could not be imported", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) { Button("OK") {} } message: { Text(error ?? "") }
    }
}

struct DocumentEditorView: View {
    let id: UUID
    @Environment(\.modelContext) private var context
    @Query private var documents: [FinanceDocument]
    @Query private var transactions: [FinancialTransaction]
    @Query private var preferences: [FinancePreferences]
    @State private var isRecognizing = false
    @State private var recognitionProgress = 0.0
    @State private var firstPage = 1
    @State private var lastPage = 1
    @State private var recognitionTask: Task<String, Error>?
    @State private var selectedCandidate: OCRTransactionCandidate?
    @State private var error: String?

    private var document: FinanceDocument? { documents.first { $0.id == id } }

    var body: some View {
        if let document {
            HSplitView {
                DocumentPreview(document: document).frame(minWidth: 330)
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text(document.originalName).font(.title2.bold())
                        Spacer()
                        if isRecognizing {
                            Button("Cancel", role: .cancel) { cancelRecognition(document) }
                        } else {
                            Button("Run OCR") { recognize(document) }
                        }
                    }
                    if document.pageCount > 1 {
                        HStack {
                            Stepper("First page: \(firstPage)", value: $firstPage, in: 1...max(1, lastPage))
                            Stepper("Last page: \(lastPage)", value: $lastPage, in: min(firstPage, document.pageCount)...document.pageCount)
                        }
                        .disabled(isRecognizing)
                    }
                    if isRecognizing {
                        ProgressView(value: recognitionProgress) {
                            Text("Recognizing selected pages…")
                        } currentValueLabel: {
                            Text(recognitionProgress, format: .percent.precision(.fractionLength(0)))
                        }
                    }
                    Text("Recognized text").font(.headline)
                    TextEditor(text: Binding(get: { document.recognizedText }, set: { document.recognizedText = $0; try? context.save() })).font(.body.monospaced()).frame(minHeight: 150)
                    Text("Import suggestions").font(.headline)
                    List(latestCandidates(document)) { candidate in
                        Button { selectedCandidate = candidate } label: {
                            HStack { VStack(alignment: .leading) { Text(candidate.transactionDetail); Text(candidate.occurredAt?.formatted(date: .abbreviated, time: .omitted) ?? "No date").font(.caption).foregroundStyle(.secondary) }; Spacer(); Text(candidate.amountMinor.map { FinanceFormat.currency(minor: $0, code: candidate.currencyCode) } ?? "Review"); if candidate.isLikelyDuplicate { Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange) } }
                        }.buttonStyle(.plain)
                    }
                }.padding(14).frame(minWidth: 330)
            }
            .sheet(item: $selectedCandidate) { CandidateReviewView(candidate: $0, document: document) }
            .onAppear { firstPage = 1; lastPage = max(1, document.pageCount) }
            .onDisappear { recognitionTask?.cancel() }
            .alert("Text recognition failed", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) { Button("OK") {} } message: { Text(error ?? "") }
        } else { ContentUnavailableView("Document not found", systemImage: "doc.questionmark") }
    }

    private func latestCandidates(_ document: FinanceDocument) -> [OCRTransactionCandidate] { document.importBatches.sorted { $0.createdAt > $1.createdAt }.first?.candidates ?? [] }

    private func recognize(_ document: FinanceDocument) {
        isRecognizing = true; recognitionProgress = 0; document.ocrStatus = .recognizing; try? context.save()
        let data = document.originalData, mime = document.mimeType, kind = document.kind
        let currency = preferences.first?.baseCurrencyCode ?? "USD"
        let pages = max(0, firstPage - 1)..<max(firstPage, lastPage)
        let worker = Task.detached(priority: .userInitiated) {
            try OCRService.recognize(data: data, mimeType: mime, pageRange: pages) { fraction in
                Task { @MainActor in recognitionProgress = fraction }
            }
        }
        recognitionTask = worker
        Task {
            do {
                let text = try await worker.value
                let seeds = OCRService.parseCandidates(text: text, defaultCurrency: currency, kind: kind)
                document.recognizedText = text; document.ocrStatus = .ready
                let batch = OCRImportBatch(document: document); batch.status = .ready; batch.completedAt = .now; context.insert(batch); document.importBatches.append(batch)
                let fingerprints = Set(transactions.filter { $0.archivedAt == nil }.map { FinanceCalculator.fingerprint(date: $0.occurredAt, amountMinor: $0.amountMinor, currency: $0.currencyCode, detail: $0.transactionDetail) })
                for seed in seeds {
                    let candidate = OCRTransactionCandidate(occurredAt: seed.date, detail: seed.detail, amountMinor: seed.amountMinor, currencyCode: seed.currencyCode, direction: seed.direction, type: seed.type, sourceText: seed.sourceText, fingerprint: seed.fingerprint, isLikelyDuplicate: fingerprints.contains(seed.fingerprint), batch: batch)
                    batch.candidates.append(candidate)
                }
                try? context.save(); isRecognizing = false; recognitionTask = nil
            } catch is CancellationError {
                document.ocrStatus = .pending; isRecognizing = false; recognitionTask = nil; try? context.save()
            } catch { document.ocrStatus = .failed; isRecognizing = false; recognitionTask = nil; self.error = error.localizedDescription; try? context.save() }
        }
    }

    private func cancelRecognition(_ document: FinanceDocument) {
        recognitionTask?.cancel()
        document.ocrStatus = .pending
        isRecognizing = false
        try? context.save()
    }
}

private struct CandidateReviewView: View {
    let candidate: OCRTransactionCandidate
    let document: FinanceDocument
    @Environment(FinancesAppState.self) private var state
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Query(sort: [SortDescriptor(\FinanceAccount.name)]) private var accounts: [FinanceAccount]
    @Query(sort: [SortDescriptor(\FinanceCategory.name)]) private var categories: [FinanceCategory]
    @State private var draft: TransactionDraft
    @State private var accountID: UUID?
    @State private var error: String?

    init(candidate: OCRTransactionCandidate, document: FinanceDocument) {
        self.candidate = candidate; self.document = document
        _draft = State(initialValue: TransactionDraft(occurredAt: candidate.occurredAt ?? .now, detail: candidate.transactionDetail, direction: candidate.direction, type: candidate.type, amount: FinanceCalculator.decimal(minor: candidate.amountMinor ?? 0), currencyCode: candidate.currencyCode))
    }

    var body: some View {
        Form {
            if candidate.isLikelyDuplicate { Label("This may duplicate an existing transaction.", systemImage: "exclamationmark.triangle.fill").foregroundStyle(.orange) }
            Picker("Direction", selection: $draft.direction) { ForEach(MoneyDirection.allCases) { Text($0.title).tag($0) } }
            Picker("Type", selection: $draft.type) { ForEach(FinanceTransactionType.allowed(for: draft.direction)) { Text($0.title).tag($0) } }
            DatePicker("Date", selection: $draft.occurredAt)
            TextField("Detail", text: $draft.detail)
            TextField("Amount", value: $draft.amount, format: .number)
            Picker("Account", selection: $accountID) { Text("Choose account").tag(UUID?.none); ForEach(accounts.filter { $0.archivedAt == nil }) { Text($0.name).tag(Optional($0.id)) } }
            Picker("Category", selection: $draft.categoryID) { Text("None").tag(UUID?.none); ForEach(categories.filter { $0.archivedAt == nil }) { Text($0.name).tag(Optional($0.id)) } }
            HStack { Button("Cancel") { dismiss() }; Spacer(); Button("Import") { importCandidate() }.keyboardShortcut(.defaultAction).disabled(accountID == nil || draft.amount <= 0) }
        }.formStyle(.grouped).padding().frame(width: 500, height: 430)
        .onChange(of: draft.direction) { _, direction in if !FinanceTransactionType.allowed(for: direction).contains(draft.type) { draft.type = FinanceTransactionType.allowed(for: direction)[0] } }
        .alert("Suggestion could not be imported", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) { Button("OK") {} } message: { Text(error ?? "") }
    }

    private func importCandidate() {
        guard let accountID else { return }
        let role: PostingRole = draft.direction == .inbound ? .destination : .source
        draft.postings = [PostingDraft(accountID: accountID, role: role, amount: draft.amount, accountAmount: draft.amount)]
        Task {
            do {
                let transactionID = try await state.store.saveTransaction(draft)
                await MainActor.run {
                    if let transaction = try? context.fetch(FetchDescriptor<FinancialTransaction>(predicate: #Predicate { $0.id == transactionID })).first {
                        let link = TransactionDocumentLink(transaction: transaction, document: document); context.insert(link); transaction.documentLinks.append(link); document.transactionLinks.append(link)
                    }
                    candidate.status = .imported; try? context.save(); dismiss()
                }
            } catch { await MainActor.run { self.error = error.localizedDescription } }
        }
    }
}
