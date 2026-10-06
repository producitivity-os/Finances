import AppKit
import SwiftUI

enum LucideIconName: String, Sendable {
    case archive, arrowDownLeft = "arrow-down-left", arrowLeftRight = "arrow-left-right", arrowUpRight = "arrow-up-right"
    case banknote, calendar, chartArea = "chart-area", circleDollar = "circle-dollar-sign", copy, creditCard = "credit-card"
    case fileImage = "file-image", fileText = "file-text", filter, landmark, listFilter = "list-filter", plus, receipt, search, settings, tags, trash = "trash-2", upload, wallet, x

    var fallback: String {
        switch self {
        case .archive: "archivebox"
        case .arrowDownLeft: "arrow.down.left"
        case .arrowLeftRight: "arrow.left.arrow.right"
        case .arrowUpRight: "arrow.up.right"
        case .banknote: "banknote"
        case .calendar: "calendar"
        case .chartArea: "chart.xyaxis.line"
        case .circleDollar: "dollarsign.circle"
        case .copy: "doc.on.doc"
        case .creditCard: "creditcard"
        case .fileImage: "photo"
        case .fileText: "doc.text"
        case .filter, .listFilter: "line.3.horizontal.decrease"
        case .landmark: "building.columns"
        case .plus: "plus"
        case .receipt: "receipt"
        case .search: "magnifyingglass"
        case .settings: "gearshape"
        case .tags: "tag"
        case .trash: "trash"
        case .upload: "square.and.arrow.up"
        case .wallet: "wallet.pass"
        case .x: "xmark"
        }
    }
}

struct LucideIcon: View {
    let name: LucideIconName
    var size: CGFloat = 17

    var body: some View {
        Group {
            if let image = Self.image(name.rawValue) { Image(nsImage: image).resizable() }
            else { Image(systemName: name.fallback).resizable() }
        }
        .scaledToFit()
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private static func image(_ name: String) -> NSImage? {
        guard let url = Bundle.main.url(forResource: name, withExtension: "svg", subdirectory: "Lucide"), let image = NSImage(contentsOf: url) else { return nil }
        image.isTemplate = true
        return image
    }
}

