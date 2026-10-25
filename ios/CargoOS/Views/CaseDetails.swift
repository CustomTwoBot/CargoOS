import SwiftUI

/// Opens a document, optionally scrolled to one quote.
struct DocLink: Hashable {
    let docId: String
    var focus: String?
}

struct HistoryLink: Hashable {}

struct LineDetailView: View {
    @Environment(CaseStore.self) private var store
    let finding: Finding

    var body: some View {
        // Always show the current revision of this line.
        let f = store.finding(key: finding.key) ?? finding
        let group = LineGroup(f)
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Card {
                    HStack {
                        StatusTag(group: group, dismissed: f.userVerdict == "false_positive")
                        Spacer()
                        Text(f.ruleId.split(separator: "_").first.map(String.init) ?? "")
                            .font(.caption.monospaced()).foregroundStyle(Theme.ink3)
                    }
                    Text(store.charge(for: f)?.description ?? "Line \(f.lineNo)")
                        .font(.title3.weight(.semibold)).foregroundStyle(Theme.ink)
                        .padding(.top, 10)
                    HStack(spacing: 24) {
                        amount("Billed", f.billedCents, Theme.ink)
                        if let expected = f.expectedCents { amount("Agreed", expected, Theme.ink) }
                        if group == .toDispute, let delta = f.deltaCents { amount("Over by", delta, Theme.dispute) }
                    }
                    .padding(.top, 12)
                    Text(f.explanation)
                        .font(.subheadline).foregroundStyle(Theme.ink2)
                        .padding(.top, 12)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Checked by CargoOS rules")
                        .font(.caption).foregroundStyle(Theme.ink3).padding(.top, 8)
                }

                VStack(alignment: .leading, spacing: 10) {
                    Text("Evidence").font(.headline).foregroundStyle(Theme.ink)
                    if let charge = store.charge(for: f) {
                        evidence("What the invoice says", charge.span)
                    }
                    ForEach(f.evidence, id: \.self) { span in
                        evidence(label(for: span), span)
                    }
                    if let missing = f.missing, !missing.isEmpty {
                        Card(padding: 14) {
                            Text("What would settle it").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.waiting)
                            ForEach(missing, id: \.self) { Text("· " + $0).font(.footnote).foregroundStyle(Theme.ink2) }
                        }
                    }
                }

                if group != .cleared, store.person.holds(.clerk) {
                    VStack(spacing: 8) {
                        Button("Keep in dispute") { Task { await store.setVerdict(f.key, "confirmed") } }
                            .buttonStyle(PrimaryButtonStyle())
                        Button("Not an issue") { Task { await store.setVerdict(f.key, "false_positive") } }
                            .buttonStyle(SecondaryButtonStyle())
                        Text(f.userVerdict == "confirmed" ? "You kept this in dispute." : "“Not an issue” is remembered for \(store.forwarder) next time.")
                            .font(.caption).foregroundStyle(Theme.ink3)
                    }
                } else if group != .cleared {
                    Text("Maya decides whether to dispute this line. You can help by answering CargoOS's question or adding the chat or email where it was agreed.")
                        .font(.footnote).foregroundStyle(Theme.ink3)
                }
            }
            .padding(16)
        }
        .background(Theme.bg)
        .navigationTitle("Line \(f.lineNo)")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func amount(_ label: String, _ cents: Int, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption).foregroundStyle(Theme.ink3)
            Text(Money.usd(cents)).font(.title3.weight(.semibold).monospacedDigit()).foregroundStyle(color)
        }
    }

    private func label(for span: SourceSpan) -> String {
        switch store.document(span.docId)?.type {
        case .reply: "What you said"
        case .chat: "In the chat"
        case .email: "In the email"
        case .quote: "In the quote"
        default: "Source"
        }
    }

    private func evidence(_ label: String, _ span: SourceSpan) -> some View {
        NavigationLink(value: DocLink(docId: span.docId, focus: span.quote)) {
            Card(padding: 14) {
                Text(label).font(.footnote.weight(.semibold)).foregroundStyle(Theme.ink2).padding(.bottom, 8)
                QuoteBlock(quote: span.quote, source: "\(store.document(span.docId)?.title ?? "Document") · \(span.locator)")
            }
        }
        .buttonStyle(.plain)
    }
}

struct DocumentView: View {
    @Environment(CaseStore.self) private var store
    let link: DocLink

    var body: some View {
        ScrollView {
            if let doc = store.document(link.docId) {
                VStack(alignment: .leading, spacing: 14) {
                    DocBadge(type: doc.type, title: doc.title,
                             detail: [doc.sender.map { "From \($0.replacingOccurrences(of: "_", with: " "))" }, ISODate.short(doc.sentAt).nilIfEmpty]
                                .compactMap { $0 }.joined(separator: " · "))
                    Card {
                        HighlightedDocText(text: doc.text, quotes: store.quotes(in: doc.id), focus: link.focus)
                    }
                    Text("Highlighted text is what CargoOS quoted as evidence.")
                        .font(.caption).foregroundStyle(Theme.ink3)
                }
                .padding(16)
            } else {
                Text("Document not found").foregroundStyle(Theme.ink3).padding()
            }
        }
        .background(Theme.bg)
        .navigationTitle(store.document(link.docId)?.type.label ?? "Document")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct HistoryView: View {
    @Environment(CaseStore.self) private var store

    var body: some View {
        List(store.history) { row in
            VStack(alignment: .leading, spacing: 3) {
                Text(row.what).font(.subheadline).foregroundStyle(Theme.ink)
                Text("\(row.who) · \(ISODate.short(row.at))").font(.caption).foregroundStyle(Theme.ink3)
            }
            .padding(.vertical, 2)
        }
        .navigationTitle("History")
        .navigationBarTitleDisplayMode(.inline)
    }
}
