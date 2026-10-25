import SwiftUI
import UniformTypeIdentifiers

/// Getting the paper trail in: what was shared to CargoOS, plus the easy ways to add more.
struct EvidenceView: View {
    @Environment(CaseStore.self) private var store
    @State private var reviewing: ImportDraft?
    @State private var showFiles = false
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                addCard
                sourcesCard
                onPhoneSection
                TrustLine()
            }
            .padding(16)
        }
        .background(Theme.bg)
        .navigationTitle("Add documents")
        .navigationDestination(for: EvidenceRoute.self) { route in
            switch route {
            case .email: ConnectEmailView()
            case .chats: ChatExportGuideView()
            case .item(let id): SharedItemView(itemId: id)
            }
        }
        .fileImporter(isPresented: $showFiles,
                      allowedContentTypes: [.pdf, .image, .plainText, .zip, .emailMessage, .data],
                      allowsMultipleSelection: false) { result in
            guard case .success(let urls) = result, let url = urls.first else { return }
            Task { await openFile(url) }
        }
        .sheet(item: $reviewing) { draft in
            ReviewSheet(draft: draft, caseId: store.caseInfo?.id ?? "", cases: store.sharedInbox.cases(),
                        onSave: save, onCancel: { reviewing = nil })
        }
        .alert("Couldn't add it", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(error ?? "")
        }
        .refreshable { store.reloadInbox() }
    }

    private var addCard: some View {
        Card(emphasized: true) {
            Kicker("Add to the \(store.forwarder) bill")
            Text("What was agreed, or the bill itself")
                .font(.system(size: 19, weight: .bold)).foregroundStyle(Theme.ink).padding(.top, 6)
            VStack(spacing: 10) {
                NavigationLink(value: EvidenceRoute.chats) {
                    bigRow("WA", Theme.lime, Theme.limeInk, "WhatsApp chat", "Chat → ⋯ → Export chat → Without media → CargoOS")
                }
                Button { showFiles = true } label: {
                    bigRow("PDF", Theme.sunken, Theme.ink2, "PDF or email", "A quote, an invoice, an .eml file")
                }
                Button { showFiles = true } label: {
                    bigRow("IMG", Theme.askTint, Theme.ask, "Photo of a paper", "Read on this phone, then sent")
                }
                // The system paste button reads the clipboard without the "Allow Paste" prompt.
                PasteButton(payloadType: String.self) { strings in
                    guard let text = strings.first else { return }
                    Task { @MainActor in paste(text) }
                }
                .labelStyle(.titleAndIcon)
                .buttonBorderShape(.roundedRectangle(radius: 14))
                .tint(Theme.brand)
                .frame(maxWidth: .infinity, minHeight: 48)
            }
            .buttonStyle(.plain)
            .padding(.top, 14)
            Text(store.person.isUploaderOnly
                 ? "You see what you added and whether CargoOS read it. No amounts."
                 : "CargoOS reads it and rechecks the bill. Nothing is sent.")
                .font(.footnote).foregroundStyle(Theme.ink3).padding(.top, 12)
        }
    }

    private func bigRow(_ tag: String, _ bg: Color, _ fg: Color, _ title: String, _ detail: String) -> some View {
        HStack(spacing: 14) {
            Text(tag).font(.caption.weight(.heavy)).foregroundStyle(fg)
                .frame(width: 46, height: 46).background(bg, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.headline).foregroundStyle(Theme.ink)
                Text(detail).font(.caption).foregroundStyle(Theme.ink3).lineLimit(2)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Theme.ink4)
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 76)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Theme.line))
    }

    private var sourcesCard: some View {
        Card(padding: 0) {
            NavigationLink(value: EvidenceRoute.email) {
                sourceRow("envelope.badge", "Connect email", "Forward supplier threads to your case inbox")
            }
            Divider().padding(.leading, 62)
            NavigationLink(value: EvidenceRoute.chats) {
                sourceRow("bubble.left.and.bubble.right", "Export a chat", "WhatsApp, Telegram, iMessage, WeChat")
            }
        }
        .buttonStyle(.plain)
    }

    private func sourceRow(_ icon: String, _ title: String, _ detail: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(Theme.ink2)
                .frame(width: 34, height: 34)
                .background(Theme.sunken, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
                Text(detail).font(.footnote).foregroundStyle(Theme.ink3)
            }
            Spacer()
            Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(Theme.ink3)
        }
        .padding(14)
        .contentShape(Rectangle())
    }

    @ViewBuilder private var onPhoneSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionTitle(title: "On this phone", trailing: store.inbox.isEmpty ? nil : "\(store.inbox.count)")
            if store.inbox.isEmpty {
                Card {
                    Text("Nothing added yet. Shared chats and files show up here.")
                        .font(.footnote).foregroundStyle(Theme.ink3)
                }
            } else {
                Card(padding: 12) {
                    ForEach(store.inbox) { item in
                        NavigationLink(value: EvidenceRoute.item(item.id)) {
                            HStack {
                                DocBadge(type: item.type, title: item.title, detail: store.statusText(for: item))
                                Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(Theme.ink3)
                            }
                        }
                        .buttonStyle(.plain)
                        if item.id != store.inbox.last?.id { Divider().padding(.vertical, 6) }
                    }
                }
                Text(store.isLive
                     ? "Goes to the case automatically so CargoOS can read it. Nothing goes to the forwarder."
                     : "Replay: kept on this phone, not sent anywhere.")
                    .font(.caption).foregroundStyle(Theme.ink3)
            }
        }
    }

    private func paste(_ text: String) {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            error = "The clipboard has no text. Copy a chat or an email first."
            return
        }
        begin(ImportReader.fromText(text))
    }

    private func openFile(_ url: URL) async {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        // Copy out of the picker's sandbox before reading.
        guard let copy = try? ImportReader.keepCopy(of: url) else {
            error = "CargoOS couldn't open \(url.lastPathComponent)."
            return
        }
        begin(await ImportReader.fromFile(copy))
    }

    private func begin(_ draft: ImportDraft) {
        reviewing = draft
    }

    private func save(_ draft: ImportDraft, note: String, caseId: String) {
        do {
            try store.add(draft, caseId: caseId, note: note)
            reviewing = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Owns the edits while the form is open, so the sheet always shows the draft it was opened with.
private struct ReviewSheet: View {
    @State var draft: ImportDraft
    @State var caseId: String
    @State private var note = ""
    let cases: [CaseRef]
    let onSave: (_ draft: ImportDraft, _ note: String, _ caseId: String) -> Void
    let onCancel: () -> Void

    var body: some View {
        ImportReviewForm(draft: $draft, caseId: $caseId, note: $note, cases: cases,
                         onSave: { onSave(draft, note, caseId) }, onCancel: onCancel)
    }
}

enum EvidenceRoute: Hashable {
    case email, chats
    case item(UUID)
}

struct SharedItemView: View {
    @Environment(CaseStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let itemId: UUID

    var body: some View {
        ScrollView {
            if let item = store.inbox.first(where: { $0.id == itemId }) {
                VStack(alignment: .leading, spacing: 14) {
                    DocBadge(type: item.type, title: item.title, detail: item.detail)
                    Card(padding: 14) {
                        row("Case", store.sharedInbox.cases().first { $0.id == item.caseId }?.title ?? item.caseId)
                        Divider().padding(.vertical, 8)
                        row("Added", ISODate.short(item.createdAt))
                        Divider().padding(.vertical, 8)
                        row("From", item.sourceName)
                        Divider().padding(.vertical, 8)
                        row("Status", store.statusText(for: item))
                        if let note = item.note {
                            Divider().padding(.vertical, 8)
                            row("Note", note)
                        }
                    }
                    if !item.text.isEmpty {
                        Card {
                            Text(item.text)
                                .font(.system(.footnote, design: .monospaced))
                                .foregroundStyle(Theme.ink)
                                .textSelection(.enabled)
                        }
                    }
                    if let original = store.sharedInbox.originalURL(item) {
                        ShareLink(item: original) {
                            Label("Original file", systemImage: "doc")
                        }
                        .buttonStyle(SecondaryButtonStyle())
                    }
                    if store.isLive, item.status == .onPhone {
                        Button("Try sending again") { Task { await store.retryUpload(item) } }
                            .buttonStyle(PrimaryButtonStyle())
                    }
                    Button("Remove from this phone", role: .destructive) {
                        store.remove(item)
                        dismiss()
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 4)
                }
                .padding(16)
            }
        }
        .background(Theme.bg)
        .navigationTitle(store.inbox.first { $0.id == itemId }?.type.label ?? "Evidence")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label).font(.footnote).foregroundStyle(Theme.ink3).frame(width: 64, alignment: .leading)
            Text(value).font(.footnote).foregroundStyle(Theme.ink)
            Spacer(minLength: 0)
        }
    }
}
