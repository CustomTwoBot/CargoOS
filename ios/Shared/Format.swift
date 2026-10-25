import Foundation

/// The three groups the UI shows (SPEC §8). Same mapping as the comment on
/// `Status` in lib/types.ts; a line the clerk dismissed counts as Cleared.
enum LineGroup: String, CaseIterable, Hashable {
    case toDispute = "To dispute"
    case waiting = "Waiting on answers"
    case cleared = "Cleared"

    init(_ finding: Finding) {
        self = finding.userVerdict == "false_positive" ? .cleared : LineGroup(status: finding.status)
    }

    init(status: FindingStatus) {
        switch status {
        case .potential_discrepancy, .invoice_noncompliance: self = .toDispute
        case .needs_review: self = .waiting
        case .supported, .outside_quote_scope: self = .cleared
        }
    }
}

/// Display totals summed from the engine's findings. The engine decides every
/// status and delta; this only adds them up for the At stake card (SPEC §6 table).
struct CaseTotals: Equatable {
    var billedCents = 0
    var agreedCents = 0
    var atStakeCents = 0
    var waitingCents = 0
    var counts: [LineGroup: Int] = [:]

    init(_ findings: [Finding]) {
        for f in findings {
            let group = LineGroup(f)
            billedCents += f.billedCents
            counts[group, default: 0] += 1
            switch f.status {
            case .needs_review: waitingCents += f.billedCents
            case .supported, .outside_quote_scope: agreedCents += f.billedCents
            case .potential_discrepancy, .invoice_noncompliance:
                agreedCents += f.expectedCents ?? f.billedCents
                if group == .toDispute { atStakeCents += f.deltaCents ?? 0 }
            }
        }
    }

    /// Live: money from the server's engine (`caseTotals`), only the group counts from the findings.
    init(_ findings: [Finding], billed: Int, agreed: Int, atStake: Int, waiting: Int) {
        for f in findings { counts[LineGroup(f), default: 0] += 1 }
        billedCents = billed
        agreedCents = agreed
        atStakeCents = atStake
        waitingCents = waiting
    }

    var countLine: String {
        let d = counts[.toDispute] ?? 0, w = counts[.waiting] ?? 0, c = counts[.cleared] ?? 0
        return "\(d) to dispute · \(w) waiting on answers · \(c) cleared"
    }
}

enum Money {
    private static let formatter: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.maximumFractionDigits = 0
        f.locale = Locale(identifier: "en_US")
        return f
    }()

    /// `480000` → `$4,800`. Whole dollars, as on the web (design §1 "Цифры").
    static func usd(_ cents: Int) -> String {
        let dollars = NSNumber(value: Double(abs(cents)) / 100)
        let text = formatter.string(from: dollars) ?? "0"
        return (cents < 0 ? "-$" : "$") + text
    }

    /// `30000` → `+$300`.
    static func delta(_ cents: Int) -> String {
        cents > 0 ? "+" + usd(cents) : usd(cents)
    }
}

enum ISODate {
    private static let withZone: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()
    // Convex's `new Date().toISOString()` carries milliseconds: 2026-10-25T09:35:12.345Z.
    private static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let dayOnly: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withFullDate]
        return f
    }()

    static func parse(_ s: String) -> Date? {
        withZone.date(from: s) ?? withFraction.date(from: s) ?? (s.count == 10 ? dayOnly.date(from: s) : nil)
    }

    static func string(_ date: Date) -> String {
        withZone.string(from: date)
    }

    /// "Sep 5", or "Today at 2:05 PM" for today.
    static func short(_ s: String?) -> String {
        guard let s, let date = parse(s) else { return "" }
        if Calendar.current.isDateInToday(date) {
            return "Today at " + date.formatted(date: .omitted, time: .shortened)
        }
        return date.formatted(.dateTime.month(.abbreviated).day())
    }
}

extension DocType {
    var label: String {
        switch self {
        case .quote: "Quote"
        case .email: "Email"
        case .chat: "Chat"
        case .proforma: "Proforma"
        case .freight_invoice: "Invoice"
        case .reply: "Your answer"
        case .other: "Other"
        }
    }

    var symbol: String {
        switch self {
        case .quote: "doc.text"
        case .email: "envelope"
        case .chat: "bubble.left.and.bubble.right"
        case .proforma: "doc.plaintext"
        case .freight_invoice: "doc.richtext"
        case .reply: "arrowshape.turn.up.left"
        case .other: "paperclip"
        }
    }

    /// Types the ops lead can pick when adding evidence.
    static let pickable: [DocType] = [.chat, .email, .quote, .freight_invoice, .other]
}
