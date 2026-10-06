import AppKit
import CryptoKit
import Foundation
import PDFKit
import SwiftData
import UniformTypeIdentifiers

enum DocumentService {
    @MainActor
    static func importDocument(from url: URL, kind: FinanceDocumentKind, context: ModelContext) throws -> FinanceDocument {
        let data = try Data(contentsOf: url)
        let hash = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        if let existing = try context.fetch(FetchDescriptor<FinanceDocument>(predicate: #Predicate { $0.contentHash == hash })).first { return existing }
        let type = UTType(filenameExtension: url.pathExtension)
        let mime = type?.preferredMIMEType ?? "application/octet-stream"
        let pageCount: Int
        let thumbnail: Data?
        if type?.conforms(to: .pdf) == true, let pdf = PDFDocument(data: data) {
            pageCount = pdf.pageCount
            thumbnail = pdf.page(at: 0)?.thumbnail(of: NSSize(width: 360, height: 480), for: .mediaBox).jpegData
        } else {
            pageCount = 1
            thumbnail = NSImage(data: data)?.scaled(maximum: 512)?.jpegData
        }
        let document = FinanceDocument(contentHash: hash, originalName: url.lastPathComponent, mimeType: mime, kind: kind, originalData: data, thumbnailData: thumbnail, pageCount: pageCount)
        context.insert(document)
        try context.save()
        return document
    }
}

private extension NSImage {
    var jpegData: Data? {
        guard let tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiffRepresentation) else { return nil }
        return bitmap.representation(using: .jpeg, properties: [.compressionFactor: 0.82])
    }

    func scaled(maximum: CGFloat) -> NSImage? {
        let scale = min(maximum / max(size.width, 1), maximum / max(size.height, 1), 1)
        let target = NSSize(width: max(1, size.width * scale), height: max(1, size.height * scale))
        let output = NSImage(size: target)
        output.lockFocus()
        NSGraphicsContext.current?.imageInterpolation = .high
        draw(in: NSRect(origin: .zero, size: target), from: NSRect(origin: .zero, size: size), operation: .copy, fraction: 1)
        output.unlockFocus()
        return output
    }
}

