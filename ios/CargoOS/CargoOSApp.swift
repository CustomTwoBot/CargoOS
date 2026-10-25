import SwiftUI

@main
struct CargoOSApp: App {
    @State private var store = CaseStore()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .task {
                    // Rehearsals and screenshots: `-demoStage accepted` starts the replay at that step.
                    if let stage = UserDefaults.standard.string(forKey: "demoStage") { store.jumpToDemoStage(stage) }
                }
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
    @State private var tab = Tab.bills

    enum Tab: Hashable { case bills, add, settings }

    var body: some View {
        Group {
            if store.onboarded {
                TabView(selection: $tab) {
                    NavigationStack { HomeView(onAdd: { tab = .add }) }
                        .tabItem { Label("Bills", systemImage: "doc.text.magnifyingglass") }
                        .badge(store.needsMeCount)
                        .tag(Tab.bills)

                    NavigationStack { EvidenceView() }
                        .tabItem { Label("Add", systemImage: "plus.rectangle.on.folder") }
                        .badge(store.pendingCount)
                        .tag(Tab.add)

                    NavigationStack { SettingsView() }
                        .tabItem { Label("Settings", systemImage: "person.crop.circle") }
                        .tag(Tab.settings)
                }
                .tint(Theme.brand)
            } else {
                OnboardingView()
            }
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
/// Takes plain values: toolbar items are hosted outside the view's environment on some pushes.
struct SourceBadge: View {
    let isLive: Bool
    var offline = false

    var body: some View {
        HStack(spacing: 5) {
            if isLive {
                Circle().fill(offline ? Theme.askFill : Theme.pay).frame(width: 6, height: 6)
            }
            Text(isLive ? "Live" : "Replay")
        }
        .font(.caption2.weight(.semibold))
        .textCase(.uppercase)
        .padding(.horizontal, 7).padding(.vertical, 3)
        .foregroundStyle(Theme.ink2)
        .overlay(Capsule().stroke(Theme.lineStrong))
        .accessibilityLabel(isLive ? "Live data from the CargoOS server" : "Replay of recorded Scenario A data")
    }
}

extension CaseStore {
    var badge: SourceBadge {
        if case .offline = connection { return SourceBadge(isLive: isLive, offline: true) }
        return SourceBadge(isLive: isLive)
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
