import Foundation
import Observation

/// What this phone holds (design §0, SPEC §5.5): Sam's ops-lead and uploader roles. It answers
/// CargoOS's questions and adds documents; it never agrees, disputes or approves.
let deviceRoles: Set<Role> = [.ops_lead, .uploader]

/// One case as the screens see it, whichever source it came from.
struct CaseSnapshot {
    var caseInfo: CaseInfo
    var documents: [SourceDoc]
    var facts: [Fact]
    var charges: [Charge]
    var findings: [Finding]
    var changes: [FindingChange]
    var totals: CaseTotals
    var questions: [Question]
    var replies: [Reply]
    var draft: Draft?
    var events: [CaseEvent]
}

/// The app's single source of case data.
///
/// **Live** when a Convex deployment is configured (`ServerConfig`): reads `cases:getDemoCase` and
/// `cases:getCaseView`, polls while the app is open, answers with `ai:submitReply`, and uploads
/// phone evidence (`Uploader`). Money and statuses come from the server's engine as they are.
///
/// **Replay** otherwise: plays Scenario A from `fixtures/scenarioA.ui.json`, labeled as replay.
@MainActor
@Observable
final class CaseStore {
    enum Source: Equatable { case live, replay }
    enum Connection: Equatable { case connecting, online, offline(String) }
    enum ReplyState: Equatable { case open, rechecking, answered }

    let source: Source
    private(set) var connection: Connection = .connecting
    private(set) var snapshot: CaseSnapshot?
    private(set) var loadError: String?
    private(set) var inbox: [SharedItem] = []
    private(set) var actionError: String?
    let sharedInbox: SharedInbox

    private let client: ConvexClient?
    private let fixture: UIFixture?
    private var caseId: String?
    /// Live: the question we answered and are waiting on the agent and engine for.
    private var pendingQuestionId: String?
    // Replay state.
    private var replayAnswered = false
    private var replayRechecking = false
    private var replayReplyText = ""
    private var replayAnsweredAt: String?

    init(sharedInbox: SharedInbox = SharedInbox(), client: ConvexClient? = ServerConfig.deploymentURL.map { ConvexClient(deploymentURL: $0) }) {
        self.sharedInbox = sharedInbox
        self.client = client
        self.source = client == nil ? .replay : .live
        self.fixture = try? UIFixture.load()
        if client == nil {
            if fixture == nil { loadError = "Couldn't load the demo case." }
            connection = .online
            rebuildReplay()
        }
        reloadInbox()
    }

    var isLive: Bool { source == .live }

    // MARK: - Live loading

    /// Fetches the case once. Called on launch, by the poll loop and after every action.
    func refresh() async {
        guard let client else { return }
        do {
            if caseId == nil {
                let id: String? = try await client.query("cases:getDemoCase")
                guard let id else {
                    snapshot = nil
                    loadError = "No case on the server yet. Ask the team to run resetDemo."
                    connection = .online
                    return
                }
                caseId = id
            }
            guard let caseId else { return }
            let view: CaseView? = try await client.query("cases:getCaseView", ["caseId": caseId])
            guard let view else {
                // The case was deleted (resetDemo makes a new one): look it up again next time.
                self.caseId = nil
                return
            }
            snapshot = CaseSnapshot(view)
            retargetReplayItems(to: view.case.id)
            loadError = nil
            connection = .online
            sharedInbox.saveCases([CaseRef(id: view.case.id, title: view.case.title, shipmentRef: view.case.shipmentRef)])
            settlePendingReply()
        } catch {
            connection = .offline(error.localizedDescription)
            if snapshot == nil { loadError = error.localizedDescription }
        }
    }

    /// Polls while the app is on screen: fast while CargoOS is reading an answer or a document.
    func pollWhileActive() async {
        guard isLive else { return }
        while !Task.isCancelled {
            await refresh()
            await syncUploads()
            let busy = pendingQuestionId != nil || documents.contains { $0.readStatus == "reading" }
            try? await Task.sleep(for: .seconds(busy ? 1 : 3))
        }
    }

    // MARK: - Case

    var caseInfo: CaseInfo? { snapshot?.caseInfo }
    var revision: Int { snapshot?.caseInfo.revision ?? 0 }
    var findings: [Finding] { snapshot?.findings ?? [] }
    var charges: [Charge] { snapshot?.charges ?? [] }
    var totals: CaseTotals { snapshot?.totals ?? CaseTotals([]) }
    var draft: Draft? { snapshot?.draft }

