import SwiftUI

/// Email in, with no mailbox sign-in (OAuth is out of scope, SPEC §3): the ops lead
/// forwards threads to a case inbox address, or shares a single message.
struct ConnectEmailView: View {
    @Environment(CaseStore.self) private var store
    @State private var copied = false

    /// Planned inbound address per case. Not receiving mail yet: needs an inbound-mail
    /// webhook into a Convex HTTP action (team decision, new service).
    private var address: String {
        "ops+\((store.caseInfo?.shipmentRef ?? "case").lowercased())@in.cargoos.app"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Card {
                    Text("Case inbox").font(.subheadline.weight(.medium)).foregroundStyle(Theme.ink2)
                    Text(address)
                        .font(.system(.body, design: .monospaced).weight(.medium))
                        .foregroundStyle(Theme.ink)
                        .textSelection(.enabled)
                        .padding(.top, 6)
                    Button {
                        UIPasteboard.general.string = address
                        copied = true
                    } label: {
                        Label(copied ? "Copied" : "Copy address", systemImage: copied ? "checkmark" : "doc.on.doc")
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .padding(.top, 14)
                    Label("Preview: this address isn't receiving mail yet. Until it is, share or paste the email.",
                          systemImage: "info.circle")
                        .font(.footnote).foregroundStyle(Theme.waiting)
                        .padding(.top, 12)
                }

                guide("Every thread with a forwarder", steps: [
                    "Gmail: Settings → See all settings → Filters → Create filter.",
                    "From: the forwarder's domain, e.g. @pacificcrest.com.",
                    "Forward it to the case inbox address above.",
                    "Outlook: Settings → Mail → Rules → Add new rule → Forward to.",
                ])

                guide("Just one email, right now", steps: [
                    "In Mail, open the message and tap Forward. Send it to the case inbox.",
                    "Or select the text, tap Share → CargoOS.",
                    "Or save it as a file (.eml or PDF) and share the file to CargoOS.",
                ])

                Card {
                    Label("CargoOS only reads mail you forward or share. It never signs in to your mailbox and never sends email.",
                          systemImage: "lock.shield")
                        .font(.footnote).foregroundStyle(Theme.ink2)
                }
            }
            .padding(16)
        }
        .background(Theme.bg)
        .navigationTitle("Connect email")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct ChatExportGuideView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Agreements made in chat count. Export the chat and CargoOS quotes the exact message.")
                    .font(.subheadline).foregroundStyle(Theme.ink2)

                guide("WhatsApp", icon: "bubble.left.and.bubble.right", steps: [
                    "Open the chat with the forwarder.",
                    "Tap their name at the top → Export Chat.",
                    "Choose Without Media.",
                    "In the share sheet, pick CargoOS.",
                ])

                guide("Telegram, iMessage, WeChat", icon: "text.bubble", steps: [
                    "Long-press a message → Select (or Select More) and pick the messages.",
                    "Tap Copy.",
                    "In CargoOS → Evidence, tap Paste.",
                ])

                guide("Only have a screenshot?", icon: "camera.viewfinder", steps: [
                    "Share the screenshot to CargoOS.",
                    "The text is read on this phone, so the clerk can quote it.",
                ])

                Text("Can't see CargoOS in the share sheet? Scroll the app row to the end, tap More and turn CargoOS on.")
                    .font(.footnote).foregroundStyle(Theme.ink3)
            }
            .padding(16)
        }
        .background(Theme.bg)
        .navigationTitle("Export a chat")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// A numbered how-to card.
@ViewBuilder
func guide(_ title: String, icon: String? = nil, steps: [String]) -> some View {
    Card {
        HStack(spacing: 8) {
            if let icon { Image(systemName: icon).foregroundStyle(Theme.ink2) }
            Text(title).font(.headline).foregroundStyle(Theme.ink)
        }
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text("\(index + 1)")
                        .font(.caption.weight(.semibold).monospacedDigit())
                        .foregroundStyle(Theme.ink2)
                        .frame(width: 20, height: 20)
                        .background(Theme.sunken, in: Circle())
                    Text(step).font(.subheadline).foregroundStyle(Theme.ink)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(.top, 12)
    }
}
