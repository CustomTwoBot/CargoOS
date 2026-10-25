import XCTest
@testable import CargoOS

/// A fake Convex deployment: answers by function path, records every request.
/// Responses are recordings in the shape `getCaseView` returns (CargoOSTests/Recordings).
final class StubConvex: URLProtocol {
    struct Call { let path: String; let url: URL; let body: [String: Any] }
    nonisolated(unsafe) static var handler: (Call) -> (Int, Data) = { _ in (500, Data()) }
    nonisolated(unsafe) static var calls: [Call] = []

    static func session() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubConvex.self]
        return URLSession(configuration: config)
    }

    static func reset() { calls = []; handler = { _ in (500, Data()) } }

    static func success(_ value: Any) -> (Int, Data) {
        (200, try! JSONSerialization.data(withJSONObject: ["status": "success", "value": value, "logLines": []]))
    }

    static func error(_ message: String) -> (Int, Data) {
        (400, try! JSONSerialization.data(withJSONObject: ["status": "error", "errorMessage": message, "logLines": []]))
    }

    static func recording(_ name: String) -> (Int, Data) {
        let url = Bundle(for: StubConvex.self).url(forResource: name, withExtension: "json")!
        return (200, try! Data(contentsOf: url))
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let data = request.httpBody ?? Self.read(request.httpBodyStream)
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        let call = Call(path: json["path"] as? String ?? request.url!.path, url: request.url!,
                        body: json["args"] as? [String: Any] ?? ["raw": data])
        Self.calls.append(call)
        let (status, body) = Self.handler(call)
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!,
                            cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}

    private static func read(_ stream: InputStream?) -> Data {
        guard let stream else { return Data() }
        stream.open(); defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let n = stream.read(&buffer, maxLength: buffer.count)
            if n <= 0 { break }
            data.append(buffer, count: n)
        }
        return data
    }
}

private let deployment = URL(string: "https://happy-otter-123.convex.cloud")!

final class ConvexClientTests: XCTestCase {
    var client: ConvexClient!

    override func setUp() {
        StubConvex.reset()
        client = ConvexClient(deploymentURL: deployment, session: StubConvex.session())
    }

    func testQuerySendsPathArgsAndFormat() async throws {
        StubConvex.handler = { _ in StubConvex.success("case_A") }
        let id: String? = try await client.query("cases:getDemoCase")
        XCTAssertEqual(id, "case_A")
        XCTAssertEqual(StubConvex.calls.first?.url.absoluteString, "https://happy-otter-123.convex.cloud/api/query")
        XCTAssertEqual(StubConvex.calls.first?.path, "cases:getDemoCase")
    }

    func testNullResultDecodesAsNil() async throws {
        StubConvex.handler = { _ in StubConvex.success(NSNull()) }
        let id: String? = try await client.query("cases:getDemoCase")
        XCTAssertNil(id)
    }

    func testMissingFunctionIsItsOwnError() async {
        StubConvex.handler = { _ in StubConvex.error("Could not find public function for 'uploads:addDocument'. Did you forget to run `npx convex dev`?") }
        do {
            let _: String = try await client.mutation("uploads:addDocument")
            XCTFail("should throw")
        } catch {
            XCTAssertEqual(error as? ConvexClient.Failure, .missingFunction("uploads:addDocument"))
        }
    }

    func testConvexErrorMessageIsKeptReadable() async {
        StubConvex.handler = { _ in StubConvex.error("[Request ID: 1a2b] Server Error\nUncaught ConvexError: This question is no longer open\n    at handler (../convex/ai.ts:210:5)") }
        do {
            let _: String = try await client.mutation("ai:submitReply")
            XCTFail("should throw")
        } catch {
            XCTAssertEqual(error.localizedDescription, "This question is no longer open")
        }
    }

    func testDecodesRecordedCaseView() async throws {
        StubConvex.handler = { _ in StubConvex.recording("caseView.before") }
        let view: CaseView? = try await client.query("cases:getCaseView", ["caseId": "case_A"])
        let v = try XCTUnwrap(view)
        XCTAssertEqual(v.findings.count, 8)
        XCTAssertEqual(v.totals.atStake, 30_000)
        XCTAssertEqual(v.questions.first?.status, "open")
        XCTAssertEqual(v.documents.first?.readStatus, "read")
        XCTAssertEqual(StubConvex.calls.first?.body["caseId"] as? String, "case_A")
    }
}

