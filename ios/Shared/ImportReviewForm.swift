import SwiftUI

/// The one form for adding evidence, used by the share extension and by the app
/// (Paste, Files). Shows what CargoOS understood, lets the ops lead fix the type,
/// pick the case and add a note. Saving keeps it on the phone until it's uploaded.
struct ImportReviewForm: View {
    @Binding var draft: ImportDraft
    @Binding var caseId: String
    @Binding var note: String
    let cases: [CaseRef]
    let onSave: () -> Void
    let onCancel: () -> Void
    @State private var showText = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    DocBadge(type: draft.type, title: draft.title, detail: draft.detail)
                    if draft.textWasRead {
                        DisclosureGroup("Text CargoOS will read", isExpanded: $showText) {
                            Text(draft.text.prefix(4000))
                                .font(.system(.footnote, design: .monospaced))
                                .foregroundStyle(Theme.ink2)
                                .textSelection(.enabled)
                        }
                        .font(.subheadline)
                    } else {
                        Label("No text found. The original file is kept so the clerk can read it.", systemImage: "exclamationmark.triangle")
                            .font(.footnote)
                            .foregroundStyle(Theme.waiting)
                    }
                } footer: {
                    Text("From \(draft.sourceName)")
                }

                Section("What is it?") {
                    Picker("Type", selection: $draft.type) {
                        ForEach(DocType.pickable, id: \.self) { type in
                            Label(type.label, systemImage: type.symbol).tag(type)
                        }
                    }
                    TextField("Title", text: $draft.title)
                }

                Section("Case") {
                    Picker("Add to", selection: $caseId) {
                        ForEach(cases) { c in
                            Text("\(c.title) · \(c.shipmentRef)").tag(c.id)
                        }
                    }
                }

                Section {
                    TextField("Note for the clerk (optional)", text: $note, axis: .vertical)
                        .lineLimit(1...4)
                } footer: {
                    Text("Nothing is sent to the forwarder. CargoOS quotes this text word for word as evidence.")
                }
            }
            .navigationTitle("Add evidence")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: onCancel)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add", action: onSave)
                        .fontWeight(.semibold)
                        .disabled(caseId.isEmpty || draft.title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}
