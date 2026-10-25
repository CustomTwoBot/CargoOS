import SwiftUI

/// The one card that needs this person now (2px ink border when it is theirs to act on).
struct NextStepCard: View {
    @Environment(CaseStore.self) private var store

    var body: some View {
        switch store.nextStep {
        case .reading: BusyCard(text: "Reading documents… Findings appear when every document is read.")
        case .rechecking: BusyCard(text: "Rechecking the lines with your answer…")
        case .answer: AnswerCard()
        case .waitingAnswer: WaitingAnswerCard()
        case .request: RequestCard()
        case .waitingDecision: InfoCard(kicker: "Waiting for \(People.owner.first)", kickerColor: Theme.ink3,
                                        title: "You asked \(People.owner.first) to approve a \(Money.usd(store.draft?.totalDisputedCents ?? 0)) dispute.",
                                        body: "Nothing goes to \(store.forwarder) until \(People.owner.first) accepts and sends it himself.")
        case .decide: DecisionCard()
        case .blockedSelf: BlockedSelfCard()
        case .writeLetter: WriteLetterCard()
        case .accepted: InfoCard(kicker: "Accepted", kickerColor: Theme.pay,
                                 title: "\(People.owner.first) accepted the dispute. Pay \(Money.usd(store.payCents)).",
                                 body: "\(People.owner.first) writes and sends the message to \(store.forwarder) himself.")
        case .rejected: RejectedCard()
        case .allClear: InfoCard(kicker: "Nothing to dispute", kickerColor: Theme.pay,
                                 title: "Every line matches what was agreed. Pay \(Money.usd(store.payCents)).",
                                 body: "CargoOS never pays. Pay it from your bank as usual.")
        }
    }
}

// MARK: - The answer (M3)

struct AnswerCard: View {
    @Environment(CaseStore.self) private var store
    @State private var text = ""
    @State private var phase = Phase.ask
    @FocusState private var focused: Bool

    enum Phase { case ask, reading, confirm }

    var body: some View {
        Card(emphasized: true) {
            switch phase {
            case .ask: ask
            case .reading:
                bubble
                HStack(spacing: 10) { ProgressView(); Text("Reading your answer…").font(.subheadline.weight(.semibold)) }
                    .foregroundStyle(Theme.ink).padding(.top, 12)
            case .confirm: confirm
            }
        }
    }

    @ViewBuilder private var ask: some View {
        if let q = store.question {
            HStack {
                Kicker("CargoOS asks you", color: Theme.ask)
                Spacer()
                Text("\(store.questionFindings.count) lines · \(Money.usd(store.askCents))")
                    .font(.footnote.monospacedDigit()).foregroundStyle(Theme.ink3)
            }
            Text(q.text)
                .font(.system(size: 17, weight: .semibold)).tracking(-0.2)
                .foregroundStyle(Theme.ink)
                .padding(.top, 8)
                .fixedSize(horizontal: false, vertical: true)
            if let cite = q.citations.first {
                QuoteBlock(quote: cite.quote, source: "\(store.document(cite.docId)?.title ?? "Document") · \(cite.locator)")
                    .padding(.top, 12)
            }
            TextField(store.sampleReply ?? "Your answer, in your own words", text: $text, axis: .vertical)
                .lineLimit(2...5)
                .focused($focused)
                .padding(12)
                .background(Theme.sunken, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Theme.lineStrong))
                .padding(.top, 14)
                .accessibilityLabel("Your answer")
            Button("Answer") { Task { await answer() } }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(store.isLive && text.trimmingCharacters(in: .whitespaces).isEmpty)
                .padding(.top, 10)
            Text(store.isLive
                 ? "Your answer becomes evidence. CargoOS rechecks the lines; nothing is sent."
                 : "Replay: CargoOS reads the recorded answer whatever you type. Nothing is sent.")
                .font(.caption).foregroundStyle(Theme.ink3).padding(.top, 8)
        }
    }

    private var answerText: String {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? (store.sampleReply ?? "") : t
    }

    private var bubble: some View {
        HStack {
            Spacer(minLength: 40)
            Text(answerText)
                .font(.subheadline)
                .foregroundStyle(Theme.brandInk)
                .padding(.horizontal, 14).padding(.vertical, 10)
                .background(Theme.brand, in: UnevenRoundedRectangle(topLeadingRadius: 16, bottomLeadingRadius: 16, bottomTrailingRadius: 4, topTrailingRadius: 16))
        }
    }

    @ViewBuilder private var confirm: some View {
        bubble
        Kicker("Is this what you meant?", color: Theme.ink).padding(.top, 14)
        ReadingList(readings: store.replayPreviewReadings).padding(.top, 8)
        Button("Yes, recheck the bill") {
            let t = answerText
            Task { await store.submitReply(t) }
        }
        .buttonStyle(PrimaryButtonStyle())
        .padding(.top, 12)
        Button("No, let me rephrase") { phase = .ask }
            .buttonStyle(SecondaryButtonStyle())
            .padding(.top, 8)
        Text("CargoOS reads your words. The rules move the money.")
            .font(.caption).foregroundStyle(Theme.ink3).padding(.top, 8)
    }

    private func answer() async {
        focused = false
        if store.isLive {
            await store.submitReply(text)
            return
        }
        withAnimation(.snappy) { phase = .reading }
        try? await Task.sleep(for: .seconds(1.1))
        withAnimation(.snappy) { phase = .confirm }
    }
}

