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

struct LineRow: View {
    let finding: Finding
    let description: String

    var body: some View {
        let group = LineGroup(finding)
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text("\(finding.lineNo)")
                    .font(.footnote.monospacedDigit())
                    .foregroundStyle(Theme.ink3)
                    .frame(width: 18, alignment: .leading)
                Text(description)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(2)
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 2) {
                    Text(Money.usd(finding.billedCents))
                        .font(.subheadline.monospacedDigit())
                        .foregroundStyle(Theme.ink)
                    if group == .toDispute, let delta = finding.deltaCents {
                        Text(Money.delta(delta))
                            .font(.footnote.weight(.semibold).monospacedDigit())
                            .foregroundStyle(Theme.dispute)
                    }
                }
            }
            HStack(spacing: 8) {
                StatusTag(group: group, dismissed: finding.userVerdict == "false_positive")
                Text(reasonText(finding))
                    .font(.footnote)
                    .foregroundStyle(Theme.ink2)
            }
            .padding(.leading, 18)
            Text(finding.explanation)
                .font(.footnote)
                .foregroundStyle(Theme.ink2)
                .padding(.leading, 18)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 4)
    }
}

/// One big number and a three-part bar: matches, at stake, waiting (design §1 "Итоги").
struct AtStakeCard: View {
    let totals: CaseTotals
    let statusLine: String

    var body: some View {
        Card {
            HStack(alignment: .firstTextBaseline) {
                Text("At stake").font(.subheadline.weight(.medium)).foregroundStyle(Theme.ink2)
                Spacer()
                Text(statusLine).font(.footnote.weight(.medium)).foregroundStyle(Theme.ink3)
            }
            Text(Money.usd(totals.atStakeCents))
                .font(.system(size: 44, weight: .semibold).monospacedDigit())
                .foregroundStyle(totals.atStakeCents > 0 ? Theme.dispute : Theme.ink)
                .contentTransition(.numericText())
                .padding(.top, 2)
            StakeBar(totals: totals).padding(.top, 10)
            HStack(spacing: 14) {
                legend(Theme.lineStrong, "Matches", totals.agreedCents)
                legend(Theme.dispute, "At stake", totals.atStakeCents)
                legend(Theme.waitingFill, "Waiting", totals.waitingCents)
            }
            .padding(.top, 10)
            Text(totals.countLine)
                .font(.footnote)
                .foregroundStyle(Theme.ink2)
                .padding(.top, 10)
            Text("Checked before you pay.")
                .font(.footnote)
                .foregroundStyle(Theme.ink3)
                .padding(.top, 2)
        }
    }

    private func legend(_ color: Color, _ label: String, _ cents: Int) -> some View {
        HStack(spacing: 5) {
            RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 8, height: 8)
            Text("\(label) \(Money.usd(cents))").font(.caption.monospacedDigit()).foregroundStyle(Theme.ink2)
        }
    }
}

struct StakeBar: View {
    let totals: CaseTotals

    var body: some View {
        GeometryReader { geo in
            let total = max(totals.agreedCents + totals.atStakeCents + totals.waitingCents, 1)
            let w = geo.size.width
            HStack(spacing: 2) {
                Rectangle().fill(Theme.lineStrong)
                    .frame(width: w * CGFloat(totals.agreedCents) / CGFloat(total))
                if totals.atStakeCents > 0 {
                    Rectangle().fill(Theme.dispute)
                        .frame(width: max(w * CGFloat(totals.atStakeCents) / CGFloat(total), 4))
                }
                if totals.waitingCents > 0 {
                    Rectangle().fill(Theme.waitingFill)
                        .frame(width: max(w * CGFloat(totals.waitingCents) / CGFloat(total), 4))
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 4))
        }
        .frame(height: 10)
        .animation(.easeInOut(duration: 0.5), value: totals)
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
