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
            }
        }
        .chartXAxis { AxisMarks(values: .automatic(desiredCount: 5)) }
        .chartYAxis { AxisMarks(position: .leading) }
        .chartXSelection(value: $selectedDate)
        .chartOverlay { proxy in
            GeometryReader { geometry in
                if let selectedPoint,
                   let plotAnchor = proxy.plotFrame,
                   let x = proxy.position(forX: selectedPoint.date),
                   let y = proxy.position(forY: Double(selectedPoint.balanceMinor) / 100) {
                    let plot = geometry[plotAnchor]
                    let tooltipWidth: CGFloat = 132
                    let tooltipHeight: CGFloat = 58
                    let proposedY = plot.minY + y - tooltipHeight / 2 - 16
                    let tooltipY = proposedY < plot.minY
                        ? min(plot.maxY - tooltipHeight / 2, plot.minY + y + tooltipHeight / 2 + 16)
                        : proposedY

                    VStack(alignment: .leading, spacing: 2) {
                        Text(selectedPoint.date, format: .dateTime.month(.abbreviated).day())
                            .font(.caption)
                        Text(FinanceFormat.currency(minor: selectedPoint.balanceMinor, code: currencyCode))
                            .font(.caption.bold())
                    }
                    .padding(7)
                    .frame(width: tooltipWidth, alignment: .leading)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 7))
                    .position(
                        x: min(plot.maxX - tooltipWidth / 2, max(plot.minX + tooltipWidth / 2, plot.minX + x)),
                        y: tooltipY
                    )
                    .allowsHitTesting(false)
                }
            }
        }
    }
}

