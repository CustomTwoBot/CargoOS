import SwiftUI

/// Opens a document, optionally scrolled to one quote.
struct DocLink: Hashable {
    let docId: String
    var focus: String?
}

struct HistoryLink: Hashable {}

struct ShipmentsView: View {
    @Environment(CaseStore.self) private var store

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let c = store.caseInfo {
                    NavigationLink(value: c) {
                        Card {
                            HStack(alignment: .firstTextBaseline) {
                                Text(c.title).font(.headline).foregroundStyle(Theme.ink)
                                Spacer()
                                SourceBadge()
                            }
                            Text("Invoice \(c.shipmentRef)" + (c.forwarder.map { " · \($0)" } ?? ""))
                                .font(.footnote).foregroundStyle(Theme.ink3).padding(.top, 2)
                            HStack(alignment: .firstTextBaseline) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("At stake").font(.caption).foregroundStyle(Theme.ink3)
                                    Text(Money.usd(store.totals.atStakeCents))
                                        .font(.title2.weight(.semibold).monospacedDigit())
                                        .foregroundStyle(store.totals.atStakeCents > 0 ? Theme.dispute : Theme.ink)
                                }
                                Spacer()
                                Text(store.statusLine)
                                    .font(.footnote.weight(.medium))
                                    .foregroundStyle(store.hasOpenQuestion ? Theme.waiting : Theme.ink2)
                            }
                            .padding(.top, 12)
                            StakeBar(totals: store.totals).padding(.top, 10)
                        }
                    }
                    .buttonStyle(.plain)
                } else if let error = store.loadError {
                    Card { Text(error).foregroundStyle(Theme.ink2) }
                } else {
                    Card { ProgressView("Loading the case…").frame(maxWidth: .infinity) }
                }
                ConnectionBanner()
                TrustLine().padding(.top, 4)
            }
            .padding(16)
        }
        .background(Theme.bg)
        .refreshable { await store.refresh() }
        .navigationTitle("Shipments")
        .navigationDestination(for: CaseInfo.self) { _ in CaseDetailView() }
        .navigationDestination(for: Finding.self) { LineDetailView(finding: $0) }
        .navigationDestination(for: DocLink.self) { DocumentView(link: $0) }
        .navigationDestination(for: Question.self) { _ in QuestionDetailView() }
        .navigationDestination(for: HistoryLink.self) { _ in HistoryView() }
    }
}

/// The case as the ops lead sees it: everything, read-only, plus their question.
struct CaseDetailView: View {
    @Environment(CaseStore.self) private var store
    @State private var showCleared = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let c = store.caseInfo {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(store.checkedAgainstLine).font(.subheadline).foregroundStyle(Theme.ink2)
                        Text("\(c.incoterm ?? "") · ops lead view").font(.caption).foregroundStyle(Theme.ink3)
                    }

                    ConnectionBanner()

                    if store.findings.isEmpty {
                        Card {
                            HStack(spacing: 10) {
                                ProgressView()
                                Text(store.readingCount > 0 ? "Reading \(store.readingCount) document\(store.readingCount == 1 ? "" : "s")…" : "CargoOS hasn't checked this invoice yet.")
                                    .font(.subheadline).foregroundStyle(Theme.ink2)
                            }
                        }
                    } else {
                        AtStakeCard(totals: store.totals, statusLine: store.statusLine)
                    }

                    if let q = store.question, store.hasOpenQuestion {
                        NavigationLink(value: q) {
                            QuestionCard(question: q, caseTitle: c.title, state: store.replyState)
                        }
                        .buttonStyle(.plain)
                    } else if !store.changes.isEmpty {
                        WhatChangedCard()
                    }

                    group(.toDispute)
                    group(.waiting)
                    clearedGroup

                    documentsSection

