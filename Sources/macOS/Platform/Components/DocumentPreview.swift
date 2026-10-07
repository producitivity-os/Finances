import AppKit
import PDFKit
import SwiftUI

struct DocumentPreview: View {
    let document: FinanceDocument
    var body: some View {
        if document.mimeType == "application/pdf" {
            PDFDocumentView(data: document.originalData)
        } else if let image = NSImage(data: document.originalData) {
            ScrollView([.horizontal, .vertical]) { Image(nsImage: image).resizable().scaledToFit().padding() }
        } else {
            ContentUnavailableView("Preview unavailable", systemImage: "doc.questionmark")
        }
    }
}

private struct PDFDocumentView: NSViewRepresentable {
    let data: Data
    func makeNSView(context: Context) -> PDFView {
        let view = PDFView()
        view.autoScales = true
        view.displayMode = .singlePageContinuous
        view.displaysPageBreaks = true
        view.document = PDFDocument(data: data)
        return view
    }
    func updateNSView(_ view: PDFView, context: Context) {
        if view.document?.dataRepresentation() != data { view.document = PDFDocument(data: data) }
    }
}

