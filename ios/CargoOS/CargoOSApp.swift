import SwiftUI

@main
struct CargoOSApp: App {
    @State private var store = CaseStore()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .tint(Theme.primary)
        }
        .onChange(of: scenePhase) { _, phase in
            // The share extension writes to the shared inbox while we're in the background.
            if phase == .active { store.reloadInbox() }
        }
    }
}

struct RootView: View {
    @Environment(CaseStore.self) private var store
    @Environment(\.scenePhase) private var scenePhase
    @State private var tab = Tab.questions

    enum Tab: Hashable { case questions, shipments, evidence }

    var body: some View {
        TabView(selection: $tab) {
            NavigationStack { QuestionsView() }
                .tabItem { Label("Questions", systemImage: "questionmark.bubble") }
                .badge(store.hasOpenQuestion ? 1 : 0)
                .tag(Tab.questions)

            NavigationStack { ShipmentsView() }
                .tabItem { Label("Shipments", systemImage: "shippingbox") }
                .tag(Tab.shipments)

            NavigationStack { EvidenceView() }
                .tabItem { Label("Evidence", systemImage: "tray.and.arrow.down") }
                .badge(store.pendingCount)
                .tag(Tab.evidence)
        }
        // Live: keep the case fresh while the app is on screen (the HTTP API isn't reactive).
        .task(id: scenePhase) {
            if scenePhase == .active { await store.pollWhileActive() }
        }
    }
}

/// "Synthetic data. Nothing is sent or paid automatically." — always visible (design §2.5).
struct TrustLine: View {
    var body: some View {
        Label("Synthetic data. Nothing is sent or paid automatically.", systemImage: "lock")
            .font(.footnote)
            .foregroundStyle(Theme.ink3)
    }
}

/// Where the data comes from: "Live" (the team's Convex deployment) or "Replay" (recorded Scenario A).
struct SourceBadge: View {
    @Environment(CaseStore.self) private var store

    var body: some View {
        HStack(spacing: 5) {
            if store.isLive {
                Circle().fill(liveColor).frame(width: 6, height: 6)
            }
            Text(store.isLive ? "Live" : "Replay")
        }
        .font(.caption2.weight(.semibold))
        .textCase(.uppercase)
        .padding(.horizontal, 7).padding(.vertical, 3)
        .foregroundStyle(Theme.ink2)
        .overlay(Capsule().stroke(Theme.lineStrong))
        .accessibilityLabel(store.isLive ? "Live data from the CargoOS server" : "Replay of recorded Scenario A data")
    }

    private var liveColor: Color {
        if case .offline = store.connection { return Theme.waitingFill }
        return Theme.cleared
    }
}

/// Shown when the live server can't be reached; the last loaded case stays on screen.
struct ConnectionBanner: View {
    @Environment(CaseStore.self) private var store

    var body: some View {
        if case .offline(let message) = store.connection {
            Label(message, systemImage: "wifi.exclamationmark")
                .font(.footnote)
                .foregroundStyle(Theme.waiting)
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.waitingTint, in: RoundedRectangle(cornerRadius: 12))
        }
    }
}