                    NavigationLink(value: HistoryLink()) {
                        Card(padding: 14) {
                            HStack {
                                Label("History", systemImage: "clock.arrow.circlepath").foregroundStyle(Theme.ink)
                                Spacer()
                                Text("\(store.history.count) events").font(.footnote).foregroundStyle(Theme.ink3)
                                Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(Theme.ink3)
                            }
                        }
                    }
                    .buttonStyle(.plain)

                    TrustLine()
                }
            }
            .padding(16)
            .animation(.spring(duration: 0.5), value: store.revision)
        }
        .background(Theme.bg)
        .refreshable { await store.refresh() }
        .navigationTitle(store.caseInfo?.title ?? "Case")
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder private func group(_ g: LineGroup) -> some View {
        let lines = store.findings(in: g)
        if !lines.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                SectionTitle(title: g.rawValue, trailing: subtotal(g, lines))
                Card(padding: 12) {
                    ForEach(lines) { f in
                        NavigationLink(value: f) {
                            LineRow(finding: f, description: store.charge(for: f)?.description ?? "Line \(f.lineNo)")
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        if f.key != lines.last?.key { Divider().padding(.vertical, 6) }
                    }
                }
            }
            .transition(.opacity.combined(with: .move(edge: .top)))
        }
    }

    @ViewBuilder private var clearedGroup: some View {
        let lines = store.findings(in: .cleared)
        VStack(alignment: .leading, spacing: 8) {
            Button {
                withAnimation { showCleared.toggle() }
            } label: {
                HStack {
                    SectionTitle(title: "Cleared", trailing: "\(lines.count) · \(Money.usd(lines.map(\.billedCents).reduce(0, +)))")
                    Image(systemName: showCleared ? "chevron.up" : "chevron.down")
                        .font(.caption.weight(.semibold)).foregroundStyle(Theme.ink3)
                }
            }
            .buttonStyle(.plain)
            if showCleared {
                Card(padding: 12) {
                    ForEach(lines) { f in
                        NavigationLink(value: f) {
                            LineRow(finding: f, description: store.charge(for: f)?.description ?? "Line \(f.lineNo)")
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        if f.key != lines.last?.key { Divider().padding(.vertical, 6) }
                    }
                }
            }
        }
    }

    private func docDetail(_ doc: SourceDoc) -> String {
        switch doc.readStatus {
        case "reading": "Reading…"
        case "not_read": "Not read · \(doc.readError ?? "couldn't read it")"
        default: ISODate.short(doc.sentAt)
        }
    }

    private func subtotal(_ g: LineGroup, _ lines: [Finding]) -> String {
        switch g {
        case .toDispute: Money.delta(lines.compactMap(\.deltaCents).reduce(0, +))
        default: Money.usd(lines.map(\.billedCents).reduce(0, +))
        }
    }

    @ViewBuilder private var documentsSection: some View {
        let onPhone = store.inbox.filter { $0.caseId == store.caseInfo?.id && $0.status == .onPhone }
        VStack(alignment: .leading, spacing: 8) {
            SectionTitle(title: "Documents", trailing: "\(store.documents.count + onPhone.count)")
            Card(padding: 12) {
                ForEach(store.documents) { doc in
                    NavigationLink(value: DocLink(docId: doc.id)) {
                        DocBadge(type: doc.type, title: doc.title, detail: docDetail(doc))
                    }
                    .buttonStyle(.plain)
                    Divider().padding(.vertical, 6)
                }
                ForEach(onPhone) { item in
                    DocBadge(type: item.type, title: item.title, detail: "On this phone · not uploaded yet")
                    Divider().padding(.vertical, 6)
                }
                Text("Add a chat, email or PDF from the Evidence tab, or share it to CargoOS from any app.")
                    .font(.caption).foregroundStyle(Theme.ink3)
            }
        }
    }
}

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

                if group != .cleared {
                    Text("The clerk decides whether to dispute this line. You can help by answering CargoOS's question or adding the chat or email where it was agreed.")
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
