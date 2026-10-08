import Foundation

struct FinanceMetricPoint: Identifiable, Sendable {
    let date: Date
    let value: Double
    var id: Date { date }
}

enum FinanceDashboardMetrics {
    static func expenditure(
        transactions: [FinancialTransaction],
        start: Date,
        monthly: Bool,
        calendar: Calendar = .current
    ) -> [FinanceMetricPoint] {
        let outbound = transactions.filter { $0.archivedAt == nil && $0.direction == .outbound && $0.occurredAt >= start }
        let grouped = Dictionary(grouping: outbound) { transaction in
            if monthly {
                let components = calendar.dateComponents([.year, .month], from: transaction.occurredAt)
                return calendar.date(from: components) ?? calendar.startOfDay(for: transaction.occurredAt)
            }
            return calendar.startOfDay(for: transaction.occurredAt)
        }
        return grouped.map { date, values in
            FinanceMetricPoint(date: date, value: Double(values.reduce(Int64(0)) { $0 + $1.amountMinor }) / 100)
        }.sorted { $0.date < $1.date }
    }
}
