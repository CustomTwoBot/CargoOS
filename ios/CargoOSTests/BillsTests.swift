import XCTest
@testable import CargoOS

/// Several bills on the phone: the demo case plus bills opened from a laptop's QR code (`…/upload/<caseId>`).
@MainActor
final class BillsTests: XCTestCase {
    private let deployment = URL(string: "https://happy-otter-123.convex.cloud")!

    /// The recorded case view under another case id: a second bill on the same server.
    private func view(_ id: String) -> (Int, Data) {
        let (status, data) = StubConvex.recording("caseView.before")
        let text = String(decoding: data, as: UTF8.self).replacingOccurrences(of: "\"case_A\"", with: "\"\(id)\"")
        return (status, Data(text.utf8))
    }

    /// This device's real settings, put back after each test.
    private var savedBills: [String] = []
    private var savedPerson = People.sam

    override func setUp() {
        StubConvex.reset()
        savedBills = DeviceSettings.billIds
        savedPerson = DeviceSettings.person
        DeviceSettings.billIds = []
        DeviceSettings.person = People.sam
        StubConvex.handler = { [unowned self] call in
            switch call.path {
            case "cases:getDemoCase": return StubConvex.success("case_A")
            case "cases:getCaseView":
                let id = call.body["caseId"] as? String ?? ""
                if id == "case_A" { return StubConvex.recording("caseView.before") }
                if id == "kh7abc123def456ghi789jkl" { return self.view(id) }
                return StubConvex.success(NSNull())
            case "learnedRules:undoLearnedRule": return StubConvex.success(NSNull())
            case "pipeline:dismissFinding": return StubConvex.error("Uncaught ConvexError: This line is already cleared")
            default: return StubConvex.error("Could not find public function for '\(call.path)'")
            }
        }
    }

    override func tearDown() {
        DeviceSettings.billIds = savedBills
        DeviceSettings.person = savedPerson
        super.tearDown()
    }

    func makeStore() -> CaseStore {
        CaseStore(sharedInbox: SharedInbox(root: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)),
                  client: ConvexClient(deploymentURL: deployment, session: StubConvex.session()))
    }

    func testReadsTheCaseIdFromTheLaptopsQRCode() {
        XCTAssertEqual(CaseStore.caseId(fromScan: "https://cargo-os.vercel.app/upload/kh7abc123def456ghi789jkl"), "kh7abc123def456ghi789jkl")
        XCTAssertEqual(CaseStore.caseId(fromScan: " https://cargoos.app/bills/kh7abc123def456ghi789jkl/message "), "kh7abc123def456ghi789jkl")
        XCTAssertEqual(CaseStore.caseId(fromScan: "kh7abc123def456ghi789jkl"), "kh7abc123def456ghi789jkl")
        XCTAssertNil(CaseStore.caseId(fromScan: "https://example.com/menu"))
        XCTAssertNil(CaseStore.caseId(fromScan: "hello"))
    }

    func testTheDemoCaseIsTheFirstBill() async {
        let store = makeStore()
        await store.refresh()
        XCTAssertEqual(store.bills.map(\.id), ["case_A"])
        XCTAssertEqual(store.bills.first?.status, "Answer 1 question")
        XCTAssertEqual(store.bills.first?.needsMe, true)
        store.setPerson(People.maya)
        await store.refresh()
        XCTAssertEqual(store.bills.first?.status, "Waiting for Sam's answer")
        XCTAssertEqual(store.bills.first?.needsMe, false)
        XCTAssertEqual(store.bills.first?.payCents, 660_000)
    }

    func testScanningABillAddsItOpensItAndRemembersIt() async {
        let store = makeStore()
        await store.refresh()
        let error = await store.addBill(fromScan: "https://cargo-os.vercel.app/upload/kh7abc123def456ghi789jkl")
        XCTAssertNil(error)
        XCTAssertEqual(store.openBillId, "kh7abc123def456ghi789jkl")
        XCTAssertEqual(store.bills.map(\.id), ["case_A", "kh7abc123def456ghi789jkl"])
        XCTAssertEqual(DeviceSettings.billIds, ["kh7abc123def456ghi789jkl"])
        XCTAssertEqual(store.sharedInbox.cases().map(\.id), ["case_A", "kh7abc123def456ghi789jkl"], "the share extension can pick it")

        await store.open("case_A")
        XCTAssertEqual(store.openBillId, "case_A")
    }

    func testAnUnknownCodeIsRefusedWithAReason() async {
        let store = makeStore()
        await store.refresh()
        let missing = await store.addBill(fromScan: "https://cargo-os.vercel.app/upload/zzzzzzzzzzzzzzzzzzzzzzzz")
        XCTAssertEqual(missing, "No bill with that code on the server.")
        let notOurs = await store.addBill(fromScan: "https://example.com/menu")
        XCTAssertEqual(notOurs, "That isn't a CargoOS bill code. Scan the QR code on the bill's page.")
        XCTAssertEqual(store.bills.map(\.id), ["case_A"])
    }

    func testAServerRefusalIsShownNotSwallowed() async {
        let store = makeStore()
        await store.refresh()
        await store.setVerdict("chg_1", "false_positive")
        XCTAssertEqual(store.actionError, "This line is already cleared")
    }

    func testUndoingALearnedRuleCallsTheServerAsThePerson() async {
        let store = makeStore()
        await store.refresh()
        await store.undoRule("rule_1")
        let call = StubConvex.calls.first { $0.path == "learnedRules:undoLearnedRule" }
        XCTAssertEqual(call?.body["ruleId"] as? String, "rule_1")
        XCTAssertEqual(call?.body["personId"] as? String, "sam")
    }
}
