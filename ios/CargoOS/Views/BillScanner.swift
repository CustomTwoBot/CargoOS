import SwiftUI
import VisionKit

/// Opens a bill created on a laptop: scan the QR code on its page (`…/upload/<caseId>`), or paste the link.
/// The bill is then listed on this phone and polled like the demo case.
struct BillScannerSheet: View {
    @Environment(CaseStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var link = ""
    @State private var error: String?
    @State private var busy = false

    private var canScan: Bool { DataScannerViewController.isSupported && DataScannerViewController.isAvailable }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("On the laptop, open the bill and its Documents tab, or start a new bill: the QR code is there.")
                        .font(.subheadline).foregroundStyle(Theme.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                    if canScan {
                        QRScanner { code in Task { await add(code) } }
                            .frame(height: 300)
                            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(Theme.line))
                    } else {
                        Card {
                            Label("This device has no camera scanner. Paste the bill's link instead.", systemImage: "camera.badge.ellipsis")
                                .font(.footnote).foregroundStyle(Theme.ink3)
                        }
                    }
                    Kicker("Or paste the link")
                    TextField("https://…/upload/…", text: $link)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                        .padding(12)
                        .background(Theme.sunken, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Theme.lineStrong))
                        .accessibilityLabel("Bill link")
                    HStack(spacing: 10) {
                        // Reads the clipboard without the "Allow Paste" prompt; a link copied on the Mac arrives by Universal Clipboard.
                        PasteButton(payloadType: String.self) { strings in
                            guard let text = strings.first else { return }
                            Task { @MainActor in link = text; await add(text) }
                        }
                        .labelStyle(.titleAndIcon)
                        .buttonBorderShape(.roundedRectangle(radius: 14))
                        .tint(Theme.ink2)
                        Button(busy ? "Opening…" : "Open the bill") { Task { await add(link) } }
                            .buttonStyle(PrimaryButtonStyle())
                            .disabled(busy || link.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                    if let error { ErrorNote(text: error) { self.error = nil } }
                }
                .padding(18)
            }
            .background(Theme.bg)
            .navigationTitle("Open a bill")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
        }
    }

    private func add(_ code: String) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        if let message = await store.addBill(fromScan: code) {
            error = message
        } else {
            dismiss()
        }
    }
}

/// VisionKit's live scanner for QR codes; reports each new payload once.
struct QRScanner: UIViewControllerRepresentable {
    let onCode: (String) -> Void

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let vc = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.qr])],
                                           qualityLevel: .balanced, isHighlightingEnabled: true)
        vc.delegate = context.coordinator
        try? vc.startScanning()
        return vc
    }

    func updateUIViewController(_ vc: DataScannerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onCode: onCode) }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onCode: (String) -> Void
        private var seen = Set<String>()

        init(onCode: @escaping (String) -> Void) { self.onCode = onCode }

        func dataScanner(_ scanner: DataScannerViewController, didAdd items: [RecognizedItem], allItems: [RecognizedItem]) {
            for case .barcode(let code) in items {
                guard let value = code.payloadStringValue, seen.insert(value).inserted else { continue }
                onCode(value)
            }
        }
    }
}
