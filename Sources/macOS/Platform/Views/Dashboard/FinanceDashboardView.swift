import SwiftData
import SwiftUI
import ProductivityUI

private enum ChartRange: String, CaseIterable, Identifiable {
    case week = "7D", month = "30D", quarter = "90D", year = "1Y", all = "All"
    var id: String { rawValue }
    var days: Int? { switch self { case .week: 7; case .month: 30; case .quarter: 90; case .year: 365; case .all: nil } }
}

struct FinanceDashboardView: View {
    @Environment(\.openWindow) private var openWindow
    @Query(sort: [SortDescriptor(\FinanceAccount.name)]) private var accounts: [FinanceAccount]
    @Query(sort: [SortDescriptor(\FinancialTransaction.occurredAt, order: .reverse)]) private var transactions: [FinancialTransaction]
    @Query private var preferences: [FinancePreferences]
    @State private var accountID: UUID?
    @State private var range = ChartRange.month
    @State private var expenditureRange = ChartDateRange.week

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
                        HStack { Spacer(); SwipeableSegmentPill(items: ChartDateRange.allCases, selection: $expenditureRange) { $0.rawValue } }
                        DynamicRangeBarChart(data: expenditureData, range: expenditureRange, barsColor: .red).frame(height: 190)
                    }
                    SavingsSourcesPieChart(savingsSources: accountSources, currencyCode: currency, title: "Account balances")
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
                default: openWindow(value: FinanceEditorRoute.transaction(UUID()))
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
                let isOutbound = transaction.direction == .outbound
                let background = isOutbound ? Color.red.opacity(0.15) : Color.green.opacity(0.15)
                let symbol = isOutbound ? "arrow.up.right" : "arrow.down.left"
                let signedAmount = isOutbound ? -transaction.amountMinor : transaction.amountMinor
                HStack {
                    Circle().fill(background).frame(width: 30, height: 30).overlay { Image(systemName: symbol) }
                    VStack(alignment: .leading) { Text(transaction.transactionDetail); Text(transaction.occurredAt, style: .date).font(.caption).foregroundStyle(.secondary) }
                    Spacer()
                    Text(FinanceFormat.currency(minor: signedAmount, code: transaction.currencyCode)).foregroundStyle(isOutbound ? Color.primary : Color.green)
                }.padding(.vertical, 3)
            }
        }
    }

    private var expenditureData: [DynamicBarChartData] {
        let calendar = Calendar.current
        let (start, monthly): (Date, Bool) = switch expenditureRange {
        case .week: (calendar.date(byAdding: .day, value: -6, to: calendar.startOfDay(for: .now)) ?? .now, false)
        case .halfYear: (calendar.date(byAdding: .month, value: -5, to: .now) ?? .now, true)
        case .year: (calendar.date(byAdding: .month, value: -11, to: .now) ?? .now, true)
        }
        return FinanceDashboardMetrics.expenditure(transactions: transactions, start: start, monthly: monthly)
            .map { DynamicBarChartData(date: $0.date, value: $0.value) }
    }

    private var accountSources: [SavingsSources] {
        activeAccounts.compactMap { account in
            let balance = Double(FinanceCalculator.accountBalance(account)) / 100
            let converted: Double?
            if account.currencyCode == currency { converted = balance }
            else if let rate = account.baseExchangeRate { converted = balance * rate }
            else { converted = nil }
            return converted.map {
                SavingsSources(title: account.name, description: account.type.title, amount: max(0, $0), color: Color(productivityHex: account.colorHex))
            }
        }
    }
}
