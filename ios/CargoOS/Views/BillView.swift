import SwiftUI

/// One bill (docs/design.md §0.5): how much can safely be paid, the approval track, the one card
/// that needs this person, then every line grouped Hold / Ask / Pay. Uploaders see documents only.
struct BillView: View {
    @Environment(CaseStore.self) private var store

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(store.forwarder).font(.title3.weight(.bold)).foregroundStyle(Theme.ink)
                    Text("\(store.invoiceRef) · \(Money.usd(store.totals.billedCents)) · checked against \(store.documents.filter { $0.type != .freight_invoice }.count) documents")
                        .font(.footnote).foregroundStyle(Theme.ink3)
                }
                ConnectionBanner()
                if store.caseInfo == nil {
                    BusyCard(text: "Opening the bill…")
                } else if store.person.isUploaderOnly {
                    UploaderBill()
                } else {
                    HeroCard()
                    TrackStrip()
                    NextStepCard()
                    if let error = store.actionError {
                        ErrorNote(text: error) { store.clearError() }
                    }
                    AnswerReadingCard()
                    LinesCard()
                    moreLinks
                }
                TrustLine()
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 28)
        }
        .background(Theme.bg)
        .navigationTitle("Bill")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarTrailing) { store.badge } }
        .refreshable { await store.refresh() }
    }

    private var moreLinks: some View {
        Card(padding: 0) {
            ForEach(store.documents) { doc in
                NavigationLink(value: DocLink(docId: doc.id)) {
                    DocBadge(type: doc.type, title: doc.title, detail: ISODate.short(doc.sentAt))
                        .padding(.horizontal, 16).padding(.vertical, 10)
                }
                .buttonStyle(.plain)
                Divider().padding(.leading, 68)
            }
            NavigationLink(value: HistoryLink()) {
                HStack {
                    Label("History", systemImage: "clock.arrow.circlepath").font(.subheadline.weight(.semibold))
                    Spacer()
                    Text("\(store.history.count) steps").font(.footnote).foregroundStyle(Theme.ink3)
                    Image(systemName: "chevron.right").font(.footnote).foregroundStyle(Theme.ink4)
                }
                .foregroundStyle(Theme.ink)
                .padding(16)
            }
            .buttonStyle(.plain)
        }
    }
}

// MARK: - Hero: "You can safely pay $6,600 of $7,500."

struct HeroCard: View {
    @Environment(CaseStore.self) private var store

    var body: some View {
        Card(padding: 20) {
            VStack(alignment: .leading, spacing: 4) {
                Text("You can safely pay")
                    .font(.system(size: 28, weight: .heavy)).tracking(-0.8)
                    .foregroundStyle(Theme.ink)
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    limeAmount
                    Text("of \(Money.usd(store.totals.billedCents)).")
                        .font(.system(size: 24, weight: .bold)).tracking(-0.6)
                        .foregroundStyle(Theme.ink4)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("You can safely pay \(Money.usd(store.payCents)) of \(Money.usd(store.totals.billedCents))")
            SplitBar(pay: store.payCents, hold: store.holdCents, ask: store.askCents).padding(.top, 16)
            HStack(alignment: .top) {
                amount("Pay", store.payCents, Theme.pay)
                amount("Hold", store.holdCents, Theme.hold)
                amount("Ask", store.askCents, store.askCents > 0 ? Theme.ask : Theme.ink4)
            }
            .padding(.top, 14)
        }
    }

    /// The one number to remember, on a lime marker.
    private var limeAmount: some View {
        Text(Money.usd(store.payCents))
            .font(.system(size: 30, weight: .heavy).monospacedDigit())
            .tracking(-0.8)
            .foregroundStyle(Theme.limeInk)
            .padding(.horizontal, 8)
            .background(Theme.lime, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .contentTransition(.numericText())
    }

    private func amount(_ label: String, _ cents: Int, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Kicker(label, color: color)
            Text(Money.usd(cents))
                .font(.system(size: 20, weight: .heavy).monospacedDigit())
                .foregroundStyle(label == "Pay" ? Theme.ink : color)
                .contentTransition(.numericText())
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Track (P3)

struct TrackStrip: View {
    @Environment(CaseStore.self) private var store

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: 0) {
                ForEach(Array(store.track.enumerated()), id: \.element.id) { i, step in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 0) {
                            dot(step)
                            if i < store.track.count - 1 {
                                Rectangle().fill(Theme.line).frame(height: 2)
                            }
                        }
                        Text(step.title).font(.footnote.weight(.bold)).foregroundStyle(titleColor(step))
                        Text("\(step.who) · \(step.detail)").font(.caption).foregroundStyle(Theme.ink3).lineLimit(2)
                    }
                    .frame(width: 128, alignment: .leading)
                }
            }
            .padding(16)
        }
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(Theme.line))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Steps: " + store.track.map { "\($0.title), \($0.who)" }.joined(separator: "; "))
    }

    private func dot(_ s: TrackStep) -> some View {
        let (bg, fg, stroke): (Color, Color, Color) = switch s.state {
        case .done: (Theme.brand, Theme.brandInk, Theme.brand)
        case .current: (Theme.surface, Theme.ink, Theme.ink)
        case .later: (Theme.sunken, Theme.ink4, Theme.line)
        case .refused: (Theme.holdTint, Theme.hold, Theme.hold)
        }
        return Text(s.initial)
            .font(.caption.weight(.bold))
            .frame(width: 30, height: 30)
            .foregroundStyle(fg)
            .background(bg, in: Circle())
            .overlay(Circle().strokeBorder(stroke, lineWidth: 2))
    }

    private func titleColor(_ s: TrackStep) -> Color {
        switch s.state {
        case .later: Theme.ink4
        case .refused: Theme.hold
        default: Theme.ink
        }
    }
}

