import Charts
import SwiftData
import SwiftUI
import ProductivityUI

private enum ChartRange: String, CaseIterable, Identifiable {
    case week = "7D", month = "30D", quarter = "90D", year = "1Y", all = "All"
    var id: String { rawValue }
    var days: Int? { switch self { case .week: 7; case .month: 30; case .quarter: 90; case .year: 365; case .all: nil } }

    var groupsByMonth: Bool {
        switch self {
        case .week, .month: false
        case .quarter, .year, .all: true
        }
    }

    var axisFormat: Date.FormatStyle {
        groupsByMonth ? .dateTime.month(.abbreviated) : .dateTime.month(.abbreviated).day()
    }
}

private enum CategoryDistributionMode: String, CaseIterable, Identifiable {
    case spending = "Spending"
    case income = "Income"

    var id: String { rawValue }
    var direction: MoneyDirection { self == .spending ? .outbound : .inbound }
}

private struct CategoryDistributionSlice: Identifiable {
    let id: String
    let name: String
    let amount: Double
    let color: Color
}

struct FinanceDashboardView: View {
    @Environment(FinancesAppState.self) private var state
    @Environment(\.openWindow) private var openWindow
    @Query(sort: [SortDescriptor(\FinanceAccount.name)]) private var accounts: [FinanceAccount]
    @Query(sort: [SortDescriptor(\FinancialTransaction.occurredAt, order: .reverse)]) private var transactions: [FinancialTransaction]
    @Query private var preferences: [FinancePreferences]
    @State private var accountID: UUID?
    @State private var range = ChartRange.month
    @State private var distributionMode = CategoryDistributionMode.spending

