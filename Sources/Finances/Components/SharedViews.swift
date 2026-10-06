import SwiftUI

struct FinancePageHeader: View {
    let eyebrow: String
    let title: String
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 3) {
                Text(eyebrow.uppercased()).font(.caption2.weight(.semibold)).tracking(1).foregroundStyle(.secondary)
                Text(title).font(.largeTitle.bold())
            }
            Spacer()
            if let actionTitle, let action { Button(actionTitle, action: action).buttonStyle(.borderedProminent) }
        }
    }
}

struct EmptyFinanceView: View {
    let icon: LucideIconName
    let title: String
    let message: String

    var body: some View {
        ContentUnavailableView {
            Label { Text(title) } icon: { LucideIcon(name: icon, size: 28) }
        } description: { Text(message) }
    }
}

extension Color {
    init(hex: String) {
        let value = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var integer: UInt64 = 0
        Scanner(string: value).scanHexInt64(&integer)
        let r, g, b: Double
        if value.count == 6 {
            r = Double((integer >> 16) & 0xff) / 255
            g = Double((integer >> 8) & 0xff) / 255
            b = Double(integer & 0xff) / 255
        } else { r = 0.2; g = 0.5; b = 0.9 }
        self.init(red: r, green: g, blue: b)
    }
}