    func findings(in group: LineGroup) -> [Finding] {
        findings.filter { LineGroup($0) == group }
    }

    func charge(for finding: Finding) -> Charge? {
        charges.first { $0.id == finding.chargeId }
    }

    func document(_ id: String) -> SourceDoc? {
        snapshot?.documents.first { $0.id == id }
    }

    /// Documents in date order.
    var documents: [SourceDoc] {
        (snapshot?.documents ?? []).sorted { ($0.sentAt ?? "") < ($1.sentAt ?? "") }
    }

    var readingCount: Int { documents.filter { $0.readStatus == "reading" }.count }

    /// Every quote that cites a document, for highlighting inside it.
    func quotes(in docId: String) -> [String] {
        guard let s = snapshot else { return [] }
        let spans = s.findings.flatMap(\.evidence) + s.facts.map(\.span) + s.charges.map(\.span) + s.questions.flatMap(\.citations)
        var seen = Set<String>()
        return spans.filter { $0.docId == docId }.map(\.quote).filter { seen.insert($0).inserted }
    }

    /// "Invoice PCL-INV-1012, checked against Quote Q-PCL-0902, email, chat." (design §0)
    var checkedAgainstLine: String {
        guard let invoice = documents.first(where: { $0.type == .freight_invoice }) else {
            return documents.isEmpty ? "No documents yet." : "Waiting for the invoice."
        }
        let sources = documents.filter { $0.type != .freight_invoice }.map { doc -> String in
            switch doc.type {
            case .quote, .proforma: doc.title
            case .reply: "your answer"
            default: doc.type.label.lowercased()
            }
        }
        var seen = Set<String>()
        let unique = sources.filter { seen.insert($0).inserted }
        return unique.isEmpty ? "\(invoice.title)." : "\(invoice.title), checked against \(unique.joined(separator: ", "))."
    }

    var statusLine: String {
        if readingCount > 0 { return "Reading documents…" }
        if findings.isEmpty { return documents.isEmpty ? "No documents yet" : "Checking…" }
        switch replyState {
        case .open: return "Waiting for your answer"
        case .rechecking: return "Rechecking…"
        case .answered: return totals.atStakeCents > 0 ? "Ready to dispute" : "All clear"
        }
    }

    // MARK: - Question

    private var myQuestions: [Question] {
        (snapshot?.questions ?? []).filter { deviceRoles.contains($0.to) }.sorted { $0.createdAt < $1.createdAt }
    }

    /// The open question to this phone, or the latest one it answered.
    var question: Question? {
        myQuestions.last { $0.status == "open" } ?? myQuestions.last
    }

    var hasOpenQuestion: Bool { question?.status == "open" && replyState != .rechecking }

    var replyState: ReplyState {
        switch source {
        case .replay:
            return replayRechecking ? .rechecking : (replayAnswered ? .answered : .open)
        case .live:
            if pendingQuestionId != nil { return .rechecking }
            return question?.status == "open" ? .open : .answered
        }
    }

    var questionFindings: [Finding] {
        guard let q = question else { return [] }
        return q.findingKeys.compactMap { finding(key: $0) }
    }

    private var answerReply: Reply? {
        guard let q = question else { return nil }
        return snapshot?.replies.last { $0.questionId == q.id }
    }

    var replyText: String {
        if source == .replay { return replayReplyText }
        return answerReply.flatMap { document($0.docId)?.text } ?? ""
    }

    var answeredAt: String? {
        if source == .replay { return replayAnsweredAt }
        return answerReply.flatMap { document($0.docId)?.sentAt }
    }

    /// The agent's reading of the answer ("partial", "ambiguous", ...), live only.
    var interpretation: String? { answerReply?.interpretation }

    /// Changes caused by the answer: the latest recompute's changes that cite the reply's facts event.
    var changes: [FindingChange] {
        guard let s = snapshot, replyState == .answered else { return [] }
        if source == .replay { return s.changes }
        guard let q = question,
              let factsEvent = s.events.last(where: { $0.type == "facts_extracted" && $0.payload?.questionId == q.id })
        else { return [] }
        return s.changes.filter { $0.causedByEventId == factsEvent.id }
    }