/// Each line of the question with what CargoOS read for it and the words it read it from.
struct ReadingList: View {
    let readings: [LineReading]
    /// Whose words: "your" for the person who answered, "Sam's" for everyone else.
    var speaker = "your"

    var body: some View {
        VStack(spacing: 8) {
            ForEach(readings) { r in
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("Line \(r.lineNo) · \(r.name)").font(.subheadline.weight(.bold)).foregroundStyle(Theme.ink)
                        Spacer()
                        Text(Money.usd(r.billedCents)).font(.subheadline.monospacedDigit()).foregroundStyle(Theme.ink2)
                    }
                    Text(r.verdict.rawValue)
                        .font(.footnote.weight(.bold))
                        .foregroundStyle(color(r.verdict))
                        .padding(.horizontal, 9).padding(.vertical, 3)
                        .background(tint(r.verdict), in: Capsule())
                    if let quote = r.quote {
                        Text("From \(speaker) words: “\(quote)”").font(.footnote).foregroundStyle(Theme.ink2)
                            .fixedSize(horizontal: false, vertical: true)
                    } else {
                        Text("Your answer didn't say. CargoOS will keep asking.").font(.footnote).foregroundStyle(Theme.ink3)
                    }
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.sunken, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
        }
    }

    private func color(_ v: LineReading.Verdict) -> Color {
        switch v { case .agreed: Theme.pay; case .notAgreed: Theme.hold; case .unsure: Theme.ask }
    }

    private func tint(_ v: LineReading.Verdict) -> Color {
        switch v { case .agreed: Theme.payTint; case .notAgreed: Theme.holdTint; case .unsure: Theme.askTint }
    }
}

/// After an answer: what it changed, and how CargoOS read it.
struct AnswerReadingCard: View {
    @Environment(CaseStore.self) private var store
    @State private var open = true

    var body: some View {
        let readings = store.answerReadings
        if !readings.isEmpty, store.person.holds(.ops_lead) || store.person.holds(.clerk) {
            Card {
                Button { withAnimation(.snappy) { open.toggle() } } label: {
                    HStack {
                        Kicker(store.canAnswer ? "Your answer changed \(store.movedKeys.count) lines" : "\(People.owner.first)'s answer changed \(store.movedKeys.count) lines",
                               color: Theme.pay)
                        Spacer()
                        Image(systemName: open ? "chevron.up" : "chevron.down").font(.footnote.weight(.semibold)).foregroundStyle(Theme.ink3)
                    }
                }
                .buttonStyle(.plain)
                if open {
                    if !store.replyText.isEmpty {
                        Text("“\(store.replyText)”").font(.subheadline).foregroundStyle(Theme.ink2)
                            .padding(.top, 8).fixedSize(horizontal: false, vertical: true)
                    }
                    ReadingList(readings: readings, speaker: store.canAnswer ? "your" : "\(People.owner.first)'s").padding(.top, 10)
                    if store.isLive && store.canAnswer {
                        Text("Not what you meant? Add a correction from the Add tab; CargoOS rechecks with it.")
                            .font(.caption).foregroundStyle(Theme.ink3).padding(.top, 8)
                    }
                }
            }
        }
    }
}

struct WaitingAnswerCard: View {
    @Environment(CaseStore.self) private var store