    private var activeAccounts: [FinanceAccount] { accounts.filter { $0.archivedAt == nil } }
    private var currency: String { accountID.flatMap { id in activeAccounts.first { $0.id == id }?.currencyCode } ?? preferences.first?.baseCurrencyCode ?? "USD" }
    private var start: Date {
        if let days = range.days { return Calendar.current.date(byAdding: .day, value: -days + 1, to: .now) ?? .now }
        return transactions.map(\FinancialTransaction.occurredAt).min() ?? Calendar.current.date(byAdding: .day, value: -30, to: .now)!
    }
    private var points: [BalancePoint] {
        if let accountID, let account = activeAccounts.first(where: { $0.id == accountID }) {
            return FinanceCalculator.balanceSeries(account: account, start: start, end: .now)
        }
        let series = activeAccounts.map { ($0, FinanceCalculator.balanceSeries(account: $0, start: start, end: .now)) }
        guard let count = series.first?.1.count else { return [] }
        return (0..<count).map { index in
            var total: Int64 = 0
            var complete = true
            for (account, values) in series {
                guard values.indices.contains(index) else { continue }
                if account.currencyCode == currency { total += values[index].balanceMinor }
                else if let rate = account.baseExchangeRate { total += Int64((Double(values[index].balanceMinor) * rate).rounded()) }
                else { complete = false }
            }
            return BalancePoint(date: series[0].1[index].date, balanceMinor: total, isComplete: complete)
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                FinancePageHeader(eyebrow: "Overview", title: "Dashboard")
                controls
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        VStack(alignment: .leading) {
                            Text("CURRENT BALANCE").font(.caption2.weight(.semibold)).tracking(1).foregroundStyle(.secondary)
                            Text(FinanceFormat.currency(minor: points.last?.balanceMinor ?? 0, code: currency)).font(.title.bold())
                        }
                        Spacer()
                        if points.contains(where: { !$0.isComplete }) { Label("Incomplete conversion", systemImage: "exclamationmark.triangle.fill").font(.caption).foregroundStyle(.orange) }
                    }
                    BalanceChartView(points: points, currencyCode: currency).frame(height: 285)
                }.padding(16).background(.background, in: RoundedRectangle(cornerRadius: 14)).overlay { RoundedRectangle(cornerRadius: 14).stroke(.separator) }
                HStack(alignment: .top, spacing: 14) {
                    ProductivitySectionCard("Expenditure") {
                        DashboardActivityBarChart(data: expenditureData, range: range, color: .red)
                            .frame(height: 230)
                    }
                    ProductivitySectionCard("Category distribution") {
                        Picker("Flow", selection: $distributionMode) {
                            ForEach(CategoryDistributionMode.allCases) { mode in
                                Text(mode.rawValue).tag(mode)
                            }
                        }
                        .pickerStyle(.segmented)
                        .labelsHidden()

                        CategoryDistributionPieChart(slices: categoryDistribution, currencyCode: currency)
                            .frame(height: 190)
                    }
                        .frame(maxWidth: 370)
                }
                recent
            }.padding(20)
        }
        .overlay(alignment: .bottomTrailing) {
            MorphingActionMenu(actions: [
                .init(id: "transaction", icon: "arrow.left.arrow.right", title: "New Transaction"),
                .init(id: "account", icon: "wallet.bifold", title: "New Account")
            ]) { item in
                switch item.id {
                case "account": openWindow(value: FinanceEditorRoute.account(UUID()))
                default: state.showTransactionPanel(id: UUID())
                }
            }.padding(18)
        }
    }

    private var controls: some View {
        HStack {
            Picker("Account", selection: $accountID) {
                Text("All accounts").tag(UUID?.none)
                ForEach(activeAccounts) { Text($0.name).tag(Optional($0.id)) }
            }.frame(width: 220)
            Spacer()
            Picker("Range", selection: $range) { ForEach(ChartRange.allCases) { Text($0.rawValue).tag($0) } }.pickerStyle(.segmented).labelsHidden().frame(width: 250)
        }
    }

    private var recent: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Recent transactions").font(.headline)
            ForEach(transactions.filter { $0.archivedAt == nil }.prefix(5)) { transaction in
                let direction = transaction.type.direction
                let signedAmount = direction == .outbound ? -transaction.amountMinor : transaction.amountMinor
                HStack {
                    TransactionDirectionBadge(direction: direction)
                    VStack(alignment: .leading) {
                        Text(transaction.recipient)
                        Text("\(transaction.transactionDetail) · \(transaction.occurredAt.formatted(date: .abbreviated, time: .omitted))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(FinanceFormat.currency(minor: signedAmount, code: transaction.currencyCode))
                        .foregroundStyle(direction == .inbound ? Color.green : direction == .outbound ? Color.red : Color.primary)
                }.padding(.vertical, 3)
            }
        }
    }

    private var expenditureData: [DynamicBarChartData] {
        FinanceDashboardMetrics.expenditure(transactions: scopedTransactions, start: start, monthly: range.groupsByMonth)
            .map { DynamicBarChartData(date: $0.date, value: $0.value) }
    }

    private var scopedTransactions: [FinancialTransaction] {
        transactions.filter { transaction in
            transaction.archivedAt == nil
                && transaction.occurredAt >= start
                && (accountID == nil || transaction.postings.contains { $0.account?.id == accountID })
        }
    }

    private var categoryDistribution: [CategoryDistributionSlice] {
        let matching = scopedTransactions.filter { $0.type.direction == distributionMode.direction }
        let grouped = Dictionary(grouping: matching) { $0.category?.id }

        return grouped.map { categoryID, values in
            let category = values.first?.category
            let amount = values.reduce(0.0) { partial, transaction in
                partial + Double(transaction.amountMinor) / 100
            }
            return CategoryDistributionSlice(
                id: categoryID?.uuidString ?? "uncategorized",
                name: category?.name ?? FinanceCategoryService.uncategorizedName,
                amount: amount,
                color: category.map { Color(hex: $0.colorHex) } ?? .secondary
            )
        }
        .filter { $0.amount > 0 }
        .sorted { $0.amount > $1.amount }
    }
}

private struct DashboardActivityBarChart: View {
    let data: [DynamicBarChartData]
    let range: ChartRange
    let color: Color

