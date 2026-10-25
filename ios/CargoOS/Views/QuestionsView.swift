import SwiftUI

/// The ops lead's inbox: what CargoOS asked them, and what their answers changed.
struct QuestionsView: View {
    @Environment(CaseStore.self) private var store

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                ConnectionBanner()
                if let error = store.loadError {
                    Card { Text(error).foregroundStyle(Theme.ink2) }
                } else if store.caseInfo == nil {
                    Card { ProgressView("Loading…").frame(maxWidth: .infinity) }
                } else if store.question == nil {
                    Card {
                        Text("No questions for you right now.").font(.headline).foregroundStyle(Theme.ink)
                        Text("When CargoOS can't find what was agreed for an invoice line, it asks you here.")
                            .font(.footnote).foregroundStyle(Theme.ink3).padding(.top, 4)
                    }
                } else if let q = store.question, let c = store.caseInfo {
                    if store.hasOpenQuestion {
                        Text("CargoOS needs one answer to finish checking \(c.shipmentRef).")
                            .font(.subheadline).foregroundStyle(Theme.ink2)
                    }
                    NavigationLink(value: q) {
                        QuestionCard(question: q, caseTitle: c.title, state: store.replyState)
                    }
                    .buttonStyle(.plain)

                    if !store.hasOpenQuestion {
                        WhatChangedCard()
                    }
                }
                TrustLine().padding(.top, 4)
            }
            .padding(16)
        }
        .background(Theme.bg)
        .refreshable { await store.refresh() }
        .navigationTitle("Questions")
        .navigationDestination(for: Question.self) { _ in QuestionDetailView() }
        .navigationDestination(for: Finding.self) { LineDetailView(finding: $0) }
        .navigationDestination(for: DocLink.self) { DocumentView(link: $0) }
    }
}

struct QuestionCard: View {
    let question: Question
    let caseTitle: String
    let state: CaseStore.ReplyState

    var body: some View {
        let open = state != .answered
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("CargoOS asked you")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(open ? Theme.waiting : Theme.ink3)
                Spacer()
                Text(open ? "Waiting for your answer" : "Answered")
                    .font(.footnote)
                    .foregroundStyle(open ? Theme.waiting : Theme.cleared)
            }
            Text(question.text)
                .font(.body)
                .foregroundStyle(Theme.ink)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
            HStack {
                Text(caseTitle).font(.caption).foregroundStyle(Theme.ink3)
                Spacer()
                Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(Theme.ink3)
            }
        }
        .padding(16)
        .background(open ? Theme.waitingTint.opacity(0.5) : Theme.surface,
                    in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(open ? Theme.waiting.opacity(0.55) : Theme.line,
                        style: StrokeStyle(lineWidth: 1, dash: open ? [5, 3] : []))
        )
    }
}

struct QuestionDetailView: View {
    @Environment(CaseStore.self) private var store
    @State private var answer = ""
    @FocusState private var focused: Bool

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let q = store.question {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("CargoOS asked you").font(.footnote.weight(.semibold)).foregroundStyle(Theme.waiting)
                        Text(q.text)
                            .font(.title3.weight(.medium))
                            .foregroundStyle(Theme.ink)
                            .fixedSize(horizontal: false, vertical: true)
                        Text("Asked \(ISODate.short(q.createdAt))").font(.caption).foregroundStyle(Theme.ink3)
                    }