    var body: some View {
        Card {
            Kicker("Waiting for \(People.owner.first)'s answer", color: Theme.ask)
            Text(store.question?.text ?? "")
                .font(.subheadline).foregroundStyle(Theme.ink2).padding(.top, 8)
                .fixedSize(horizontal: false, vertical: true)
            Text("CargoOS asked \(People.owner.first) about \(store.questionFindings.count) lines (\(Money.usd(store.askCents))). You'll see what changes here.")
                .font(.footnote).foregroundStyle(Theme.ink3).padding(.top, 8)
        }
    }
}

// MARK: - Approval (P3)

struct RequestCard: View {
    @Environment(CaseStore.self) private var store

    var body: some View {
        Card(emphasized: true) {
            Kicker("Ready to dispute", color: Theme.hold)
            Text("Dispute \(Money.usd(store.holdCents)) with \(store.forwarder)?")
                .font(.system(size: 19, weight: .bold)).foregroundStyle(Theme.ink).padding(.top, 8)
            DisputedLines(keys: store.lines(.toDispute).map(\.key)).padding(.top, 12)
            Button(store.person.holds(.controller) ? "Request approval" : "Ask \(People.owner.first) to approve") {
                Task { await store.requestApproval() }
            }
            .buttonStyle(PrimaryButtonStyle())
            .padding(.top, 14)
            Text(store.person.holds(.controller)
                 ? "You can't approve a request you made yourself. Another owner decides."
                 : "\(People.owner.first) decides. You can't approve what you asked for.")
                .font(.caption).foregroundStyle(Theme.ink3).padding(.top, 8)
        }
    }
}

