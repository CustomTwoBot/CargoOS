import XCTest
@testable import CargoOS

/// Expected values from SPEC §6 (totals) and §7.2 (Scenario A before / after the reply).
final class CaseTotalsTests: XCTestCase {
    var fixture: UIFixture!

    override func setUpWithError() throws {
        fixture = try UIFixture.load(from: Bundle(for: CaseStore.self))
    }

    func testRevisionOneTotals() throws {
        let totals = CaseTotals(try XCTUnwrap(fixture.findings["1"]))
        XCTAssertEqual(totals.billedCents, 750_000)
        XCTAssertEqual(totals.agreedCents, 660_000)
        XCTAssertEqual(totals.atStakeCents, 30_000)
        XCTAssertEqual(totals.waitingCents, 60_000)
        XCTAssertEqual(totals.countLine, "1 to dispute · 2 waiting on answers · 5 cleared")
    }

    func testRevisionTwoTotals() throws {
        let totals = CaseTotals(try XCTUnwrap(fixture.findings["2"]))
        XCTAssertEqual(totals.billedCents, 750_000)
        XCTAssertEqual(totals.agreedCents, 680_000)
        XCTAssertEqual(totals.atStakeCents, 70_000)
        XCTAssertEqual(totals.waitingCents, 0)
        XCTAssertEqual(totals.countLine, "2 to dispute · 0 waiting on answers · 6 cleared")
    }

    func testParsesServerTimestampsWithMilliseconds() {
        // Convex writes now() as toISOString(); reading only the day gave yesterday's date west of UTC.
        XCTAssertEqual(ISODate.parse("2026-10-25T09:35:12.345Z"), ISODate.parse("2026-10-25T09:35:12Z")!.addingTimeInterval(0.345))
        XCTAssertNotNil(ISODate.parse("2026-09-05T14:21:00-07:00"))
        XCTAssertNotNil(ISODate.parse("2026-09-30"))
        XCTAssertNil(ISODate.parse("2026-10-25Tgarbage"))
    }

    func testMoneyFormatting() {
        XCTAssertEqual(Money.usd(480_000), "$4,800")
        XCTAssertEqual(Money.usd(0), "$0")
        XCTAssertEqual(Money.delta(30_000), "+$300")
        XCTAssertEqual(Money.usd(-40_000), "-$400")
    }
}

@MainActor
final class CaseStoreTests: XCTestCase {
    func makeStore() -> CaseStore {
        CaseStore(sharedInbox: SharedInbox(root: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)),
                  client: nil)
    }

    func testStartsWithTheOpenQuestion() {
        let store = makeStore()
        XCTAssertNil(store.loadError)
        XCTAssertFalse(store.isLive)
        XCTAssertTrue(store.hasOpenQuestion)
        XCTAssertEqual(store.revision, 1)
        XCTAssertEqual(store.questionFindings.map(\.lineNo), [4, 6])
        XCTAssertTrue(store.changes.isEmpty)
        XCTAssertFalse(store.documents.contains { $0.type == .reply }, "the reply doesn't exist before the answer")
        XCTAssertEqual(store.checkedAgainstLine, "Invoice PCL-INV-1012, checked against Quote Q-PCL-0902, email, chat.")
        XCTAssertFalse(store.history.contains { $0.what.hasPrefix("You answered") })
    }

    func testAnsweringMovesLinesFourAndSix() async {
        let store = makeStore()
        await store.submitReply("approved the $200 congestion fee on WhatsApp, nobody agreed to $400 rush handling")
        XCTAssertEqual(store.replyState, .answered)
        XCTAssertEqual(store.revision, 2)
        XCTAssertEqual(store.changes.map(\.lineNo), [4, 6])
        XCTAssertEqual(store.finding(key: "chg_4").map(LineGroup.init), .cleared)
        XCTAssertEqual(store.finding(key: "chg_6").map(LineGroup.init), .toDispute)
        XCTAssertEqual(store.totals.atStakeCents, 70_000)
        XCTAssertTrue(store.checkedAgainstLine.hasSuffix("your answer."))
        XCTAssertTrue(store.history.contains { $0.what == "You answered the question" })
    }

    func testEmptyReplyIsIgnored() async {
        let store = makeStore()
        await store.submitReply("   ")
        XCTAssertEqual(store.replyState, .open)
    }

    func testEveryCitedQuoteIsInItsDocument() throws {
        // CLAUDE.md #4: a span's quote is an exact (whitespace-normalized) substring of its document.
        let fixture = try UIFixture.load(from: Bundle(for: CaseStore.self))
        let spans = fixture.findings.values.flatMap { $0.flatMap(\.evidence) } + fixture.question.citations
        for span in spans {
            let doc = try XCTUnwrap(fixture.documents.first { $0.id == span.docId })
            XCTAssertNotNil(HighlightedDocText.range(of: span.quote, in: doc.text), "\(span.quote) not in \(doc.id)")
        }
    }

    func testPhoneHoldsSamsOpsLeadAndUploaderRoles() {
        XCTAssertEqual(deviceRoles, [.ops_lead, .uploader])
        XCTAssertEqual(devicePersonId, "sam")
    }
}