                    if !q.citations.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Closest mention").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink2)
                            ForEach(q.citations, id: \.self) { span in
                                NavigationLink(value: DocLink(docId: span.docId, focus: span.quote)) {
                                    QuoteBlock(quote: span.quote,
                                               source: "\(store.document(span.docId)?.title ?? "Document") · \(span.locator)")
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Lines this is about").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink2)
                        Card(padding: 12) {
                            ForEach(store.questionFindings) { f in
                                LineRow(finding: f, description: store.charge(for: f)?.description ?? "Line \(f.lineNo)")
                                if f.key != store.questionFindings.last?.key { Divider().padding(.vertical, 6) }
                            }
                        }
                    }

                    answerSection
                }
            }
            .padding(16)
        }
        .background(Theme.bg)
        .navigationTitle("Question")
        .navigationBarTitleDisplayMode(.inline)
        .scrollDismissesKeyboard(.interactively)
    }

    @ViewBuilder private var answerSection: some View {
        switch store.replyState {
        case .open:
            VStack(alignment: .leading, spacing: 10) {
                Text("Your answer").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink2)
                ZStack(alignment: .topLeading) {
                    if answer.isEmpty {
                        Text("e.g. we approved the congestion fee on WhatsApp, nobody agreed to rush handling")
                            .foregroundStyle(Theme.ink3)
                            .padding(.horizontal, 5).padding(.vertical, 8)
                    }
                    TextEditor(text: $answer)
                        .focused($focused)
                        .scrollContentBackground(.hidden)
                        .frame(minHeight: 110)
                }
                .padding(8)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(focused ? Theme.primary : Theme.lineStrong))

                Text("Write it the way you'd tell a colleague. CargoOS reads your answer and rechecks every line. Nothing is sent to the forwarder.")
                    .font(.footnote).foregroundStyle(Theme.ink3)

                if answer.isEmpty, let sample = store.sampleReply {
                    Button("Use the recorded demo answer") { answer = sample }
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(Theme.link)
                }

                if let error = store.actionError {
                    Label(error, systemImage: "exclamationmark.triangle")
                        .font(.footnote).foregroundStyle(Theme.dispute)
                }

                Button("Reply") {
                    focused = false
                    Task { await store.submitReply(answer) }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        case .rechecking:
            Card {
                HStack(spacing: 10) {
                    ProgressView()
                    Text("Rechecking \(store.charges.count) charges with your answer…")
                        .font(.subheadline).foregroundStyle(Theme.ink2)
                }
            }
        case .answered:
            VStack(alignment: .leading, spacing: 12) {
                Card {
                    HStack {
                        Text("You answered").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
                        Spacer()
                        Text(ISODate.short(store.answeredAt)).font(.footnote).foregroundStyle(Theme.ink3)
                    }
                    Text(store.replyText)
                        .font(.body).foregroundStyle(Theme.ink2)
                        .padding(.top, 6)
                        .fixedSize(horizontal: false, vertical: true)
                }
                WhatChangedCard()
            }
        }
    }
}

/// "What changed after your answer" (SPEC §8.6), citing the reply for each line.
struct WhatChangedCard: View {
    @Environment(CaseStore.self) private var store

    var body: some View {
        Card {
            HStack {
                Text("What changed after your answer").font(.headline).foregroundStyle(Theme.ink)
                Spacer()
                SourceBadge()
            }
            if store.changes.isEmpty {
                Text(store.interpretation == "ambiguous"
                     ? "CargoOS couldn't tell what was agreed from your answer, so nothing changed yet."
                     : "No lines changed.")
                    .font(.subheadline).foregroundStyle(Theme.ink2).padding(.top, 10)
            }
            ForEach(store.changes) { change in
                if let f = store.finding(key: change.key) {
                    NavigationLink(value: f) {
                        ChangeRow(change: change, finding: f,
                                  description: store.charge(for: f)?.description ?? "Line \(change.lineNo)")
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 12)
                }
            }
            if !store.isLive {
                Text("Offline replay: the new result is Scenario A's recorded outcome. Connected to the server, CargoOS reads what you actually wrote.")
                    .font(.caption)
                    .foregroundStyle(Theme.ink3)
                    .padding(.top, 12)
            }
        }
    }
}

struct ChangeRow: View {
    let change: FindingChange
    let finding: Finding
    let description: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text("Line \(change.lineNo)").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
                Text(description).font(.subheadline).foregroundStyle(Theme.ink2).lineLimit(1)
                Spacer()
                Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(Theme.ink3)
            }
            HStack(spacing: 6) {
                if let from = change.from {
                    StatusTag(group: LineGroup(status: from.status))
                    Image(systemName: "arrow.right").font(.caption).foregroundStyle(Theme.ink3)
                }
                StatusTag(group: LineGroup(status: change.to.status))
                if let delta = change.to.deltaCents {
                    Text(Money.delta(delta)).font(.footnote.weight(.semibold).monospacedDigit()).foregroundStyle(Theme.dispute)
                }
            }
            Text(finding.explanation).font(.footnote).foregroundStyle(Theme.ink2)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
