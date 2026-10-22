import SwiftData
import SwiftUI

struct CategoriesView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.openWindow) private var openWindow
    @Query(sort: [SortDescriptor(\FinanceCategory.name)]) private var categories: [FinanceCategory]
    @Query private var transactions: [FinancialTransaction]

    private var visible: [FinanceCategory] { categories.filter { $0.archivedAt == nil } }

    var body: some View {
        List(visible) { category in
            HStack {
                FinanceIconView(name: category.iconName, size: 17)
                    .foregroundStyle(Color(hex: category.colorHex))
                    .frame(width: 28, height: 28)
                    .background(Color(hex: category.colorHex).opacity(0.12), in: RoundedRectangle(cornerRadius: 7))
                Text(category.name)
                Spacer()
            }
            .contentShape(Rectangle())
            .onTapGesture(count: 2) { edit(category) }
            .swipeActions(edge: .leading, allowsFullSwipe: false) {
                Button { edit(category) } label: {
                    Label("Edit", systemImage: "pencil")
                        .labelStyle(.iconOnly)
                        .frame(width: 24, height: 24, alignment: .center)
                }
                .tint(FinanceTheme.accent)
            }
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                if !FinanceCategoryService.isUncategorized(category) {
                    Button(role: .destructive) { delete(category) } label: {
                        Label("Delete", systemImage: "trash")
                            .labelStyle(.iconOnly)
                            .frame(width: 24, height: 24, alignment: .center)
                    }
                }
            }
            .contextMenu {
                Button("Edit") { edit(category) }
                if !FinanceCategoryService.isUncategorized(category) {
                    Button("Delete", role: .destructive) { delete(category) }
                }
            }
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { openWindow(value: FinanceEditorRoute.category(UUID())) } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 15, weight: .semibold))
                        .frame(width: 32, height: 32)
                        .background(.ultraThinMaterial, in: Circle())
                        .overlay { Circle().stroke(.secondary.opacity(0.18)) }
                }
                .buttonStyle(.plain)
                .help("New Category")
                .accessibilityLabel("New Category")
            }
        }
    }

    private func edit(_ category: FinanceCategory) {
        openWindow(value: FinanceEditorRoute.category(category.id))
    }

    private func delete(_ category: FinanceCategory) {
        try? FinanceCategoryService.delete(category, categories: categories, transactions: transactions, in: context)
    }
}

struct CategoryEditorView: View {
    let id: UUID
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Query private var categories: [FinanceCategory]
    @State private var name = ""
    @State private var icon = "circle-dollar-sign"
    @State private var color = "#2F80ED"
    @State private var error: String?

    var body: some View {
        Form {
            TextField("Name", text: $name)
            LabeledContent("Icon") { FinanceIconPicker(selection: $icon).frame(maxWidth: 260) }
            LabeledContent("Color") { FinanceColorPicker(hex: $color).frame(maxWidth: 260) }
            HStack(spacing: 10) {
                FinanceIconView(name: icon, size: 18)
                    .foregroundStyle(Color(hex: color))
                    .frame(width: 32, height: 32)
                    .background(Color(hex: color).opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
                Text(name.isEmpty ? "Preview" : name)
            }
            HStack { Button("Cancel") { dismiss() }; Spacer(); Button("Save") { save() }.keyboardShortcut(.defaultAction).disabled(name.trimmingCharacters(in: .whitespaces).isEmpty) }
        }.formStyle(.grouped).padding().frame(width: 480, height: 350).task { load() }
        .alert("Category could not be saved", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) { Button("OK") {} } message: { Text(error ?? "") }
    }
    private func load() { if let category = categories.first(where: { $0.id == id }) { name = category.name; icon = category.iconName; color = category.colorHex } }
    private func save() {
        let category = categories.first(where: { $0.id == id }) ?? FinanceCategory(id: id, name: name, iconName: icon, colorHex: color)
        if category.modelContext == nil { context.insert(category) }
        category.name = name.trimmingCharacters(in: .whitespacesAndNewlines); category.iconName = icon; category.colorHex = FinanceIconCatalog.normalizedHex(color)
        do { try context.save(); dismiss() } catch { self.error = error.localizedDescription }
    }
}
