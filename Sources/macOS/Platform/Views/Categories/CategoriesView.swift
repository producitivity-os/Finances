import SwiftData
import SwiftUI

struct CategoriesView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.openWindow) private var openWindow
    @Query(sort: [SortDescriptor(\FinanceCategory.name)]) private var categories: [FinanceCategory]
    @State private var showArchived = false

    private var visible: [FinanceCategory] { categories.filter { showArchived || $0.archivedAt == nil } }

    var body: some View {
        VStack(spacing: 0) {
            FinancePageHeader(eyebrow: "Organize spending", title: "Categories", actionTitle: "Add Category") { openWindow(value: FinanceEditorRoute.category(UUID())) }.padding(20)
            List(visible) { category in
                HStack {
                    Circle().fill(Color(hex: category.colorHex)).frame(width: 12, height: 12)
                    Text(category.name)
                    Spacer()
                    if category.isBuiltin { Text("Built-in").font(.caption).foregroundStyle(.secondary) }
                    if category.archivedAt != nil { Text("Archived").font(.caption).foregroundStyle(.orange) }
                }.contentShape(Rectangle()).onTapGesture(count: 2) { openWindow(value: FinanceEditorRoute.category(category.id)) }
                .contextMenu {
                    Button("Edit") { openWindow(value: FinanceEditorRoute.category(category.id)) }
                    Button(category.archivedAt == nil ? "Archive" : "Restore") { category.archivedAt = category.archivedAt == nil ? .now : nil; try? context.save() }
                }
            }
        }.toolbar { Toggle("Show Archived", isOn: $showArchived) }
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
            TextField("Lucide icon", text: $icon)
            TextField("Color", text: $color)
            HStack { Circle().fill(Color(hex: color)).frame(width: 18, height: 18); Text(name.isEmpty ? "Preview" : name) }
            HStack { Button("Cancel") { dismiss() }; Spacer(); Button("Save") { save() }.keyboardShortcut(.defaultAction).disabled(name.trimmingCharacters(in: .whitespaces).isEmpty) }
        }.formStyle(.grouped).padding().frame(width: 450, height: 290).task { load() }
        .alert("Category could not be saved", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) { Button("OK") {} } message: { Text(error ?? "") }
    }
    private func load() { if let category = categories.first(where: { $0.id == id }) { name = category.name; icon = category.iconName; color = category.colorHex } }
    private func save() {
        let category = categories.first(where: { $0.id == id }) ?? FinanceCategory(id: id, name: name, iconName: icon, colorHex: color)
        if category.modelContext == nil { context.insert(category) }
        category.name = name.trimmingCharacters(in: .whitespacesAndNewlines); category.iconName = icon; category.colorHex = color
        do { try context.save(); dismiss() } catch { self.error = error.localizedDescription }
    }
}