@MainActor
final class LiveCaseStoreTests: XCTestCase {
    var answered = false

    override func setUp() {
        StubConvex.reset()
        answered = false
        StubConvex.handler = { [unowned self] call in
            switch call.path {
            case "cases:getDemoCase": return StubConvex.success("case_A")
            case "cases:getCaseView": return StubConvex.recording(self.answered ? "caseView.after" : "caseView.before")
            case "ai:submitReply":
                self.answered = true
                return StubConvex.success("doc_reply_1")
            default: return StubConvex.error("Could not find public function for '\(call.path)'")
            }
        }
    }

    func makeStore() -> CaseStore {
        CaseStore(sharedInbox: SharedInbox(root: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)),
                  client: ConvexClient(deploymentURL: deployment, session: StubConvex.session()))
    }

    func testLoadsTheCaseWithServerTotals() async {
        let store = makeStore()
        XCTAssertTrue(store.isLive)
        await store.refresh()
        XCTAssertEqual(store.connection, .online)
        XCTAssertEqual(store.caseInfo?.shipmentRef, "PCL-INV-1012")
        XCTAssertEqual(store.totals.atStakeCents, 30_000)
        XCTAssertEqual(store.totals.countLine, "1 to dispute · 2 waiting on answers · 5 cleared")
        XCTAssertTrue(store.hasOpenQuestion)
        XCTAssertEqual(store.replyState, .open)
        XCTAssertEqual(store.questionFindings.map(\.lineNo), [4, 6])
    }

    func testAnswerGoesToSubmitReplyAsOpsLeadAndSettlesAfterRecompute() async throws {
        let store = makeStore()
        await store.refresh()
        await store.submitReply("approved the $200 congestion fee on WhatsApp, nobody agreed to $400 rush handling")

        let call = try XCTUnwrap(StubConvex.calls.first { $0.path == "ai:submitReply" })
        XCTAssertEqual(call.body["role"] as? String, "ops_lead")
        XCTAssertEqual(call.body["personId"] as? String, "sam")
        XCTAssertEqual(call.body["questionId"] as? String, "q_1")

        XCTAssertNil(store.actionError)
        XCTAssertEqual(store.replyState, .answered)
        XCTAssertEqual(store.changes.map(\.lineNo), [4, 6])
        XCTAssertEqual(store.totals.atStakeCents, 70_000)
        XCTAssertEqual(store.replyText, "approved the $200 congestion fee on WhatsApp, nobody agreed to $400 rush handling")
        XCTAssertEqual(store.interpretation, "partial")
        XCTAssertTrue(store.history.contains { $0.what == "You answered the question" })
    }

    func testServerRefusalIsShownAndNothingChanges() async {
        StubConvex.handler = { call in
            switch call.path {
            case "cases:getDemoCase": return StubConvex.success("case_A")
            case "cases:getCaseView": return StubConvex.recording("caseView.before")
            default: return StubConvex.error("Uncaught ConvexError: This question is no longer open")
            }
        }
        let store = makeStore()
        await store.refresh()
        await store.submitReply("yes")
        XCTAssertEqual(store.actionError, "This question is no longer open")
        XCTAssertEqual(store.replyState, .open)
    }

    func testNoCaseOnServerSaysSo() async {
        StubConvex.handler = { _ in StubConvex.success(NSNull()) }
        let store = makeStore()
        await store.refresh()
        XCTAssertNil(store.caseInfo)
        XCTAssertEqual(store.loadError, "No case on the server yet. Ask the team to run resetDemo.")
    }

    func testUnreachableServerIsOffline() async {
        StubConvex.handler = { _ in (502, Data("Bad gateway".utf8)) }
        let store = makeStore()
        await store.refresh()
        guard case .offline = store.connection else { return XCTFail("expected offline, got \(store.connection)") }
    }
}

final class UploaderTests: XCTestCase {
    var root: URL!
    var inbox: SharedInbox!

    override func setUp() {
        StubConvex.reset()
        root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        inbox = SharedInbox(root: root)
    }

    func uploader() -> Uploader {
        Uploader(client: ConvexClient(deploymentURL: deployment, session: StubConvex.session()), inbox: inbox)
    }

