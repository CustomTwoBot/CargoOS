import SwiftUI

/// "Good afternoon, Sam": the totals across bills and one row per bill (C1). The phone holds the
/// demo bill (live or replay); an uploader sees names and documents only, never amounts.
struct HomeView: View {
    @Environment(CaseStore.self) private var store
    let onAdd: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                ConnectionBanner()
                if store.person.isUploaderOnly {
                    uploaderBody
                } else if store.caseInfo != nil {
                    totals
                    Text("Bills").font(.headline).foregroundStyle(Theme.ink).padding(.top, 4)
                    NavigationLink(value: BillLink()) { BillRow() }
                        .buttonStyle(.plain)
                } else {
                    emptyOrError
                }
                addRow
                TrustLine().padding(.top, 4)
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 24)
        }
        .background(Theme.bg)
        .toolbar(.hidden, for: .navigationBar)
        .navigationDestination(for: BillLink.self) { _ in BillView() }
        .navigationDestination(for: DocLink.self) { DocumentView(link: $0) }
        .navigationDestination(for: HistoryLink.self) { _ in HistoryView() }
        .navigationDestination(for: Finding.self) { LineDetailView(finding: $0) }
        .navigationDestination(for: LetterLink.self) { _ in LetterView() }
        .refreshable { await store.refresh() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                LogoMark(size: 24)
                Text("CargoOS").font(.headline.weight(.heavy)).foregroundStyle(Theme.ink)
                Spacer()
                store.badge
            }
            .padding(.bottom, 14)
            Text("\(greeting), \(store.person.first).")
                .font(.system(size: 30, weight: .heavy)).tracking(-0.8)
                .foregroundStyle(Theme.ink)
            Text(subline)
                .font(.title3.weight(.semibold))
                .foregroundStyle(Theme.ink4)
        }
        .padding(.top, 8)
    }

    private var subline: String {
        if store.person.isUploaderOnly { return "Send what was agreed." }
        switch store.needsMeCount {
        case 0: return "Nothing needs you right now."
        case 1: return "1 bill needs you."
        default: return "\(store.needsMeCount) bills need you."
        }
    }

    private var greeting: String {
        let h = Calendar.current.component(.hour, from: Date())
        return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"
    }

    private var totals: some View {
        HStack(alignment: .top, spacing: 10) {
            tile("Safe to pay", Money.usd(store.payCents), Theme.pay, highlight: true)
            tile("On hold", Money.usd(store.holdCents), Theme.hold)
            tile("Waiting", Money.usd(store.askCents), store.askCents > 0 ? Theme.ask : Theme.ink4)
        }
    }

    private func tile(_ label: String, _ value: String, _ color: Color, highlight: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Kicker(label, color: color).lineLimit(1).minimumScaleFactor(0.8)
            Text(value)
                .font(.system(size: 20, weight: .heavy).monospacedDigit())
                .foregroundStyle(highlight ? Theme.limeInk : color)
                .padding(.horizontal, highlight ? 6 : 0)
                .background(highlight ? Theme.lime : .clear, in: RoundedRectangle(cornerRadius: 7))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .contentTransition(.numericText())
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Theme.line))
    }

    private var uploaderBody: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let c = store.caseInfo {
                NavigationLink(value: BillLink()) {
                    Card {
                        Text(store.forwarder).font(.headline).foregroundStyle(Theme.ink)
                        Text("\(c.title) · \(store.documents.count) documents")
                            .font(.footnote).foregroundStyle(Theme.ink3).padding(.top, 2)
                        if store.readingCount > 0 {
                            Label("CargoOS is reading \(store.readingCount)", systemImage: "hourglass")
                                .font(.footnote.weight(.semibold)).foregroundStyle(Theme.ink2).padding(.top, 8)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
            Text("You add documents. Maya and Sam see what CargoOS finds.")
                .font(.footnote).foregroundStyle(Theme.ink3)
        }
    }

    @ViewBuilder private var emptyOrError: some View {
        if let error = store.loadError {
            Card { Text(error).font(.subheadline).foregroundStyle(Theme.ink2) }
        } else {
            Card {
                HStack(spacing: 10) {
                    ProgressView()
                    Text("Loading bills…").font(.subheadline).foregroundStyle(Theme.ink2)
                }
            }
        }
    }

    private var addRow: some View {
        Button(action: onAdd) {
            HStack(spacing: 12) {
                Image(systemName: "plus")
                    .font(.headline)
                    .frame(width: 40, height: 40)
                    .foregroundStyle(Theme.brandInk)
                    .background(Theme.brand, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Add documents").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
                    Text("A WhatsApp chat, a PDF or a photo of a paper").font(.footnote).foregroundStyle(Theme.ink3)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Theme.ink4)
            }
            .padding(14)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Theme.line, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
        }
        .buttonStyle(.plain)
    }
}

struct BillLink: Hashable {}
struct LetterLink: Hashable {}

/// One bill: forwarder, the mini pay/hold/ask bar, the status in words and the next step.
struct BillRow: View {
    @Environment(CaseStore.self) private var store

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(store.forwarder).font(.headline).foregroundStyle(Theme.ink)
                    Text(store.invoiceRef).font(.footnote).foregroundStyle(Theme.ink3)
                }
                Spacer()
                Text(Money.usd(store.totals.billedCents))
                    .font(.headline.monospacedDigit()).foregroundStyle(Theme.ink)
            }
            SplitBar(pay: store.payCents, hold: store.holdCents, ask: store.askCents, height: 8)
            HStack {
                Text(store.nextStepLabel)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(store.nextStepColor)
                Spacer()
                Text(store.nextStepAction)
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .foregroundStyle(store.needsMeCount > 0 ? Theme.brandInk : Theme.ink)
                    .background(store.needsMeCount > 0 ? Theme.brand : Theme.sunken, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
            }
        }
        .padding(16)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(Theme.line))
    }
}

/// Pay (green) · Hold (red) · Ask (amber stripes), sized by amount; segments grow when the answer moves money.
struct SplitBar: View {
    let pay: Int
    let hold: Int
    let ask: Int
    var height: CGFloat = 16

    var body: some View {
        GeometryReader { geo in
            let total = CGFloat(max(pay + hold + ask, 1))
            let gaps = CGFloat([pay, hold, ask].filter { $0 > 0 }.count - 1) * 3
            let w = max(geo.size.width - max(gaps, 0), 0)
            HStack(spacing: 3) {
                if pay > 0 { Rectangle().fill(Theme.payFill).frame(width: w * CGFloat(pay) / total) }
                if hold > 0 { Rectangle().fill(Theme.holdFill).frame(width: max(w * CGFloat(hold) / total, 6)) }
                if ask > 0 { AskStripes().frame(width: max(w * CGFloat(ask) / total, 6)) }
            }
            .clipShape(Capsule())
        }
        .frame(height: height)
        .background(Theme.raised, in: Capsule())
        .animation(.smooth(duration: 0.9), value: [pay, hold, ask])
        .accessibilityElement()
        .accessibilityLabel("Pay \(Money.usd(pay)), hold \(Money.usd(hold)), ask \(Money.usd(ask))")
    }
}