// MARK: - Lines grouped Hold / Ask / Pay

struct LinesCard: View {
    @Environment(CaseStore.self) private var store

    var body: some View {
        Card(padding: 8) {
            group(.toDispute, "Hold · more than agreed", Theme.hold, store.holdCents, prefix: "+")
            group(.waiting, "Ask · waiting for an answer", Theme.ask, store.askCents)
            group(.cleared, "Pay · matches what was agreed", Theme.pay, nil)
        }
    }

    @ViewBuilder private func group(_ g: LineGroup, _ title: String, _ color: Color, _ cents: Int?, prefix: String = "") -> some View {
        let lines = store.lines(g)
        HStack {
            Kicker(title, color: color)
            Spacer()
            if let cents { Text(prefix + Money.usd(cents)).font(.footnote.weight(.bold).monospacedDigit()).foregroundStyle(color) }
        }
        .padding(.horizontal, 10).padding(.top, 12).padding(.bottom, 4)
        if lines.isEmpty {
            Text(g == .waiting ? "Nothing left to ask." : "None.").font(.footnote).foregroundStyle(Theme.ink4)
                .padding(.horizontal, 10).padding(.bottom, 6)
        }
        ForEach(lines) { f in
            NavigationLink(value: f) { LineRow2(finding: f) }.buttonStyle(.plain)
        }
    }
}

struct LineRow2: View {
    @Environment(CaseStore.self) private var store
    let finding: Finding

    var body: some View {
        let g = LineGroup(finding)
        let moved = store.movedKeys.contains(finding.key)
        HStack(alignment: .center, spacing: 10) {
            Text("\(finding.lineNo)").font(.footnote.monospacedDigit()).foregroundStyle(Theme.ink4).frame(width: 16)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(store.name(of: finding)).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink).lineLimit(1)
                    if moved {
                        Text("Moved").font(.caption2.weight(.bold)).foregroundStyle(Theme.limeInk)
                            .padding(.horizontal, 5).padding(.vertical, 1).background(Theme.lime, in: RoundedRectangle(cornerRadius: 4))
                    }
                }
                Text(chip).font(.caption).foregroundStyle(Theme.ink3).lineLimit(1)
            }
            Spacer(minLength: 6)
            Text(amount(g)).font(.subheadline.weight(.bold).monospacedDigit()).foregroundStyle(color(g))
            Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(Theme.ink4)
        }
        .padding(.horizontal, 10).padding(.vertical, 10)
        .background(moved ? (g == .toDispute ? Theme.holdTint : Theme.payTint) : .clear, in: RoundedRectangle(cornerRadius: 12))
        .animation(.easeOut(duration: 0.9), value: moved)
    }

    private var chip: String {
        if finding.userVerdict == "false_positive" { return "Not an issue · dismissed by clerk" }
        if let expected = finding.expectedCents, expected > 0, LineGroup(finding) == .toDispute {
            return "Agreed \(Money.usd(expected)) → billed \(Money.usd(finding.billedCents))"
        }
        return reasonText(finding)
    }

    private func amount(_ g: LineGroup) -> String {
        g == .toDispute ? Money.delta(finding.deltaCents ?? 0) : Money.usd(finding.billedCents)
    }

    private func color(_ g: LineGroup) -> Color {
        switch g {
        case .toDispute: Theme.hold
        case .waiting: Theme.ask
        case .cleared: Theme.ink
        }
    }
}

// MARK: - Uploader (Leo): documents only

struct UploaderBill: View {
    @Environment(CaseStore.self) private var store

    var body: some View {
        Card {
            Kicker("Documents in this bill")
            ForEach(store.documents.filter { $0.type != .reply }) { doc in
                DocBadge(type: doc.type, title: doc.title, detail: readLabel(doc)).padding(.top, 12)
            }
            Text("You add documents; Maya and Sam see what CargoOS finds in them.")
                .font(.footnote).foregroundStyle(Theme.ink3).padding(.top, 14)
        }
    }

    private func readLabel(_ d: SourceDoc) -> String {
        switch d.readStatus {
        case "reading": "CargoOS is reading it"
        case "not_read": "Couldn't be read"
        default: "Read"
        }
    }
}

struct ErrorNote: View {
    let text: String
    let onClose: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.circle.fill").foregroundStyle(Theme.hold)
            Text(text).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.hold).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            Button(action: onClose) { Image(systemName: "xmark").font(.footnote.weight(.bold)) }
                .foregroundStyle(Theme.hold)
                .accessibilityLabel("Dismiss")
        }
        .padding(14)
        .background(Theme.holdTint, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}
