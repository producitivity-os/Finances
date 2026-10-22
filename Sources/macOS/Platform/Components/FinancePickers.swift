import AppKit
import ProductivityUI
import SwiftUI

struct FinanceIconView: View {
    let name: String
    var size: CGFloat = 17

    var body: some View {
        Group {
            if name.hasPrefix("sf:") {
                Image(systemName: String(name.dropFirst(3)))
                    .resizable()
            } else if let lucide = LucideIconName(rawValue: name) {
                LucideIcon(name: lucide, size: size)
            } else {
                Image(systemName: FinanceIconCatalog.fallbackSymbol(for: name))
                    .resizable()
            }
        }
        .scaledToFit()
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

struct FinanceIconPicker: View {
    @Binding var selection: String
    @State private var showsPicker = false

    var body: some View {
        Button {
            showsPicker = true
        } label: {
            HStack(spacing: 10) {
                FinanceIconView(name: selection, size: 20)
                    .foregroundStyle(FinanceTheme.accent)
                    .frame(width: 32, height: 30)
                    .background(FinanceTheme.accent.opacity(0.10), in: RoundedRectangle(cornerRadius: 7))
                VStack(alignment: .leading, spacing: 1) {
                    Text(FinanceIconCatalog.displayName(for: selection))
                    Text(selection.hasPrefix("sf:") ? "SF Symbol" : "Lucide")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showsPicker) {
            FinanceIconPickerDialog(selection: $selection)
        }
    }
}

struct FinanceColorPicker: View {
    @Binding var hex: String

    private var color: Binding<Color> {
        Binding(
            get: { Color(hex: hex) },
            set: { value in
                if let resolved = value.financeHexString { hex = resolved }
            }
        )
    }

    var body: some View {
        HStack(spacing: 10) {
            ColorPicker("", selection: color, supportsOpacity: false)
                .labelsHidden()
            TextField("#009051", text: $hex)
                .textFieldStyle(.roundedBorder)
                .font(.body.monospaced())
                .frame(width: 104)
                .onSubmit { hex = FinanceIconCatalog.normalizedHex(hex) }
            Spacer()
            Circle()
                .fill(Color(hex: hex))
                .frame(width: 22, height: 22)
                .overlay { Circle().stroke(.separator) }
        }
    }
}

private struct FinanceIconPickerDialog: View {
    private enum Library: String, CaseIterable, Identifiable {
        case all = "All"
        case lucide = "Lucide"
        case sfSymbols = "SF Symbols"
        var id: String { rawValue }
    }

    @Binding var selection: String
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var library = Library.all

    private var options: [FinanceIconOption] {
        FinanceIconCatalog.options.filter { option in
            (library == .all || option.libraryName == library.rawValue)
                && (query.isEmpty
                    || option.title.localizedCaseInsensitiveContains(query)
                    || option.value.localizedCaseInsensitiveContains(query))
        }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("Icon library", selection: $library) {
                    ForEach(Library.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding([.horizontal, .top])

                ScrollView {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), spacing: 10)], spacing: 10) {
                        ForEach(options) { option in
                            Button {
                                selection = option.value
                                dismiss()
                            } label: {
                                VStack(spacing: 8) {
                                    FinanceIconView(name: option.value, size: 24)
                                    Text(option.title)
                                        .font(.caption)
                                        .lineLimit(1)
                                }
                                .foregroundStyle(selection == option.value ? Color.white : Color.primary)
                                .frame(maxWidth: .infinity, minHeight: 72)
                                .background(selection == option.value ? FinanceTheme.accent : Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("\(option.title), \(option.libraryName)")
                        }
                    }
                    .padding()
                }
                .overlay {
                    if options.isEmpty {
                        ContentUnavailableView.search(text: query)
                    }
                }
            }
            .searchable(text: $query, prompt: "Search icons")
            .navigationTitle("Choose an Icon")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
        .frame(minWidth: 620, minHeight: 560)
    }
}

struct FinanceIconOption: Identifiable {
    let value: String
    let title: String
    let libraryName: String
    var id: String { value }
}

enum FinanceIconCatalog {
    private static let sfSymbols = [
        "airplane", "archivebox", "arrow.down.left", "arrow.left.arrow.right", "arrow.up.right",
        "bag", "banknote", "basket", "bicycle", "bolt", "book", "building.columns", "calendar",
        "camera", "car", "cart", "chart.bar", "chart.line.uptrend.xyaxis", "chart.pie", "checkmark.circle",
        "checkmark.seal", "checkmark.shield", "clock", "creditcard", "cup.and.saucer", "dollarsign.circle",
        "doc", "doc.text", "film", "flame", "fork.knife", "fuelpump", "gift", "graduationcap",
        "hammer", "hand.raised", "heart", "heart.text.square", "house", "laptopcomputer", "leaf",
        "lightbulb", "link", "mappin", "music.note", "paperclip", "pawprint", "person", "phone",
        "photo", "pills", "printer", "receipt", "repeat", "scissors", "shield", "shippingbox",
        "sparkles", "star", "storefront", "tag", "ticket", "tram", "trash", "tshirt", "umbrella",
        "wallet.pass", "waveform", "wrench.and.screwdriver"
    ]

    private static let legacyLucide = [
        "briefcase-business", "car", "chart-candlestick", "clapperboard", "gift", "graduation-cap",
        "hand-coins", "heart-pulse", "house", "plane", "shield-check", "shopping-bag",
        "shopping-basket", "zap"
    ]

    static let options: [FinanceIconOption] = {
        let lucideNames = Set(LucideIconName.allCases.map(\.rawValue) + legacyLucide)
        let lucide = lucideNames.sorted().map {
            FinanceIconOption(value: $0, title: displayName(for: $0), libraryName: "Lucide")
        }
        let symbols = sfSymbols.map {
            FinanceIconOption(value: "sf:\($0)", title: displayName(for: $0), libraryName: "SF Symbols")
        }
        return lucide + symbols
    }()

    static func displayName(for value: String) -> String {
        let raw = value.hasPrefix("sf:") ? String(value.dropFirst(3)) : value
        return raw
            .replacingOccurrences(of: ".", with: " ")
            .replacingOccurrences(of: "-", with: " ")
            .split(separator: " ")
            .map { $0.capitalized }
            .joined(separator: " ")
    }

    static func fallbackSymbol(for name: String) -> String {
        if name.hasPrefix("sf:") { return String(name.dropFirst(3)) }
        if let lucide = LucideIconName(rawValue: name) { return lucide.fallbackSymbol }
        return switch name {
        case "shopping-basket": "basket"
        case "house": "house"
        case "zap": "bolt"
        case "car": "car"
        case "plane": "airplane"
        case "heart-pulse": "heart.text.square"
        case "graduation-cap": "graduationcap"
        case "clapperboard": "film"
        case "shopping-bag": "bag"
        case "shield-check": "checkmark.shield"
        case "briefcase-business": "briefcase"
        case "chart-candlestick": "chart.xyaxis.line"
        case "hand-coins": "banknote"
        default: "tag"
        }
    }

    static func normalizedHex(_ value: String) -> String {
        let raw = value.trimmingCharacters(in: CharacterSet.alphanumerics.inverted).uppercased()
        return raw.count == 6 && raw.allSatisfy(\.isHexDigit) ? "#\(raw)" : "#2F80ED"
    }
}

private extension Color {
    var financeHexString: String? {
        guard let value = NSColor(self).usingColorSpace(.sRGB) else { return nil }
        return String(
            format: "#%02X%02X%02X",
            Int((value.redComponent * 255).rounded()),
            Int((value.greenComponent * 255).rounded()),
            Int((value.blueComponent * 255).rounded())
        )
    }
}
