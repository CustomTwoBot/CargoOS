import Foundation
import SwiftUI
import Observation

/// What this phone holds (SPEC §5.5): the roles of the person it is set to. Controls show only
/// for roles held; the server checks every mutation again by person.
var deviceRoles: Set<Role> { DeviceSettings.person.roles }

/// How CargoOS read one line of an answer (the M3 "Is this what you meant?" card).
struct LineReading: Identifiable, Hashable {
    enum Verdict: String { case agreed = "Agreed", notAgreed = "Not agreed", unsure = "Not sure" }
    let key: String
    let lineNo: Int
    let name: String
    let billedCents: Int
    let verdict: Verdict
    /// The words of the answer that led to it, verbatim.
    let quote: String?
    var id: String { key }
}

/// One step of the approval track (P3): who did it and when, or who does it next.
struct TrackStep: Identifiable, Hashable {
    enum State { case done, current, later, refused }
    let id: String
    let initial: String
    let who: String
    let title: String
    let detail: String
    let state: State
}

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
    /// Live: the seeded demo case, and the bill opened on this phone when it isn't that one.
    private(set) var demoCaseId: String?
    private(set) var selectedBillId: String?
    /// Live: every bill this phone knows (the demo case plus bills scanned from a laptop), newest data first.
    private(set) var billSummaries: [BillSummary] = []
    /// Live: the question we answered and are waiting on the agent and engine for.
    private var pendingQuestionId: String?
    // Replay state.
    private var replayAnswered = false
    private var replayRechecking = false
    private var replayReplyText = ""
    private var replayAnsweredAt: String?
    private var replayDraft: Draft?
    private var replayVerdicts: [String: String] = [:]
    private var replayEvents: [CaseEvent] = []
    /// The owner's edits of the message to the seller, by draft id. Kept on this phone.
    private(set) var letterEdits: [String: String] = [:]

    /// The person this phone is set to.
    private(set) var person: Person = DeviceSettings.person
    private(set) var onboarded: Bool = DeviceSettings.onboarded

    func setPerson(_ p: Person) {
        DeviceSettings.person = p
        person = p
        if isLive { Task { await refresh() } }   // the bills list reads differently for each person
    }

    func finishOnboarding(as p: Person) {
        setPerson(p)
        DeviceSettings.onboarded = true
        onboarded = true
    }

    func signOut() {
        DeviceSettings.onboarded = false
        onboarded = false
    }

    func clearError() { actionError = nil }

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

    /// Fetches the open bill (the demo case unless another bill was opened) and a summary of every
    /// bill this phone knows. Called on launch, by the poll loop and after every action.
    func refresh() async {
        guard let client else { return }
        do {
            let demo: String? = try await client.query("cases:getDemoCase")
            demoCaseId = demo
            guard let target = selectedBillId ?? demo else {
                snapshot = nil
                loadError = "No case on the server yet. Ask the team to run resetDemo."
                connection = .online
                await refreshSummaries(current: nil)
                return
            }
            if caseId != target { pendingQuestionId = nil }
            caseId = target
            let view: CaseView? = try await client.query("cases:getCaseView", ["caseId": target])
            guard let view else {
                // The case was deleted (resetDemo makes a new demo case): fall back to the demo case.
                if selectedBillId == target { forgetBill(target) }
                caseId = nil
                snapshot = nil
                return
            }
            guard caseId == view.case.id else { return }   // another bill was opened meanwhile
            snapshot = CaseSnapshot(view)
            if view.case.id == demo { retargetReplayItems(to: view.case.id) }
            loadError = nil
            connection = .online
            settlePendingReply()
            await refreshSummaries(current: view)
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

    private var allQuestions: [Question] {
        (snapshot?.questions ?? []).sorted { $0.createdAt < $1.createdAt }
    }

    /// The open question, or the latest one answered. Everyone sees it; only its addressee answers.
    var question: Question? {
        allQuestions.last { $0.status == "open" } ?? allQuestions.last
    }

    /// An open question this person answers.
    var hasOpenQuestion: Bool {
        guard let q = question else { return false }
        return q.status == "open" && replyState != .rechecking && person.holds(q.to)
    }

    var canAnswer: Bool { question.map { person.holds($0.to) } ?? false }

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
        guard let q = question, person.holds(q.to), !trimmed.isEmpty, replyState == .open else { return }
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
        letterEdits = [:]
        actionError = nil
        guard source == .replay else {
            Task { await resetLive() }
            return
        }
        replayAnswered = false
        replayReplyText = ""
        replayAnsweredAt = nil
        replayDraft = nil
        replayVerdicts = [:]
        replayEvents = []
        rebuildReplay()
    }

    /// Live: the presenter's reset (`seed:resetLiveDemo`), then the new case is looked up again.
    private func resetLive() async {
        guard let client else { return }
        struct Args: Encodable { let personId: String }
        do {
            let _: String = try await client.mutation("seed:resetLiveDemo", Args(personId: person.id))
            caseId = nil
            pendingQuestionId = nil
            await refresh()
        } catch {
            actionError = error.localizedDescription
        }
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
            .map { $0.with(verdict: replayVerdicts[$0.key]) }
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
            questions: [question], replies: replayAnswered ? [f.reply] : [], draft: replayDraft,
            events: events + replayEvents
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

// MARK: - The redesign: pay / hold / ask, the answer's reading, approval, the letter

extension Finding {
    /// The same finding with the clerk's verdict set (replay keeps verdicts on the phone).
    func with(verdict: String?) -> Finding {
        guard let verdict else { return self }
        var f = Finding(key: key, caseId: caseId, chargeId: chargeId, lineNo: lineNo, revision: revision, status: status,
                        ruleId: ruleId, billedCents: billedCents, expectedCents: expectedCents, deltaCents: deltaCents,
                        factIds: factIds, evidence: evidence, missing: missing, routeTo: routeTo, explanation: explanation,
                        userVerdict: verdict, userVerdictBy: .clerk)
        f.learnedRuleId = learnedRuleId
        return f
    }
}

extension Draft {
    func with(status: String, requestedBy: String? = nil, approvedBy: String? = nil,
              rejectedBy: String? = nil, rejectionReason: String? = nil) -> Draft {
        Draft(id: id, caseId: caseId, to: to, subject: subject, body: body, findingKeys: findingKeys,
              totalDisputedCents: totalDisputedCents, status: status, createdBy: createdBy,
              requestedBy: requestedBy ?? self.requestedBy, approvedBy: approvedBy ?? self.approvedBy,
              rejectedBy: rejectedBy ?? self.rejectedBy, rejectionReason: rejectionReason ?? self.rejectionReason)
    }
}

extension CaseStore {
    // MARK: Pay / Hold / Ask

    /// What can safely be paid: everything that matches what was agreed. The engine's agreed total.
    var payCents: Int { totals.agreedCents }
    /// More than agreed: the engine's at-stake total.
    var holdCents: Int { totals.atStakeCents }
    /// Waiting for an answer.
    var askCents: Int { totals.waitingCents }

    var forwarder: String { caseInfo?.forwarder ?? "Pacific Crest Logistics" }

    var invoiceRef: String {
        let title = documents.first { $0.type == .freight_invoice }?.title ?? caseInfo?.shipmentRef ?? "Invoice"
        return title.replacingOccurrences(of: "Invoice ", with: "")
    }

    /// Lines in one money group, in invoice order.
    func lines(_ group: LineGroup) -> [Finding] { findings(in: group) }

    func name(of f: Finding) -> String { charge(for: f)?.description ?? "Line \(f.lineNo)" }

    /// The moves of the latest recheck, by finding key: where the line came from.
    var movedKeys: Set<String> {
        Set((snapshot?.changes ?? []).filter { c in
            guard let from = c.from else { return false }
            return LineGroup(status: from.status) != LineGroup(status: c.to.status)
        }.map(\.key))
    }

    // MARK: The answer's reading (M3)

    private func readings(from facts: [Fact], answer: String) -> [LineReading] {
        questionFindings.map { f in
            let type = charge(for: f)?.chargeType
            let fact = facts.first { $0.chargeType == type && ($0.kind == "approval" || $0.kind == "rejection") }
            let verdict: LineReading.Verdict = fact?.kind == "approval" ? .agreed : fact?.kind == "rejection" ? .notAgreed : .unsure
            return LineReading(key: f.key, lineNo: f.lineNo, name: name(of: f), billedCents: f.billedCents,
                               verdict: verdict, quote: fact?.span.quote)
        }
    }

    /// Replay: how CargoOS reads the recorded answer, shown before anything is rechecked.
    var replayPreviewReadings: [LineReading] {
        guard source == .replay, let f = fixture else { return [] }
        return readings(from: f.facts.filter { $0.origin == "reply" }, answer: f.reply.docId)
    }

    /// After an answer: how CargoOS read it, line by line (facts from the reply).
    var answerReadings: [LineReading] {
        guard replyState == .answered, let s = snapshot else { return [] }
        if source == .replay { return replayAnswered ? readings(from: s.facts.filter { $0.origin == "reply" }, answer: "") : [] }
        guard let reply = answerReply else { return [] }
        let ids = Set(reply.factIds)
        return readings(from: s.facts.filter { ids.contains($0.id) }, answer: reply.docId)
    }

    // MARK: Approval (P3)

    var canRequest: Bool { person.holds(.clerk) && holdCents > 0 && replyState != .rechecking }

    /// Why this person can't accept or reject the pending draft, or nil when they can (CLAUDE.md rule 8).
    var decisionBlockedReason: String? {
        guard let d = draft, d.status == "pending_approval" else { return nil }
        if !person.holds(.controller) { return "Only \(People.owner.first) can accept or reject a dispute." }
        if d.requestedBy == person.id { return "You asked for this dispute, so another owner decides." }
        return nil
    }

    private func replayEvent(_ type: String, actor: String) {
        let e = CaseEvent(id: "local_\(replayEvents.count + 1)", caseId: caseInfo?.id ?? "", at: ISODate.string(Date()),
                          actor: actor, type: type)
        replayEvents.append(e)
    }

    struct Decision: Decodable { let ok: Bool; let reason: String? }

    func requestApproval() async {
        guard canRequest else { return }
        actionError = nil
        switch source {
        case .replay:
            guard let base = fixture?.draft else { return }
            replayDraft = base.with(status: "pending_approval", requestedBy: person.id)
            replayEvent("approval_requested", actor: "clerk")
            rebuildReplay()
        case .live:
            guard let client, let caseId else { return }
            struct Args: Encodable { let caseId: String; let personId: String }
            do {
                let _: String = try await client.mutation("drafts:requestApproval", Args(caseId: caseId, personId: person.id))
                await refresh()
            } catch { actionError = error.localizedDescription }
        }
    }

    func accept() async { await decide(approve: true, reason: nil) }

    func reject(reason: String) async {
        let why = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !why.isEmpty else { actionError = "A reason is required to reject."; return }
        await decide(approve: false, reason: why)
    }

    /// Tries to decide; a blocked attempt is refused and logged, as the server does.
    func decide(approve: Bool, reason: String?) async {
        guard let d = draft, d.status == "pending_approval" else { return }
        actionError = nil
        switch source {
        case .replay:
            if let blocked = decisionBlockedReason {
                replayEvent("approval_blocked", actor: "system")
                actionError = blocked
                rebuildReplay()
                return
            }
            replayDraft = approve
                ? d.with(status: "approved", approvedBy: person.id)
                : d.with(status: "rejected", rejectedBy: person.id, rejectionReason: reason)
            replayEvent(approve ? "approved" : "draft_rejected", actor: "controller")
            rebuildReplay()
        case .live:
            guard let client else { return }
            do {
                let result: Decision
                if approve {
                    struct Args: Encodable { let draftId: String; let personId: String }
                    result = try await client.mutation("drafts:approveDraft", Args(draftId: d.id, personId: person.id))
                } else {
                    struct Args: Encodable { let draftId: String; let personId: String; let reason: String }
                    result = try await client.mutation("drafts:rejectDraft", Args(draftId: d.id, personId: person.id, reason: reason ?? ""))
                }
                if !result.ok { actionError = result.reason ?? "Not allowed." }
                await refresh()
            } catch { actionError = error.localizedDescription }
        }
    }

    /// Keep in dispute (confirmed) or Not an issue (false_positive), as the clerk.
    func setVerdict(_ key: String, _ verdict: String) async {
        guard person.holds(.clerk) else { return }
        switch source {
        case .replay:
            replayVerdicts[key] = verdict
            replayEvent(verdict == "confirmed" ? "finding_confirmed" : "finding_dismissed", actor: "clerk")
            rebuildReplay()
        case .live:
            guard let client, let caseId else { return }
            struct Args: Encodable { let role = "clerk"; let personId: String; let caseId: String; let key: String }
            do {
                let _: String? = try await client.mutation(
                    verdict == "confirmed" ? "pipeline:confirmFinding" : "pipeline:dismissFinding",
                    Args(personId: person.id, caseId: caseId, key: key))
                await refresh()
            } catch { actionError = error.localizedDescription }
        }
    }

    /// The approval track: checked → answered → asked to approve → decided → message.
    var track: [TrackStep] {
        guard let s = snapshot else { return [] }
        func at(_ type: String) -> String? { s.events.last { $0.type == type }?.at }
        let owner = People.owner
        let answered = replyState == .answered
        let d = s.draft
        let requester = People.byId(d?.requestedBy)
        var steps = [
            TrackStep(id: "checked", initial: "C", who: "CargoOS", title: "Checked \(charges.count) lines",
                      detail: ISODate.short(at("recomputed")), state: at("recomputed") == nil ? .current : .done),
            TrackStep(id: "answered", initial: owner.initial, who: owner.first,
                      title: answered ? "Answered" : "Answer CargoOS",
                      detail: answered ? ISODate.short(answeredAt) : "waiting", state: answered ? .done : (question == nil ? .done : .current)),
        ]
        let requested = d != nil
        steps.append(TrackStep(id: "requested", initial: requester?.initial ?? "M", who: requester?.first ?? "Maya",
                               title: requested ? "Asked to approve" : "Ask to approve",
                               detail: requested ? Money.usd(d!.totalDisputedCents) : "bookkeeper",
                               state: requested ? .done : (answered && holdCents > 0 ? .current : .later)))
        switch d?.status {
        case "approved":
            steps.append(TrackStep(id: "decided", initial: owner.initial, who: owner.first, title: "Accepted", detail: ISODate.short(at("approved")), state: .done))
            steps.append(TrackStep(id: "message", initial: owner.initial, who: owner.first, title: "Write to seller", detail: "nothing is sent", state: .current))
        case "rejected":
            steps.append(TrackStep(id: "decided", initial: owner.initial, who: owner.first, title: "Rejected", detail: "back to \(requester?.first ?? "Maya")", state: .refused))
            steps.append(TrackStep(id: "message", initial: owner.initial, who: owner.first, title: "Write to seller", detail: "nothing is sent", state: .later))
        case "pending_approval":
            let self_ = d?.requestedBy == owner.id
            steps.append(TrackStep(id: "decided", initial: self_ ? "?" : owner.initial, who: self_ ? "Another owner" : owner.first,
                                   title: "Accept or reject", detail: self_ ? "not the one who asked" : "reason to reject", state: .current))
            steps.append(TrackStep(id: "message", initial: owner.initial, who: owner.first, title: "Write to seller", detail: "nothing is sent", state: .later))
        default:
            steps.append(TrackStep(id: "decided", initial: owner.initial, who: owner.first, title: "Accept or reject", detail: "owner", state: .later))
            steps.append(TrackStep(id: "message", initial: owner.initial, who: owner.first, title: "Write to seller", detail: "nothing is sent", state: .later))
        }
        return steps
    }

    // MARK: The letter (L1)

    /// The message to the seller once accepted: the owner's edit, or CargoOS's draft signed by this person.
    var letter: (subject: String, body: String)? {
        guard let d = draft, d.status == "approved" else { return nil }
        if d.body.isEmpty { return nil }   // live: CargoOS is still writing it
        return (d.subject, letterEdits[d.id] ?? Self.signed(d.body, by: person.first))
    }

    var letterBeingWritten: Bool { draft?.status == "approved" && (draft?.body.isEmpty ?? true) }

    func saveLetter(_ body: String) -> String? {
        guard let d = draft, let original = letter?.body else { return nil }
        if Self.lockedValues(body) != Self.lockedValues(original) {
            return "Numbers come from the checked bill and can't be changed. Edit only the words."
        }
        letterEdits[d.id] = body
        return nil
    }

    func restoreLetter() {
        guard let d = draft else { return }
        letterEdits[d.id] = nil
    }

    /// Amounts and line numbers, in order. An edit must leave this list unchanged.
    static func lockedValues(_ text: String) -> [String] {
        let pattern = #"[+−-]?\$\d[\d,]*(?:\.\d{2})?|\b[Ll]ines? \d+\b"#
        guard let re = try? NSRegularExpression(pattern: pattern) else { return [] }
        let ns = text as NSString
        return re.matches(in: text, range: NSRange(location: 0, length: ns.length)).map { ns.substring(with: $0.range) }
    }

    /// The line after the sign-off ("Thanks,") becomes the name.
    static func signed(_ body: String, by name: String) -> String {
        var lines = body.components(separatedBy: "\n")
        let signOff = #"^(thanks|thank you|best|regards|kind regards|best regards|cheers)[,.!]?$"#
        guard let i = lines.lastIndex(where: { $0.trimmingCharacters(in: .whitespaces).range(of: signOff, options: [.regularExpression, .caseInsensitive]) != nil }),
              i + 1 < lines.count, !lines[i + 1].trimmingCharacters(in: .whitespaces).isEmpty else { return body }
        lines[i + 1] = name
        return lines.joined(separator: "\n")
    }
}

// MARK: - The next step for this person (one card on the bill, one word in the list)

enum NextStep: Equatable {
    case reading, rechecking, answer, waitingAnswer, request, waitingDecision, decide, blockedSelf,
         writeLetter, accepted, rejected, allClear
}

extension CaseStore {
    var nextStep: NextStep {
        if findings.isEmpty { return .reading }
        if replyState == .rechecking { return .rechecking }
        if let q = question, q.status == "open" { return person.holds(q.to) ? .answer : .waitingAnswer }
        if let d = draft {
            switch d.status {
            case "pending_approval":
                if decisionBlockedReason == nil { return .decide }
                return d.requestedBy == person.id && person.holds(.controller) ? .blockedSelf : .waitingDecision
            case "approved": return person.holds(.controller) ? .writeLetter : .accepted
            case "rejected": return .rejected
            default: break
            }
        }
        if holdCents > 0 && person.holds(.clerk) { return .request }
        return .allClear
    }

    /// Bills waiting on this person: the open bill by its next step, the others by their summaries.
    var needsMeCount: Int {
        bills.filter { $0.id != openBillId && $0.needsMe }.count + openBillNeedsMe
    }

    private var openBillNeedsMe: Int {
        switch nextStep {
        case .answer, .decide, .request, .writeLetter: return 1
        case .rejected: return person.holds(.clerk) && draft?.requestedBy == person.id ? 1 : 0
        default: return 0
        }
    }

    var nextStepLabel: String {
        switch nextStep {
        case .reading: return "Reading documents"
        case .rechecking: return "Rechecking"
        case .answer: return "Answer 1 question"
        case .waitingAnswer: return "Waiting for \(People.owner.first)'s answer"
        case .request: return "Ready to dispute · \(Money.usd(holdCents))"
        case .waitingDecision: return "Waiting for \(People.owner.first)"
        case .decide: return "\(People.byId(draft?.requestedBy)?.first ?? "Maya") asks you to approve"
        case .blockedSelf: return "Another owner decides"
        case .writeLetter: return "Accepted · write to the seller"
        case .accepted: return "\(People.owner.first) accepted · pay \(Money.usd(payCents))"
        case .rejected: return "\(People.owner.first) rejected the dispute"
        case .allClear: return "Safe to pay in full"
        }
    }

    var nextStepAction: String {
        switch nextStep {
        case .answer: return "Answer"
        case .decide: return "Decide"
        case .request: return "Review"
        case .writeLetter: return "Write"
        default: return "Open"
        }
    }

    var nextStepColor: Color {
        switch nextStep {
        case .answer, .waitingAnswer: return Theme.ask
        case .request, .decide, .rejected: return Theme.hold
        case .writeLetter, .accepted, .allClear: return Theme.pay
        default: return Theme.ink3
        }
    }
}

// MARK: - Replay stages for rehearsals and screenshots (`-demoStage answered|requested|accepted|rejected`)

extension CaseStore {
    /// Jumps the replay to a point in the story. Replay only; the live case is never touched.
    func jumpToDemoStage(_ stage: String) {
        guard source == .replay, let f = fixture else { return }
        resetDemo()
        guard ["answered", "requested", "accepted", "rejected"].contains(stage) else { return }
        replayAnswered = true
        replayReplyText = f.documents.first { $0.type == .reply }?.text ?? ""
        replayAnsweredAt = ISODate.string(Date())
        if stage != "answered" {
            replayDraft = f.draft.with(status: "pending_approval", requestedBy: People.maya.id)
            replayEvent("approval_requested", actor: "clerk")
        }
        if stage == "accepted", let d = replayDraft {
            replayDraft = d.with(status: "approved", approvedBy: People.sam.id)
            replayEvent("approved", actor: "controller")
        }
        if stage == "rejected", let d = replayDraft {
            replayDraft = d.with(status: "rejected", rejectedBy: People.sam.id, rejectionReason: DecisionCard.demoReason)
            replayEvent("draft_rejected", actor: "controller")
        }
        rebuildReplay()
    }
}

// MARK: - Several bills: the demo case plus bills opened from a laptop's QR code

/// One row of the bills list, from the server's `getCaseView` (money is the engine's totals).
struct BillSummary: Identifiable, Hashable {
    let id: String
    let forwarder: String
    let invoiceRef: String
    let billedCents: Int
    let payCents: Int
    let holdCents: Int
    let askCents: Int
    let status: String
    let documents: Int
    let isDemo: Bool
    /// Something on this bill waits for the person this phone is set to.
    var needsMe = false
}

extension BillSummary {
    /// The row as `person` sees it: the same words as the open bill's next step.
    init(_ view: CaseView, isDemo: Bool, person: Person = DeviceSettings.person) {
        let invoice = view.documents.first { $0.type == .freight_invoice }?.title ?? view.case.shipmentRef
        let reading = view.documents.filter { $0.readStatus == "reading" }.count
        let owner = People.owner.first
        var status: String
        var needsMe = false
        if view.findings.isEmpty {
            status = reading > 0 ? "Reading \(reading) of \(view.documents.count) documents" : (view.documents.isEmpty ? "Waiting for documents" : "Checking…")
        } else if let q = view.questions.first(where: { $0.status == "open" }) {
            needsMe = person.holds(q.to)
            status = needsMe ? "Answer 1 question" : "Waiting for \(owner)'s answer"
        } else if let d = view.draft, d.status == "pending_approval" {
            needsMe = person.holds(.controller) && d.requestedBy != person.id
            status = needsMe ? "\(People.byId(d.requestedBy)?.first ?? "Maya") asks you to approve" : "Waiting for \(owner) · \(Money.usd(d.totalDisputedCents))"
        } else if view.draft?.status == "approved" {
            needsMe = person.holds(.controller)
            status = needsMe ? "Accepted · write to the seller" : "\(owner) accepted · pay \(Money.usd(view.totals.agreed))"
        } else if view.draft?.status == "rejected" {
            needsMe = person.holds(.clerk) && view.draft?.requestedBy == person.id
            status = "\(owner) rejected the dispute"
        } else if view.totals.atStake > 0 {
            needsMe = person.holds(.clerk)
            status = "Ready to dispute · \(Money.usd(view.totals.atStake))"
        } else {
            status = "Safe to pay in full"
        }
        if person.isUploaderOnly { needsMe = false; status = "\(view.documents.count) documents" }
        self.init(id: view.case.id, forwarder: view.case.forwarder ?? view.case.title,
                  invoiceRef: invoice.replacingOccurrences(of: "Invoice ", with: ""),
                  billedCents: view.totals.billed, payCents: view.totals.agreed, holdCents: view.totals.atStake,
                  askCents: view.totals.waiting, status: status, documents: view.documents.count, isDemo: isDemo,
                  needsMe: needsMe)
    }
}

extension DeviceSettings {
    private static let billsKey = "cargoos.bills"
    private static var store: UserDefaults { UserDefaults(suiteName: SharedInbox.appGroup) ?? .standard }

    /// Bills opened on this phone from a laptop's QR code, oldest first.
    static var billIds: [String] {
        get { store.stringArray(forKey: billsKey) ?? [] }
        set { store.set(newValue, forKey: billsKey) }
    }
}

extension CaseStore {
    /// The case id in what a laptop's QR code or link holds: `https://…/upload/<id>`, `…/bills/<id>`, or the bare id.
    static func caseId(fromScan raw: String) -> String? {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let isId = { (s: String) in s.count >= 16 && s.count <= 64 && s.allSatisfy { $0.isLetter || $0.isNumber || $0 == "_" } }
        if let url = URL(string: text), url.scheme != nil {
            let parts = url.pathComponents.filter { $0 != "/" }
            if let i = parts.firstIndex(where: { $0 == "upload" || $0 == "bills" }), i + 1 < parts.count, isId(parts[i + 1]) {
                return parts[i + 1]
            }
            return nil
        }
        return isId(text) ? text : nil
    }

    /// Every bill for the list: live, the server's summaries; replay, the one recorded bill.
    var bills: [BillSummary] {
        if isLive { return billSummaries }
        guard let s = snapshot else { return [] }
        let view = CaseView(case: s.caseInfo, documents: s.documents, facts: s.facts, charges: s.charges, findings: s.findings,
                            changes: s.changes, totals: .init(billed: s.totals.billedCents, agreed: s.totals.agreedCents,
                                                              atStake: s.totals.atStakeCents, waiting: s.totals.waitingCents, waived: 0),
                            questions: s.questions, replies: s.replies, draft: s.draft, events: s.events)
        return [BillSummary(view, isDemo: true, person: person)]
    }

    /// The id of the bill on screen.
    var openBillId: String? { caseInfo?.id }

    /// Opens a bill: the bill page then shows it, polled like the demo case.
    func open(_ id: String) async {
        guard isLive, id != caseInfo?.id else { return }
        selectedBillId = id == demoCaseId ? nil : id
        snapshot = nil
        caseId = nil
        await refresh()
    }

    /// Adds a bill from a laptop's QR code or link, if the server has it, and opens it.
    func addBill(fromScan raw: String) async -> String? {
        guard let client else { return "Scanning a bill needs the live server. This phone plays the recorded replay." }
        guard let id = Self.caseId(fromScan: raw) else { return "That isn't a CargoOS bill code. Scan the QR code on the bill's page." }
        do {
            let view: CaseView? = try await client.query("cases:getCaseView", ["caseId": id])
            guard view != nil else { return "No bill with that code on the server." }
        } catch {
            return error.localizedDescription
        }
        if id != demoCaseId && !DeviceSettings.billIds.contains(id) { DeviceSettings.billIds.append(id) }
        await open(id)
        return nil
    }

    func forgetBill(_ id: String) {
        DeviceSettings.billIds.removeAll { $0 == id }
        if selectedBillId == id { selectedBillId = nil }
        billSummaries.removeAll { $0.id == id }
    }

    /// Summaries of every known bill, and the list the share extension offers.
    func refreshSummaries(current: CaseView?) async {
        guard let client else { return }
        var ids: [String] = []
        for id in [demoCaseId].compactMap({ $0 }) + DeviceSettings.billIds where !ids.contains(id) { ids.append(id) }
        var out: [BillSummary] = []
        for id in ids {
            if let current, current.case.id == id {
                out.append(BillSummary(current, isDemo: id == demoCaseId, person: person))
            } else if let view: CaseView? = try? await client.query("cases:getCaseView", ["caseId": id]) {
                if let view { out.append(BillSummary(view, isDemo: id == demoCaseId, person: person)) }
                else if id != demoCaseId { DeviceSettings.billIds.removeAll { $0 == id } }
            } else if let old = billSummaries.first(where: { $0.id == id }) {
                out.append(old)   // offline: keep what we had
            }
        }
        billSummaries = out
        sharedInbox.saveCases(out.map { CaseRef(id: $0.id, title: "\($0.forwarder) · \($0.invoiceRef)", shipmentRef: $0.invoiceRef) })
    }

    // MARK: Learned rules (R10)

    func undoRule(_ ruleId: String) async {
        guard person.holds(.clerk), let client else { return }
        struct Args: Encodable { let ruleId: String; let personId: String }
        do {
            let _: String? = try await client.mutation("learnedRules:undoLearnedRule", Args(ruleId: ruleId, personId: person.id))
            await refresh()
        } catch { actionError = error.localizedDescription }
    }
}
