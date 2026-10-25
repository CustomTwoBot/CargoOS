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

    func testThePhonesPersonDecidesItsRoles() {
        let store = makeStore()
        store.setPerson(People.sam)
        XCTAssertEqual(devicePersonId, "sam")
        XCTAssertEqual(deviceRoles, [.clerk, .ops_lead, .controller, .uploader])
        store.setPerson(People.leo)
        XCTAssertEqual(devicePersonId, "leo")
        XCTAssertTrue(store.person.isUploaderOnly)
        XCTAssertFalse(store.hasOpenQuestion, "Leo doesn't answer CargoOS")
        store.setPerson(People.sam)
    }
}

/// The redesign: pay / hold / ask, the answer's reading (M3), approval (P3) and the letter (L1).
@MainActor
final class RedesignFlowTests: XCTestCase {
    func makeStore(as person: Person = People.sam) -> CaseStore {
        let store = CaseStore(sharedInbox: SharedInbox(root: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)),
                              client: nil)
        store.setPerson(person)
        return store
    }

    override func tearDown() {
        DeviceSettings.person = People.sam
        super.tearDown()
    }

    func testPayHoldAskBeforeAndAfterTheAnswer() async {
        let store = makeStore()
        XCTAssertEqual([store.payCents, store.holdCents, store.askCents], [660_000, 30_000, 60_000])
        XCTAssertEqual(store.nextStep, .answer)
        await store.submitReply("approved the $200 congestion fee on WhatsApp, nobody agreed to $400 rush handling")
        XCTAssertEqual([store.payCents, store.holdCents, store.askCents], [680_000, 70_000, 0])
        XCTAssertEqual(store.movedKeys, ["chg_4", "chg_6"])
        XCTAssertEqual(store.nextStep, .request)
    }

    func testTheReplayReadingIsShownBeforeAnythingIsRechecked() {
        let store = makeStore()
        let readings = store.replayPreviewReadings
        XCTAssertEqual(readings.map(\.lineNo), [4, 6])
        XCTAssertEqual(readings.map(\.verdict), [.agreed, .notAgreed])
        XCTAssertEqual(readings.first?.quote, "approved the $200 congestion fee on WhatsApp")
        XCTAssertEqual(store.revision, 1, "reading doesn't recheck")
        XCTAssertTrue(store.answerReadings.isEmpty)
    }

    func testMayaAsksSamDecidesWithAReason() async {
        let maya = makeStore(as: People.maya)
        XCTAssertEqual(maya.nextStep, .waitingAnswer, "Maya doesn't answer CargoOS")
        maya.setPerson(People.sam)
        await maya.submitReply("x")
        maya.setPerson(People.maya)
        XCTAssertEqual(maya.nextStep, .request)
        await maya.requestApproval()
        XCTAssertEqual(maya.draft?.status, "pending_approval")
        XCTAssertEqual(maya.draft?.requestedBy, "maya")
        XCTAssertEqual(maya.nextStep, .waitingDecision)

        maya.setPerson(People.sam)
        XCTAssertEqual(maya.nextStep, .decide)
        await maya.reject(reason: "  ")
        XCTAssertEqual(maya.draft?.status, "pending_approval", "a reason is required")
        XCTAssertNotNil(maya.actionError)
        await maya.reject(reason: "They really did expedite it for us.")
        XCTAssertEqual(maya.draft?.status, "rejected")
        XCTAssertEqual(maya.draft?.rejectionReason, "They really did expedite it for us.")
        XCTAssertTrue(maya.history.contains { $0.what == "Rejected the dispute" })
    }

    func testWhoeverAskedCantApprove() async {
        let store = makeStore()
        await store.submitReply("x")
        await store.requestApproval()
        XCTAssertEqual(store.nextStep, .blockedSelf)
        await store.accept()
        XCTAssertEqual(store.draft?.status, "pending_approval")
        XCTAssertEqual(store.actionError, "You asked for this dispute, so another owner decides.")
        XCTAssertTrue(store.history.contains { $0.what.hasPrefix("Approval blocked") })
    }

    func testAcceptedLetterKeepsItsNumbersLocked() async throws {
        let store = makeStore(as: People.maya)
        store.setPerson(People.sam); await store.submitReply("x"); store.setPerson(People.maya)
        await store.requestApproval()
        store.setPerson(People.sam)
        await store.accept()
        XCTAssertEqual(store.nextStep, .writeLetter)
        let letter = try XCTUnwrap(store.letter)
        XCTAssertTrue(letter.body.contains("Thanks,\nSam"), "signed by the owner who writes it")
        XCTAssertEqual(CaseStore.lockedValues(letter.body), ["Line 1", "$4,800", "$4,500", "$300", "Line 6", "$400", "$400", "$400", "$700", "$6,800"])
        XCTAssertNotNil(store.saveLetter(letter.body.replacingOccurrences(of: "$700", with: "$500")))
        XCTAssertNil(store.saveLetter(letter.body.replacingOccurrences(of: "Hi Derek", with: "Hello Derek")))
        XCTAssertTrue(store.letter?.body.hasPrefix("Hello Derek") ?? false)
    }

    func testNotAnIssueClearsTheLine() async {
        let store = makeStore(as: People.maya)
        await store.setVerdict("chg_1", "false_positive")
        XCTAssertEqual(store.finding(key: "chg_1").map(LineGroup.init), .cleared)
        XCTAssertEqual(store.holdCents, 0)
    }

    func testTrackFollowsTheApproval() async {
        let store = makeStore()
        XCTAssertEqual(store.track.map(\.state), [.done, .current, .later, .later, .later])
        await store.submitReply("x")
        XCTAssertEqual(store.track[1].state, .done)
        XCTAssertEqual(store.track[2].state, .current)
    }
}
