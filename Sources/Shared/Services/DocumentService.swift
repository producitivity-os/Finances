import CryptoKit
import Foundation
import PDFKit
import SwiftData
import UniformTypeIdentifiers
#if os(macOS)
import AppKit
private typealias PlatformImage = NSImage
#else
import UIKit
private typealias PlatformImage = UIImage
#endif

enum DocumentService {
    @MainActor
    static func importDocument(from url: URL, kind: FinanceDocumentKind, context: ModelContext) throws -> FinanceDocument {
        let data = try Data(contentsOf: url)
        let type = UTType(filenameExtension: url.pathExtension)
        return try importDocument(
            data: data,
            originalName: url.lastPathComponent,
            mimeType: type?.preferredMIMEType ?? "application/octet-stream",
            kind: kind,
            context: context
        )
    }

    @MainActor
    static func importDocument(
        data: Data,
        originalName: String,
        mimeType: String,
        kind: FinanceDocumentKind,
        context: ModelContext
    ) throws -> FinanceDocument {
        let hash = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        if let existing = try context.fetch(FetchDescriptor<FinanceDocument>(predicate: #Predicate { $0.contentHash == hash })).first { return existing }
        let pageCount: Int
        let thumbnail: Data?
        if mimeType == "application/pdf", let pdf = PDFDocument(data: data) {
            pageCount = pdf.pageCount
            thumbnail = pdf.page(at: 0)?.thumbnail(of: CGSize(width: 360, height: 480), for: .mediaBox).financeJPEGData
        } else {
            pageCount = 1
            thumbnail = PlatformImage(data: data)?.financeScaled(maximum: 512)?.financeJPEGData
        }
        let document = FinanceDocument(contentHash: hash, originalName: originalName, mimeType: mimeType, kind: kind, originalData: data, thumbnailData: thumbnail, pageCount: pageCount)
        context.insert(document)
        try context.save()
        return document
    }
}

private extension PlatformImage {
    var financeJPEGData: Data? {
        #if os(macOS)
        guard let tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiffRepresentation) else { return nil }
        return bitmap.representation(using: .jpeg, properties: [.compressionFactor: 0.82])
        #else
        return jpegData(compressionQuality: 0.82)
        #endif
    }

    func financeScaled(maximum: CGFloat) -> PlatformImage? {
        let scale = min(maximum / max(size.width, 1), maximum / max(size.height, 1), 1)
        let target = CGSize(width: max(1, size.width * scale), height: max(1, size.height * scale))
        #if os(macOS)
        let output = NSImage(size: target)
        output.lockFocus()
        NSGraphicsContext.current?.imageInterpolation = .high
        draw(in: NSRect(origin: .zero, size: target), from: NSRect(origin: .zero, size: size), operation: .copy, fraction: 1)
        output.unlockFocus()
        return output
        #else
        return UIGraphicsImageRenderer(size: target).image { _ in
            draw(in: CGRect(origin: .zero, size: target))
        }
        #endif
    }
}
