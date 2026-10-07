import PDFKit
import SwiftUI
@preconcurrency import VisionKit

struct DocumentScannerView: UIViewControllerRepresentable {
    let completion: (Result<Data, Error>) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(completion: completion) }

    func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
        let controller = VNDocumentCameraViewController()
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ uiViewController: VNDocumentCameraViewController, context: Context) {}

    final class Coordinator: NSObject, VNDocumentCameraViewControllerDelegate {
        let completion: (Result<Data, Error>) -> Void

        init(completion: @escaping (Result<Data, Error>) -> Void) {
            self.completion = completion
        }

        func documentCameraViewController(
            _ controller: VNDocumentCameraViewController,
            didFinishWith scan: VNDocumentCameraScan
        ) {
            let pdf = PDFDocument()
            for index in 0..<scan.pageCount {
                if let page = PDFPage(image: scan.imageOfPage(at: index)) {
                    pdf.insert(page, at: index)
                }
            }
            if let data = pdf.dataRepresentation() {
                completion(.success(data))
            } else {
                completion(.failure(CocoaError(.fileWriteUnknown)))
            }
            Task { @MainActor in controller.dismiss(animated: true) }
        }

        func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
            Task { @MainActor in controller.dismiss(animated: true) }
        }

        func documentCameraViewController(
            _ controller: VNDocumentCameraViewController,
            didFailWithError error: Error
        ) {
            completion(.failure(error))
            Task { @MainActor in controller.dismiss(animated: true) }
        }
    }
}
