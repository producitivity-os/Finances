import XCTest
@testable import FinancesIOS

final class FinancesIOSTests: XCTestCase {
    func testLoanCanFlowInEitherDirection() {
        XCTAssertTrue(FinanceTransactionType.allowed(for: .inbound).contains(.loan))
        XCTAssertTrue(FinanceTransactionType.allowed(for: .outbound).contains(.loan))
    }
}