    /// The recorded reply from the fixture, offered in replay as a starting point.
    var sampleReply: String? {
        guard source == .replay else { return nil }
        return fixture?.documents.first { $0.type == .reply }?.text
    }

    func finding(key: String) -> Finding? { findings.first { $0.key == key } }

    func submitReply(_ text: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard deviceRoles.contains(.ops_lead), !trimmed.isEmpty, replyState == .open, let q = question else { return }
        actionError = nil
        switch source {
        case .replay:
            replayReplyText = trimmed
            replayRechecking = true
            try? await Task.sleep(for: .seconds(1.6))
            replayAnsweredAt = ISODate.string(Date())
            replayRechecking = false
            replayAnswered = true
            rebuildReplay()
        case .live:
            guard let client else { return }
            struct Args: Encodable { let role: String; let personId: String; let questionId: String; let text: String }
            do {
                let _: String = try await client.mutation("ai:submitReply", Args(
                    role: Role.ops_lead.rawValue, personId: devicePersonId, questionId: q.id, text: trimmed))
                pendingQuestionId = q.id
                pendingSince = Date()
                await refresh()
            } catch {
                actionError = error.localizedDescription
            }
        }
    }

    private var pendingSince: Date?

    /// The answer is settled once the agent has read it and the engine has recomputed after that,
    /// or once a follow-up question replaced it. Gives up waiting after two minutes.
    private func settlePendingReply() {
        guard let pending = pendingQuestionId, let s = snapshot else { return }
        if let since = pendingSince, Date().timeIntervalSince(since) > 120 {
            pendingQuestionId = nil
            actionError = "CargoOS is taking longer than usual to read your answer. Pull to refresh."
            return
        }
        guard let q = s.questions.first(where: { $0.id == pending }), q.status != "open",
              let factsIndex = s.events.lastIndex(where: { $0.type == "facts_extracted" && $0.payload?.questionId == pending })
        else { return }
        let recomputedAfter = s.events[factsIndex...].contains { $0.type == "recomputed" }
        let followUp = s.questions.contains { $0.followupOf == pending }
        if recomputedAfter || followUp { pendingQuestionId = nil }
    }

    func resetDemo() {
        guard source == .replay else { return }
        replayAnswered = false
        replayReplyText = ""
        replayAnsweredAt = nil
        rebuildReplay()
    }

    // MARK: - History

    struct HistoryRow: Identifiable, Hashable {
        let id: String
        let at: String
        let who: String
        let what: String
    }

    var history: [HistoryRow] {
        guard let s = snapshot else { return [] }
        var rows = s.events.map { e in
            HistoryRow(id: e.id, at: e.at, who: Self.actorLabel(e.actor), what: describe(e))
        }
        rows += inbox.filter { $0.caseId == s.caseInfo.id && $0.status == .onPhone }.map { item in
            HistoryRow(id: item.id.uuidString, at: item.createdAt, who: "You · uploader",
                       what: "Added \(item.title) on this phone (not uploaded yet)")
        }
        return rows.sorted { $0.at > $1.at }
    }

    static func actorLabel(_ actor: String) -> String {
        switch actor {
        case "ops_lead": "You · ops lead"
        case "uploader": "You · uploader"
        case "clerk": "Clerk"
        case "controller": "Controller"
        case "agent": "CargoOS agent"
        default: "CargoOS rules"
        }
    }

