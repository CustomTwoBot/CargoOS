import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// "Share → CargoOS" from WhatsApp (Export Chat), Mail, Files, Photos, Safari.
/// Reads the shared item on the phone, shows what CargoOS understood, and saves it
/// to the shared inbox. It never uploads or sends anything by itself.
final class ShareViewController: UIViewController {
    private let model = ShareModel()

    override func viewDidLoad() {
        super.viewDidLoad()
        model.finish = { [weak self] in self?.extensionContext?.completeRequest(returningItems: nil) }
        model.cancel = { [weak self] in
            self?.extensionContext?.cancelRequest(withError: CocoaError(.userCancelled))
        }
        let host = UIHostingController(rootView: ShareRootView(model: model).tint(Theme.primary))
        addChild(host)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(host.view)
        host.didMove(toParent: self)

        let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
        Task { await model.load(providers) }
    }
}

@Observable
final class ShareModel {
    enum Phase { case reading, review, saved, failed(String) }

    var phase: Phase = .reading
    var drafts: [ImportDraft] = []
    var index = 0
    var caseId = ""
    var note = ""
    var cases: [CaseRef] = []
    var finish: () -> Void = {}
    var cancel: () -> Void = {}
    private let inbox = SharedInbox()

    @MainActor
    func load(_ providers: [NSItemProvider]) async {
        cases = inbox.cases()
        if cases.isEmpty, let c = try? UIFixture.load().case {
            cases = [CaseRef(id: c.id, title: c.title, shipmentRef: c.shipmentRef)]
        }
        caseId = cases.first?.id ?? ""

        var result: [ImportDraft] = []
        for provider in providers {
            if let draft = await Self.read(provider) { result.append(draft) }
        }
        // A WhatsApp export can arrive as the chat text plus the same chat as a file: keep one.
        drafts = result.reduce(into: []) { kept, d in
            if !kept.contains(where: { $0.text == d.text && !d.text.isEmpty }) { kept.append(d) }
        }
        phase = drafts.isEmpty ? .failed("CargoOS couldn't read what you shared. Try Export Chat, a PDF, or copy the text.") : .review
    }

    @MainActor
    func save() {
        do {
            for draft in drafts {
                try inbox.add(draft, caseId: caseId, note: note)
            }
            phase = .saved
            Task {
                try? await Task.sleep(for: .seconds(1.1))
                finish()
            }
        } catch {
            phase = .failed("Couldn't save: \(error.localizedDescription)")
        }
    }

    // MARK: - Reading providers

    private static func read(_ provider: NSItemProvider) async -> ImportDraft? {
        let fileTypes: [UTType] = [.zip, .pdf, .emailMessage, .image, .plainText]
        for type in fileTypes where provider.hasItemConformingToTypeIdentifier(type.identifier) {
            if type == .plainText, let text = await loadText(provider) {
                return ImportReader.fromText(text, sourceName: provider.suggestedName ?? "Shared text")
            }
            if let url = await loadFile(provider, typeId: type.identifier) {
                return await ImportReader.fromFile(url)
            }
        }
        if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
           let url = await loadURL(provider) {
            return url.isFileURL ? await ImportReader.fromFile(url) : ImportReader.fromURL(url)
        }
        // Any other file: take it as the app registered it.
        if let typeId = provider.registeredTypeIdentifiers.first,
           let url = await loadFile(provider, typeId: typeId) {
            return await ImportReader.fromFile(url)
        }
        return nil
    }

    /// Plain text arrives as a String (selected text) or as a file URL (a .txt export).
    private static func loadText(_ provider: NSItemProvider) async -> String? {
        await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) { item, _ in
                switch item {
                case let s as String: continuation.resume(returning: s)
                case let url as URL: continuation.resume(returning: try? String(contentsOf: url, encoding: .utf8))
                case let data as Data: continuation.resume(returning: String(data: data, encoding: .utf8))
                default: continuation.resume(returning: nil)
                }
            }
        }
    }

    /// Copies the file out before the provider deletes it.
    private static func loadFile(_ provider: NSItemProvider, typeId: String) async -> URL? {
        await withCheckedContinuation { continuation in
            _ = provider.loadFileRepresentation(forTypeIdentifier: typeId) { url, _ in
                continuation.resume(returning: url.flatMap { try? ImportReader.keepCopy(of: $0) })
            }
        }
    }

    private static func loadURL(_ provider: NSItemProvider) async -> URL? {
        await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: UTType.url.identifier) { item, _ in
                continuation.resume(returning: item as? URL)
            }
        }
    }
}

struct ShareRootView: View {
    @Bindable var model: ShareModel

    var body: some View {
        switch model.phase {
        case .reading:
            VStack(spacing: 12) {
                ProgressView()
                Text("Reading…").font(.subheadline).foregroundStyle(Theme.ink2)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.bg)
        case .review:
            ImportReviewForm(
                draft: $model.drafts[model.index],
                caseId: $model.caseId,
                note: $model.note,
                cases: model.cases,
                onSave: { model.save() },
                onCancel: { model.cancel() }
            )
        case .saved:
            VStack(spacing: 12) {
                Image(systemName: "checkmark.circle.fill").font(.system(size: 44)).foregroundStyle(Theme.cleared)
                Text("Added to CargoOS").font(.headline).foregroundStyle(Theme.ink)
                Text("Kept on this phone. Open CargoOS to see it.").font(.footnote).foregroundStyle(Theme.ink3)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.bg)
        case .failed(let message):
            VStack(spacing: 16) {
                Image(systemName: "exclamationmark.triangle").font(.system(size: 36)).foregroundStyle(Theme.waiting)
                Text(message).font(.subheadline).foregroundStyle(Theme.ink2).multilineTextAlignment(.center)
                Button("Close") { model.cancel() }.buttonStyle(SecondaryButtonStyle()).frame(maxWidth: 200)
            }
            .padding(24)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.bg)
        }
    }
}
