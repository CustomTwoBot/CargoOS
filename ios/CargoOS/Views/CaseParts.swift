import SwiftUI

/// Status shape from design §1: To dispute filled red, Waiting dashed, Cleared a green check.
struct StatusTag: View {
    let group: LineGroup
    var dismissed = false

    var body: some View {
        switch group {
        case .toDispute:
            Text("To dispute")
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 8).padding(.vertical, 3)
                .foregroundStyle(Theme.disputeInk)
                .background(Theme.dispute, in: Capsule())
        case .waiting:
            Text("Waiting")
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 8).padding(.vertical, 3)
                .foregroundStyle(Theme.waiting)
                .background(Theme.waitingTint, in: Capsule())
                .overlay(Capsule().stroke(Theme.waiting.opacity(0.6), style: StrokeStyle(lineWidth: 1, dash: [3, 2])))
        case .cleared:
            Label(dismissed ? "Dismissed by clerk" : "Cleared", systemImage: "checkmark")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Theme.cleared)
                .labelStyle(.titleAndIcon)
        }
    }
}

/// The plain-words reason from design §1 ("Язык"), with the rule code small beside it.
func reasonText(_ f: Finding) -> String {
    switch f.ruleId {
    case "R0_MATCH": "Matches what was agreed"
    case "R1_DUPLICATE": "Billed twice"
    case "R2_RATE_MISMATCH": "Higher than agreed"
    case "R3_MATH_CURRENCY": "Different currency"
    case "R4_PERMITTED_SURCHARGE": "Allowed by the quote"
    case "R5_EXCLUDED_SCOPE": "Outside the quote, billable"
    case "R6_NO_EVIDENCE": "No agreement found"
    case "R7_CONFLICT": "Sources disagree"
    case "R8_APPROVED": "You approved it"
    case "R9_REJECTED": "You said it was never agreed"
    default: f.ruleId
    }
}

/// A verbatim quote with the yellow marker, and where it came from.
struct QuoteBlock: View {
    let quote: String
    let source: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(quote)
                .font(.callout)
                .foregroundStyle(Theme.highlightInk)
                .padding(.horizontal, 6).padding(.vertical, 3)
                .background(Theme.highlight, in: RoundedRectangle(cornerRadius: 4))
                .fixedSize(horizontal: false, vertical: true)
            Text(source).font(.caption).foregroundStyle(Theme.ink3)
        }
    }
}

/// Document text with every cited quote highlighted. Quotes match exactly, or with
/// whitespace collapsed (the same rule extraction uses, CLAUDE.md #4).
struct HighlightedDocText: View {
    let text: String
    let quotes: [String]
    var focus: String?

    var body: some View {
        Text(attributed)
            .font(.system(.callout, design: .monospaced))
            .foregroundStyle(Theme.ink)
            .textSelection(.enabled)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var attributed: AttributedString {
        var a = AttributedString(text)
        for quote in quotes {
            guard let range = Self.range(of: quote, in: text),
                  let lower = AttributedString.Index(range.lowerBound, within: a),
                  let upper = AttributedString.Index(range.upperBound, within: a) else { continue }
            a[lower..<upper].backgroundColor = quote == focus ? Theme.highlight : Theme.highlight.opacity(0.45)
            a[lower..<upper].foregroundColor = Theme.highlightInk
        }
        return a
    }

    static func range(of quote: String, in text: String) -> Range<String.Index>? {
        if let exact = text.range(of: quote) { return exact }
        let words = quote.split(whereSeparator: \.isWhitespace).map { NSRegularExpression.escapedPattern(for: String($0)) }
        guard !words.isEmpty else { return nil }
        return text.range(of: words.joined(separator: #"\s+"#), options: .regularExpression)
    }
}

struct SectionTitle: View {
    let title: String
    var trailing: String?

    var body: some View {
        HStack {
            Text(title).font(.headline).foregroundStyle(Theme.ink)
            Spacer()
            if let trailing {
                Text(trailing).font(.subheadline.monospacedDigit()).foregroundStyle(Theme.ink3)
            }
        }
    }
}
