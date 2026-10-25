import SwiftUI
import UIKit

/// The message to the seller (L1): CargoOS wrote the words, code put in every number. The owner
/// edits the words; amounts and line numbers stay as they are. The only ways out are Copy, Share and
/// PDF: CargoOS never sends it.
struct LetterView: View {
    @Environment(CaseStore.self) private var store
    @State private var editing = false
    @State private var draft = ""
    @State private var error: String?
    @State private var copied = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let letter = store.letter {
                    paper(letter)
                    actions(letter)
                    locked(letter.body)
                } else {
                    BusyCard(text: "CargoOS is writing the message…")
                }
            }
            .padding(18)
        }
        .background(Theme.bg)
        .navigationTitle("Message")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if store.letter != nil {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(editing ? "Done" : "Edit words") { toggleEditing() }
                        .fontWeight(.semibold)
                }
            }
        }
        .alert("Numbers are locked", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("Keep editing", role: .cancel) {}
            Button("Undo my changes", role: .destructive) { draft = store.letter?.body ?? ""; editing = false }
        } message: { Text(error ?? "") }
    }

    private func paper(_ letter: (subject: String, body: String)) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Group {
                row("To", "Derek, \(store.forwarder)")
                row("From", "\(store.person.first), Bayline Home Goods")
                row("About", letter.subject)
            }
            Divider().padding(.vertical, 12)
            if editing {
                TextEditor(text: $draft)
                    .font(.body)
                    .frame(minHeight: 340)
                    .scrollContentBackground(.hidden)
                    .accessibilityLabel("Message text. Numbers are locked.")
            } else {
                Text(highlighted(letter.body))
                    .font(.body)
                    .foregroundStyle(Theme.ink)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Theme.line))
        .shadow(color: .black.opacity(0.06), radius: 14, y: 6)
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(label).font(.footnote.weight(.bold)).foregroundStyle(Theme.ink).frame(width: 46, alignment: .leading)
            Text(value).font(.footnote).foregroundStyle(Theme.ink2)
        }
        .padding(.vertical, 2)
    }

    private func actions(_ letter: (subject: String, body: String)) -> some View {
        let plain = "Subject: \(letter.subject)\n\n\(letter.body)"
        return VStack(spacing: 10) {
            Button {
                UIPasteboard.general.string = plain
                copied = true
            } label: { Text(copied ? "Copied" : "Copy text") }
                .buttonStyle(PrimaryButtonStyle())
            HStack(spacing: 10) {
                ShareLink(item: plain, subject: Text(letter.subject)) { Text("Share") }
                    .buttonStyle(SecondaryButtonStyle())
                if let pdf = Self.pdf(subject: letter.subject, body: letter.body, to: store.forwarder) {
                    ShareLink(item: pdf) { Text("Save PDF") }
                        .buttonStyle(SecondaryButtonStyle())
                }
            }
            Text("CargoOS never sends this. You send it yourself.")
                .font(.caption).foregroundStyle(Theme.ink3)
        }
    }

    private func locked(_ body: String) -> some View {
        Card {
            Kicker("Locked from the checked bill")
            FlowChips(values: CaseStore.lockedValues(body)).padding(.top, 10)
            Text("Edit any word. These numbers come from CargoOS rules and can't be changed here.")
                .font(.footnote).foregroundStyle(Theme.ink3).padding(.top, 10)
        }
    }

    private func toggleEditing() {
        if editing {
            if let message = store.saveLetter(draft) { error = message; return }
            editing = false
        } else {
            draft = store.letter?.body ?? ""
            editing = true
        }
    }

    /// The locked values on a quiet green marker.
    private func highlighted(_ text: String) -> AttributedString {
        var a = AttributedString(text)
        for value in Set(CaseStore.lockedValues(text)) {
            var search = a.startIndex
            while let r = a[search...].range(of: value) {
                a[r].backgroundColor = Theme.payTint
                a[r].foregroundColor = Theme.pay
                a[r].font = .body.weight(.bold)
                search = r.upperBound
            }
        }
        return a
    }

    /// A plain one-page PDF of the message in the temporary folder, for Save PDF.
    static func pdf(subject: String, body: String, to: String) -> URL? {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("CargoOS-dispute.pdf")
        let page = CGRect(x: 0, y: 0, width: 612, height: 792)
        let renderer = UIGraphicsPDFRenderer(bounds: page)
        let text = "To: \(to)\nSubject: \(subject)\n\n\(body)"
        let attrs: [NSAttributedString.Key: Any] = [.font: UIFont.systemFont(ofSize: 12), .foregroundColor: UIColor.black]
        do {
            try renderer.writePDF(to: url) { ctx in
                ctx.beginPage()
                (text as NSString).draw(in: page.insetBy(dx: 54, dy: 54), withAttributes: attrs)
            }
            return url
        } catch { return nil }
    }
}

/// Wrapping row of small chips.
struct FlowChips: View {
    let values: [String]

    var body: some View {
        FlowLayout(spacing: 6) {
            ForEach(Array(values.enumerated()), id: \.offset) { _, v in
                Text(v)
                    .font(.footnote.weight(.bold).monospacedDigit())
                    .foregroundStyle(Theme.pay)
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(Theme.payTint, in: RoundedRectangle(cornerRadius: 7))
            }
        }
    }
}

struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x + size.width > width, x > 0 { x = 0; y += rowH + spacing; rowH = 0 }
            x += size.width + spacing
            rowH = max(rowH, size.height)
        }
        return CGSize(width: width == .infinity ? x : width, height: y + rowH)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowH: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX { x = bounds.minX; y += rowH + spacing; rowH = 0 }
            s.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowH = max(rowH, size.height)
        }
    }
}
