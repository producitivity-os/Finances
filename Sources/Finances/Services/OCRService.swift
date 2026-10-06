import AppKit
import Foundation
import PDFKit
@preconcurrency import Vision

struct OCRCandidateSeed: Equatable, Sendable {
    var date: Date?
    var detail: String
    var amountMinor: Int64?
    var currencyCode: String
    var direction: MoneyDirection
    var type: FinanceTransactionType
    var sourceText: String
    var fingerprint: String
}

enum OCRService {
    static func recognize(
        data: Data,
        mimeType: String,
        pageRange: Range<Int>? = nil,
        progress: @escaping @Sendable (Double) -> Void = { _ in }
    ) throws -> String {
        if mimeType == "application/pdf", let pdf = PDFDocument(data: data) {
            let requested = pageRange ?? 0..<pdf.pageCount
            let range = requested.clamped(to: 0..<pdf.pageCount)
            let pageIndexes = Array(range)
            guard !pageIndexes.isEmpty else { return "" }
            var pages: [String] = []
            for (offset, index) in pageIndexes.enumerated() {
                try Task.checkCancellation()
                guard let page = pdf.page(at: index) else { continue }
                let image = page.thumbnail(of: NSSize(width: 2_000, height: 2_600), for: .mediaBox)
                pages.append(try recognize(image: image))
                progress(Double(offset + 1) / Double(pageIndexes.count))
            }
            return pages.joined(separator: "\n\n")
        }
        try Task.checkCancellation()
        guard let image = NSImage(data: data) else { throw CocoaError(.fileReadCorruptFile) }
        let text = try recognize(image: image)
        progress(1)
        return text
    }

    static func recognize(image: NSImage) throws -> String {
        guard let data = image.tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: data),
              let cgImage = bitmap.cgImage else { throw CocoaError(.fileReadCorruptFile) }
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        try VNImageRequestHandler(cgImage: cgImage).perform([request])
        return (request.results ?? [])
            .sorted { lhs, rhs in
                abs(lhs.boundingBox.midY - rhs.boundingBox.midY) > 0.01 ? lhs.boundingBox.midY > rhs.boundingBox.midY : lhs.boundingBox.minX < rhs.boundingBox.minX
            }
            .compactMap { $0.topCandidates(1).first?.string }
            .joined(separator: "\n")
    }

    static func parseCandidates(text: String, defaultCurrency: String, kind: FinanceDocumentKind) -> [OCRCandidateSeed] {
        let lines = text.split(whereSeparator: \Character.isNewline).map(String.init).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        if kind == .receipt {
            let amount = lines.reversed().compactMap(parseAmount).first
            let detail = lines.first ?? "Receipt"
            return [makeSeed(line: text, detail: detail, amount: amount, date: lines.compactMap(parseDate).first, currency: defaultCurrency)]
        }
        let parsed = lines.compactMap { line -> OCRCandidateSeed? in
            guard let amount = parseAmount(line) else { return nil }
            let cleaned = line.replacingOccurrences(of: amount.match, with: "").trimmingCharacters(in: .whitespacesAndNewlines)
            return makeSeed(line: line, detail: cleaned.isEmpty ? "Statement transaction" : cleaned, amount: amount, date: parseDate(line), currency: defaultCurrency)
        }
        return parsed.isEmpty ? [makeSeed(line: text, detail: lines.first ?? "Statement transaction", amount: nil, date: nil, currency: defaultCurrency)] : parsed
    }

    private static func makeSeed(line: String, detail: String, amount: (minor: Int64, match: String)?, date: Date?, currency: String) -> OCRCandidateSeed {
        let signed = amount?.minor ?? 0
        let direction: MoneyDirection = signed < 0 ? .outbound : .inbound
        let type: FinanceTransactionType = direction == .outbound ? .expense : .deposit
        let minor = amount.map { abs($0.minor) }
        return OCRCandidateSeed(date: date, detail: detail, amountMinor: minor, currencyCode: currency, direction: direction, type: type, sourceText: line, fingerprint: FinanceCalculator.fingerprint(date: date, amountMinor: minor, currency: currency, detail: detail))
    }

    private static func parseAmount(_ line: String) -> (minor: Int64, match: String)? {
        let pattern = #"(?<!\d)([-+]?\(?\d{1,3}(?:[,\s]\d{3})*(?:\.\d{2})\)?|[-+]?\(?\d+\.\d{2}\)?)(?:\s?(?:CR|DR))?(?!\d)"#
        guard let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive),
              let match = regex.matches(in: line, range: NSRange(line.startIndex..., in: line)).last,
              let range = Range(match.range, in: line) else { return nil }
        let raw = String(line[range])
        let upper = raw.uppercased()
        let negative = raw.contains("-") || raw.contains("(") || upper.contains("DR")
        let numeric = raw.replacingOccurrences(of: #"[^0-9.]"#, with: "", options: .regularExpression)
        guard let value = Decimal(string: numeric) else { return nil }
        let minor = FinanceCalculator.minorUnits(value) * (negative ? -1 : 1)
        return (minor, raw)
    }

    private static func parseDate(_ line: String) -> Date? {
        let patterns = ["dd/MM/yyyy", "dd-MM-yyyy", "yyyy-MM-dd", "dd MMM yyyy", "MMM dd, yyyy"]
        for pattern in patterns {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.dateFormat = pattern
            let length = pattern.contains("MMM") ? min(line.count, 20) : 10
            for start in line.indices.prefix(max(1, line.count - length + 1)) {
                let end = line.index(start, offsetBy: min(length, line.distance(from: start, to: line.endIndex)), limitedBy: line.endIndex) ?? line.endIndex
                if let date = formatter.date(from: String(line[start..<end]).trimmingCharacters(in: .whitespaces)) { return date }
            }
        }
        return nil
    }
}
