import SwiftUI

/// Who uses this phone, where the data comes from, and the demo reset.
struct SettingsView: View {
    @Environment(CaseStore.self) private var store
    @State private var confirmReset = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Kicker("This phone")
                ForEach(People.all) { p in
                    PersonCard(person: p, selected: p == store.person) { store.setPerson(p) }
                }
                Card {
                    Kicker("Data")
                    HStack {
                        Text(store.isLive ? "Live: the team's CargoOS server" : "Replay of the recorded Scenario A")
                            .font(.subheadline).foregroundStyle(Theme.ink)
                        Spacer()
                        store.badge
                    }
                    .padding(.top, 8)
                    Text("Bayline Home Goods · USD · synthetic data")
                        .font(.footnote).foregroundStyle(Theme.ink3).padding(.top, 4)
                    Button("Reset the demo") { confirmReset = true }
                        .buttonStyle(SecondaryButtonStyle())
                        .padding(.top, 14)
                }
                Button("Show the welcome screen again") { store.signOut() }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.ink2)
                TrustLine()
            }
            .padding(18)
        }
        .background(Theme.bg)
        .navigationTitle("Settings")
        .confirmationDialog("Reset the demo?", isPresented: $confirmReset, titleVisibility: .visible) {
            Button("Reset", role: .destructive) { store.resetDemo() }
        } message: {
            Text(store.isLive ? "The live case goes back to before the answer, for everyone." : "The bill goes back to before the answer.")
        }
    }
}
