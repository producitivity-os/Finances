import Charts
import SwiftUI

struct BalanceChartView: View {
    let points: [BalancePoint]
    let currencyCode: String
    @State private var selectedDate: Date?

    private var selectedPoint: BalancePoint? {
        guard let selectedDate else { return nil }
        return points.min { abs($0.date.timeIntervalSince(selectedDate)) < abs($1.date.timeIntervalSince(selectedDate)) }
    }

    var body: some View {
        Chart {
            RuleMark(y: .value("Zero", 0)).foregroundStyle(.secondary.opacity(0.35))
            ForEach(points) { point in
                let value = Double(point.balanceMinor) / 100
                AreaMark(x: .value("Date", point.date), yStart: .value("Zero", 0), yEnd: .value("Balance", value))
                    .foregroundStyle(value >= 0 ? Color.green.opacity(0.16) : Color.red.opacity(0.18))
                    .interpolationMethod(.catmullRom)
                LineMark(x: .value("Date", point.date), y: .value("Balance", value))
                    .foregroundStyle(value >= 0 ? Color.green : Color.red)
                    .lineStyle(.init(lineWidth: 2.2))
                    .interpolationMethod(.catmullRom)
            }
            if let selectedPoint {
                RuleMark(x: .value("Selected", selectedPoint.date)).foregroundStyle(.secondary.opacity(0.4))
                PointMark(x: .value("Date", selectedPoint.date), y: .value("Balance", Double(selectedPoint.balanceMinor) / 100))
                    .foregroundStyle(selectedPoint.balanceMinor >= 0 ? .green : .red)
                    .annotation(position: .top) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(selectedPoint.date, format: .dateTime.month(.abbreviated).day()).font(.caption)
                            Text(FinanceFormat.currency(minor: selectedPoint.balanceMinor, code: currencyCode)).font(.caption.bold())
                        }.padding(7).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 7))
                    }
            }
        }
        .chartXAxis { AxisMarks(values: .automatic(desiredCount: 5)) }
        .chartYAxis { AxisMarks(position: .leading) }
        .chartXSelection(value: $selectedDate)
    }
}

