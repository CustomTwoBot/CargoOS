import Foundation

// Swift mirrors of lib/types.ts (the shared contract) and of what Convex returns for them
// (`_id` plus the fields; `_creationTime` is ignored). Read-only copies:
// change lib/types.ts first, after a team message, then follow here.
// Money is integer cents, dates are ISO 8601 strings, as on the web.

enum Role: String, Codable, Hashable {
    case clerk, controller, ops_lead, uploader
}

enum DocType: String, Codable, CaseIterable, Hashable {
    case quote, email, chat, proforma, freight_invoice, reply, other
}

enum FindingStatus: String, Codable, Hashable {
    case supported, outside_quote_scope, potential_discrepancy, invoice_noncompliance, needs_review
}

struct CaseInfo: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let shipmentRef: String
    let incoterm: String?
    let baseCurrency: String
    var revision: Int
    let status: String
    var forwarder: String? = nil

    enum CodingKeys: String, CodingKey {
        case id = "_id", title, shipmentRef, incoterm, baseCurrency, revision, status, forwarder
    }
}

struct SourceDoc: Codable, Identifiable, Hashable {
    let id: String
    let caseId: String
    let type: DocType
    let title: String
    let sender: String?
    let sentAt: String?
    let text: String
    let fileId: String?
    var textFrom: String? = nil       // "pdf" | "eml" | "txt" | "image" | "paste"
    var readStatus: String? = nil     // "reading" | "read" | "not_read"
    var readError: String? = nil

    enum CodingKeys: String, CodingKey {
        case id = "_id", caseId, type, title, sender, sentAt, text, fileId, textFrom, readStatus, readError
    }
}

struct SourceSpan: Codable, Hashable {
    let docId: String
    let locator: String
    let quote: String
}

struct Fact: Codable, Identifiable, Hashable {
    let id: String
    let caseId: String
    let kind: String
    let chargeType: String?
    let amountCents: Int?
    let currency: String?
    let validUntil: String?
    let effectiveAt: String
    let statedBy: String
    let span: SourceSpan
    let supersedes: [String]?
    let origin: String

    enum CodingKeys: String, CodingKey {
        case id = "_id", caseId, kind, chargeType, amountCents, currency, validUntil, effectiveAt, statedBy, span, supersedes, origin
    }
}

struct Charge: Codable, Identifiable, Hashable {
    let id: String
    let caseId: String
    let docId: String
    let lineNo: Int
    let billedBy: String
    let chargeType: String
    let description: String
    let amountCents: Int
    let currency: String
    let span: SourceSpan

    enum CodingKeys: String, CodingKey {
        case id = "_id", caseId, docId, lineNo, billedBy, chargeType, description, amountCents, currency, span
    }
}

struct Finding: Codable, Identifiable, Hashable {
    let key: String
    let caseId: String
    let chargeId: String
    let lineNo: Int
    let revision: Int
    let status: FindingStatus
    let ruleId: String
    let billedCents: Int
    let expectedCents: Int?
    let deltaCents: Int?
    let factIds: [String]
    let evidence: [SourceSpan]
    let missing: [String]?
    let routeTo: String?
    let explanation: String
    let userVerdict: String?
    let userVerdictBy: Role?
    var learnedRuleId: String? = nil

    var id: String { key }
}

struct StatusDelta: Codable, Hashable {
    let status: FindingStatus
    let deltaCents: Int?
}

struct FindingChange: Codable, Hashable, Identifiable {
    let key: String
    let lineNo: Int
    let from: StatusDelta?
    let to: StatusDelta
    let causedByEventId: String
    let causedByFactIds: [String]

    var id: String { key }
}

struct Question: Codable, Identifiable, Hashable {
    let id: String
    let caseId: String
    let to: Role
    let findingKeys: [String]
    let text: String
    let citations: [SourceSpan]
    let followupOf: String?
    var status: String       // "open" | "answered" | "closed_unresolved"
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id = "_id", caseId, to, findingKeys, text, citations, followupOf, status, createdAt
    }
}

struct Reply: Codable, Identifiable, Hashable {
    let id: String
    let caseId: String
    let questionId: String
    let from: Role
    let docId: String
    let interpretation: String
    let factIds: [String]

    enum CodingKeys: String, CodingKey {
        case id = "_id", caseId, questionId, from, docId, interpretation, factIds
    }
}

struct Draft: Codable, Identifiable, Hashable {
    let id: String
    let caseId: String
    let to: String
    let subject: String
    let body: String
    let findingKeys: [String]
    let totalDisputedCents: Int
    let status: String
    let createdBy: Role
    var requestedBy: String? = nil   // person ids (lib/people.ts)
    var approvedBy: String? = nil
    var rejectedBy: String? = nil
    var rejectionReason: String? = nil

    enum CodingKeys: String, CodingKey {
        case id = "_id", caseId, to, subject, body, findingKeys, totalDisputedCents, status, createdBy,
             requestedBy, approvedBy, rejectedBy, rejectionReason
    }
}

struct CaseEvent: Codable, Identifiable, Hashable {
    let id: String
    let caseId: String
    let at: String
    let actor: String
    let type: String
    var payload: EventPayload? = nil

    enum CodingKeys: String, CodingKey {
        case id = "_id", caseId, at, actor, type, payload
    }
}

/// The few payload keys the phone reads. Payloads are free-form (`Record<string, unknown>`),
/// so each key is read only if it is a string and ignored otherwise.
struct EventPayload: Codable, Hashable {
    var docId: String?
    var questionId: String?
    var replyId: String?
    var interpretation: String?
    var questionStatus: String?
    var stage: String?
    var error: String?

    private enum Keys: String, CodingKey, CaseIterable {
        case docId, questionId, replyId, interpretation, questionStatus, stage, error
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        func str(_ k: Keys) -> String? { (try? c.decodeIfPresent(String.self, forKey: k)) ?? nil }
        docId = str(.docId); questionId = str(.questionId); replyId = str(.replyId)
        interpretation = str(.interpretation); questionStatus = str(.questionStatus)
        stage = str(.stage); error = str(.error)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encodeIfPresent(docId, forKey: .docId)
        try c.encodeIfPresent(questionId, forKey: .questionId)
        try c.encodeIfPresent(replyId, forKey: .replyId)
        try c.encodeIfPresent(interpretation, forKey: .interpretation)
        try c.encodeIfPresent(questionStatus, forKey: .questionStatus)
        try c.encodeIfPresent(stage, forKey: .stage)
        try c.encodeIfPresent(error, forKey: .error)
    }
}

/// `fixtures/scenarioA.ui.json`: the full case with findings revisions 1 (before the
/// ops lead's answer) and 2 (after it). The same file the web UI builds against.
struct UIFixture: Codable {
    let `case`: CaseInfo
    let documents: [SourceDoc]
    let facts: [Fact]
    let charges: [Charge]
    let findings: [String: [Finding]]
    let changes: [FindingChange]
    let question: Question
    let reply: Reply
    let draft: Draft
    let events: [CaseEvent]

    static func load(from bundle: Bundle = .main) throws -> UIFixture {
        guard let url = bundle.url(forResource: "scenarioA.ui", withExtension: "json") else {
            throw CocoaError(.fileNoSuchFile)
        }
        return try JSONDecoder().decode(UIFixture.self, from: Data(contentsOf: url))
    }
}