    func addFile(_ name: String, _ data: Data, type: DocType = .other, text: String = "") throws -> SharedItem {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathComponent(name)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url)
        let draft = ImportDraft(type: type, title: name, text: text, detail: "", sourceName: name, fileURL: url)
        return try inbox.add(draft, caseId: "case_A", note: nil)
    }

    func testPayloadRules() throws {
        let pdf = try addFile("invoice.pdf", Data("%PDF-1.4".utf8), type: .freight_invoice)
        XCTAssertEqual(Uploader.payload(for: pdf, original: inbox.originalURL(pdf)),
                       .file(data: Data("%PDF-1.4".utf8), contentType: "application/pdf", fileName: "invoice.pdf"))

        let zip = try addFile("WhatsApp Chat - Derek PCL.zip", Data([0x50, 0x4b]), type: .chat, text: "9/8/26, 9:12 AM - A: hi")
        XCTAssertEqual(Uploader.payload(for: zip, original: inbox.originalURL(zip)),
                       .file(data: Data("9/8/26, 9:12 AM - A: hi".utf8), contentType: "text/plain; charset=utf-8",
                             fileName: "WhatsApp Chat - Derek PCL.txt"), "a zip goes up as its chat text, named .txt")

        let pasted = try inbox.add(ImportReader.fromText("Ocean freight reduced to $4,500"), caseId: "case_A", note: nil)
        XCTAssertEqual(Uploader.payload(for: pasted, original: inbox.originalURL(pasted)), .pasted(text: "Ocean freight reduced to $4,500"))

        let numbers = try addFile("rates.numbers", Data([1]), type: .other)
        guard case .unsupported = Uploader.payload(for: numbers, original: inbox.originalURL(numbers)) else {
            return XCTFail("a file the server can't read and with no text is refused on the phone")
        }
    }

    func testStaysOnPhoneUntilServerHasUploads() async throws {
        StubConvex.handler = { call in StubConvex.error("Could not find public function for '\(call.path)'") }
        _ = try inbox.add(ImportReader.fromText("note"), caseId: "case_A", note: nil)
        let result = await uploader().syncAll()
        XCTAssertEqual(result.first?.status, .onPhone)
        XCTAssertEqual(result.first?.uploadError, "Waiting: the server can't take uploads yet. Goes up automatically later.")
        XCTAssertEqual(inbox.items().first?.status, .onPhone, "saved, so the next sync retries")
    }

    func testUploadsFileThenAddsDocumentAsSam() async throws {
        StubConvex.handler = { call in
            switch call.path {
            case "uploads:generateUploadUrl": return StubConvex.success("https://happy-otter-123.convex.cloud/api/storage/upload?token=abc")
            case "uploads:addDocument": return StubConvex.success("doc_new")
            default: // the storage POST
                return (200, try! JSONSerialization.data(withJSONObject: ["storageId": "kg2storage"]))
            }
        }
        let item = try addFile("invoice.pdf", Data("%PDF-1.4".utf8), type: .freight_invoice)
        let saved = await uploader().upload(item)

        XCTAssertEqual(saved.status, .uploaded)
        XCTAssertEqual(saved.docId, "doc_new")
        XCTAssertNil(saved.uploadError)
        XCTAssertEqual(StubConvex.calls.map(\.path), ["uploads:generateUploadUrl", "/api/storage/upload", "uploads:addDocument"])
        // Exactly the validators in convex/uploads.ts: extra keys would be rejected.
        XCTAssertEqual(StubConvex.calls[0].body as? [String: String], ["personId": "sam"])
        XCTAssertEqual(StubConvex.calls[2].body as? [String: String], [
            "caseId": "case_A", "personId": "sam", "storageId": "kg2storage", "fileName": "invoice.pdf", "docType": "freight_invoice",
        ])
    }

    func testPastedTextGoesToAddPastedText() async throws {
        StubConvex.handler = { _ in StubConvex.success("doc_pasted") }
        let item = try inbox.add(ImportReader.fromText("From: Derek <d@pcl.com>\nSubject: RE: rate\n\nOcean freight reduced to $4,500"),
                                 caseId: "case_A", note: nil)
        let saved = await uploader().upload(item)
        XCTAssertEqual(saved.status, .uploaded)
        XCTAssertEqual(StubConvex.calls.map(\.path), ["uploads:addPastedText"])
        let body = try XCTUnwrap(StubConvex.calls.first?.body as? [String: String])
        XCTAssertEqual(body["docType"], "email")
        XCTAssertEqual(body["title"], "Email: RE: rate")
        XCTAssertEqual(body["personId"], "sam")
        XCTAssertTrue(body["text"]?.contains("Ocean freight reduced to $4,500") == true)
    }

    func testRefusedUploadWaitsForManualRetry() async throws {
        StubConvex.handler = { _ in StubConvex.error("Uncaught ConvexError: Case not found") }
        _ = try inbox.add(ImportReader.fromText("note"), caseId: "case_gone", note: nil)
        let first = await uploader().syncAll()
        XCTAssertEqual(first.first?.uploadError, "Case not found")
        let again = await uploader().syncAll()
        XCTAssertTrue(again.isEmpty, "a refused item isn't retried on every poll")
    }
}