/// The disputed lines with their agreed and billed amounts.
struct DisputedLines: View {
    @Environment(CaseStore.self) private var store
    let keys: [String]

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(keys.compactMap { store.finding(key: $0) }.enumerated()), id: \.element.key) { i, f in
                if i > 0 { Divider() }
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(f.lineNo) · \(store.name(of: f))").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
                        Text(f.expectedCents.flatMap { $0 > 0 ? "Agreed \(Money.usd($0)), billed \(Money.usd(f.billedCents))" : nil } ?? reasonText(f))
                            .font(.caption).foregroundStyle(Theme.ink3)
                    }
                    Spacer()
                    Text(Money.delta(f.deltaCents ?? 0)).font(.subheadline.weight(.bold).monospacedDigit()).foregroundStyle(Theme.hold)
                }
                .padding(.vertical, 10)
            }
        }
        .padding(.horizontal, 12)
        .background(Theme.sunken, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

struct DecisionCard: View {
    @Environment(CaseStore.self) private var store
    @State private var rejecting = false
    @State private var reason = ""
    @State private var tried = false

    static let demoReason = "It wasn't agreed upfront, but they really did expedite it for us. Let's pay it this time."

    var body: some View {
        let d = store.draft
        let who = People.byId(d?.requestedBy)?.first ?? "Maya"
        Card(emphasized: true) {
            Kicker("\(who) asks you to approve", color: Theme.hold)
            Text("Dispute \(Money.usd(d?.totalDisputedCents ?? 0)) with \(store.forwarder) and pay \(Money.usd(store.payCents)).")
                .font(.system(size: 19, weight: .bold)).foregroundStyle(Theme.ink).padding(.top, 8)
                .fixedSize(horizontal: false, vertical: true)
            DisputedLines(keys: d?.findingKeys ?? []).padding(.top, 12)
            if rejecting {
                HStack {
                    Text("Why? \(who) will see this.").font(.subheadline.weight(.bold)).foregroundStyle(Theme.ink)
                    Spacer()
                    Button("Demo reason") { reason = Self.demoReason }
                        .font(.footnote.weight(.semibold)).foregroundStyle(Theme.brand)
                }
                .padding(.top, 14)
                TextField("Write the reason in your own words", text: $reason, axis: .vertical)
                    .lineLimit(3...6)
                    .padding(12)
                    .background(Theme.sunken, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .strokeBorder(tried && reason.trimmingCharacters(in: .whitespaces).isEmpty ? Theme.hold : Theme.lineStrong))
                    .padding(.top, 6)
                    .accessibilityLabel("Reason for rejecting")
                if tried && reason.trimmingCharacters(in: .whitespaces).isEmpty {
                    Text("A reason is required to reject.").font(.footnote.weight(.semibold)).foregroundStyle(Theme.hold).padding(.top, 4)
                }
                Button("Reject and send back to \(who)") {
                    tried = true
                    guard !reason.trimmingCharacters(in: .whitespaces).isEmpty else { return }
                    Task { await store.reject(reason: reason) }
                }
                .buttonStyle(PrimaryButtonStyle(tint: Theme.holdFill, ink: .white))
                .padding(.top, 12)
                Button("Cancel") { rejecting = false; tried = false }
                    .buttonStyle(SecondaryButtonStyle()).padding(.top, 8)
            } else {
                HStack(spacing: 10) {
                    Button("Accept") { Task { await store.accept() } }.buttonStyle(PrimaryButtonStyle())
                    Button("Reject") { rejecting = true }.buttonStyle(SecondaryButtonStyle())
                }
                .padding(.top, 14)
                Text("Accept opens the message to \(store.forwarder) for you to edit. Nothing is sent.")
                    .font(.caption).foregroundStyle(Theme.ink3).padding(.top, 8)
            }
        }
    }
}

struct BlockedSelfCard: View {
    @Environment(CaseStore.self) private var store

    var body: some View {
        Card {
            Kicker("You asked for this dispute", color: Theme.ink3)
            Text("You requested this, so another owner decides.")
                .font(.system(size: 19, weight: .bold)).foregroundStyle(Theme.ink).padding(.top, 8)
            Text("Nobody approves a dispute they asked for. CargoOS checks this on the server, not just on this phone.")
                .font(.subheadline).foregroundStyle(Theme.ink2).padding(.top, 6)
                .fixedSize(horizontal: false, vertical: true)
            Button("Try to accept anyway") { Task { await store.accept() } }
                .buttonStyle(SecondaryButtonStyle()).padding(.top, 14)
        }
    }
}

struct RejectedCard: View {
    @Environment(CaseStore.self) private var store

    var body: some View {
        let d = store.draft
        let mine = d?.rejectedBy == store.person.id
        Card(emphasized: true) {
            Kicker(mine ? "You sent it back" : "\(People.owner.first) rejected this", color: Theme.hold)
            Text(mine ? "You rejected the \(Money.usd(d?.totalDisputedCents ?? 0)) dispute." : "\(People.owner.first) rejected the \(Money.usd(d?.totalDisputedCents ?? 0)) dispute.")
                .font(.system(size: 19, weight: .bold)).foregroundStyle(Theme.ink).padding(.top, 8)
            if let reason = d?.rejectionReason {
                Text("“\(reason)”")
                    .font(.subheadline).foregroundStyle(Theme.ink)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.holdTint, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .padding(.top, 10)
            }
            Text("Nothing was sent to \(store.forwarder).").font(.footnote).foregroundStyle(Theme.ink3).padding(.top, 8)
            if store.person.holds(.clerk) && !mine {
                Button("Change the lines and ask again") { Task { await store.requestApproval() } }
                    .buttonStyle(SecondaryButtonStyle()).padding(.top, 12)
            }
        }
    }
}

struct WriteLetterCard: View {
    @Environment(CaseStore.self) private var store

    var body: some View {
        Card(emphasized: true) {
            Kicker("Accepted", color: Theme.pay)
            Text("Write to \(store.forwarder).")
                .font(.system(size: 19, weight: .bold)).foregroundStyle(Theme.ink).padding(.top, 8)
            if store.letterBeingWritten {
                HStack(spacing: 10) { ProgressView(); Text("CargoOS is writing the message…").font(.subheadline) }
                    .foregroundStyle(Theme.ink2).padding(.top, 10)
            } else {
                NavigationLink(value: LetterLink()) { Text("Open the message") }
                    .buttonStyle(PrimaryButtonStyle()).padding(.top, 14)
            }
            Text("CargoOS never sends this. You send it yourself.").font(.caption).foregroundStyle(Theme.ink3).padding(.top, 8)
        }
    }
}

struct InfoCard: View {
    let kicker: String
    let kickerColor: Color
    let title: String
    let body_: String

    init(kicker: String, kickerColor: Color, title: String, body: String) {
        self.kicker = kicker
        self.kickerColor = kickerColor
        self.title = title
        self.body_ = body
    }

    var body: some View {
        Card {
            Kicker(kicker, color: kickerColor)
            Text(title).font(.system(size: 18, weight: .bold)).foregroundStyle(Theme.ink).padding(.top, 8)
                .fixedSize(horizontal: false, vertical: true)
            Text(body_).font(.subheadline).foregroundStyle(Theme.ink2).padding(.top, 6)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

struct BusyCard: View {
    let text: String

    var body: some View {
        Card(emphasized: true) {
            HStack(spacing: 10) {
                ProgressView()
                Text(text).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
            }
        }
    }
}