    var body: some View {
        Chart(data) { item in
            BarMark(
                x: .value("Date", item.date),
                y: .value("Amount", item.value)
            )
            .foregroundStyle(color.gradient)
            .cornerRadius(4)
            .annotation(position: .top) {
                if data.count <= 7 {
                    Text(item.value.formatted(.number.precision(.fractionLength(0))))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: 6)) { _ in
                AxisGridLine()
                AxisValueLabel(format: range.axisFormat)
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading) {
                AxisGridLine()
                AxisValueLabel()
            }
        }
        .chartOverlay { _ in
            if data.isEmpty {
                ContentUnavailableView("No expenditure", systemImage: "chart.bar", description: Text("No spending was recorded in this period."))
            }
        }
        .accessibilityLabel("Expenditure history")
    }
}

private struct CategoryDistributionPieChart: View {
    let slices: [CategoryDistributionSlice]
    let currencyCode: String
    @State private var hoveredID: String?
    @State private var hoverLocation: CGPoint = .zero

    private var total: Double { slices.reduce(0) { $0 + $1.amount } }
    private var hoveredSlice: CategoryDistributionSlice? { slices.first { $0.id == hoveredID } }

    var body: some View {
        ZStack {
            if slices.isEmpty {
                ContentUnavailableView("No category data", systemImage: "chart.pie", description: Text("Transactions in this period will appear here."))
            } else {
                Chart(slices) { slice in
                    SectorMark(
                        angle: .value("Amount", slice.amount),
                        innerRadius: .ratio(0.68),
                        angularInset: 2
                    )
                    .foregroundStyle(slice.color)
                    .cornerRadius(4)
                    .opacity(hoveredID == nil || hoveredID == slice.id ? 1 : 0.45)
                }
                .chartLegend(.hidden)
                .overlay {
                    GeometryReader { geometry in
                        Color.clear
                            .contentShape(Rectangle())
                            .onContinuousHover { phase in
                                switch phase {
                                case let .active(location):
                                    hoverLocation = location
                                    hoveredID = sliceID(at: location, in: geometry.size)
                                case .ended:
                                    hoveredID = nil
                                }
                            }

                        if let hoveredSlice {
                            tooltip(for: hoveredSlice)
                                .fixedSize()
                                .position(tooltipPosition(in: geometry.size))
                                .allowsHitTesting(false)
                        }
                    }
                }

                VStack(spacing: 2) {
                    Text(total, format: .currency(code: currencyCode))
                        .font(.headline)
                        .minimumScaleFactor(0.65)
                    Text("Total")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .allowsHitTesting(false)
            }
        }
        .accessibilityLabel("Category distribution")
    }

    private func tooltip(for slice: CategoryDistributionSlice) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(slice.name)
                .font(.caption.weight(.semibold))
            Text(slice.amount, format: .currency(code: currencyCode))
                .font(.caption.monospacedDigit())
            Text(slice.amount / total, format: .percent.precision(.fractionLength(1)))
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(8)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))
        .overlay { RoundedRectangle(cornerRadius: 8).stroke(.separator) }
    }

    private func sliceID(at location: CGPoint, in size: CGSize) -> String? {
        guard total > 0 else { return nil }
        let center = CGPoint(x: size.width / 2, y: size.height / 2)
        let dx = location.x - center.x
        let dy = location.y - center.y
        let radius = hypot(dx, dy)
        let outerRadius = min(size.width, size.height) / 2
        guard radius <= outerRadius, radius >= outerRadius * 0.68 else { return nil }

        var angle = atan2(dx, -dy)
        if angle < 0 { angle += 2 * .pi }
        let value = angle / (2 * .pi) * total
        var cumulative = 0.0
        for slice in slices {
            cumulative += slice.amount
            if value <= cumulative { return slice.id }
        }
        return slices.last?.id
    }

    private func tooltipPosition(in size: CGSize) -> CGPoint {
        CGPoint(
            x: min(max(90, hoverLocation.x), max(90, size.width - 90)),
            y: min(max(34, hoverLocation.y - 42), max(34, size.height - 34))
        )
    }
}