@MainActor
final class LiveRetargetTests: XCTestCase {
    func testEvidenceAddedInReplayMovesToTheLiveCase() async throws {
        StubConvex.reset()
        StubConvex.handler = { call in
            switch call.path {
            case "cases:getDemoCase": return StubConvex.success("case_A_live")
            case "cases:getCaseView":
                var (status, data) = StubConvex.recording("caseView.before")
                var json = try! JSONSerialization.jsonObject(with: data) as! [String: Any]
                var value = json["value"] as! [String: Any]
                var c = value["case"] as! [String: Any]
                c["_id"] = "case_A_live"; value["case"] = c; json["value"] = value
                data = try! JSONSerialization.data(withJSONObject: json)
                status = 200
                return (status, data)
            default: return StubConvex.error("Could not find public function for '\(call.path)'")
            }
        }
        let inbox = SharedInbox(root: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
        _ = try inbox.add(ImportReader.fromText("note"), caseId: "case_A", note: nil)
        let store = CaseStore(sharedInbox: inbox, client: ConvexClient(deploymentURL: URL(string: "https://x.convex.cloud")!, session: StubConvex.session()))
        await store.refresh()
        XCTAssertEqual(inbox.items().first?.caseId, "case_A_live")
    }
}

/// Responses recorded from the team's dev deployment (canny-pelican-982) on Oct 25: Scenario A after
/// `resetDemo` and one pasted note from the phone (before), then after answering Claude's question (after).
@MainActor
final class RecordedServerTests: XCTestCase {
    var answered = false

    override func setUp() {
        StubConvex.reset()
        answered = false
        StubConvex.handler = { [unowned self] call in
            switch call.path {
            case "cases:getDemoCase": return StubConvex.success("k57bbew538b6pjg5hjxdx2c4qh8gy4yb")
            case "cases:getCaseView": return StubConvex.recording(self.answered ? "server.caseView.after" : "server.caseView.before")
            case "ai:submitReply": self.answered = true; return StubConvex.success("reply_doc")
            default: return StubConvex.error("Could not find public function for '\(call.path)'")
            }
        }
    }

    func testRealServerJourney() async throws {
        let store = CaseStore(sharedInbox: SharedInbox(root: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)),
                              client: ConvexClient(deploymentURL: URL(string: "https://canny-pelican-982.convex.cloud")!, session: StubConvex.session()))
        await store.refresh()
        XCTAssertEqual(store.connection, .online)
        XCTAssertEqual(store.totals.atStakeCents, 30_000, "numbers arrive as 30000.0 and still decode as cents")
        XCTAssertEqual(store.totals.waitingCents, 60_000)
        XCTAssertEqual(store.replyState, .open)
        XCTAssertEqual(store.questionFindings.map(\.lineNo), [4, 6])
        let q = try XCTUnwrap(store.question)
        XCTAssertTrue(q.citations.allSatisfy { store.document($0.docId) != nil }, "every citation opens its document")

        await store.submitReply("approved the $200 congestion fee on WhatsApp, nobody agreed to $400 rush handling")
        XCTAssertNil(store.actionError)
        XCTAssertEqual(store.replyState, .answered)
        XCTAssertEqual(store.interpretation, "partial")
        XCTAssertEqual(store.changes.map(\.lineNo), [4, 6], "changes are matched to the reply's facts_extracted event")
        XCTAssertEqual(store.totals.atStakeCents, 70_000)
        XCTAssertEqual(store.finding(key: store.questionFindings[0].key)?.ruleId, "R8_APPROVED")
        XCTAssertEqual(store.finding(key: store.questionFindings[1].key)?.ruleId, "R9_REJECTED")
        XCTAssertNotNil(store.answeredAt.flatMap(ISODate.parse), "the reply's millisecond timestamp parses")
    }
}
