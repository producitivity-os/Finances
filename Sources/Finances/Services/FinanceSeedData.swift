import Foundation

struct SeedCategory: Sendable {
    let name: String
    let icon: String
    let color: String
}

enum FinanceSeedData {
    static let categories: [SeedCategory] = [
        .init(name: "Food & Dining", icon: "fork-knife", color: "#F2994A"),
        .init(name: "Groceries", icon: "shopping-basket", color: "#27AE60"),
        .init(name: "Housing", icon: "house", color: "#8E44AD"),
        .init(name: "Utilities", icon: "zap", color: "#F2C94C"),
        .init(name: "Transport", icon: "car", color: "#2D9CDB"),
        .init(name: "Travel", icon: "plane", color: "#56CCF2"),
        .init(name: "Healthcare", icon: "heart-pulse", color: "#EB5757"),
        .init(name: "Education", icon: "graduation-cap", color: "#9B51E0"),
        .init(name: "Subscriptions", icon: "repeat", color: "#6FCF97"),
        .init(name: "Entertainment", icon: "clapperboard", color: "#BB6BD9"),
        .init(name: "Shopping", icon: "shopping-bag", color: "#F2994A"),
        .init(name: "Insurance", icon: "shield-check", color: "#2F80ED"),
        .init(name: "Taxes", icon: "landmark", color: "#828282"),
        .init(name: "Fees", icon: "receipt", color: "#BDBDBD"),
        .init(name: "Gifts & Donations", icon: "gift", color: "#EB5757"),
        .init(name: "Salary", icon: "briefcase-business", color: "#219653"),
        .init(name: "Investments", icon: "chart-candlestick", color: "#2F80ED"),
        .init(name: "Loans", icon: "hand-coins", color: "#F2994A"),
        .init(name: "Transfers", icon: "arrow-left-right", color: "#56CCF2"),
        .init(name: "Other", icon: "circle-dollar-sign", color: "#828282")
    ]
}