    private func describe(_ e: CaseEvent) -> String {
        let docTitle = e.payload?.docId.flatMap { document($0)?.title }
        switch e.type {
        case "doc_added": return "Added \(docTitle ?? "a document")"
        case "document_uploaded": return "Uploaded \(docTitle ?? "a document")"
        case "facts_extracted":
            if e.payload?.questionId != nil { return "Read your answer (\(e.payload?.interpretation ?? "read"))" }
            return "Read \(docTitle ?? "a document") and found its terms"
        case "extraction_failed": return "Couldn't read \(docTitle ?? "part of a document")"
        case "recomputed": return "Checked \(charges.count) charges"
        case "question_asked": return "Asked you a question"
        case "reply_received": return "You answered the question"
        case "draft_created": return "Drafted a dispute to the forwarder"
        case "approval_requested": return "Asked the owner to approve the dispute"
        case "approved": return "Approved the dispute. Nothing was sent."
        case "approval_blocked": return "Approval blocked: not allowed for this person"
        case "draft_rejected": return "Rejected the dispute"
        case "finding_confirmed": return "Kept a line in dispute"
        case "finding_dismissed": return "Marked a line as not an issue"
        case "charge_edited": return "Edited an invoice line"
        case "rule_learned": return "Learned a rule for this forwarder"
        case "rule_undone": return "Undid a learned rule"
        default: return e.type.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    // MARK: - Evidence added on this phone

    func reloadInbox() {
        inbox = sharedInbox.items()
    }

    func add(_ draft: ImportDraft, caseId: String, note: String?) throws {
        try sharedInbox.add(draft, caseId: caseId, note: note)
        reloadInbox()
        Task { await syncUploads() }
    }

    func remove(_ item: SharedItem) {
        sharedInbox.remove(item)
        reloadInbox()
    }

    var pendingCount: Int { inbox.filter { $0.status == .onPhone }.count }

    private var syncing = false

    /// Live only: sends what's on the phone to the case.
    func syncUploads() async {
        guard let client, !syncing, inbox.contains(where: { $0.status == .onPhone }) else { return }
        syncing = true
        defer { syncing = false }
        await Uploader(client: client, inbox: sharedInbox).syncAll()
        reloadInbox()
        await refresh()
    }

    /// Evidence added while the app ran on the replay case points at the fixture's case id,
    /// which doesn't exist on the server: move it to the live case before it goes up.
    private func retargetReplayItems(to liveCaseId: String) {
        guard let replayId = fixture?.case.id, replayId != liveCaseId else { return }
        var changed = false
        for var item in sharedInbox.items() where item.status == .onPhone && item.caseId == replayId {
            item.caseId = liveCaseId
            item.uploadError = nil
            try? sharedInbox.save(item)
            changed = true
        }
        if changed { reloadInbox() }
    }

    /// The server's copy of an uploaded item, with its read status.
    func serverDocument(for item: SharedItem) -> SourceDoc? {
        item.docId.flatMap(document)
    }

    /// One line on where an item is: on the phone, sent, being read, read or not read.
    func statusText(for item: SharedItem) -> String {
        switch item.status {
        case .onPhone:
            if let error = item.uploadError { return error }
            return isLive ? "Sending to the case…" : "On this phone · not uploaded yet"
        case .uploaded:
            switch serverDocument(for: item)?.readStatus {
            case "reading": return "Sent · CargoOS is reading it"
            case "read": return "Sent · read by CargoOS"
            case "not_read": return "Sent · not read: \(serverDocument(for: item)?.readError ?? "unknown reason")"
            default: return "Sent to the case"
            }
        }
    }

    /// Tries one item again now.
    func retryUpload(_ item: SharedItem) async {
        guard let client else { return }
        _ = await Uploader(client: client, inbox: sharedInbox).upload(item)
        reloadInbox()
        await refresh()
    }

    // MARK: - Replay

    private func rebuildReplay() {
        guard let f = fixture else { return }
        let revision = replayAnswered ? 2 : 1
        let findings = (f.findings[String(revision)] ?? []).sorted { $0.lineNo < $1.lineNo }
        var caseInfo = f.case
        caseInfo.revision = revision
        var question = f.question
        question.status = replayAnswered ? "answered" : "open"
        let documents = replayAnswered ? f.documents : f.documents.filter { $0.type != .reply }
        // Before the answer, only what happened up to the question being asked.
        let events = replayAnswered ? f.events : f.events.filter { $0.at <= f.question.createdAt }
        snapshot = CaseSnapshot(
            caseInfo: caseInfo, documents: documents, facts: f.facts, charges: f.charges,
            findings: findings, changes: replayAnswered ? f.changes : [], totals: CaseTotals(findings),
            questions: [question], replies: replayAnswered ? [f.reply] : [], draft: replayAnswered ? f.draft : nil,
            events: events
        )
    }
}

extension CaseSnapshot {
    /// Totals are the engine's (`caseTotals` on the server); only the group counts are counted here.
    init(_ view: CaseView) {
        self.init(
            caseInfo: view.case, documents: view.documents, facts: view.facts, charges: view.charges,
            findings: view.findings.sorted { $0.lineNo < $1.lineNo }, changes: view.changes,
            totals: CaseTotals(view.findings, server: view.totals),
            questions: view.questions, replies: view.replies, draft: view.draft, events: view.events
        )
    }
}
