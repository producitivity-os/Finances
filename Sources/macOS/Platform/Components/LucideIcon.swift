import ProductivityUI
import SwiftUI

typealias LucideIconName = ProductivityUI.LucideIconName

struct LucideIcon: View {
    let name: LucideIconName
    var size: CGFloat = 17

    var body: some View {
        ProductivityUI.LucideIcon(name: name, size: size)
    }
}
