import SwiftUI

struct FinanceEditorHost: View {
    let route: FinanceEditorRoute
    var body: some View {
        switch route {
        case .account(let id): AccountEditorView(id: id)
        case .category(let id): CategoryEditorView(id: id)
        case .document(let id): DocumentEditorView(id: id)
        }
    }
}
