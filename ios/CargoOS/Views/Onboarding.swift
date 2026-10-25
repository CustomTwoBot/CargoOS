import SwiftUI

/// First launch: what CargoOS does, then who uses this phone. No login: the person is a device
/// setting (SPEC §5.5) and can be changed later in Settings.
struct OnboardingView: View {
    @State private var step = Step.welcome

    enum Step { case welcome, who }

    var body: some View {
        switch step {
        case .welcome: WelcomeView { withAnimation(.snappy) { step = .who } }
        case .who: WhoView { withAnimation(.snappy) { step = .welcome } }
        }
    }
}

struct WelcomeView: View {
    let onStart: () -> Void

    var body: some View {
        ZStack {
            Theme.forest.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 10) {
                    LogoMark(size: 34, onDark: true)
                    Text("CargoOS").font(.title3.weight(.heavy)).foregroundStyle(.white)
                }
                Spacer(minLength: 24)
                Text("Checked before\nyou pay.")
                    .font(.system(size: 44, weight: .heavy))
                    .tracking(-1.2)
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
                Text("CargoOS reads the quote, the emails and the chats, checks every line of a freight bill against them, and tells you how much you can safely pay.")
                    .font(.body)
                    .foregroundStyle(Theme.brandSoft)
                    .padding(.top, 16)
                    .fixedSize(horizontal: false, vertical: true)
                VStack(alignment: .leading, spacing: 12) {
                    point("Pay", "what matches what was agreed", Theme.lime)
                    point("Hold", "what's more than agreed", Color(hex: 0xFF8A7A))
                    point("Ask", "what nobody wrote down. CargoOS asks you", Color(hex: 0xF6D27A))
                }
                .padding(.top, 28)
                Spacer(minLength: 24)
                Button(action: onStart) {
                    Text("Get started")
                }
                .buttonStyle(PrimaryButtonStyle(tint: Theme.lime, ink: Theme.limeInk))
                Text("Synthetic data. Nothing is sent or paid automatically.")
                    .font(.footnote)
                    .foregroundStyle(Theme.brandSoft)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 14)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 20)
        }
    }

    private func point(_ word: String, _ text: String, _ color: Color) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(word)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(Theme.forest)
                .padding(.horizontal, 10).padding(.vertical, 3)
                .background(color, in: Capsule())
            Text(text).font(.subheadline).foregroundStyle(.white)
        }
    }
}

/// "Who uses this phone?": the one place a person is picked, besides Settings.
struct WhoView: View {
    @Environment(CaseStore.self) private var store
    @State private var picked = DeviceSettings.person
    let onBack: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Button(action: onBack) {
                    Label("Back", systemImage: "chevron.left").font(.subheadline.weight(.semibold))
                }
                .foregroundStyle(Theme.ink2)
                VStack(alignment: .leading, spacing: 6) {
                    Text("Who uses this phone?")
                        .font(.system(size: 30, weight: .heavy)).tracking(-0.8)
                        .foregroundStyle(Theme.ink)
                    Text("Bayline Home Goods has three people in this demo. No account needed. You can switch later in Settings.")
                        .font(.subheadline).foregroundStyle(Theme.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                ForEach(People.all) { p in
                    PersonCard(person: p, selected: p == picked) { picked = p }
                }
                Button {
                    store.finishOnboarding(as: picked)
                } label: {
                    Text("Continue as \(picked.first)")
                }
                .buttonStyle(PrimaryButtonStyle())
                .padding(.top, 4)
            }
            .padding(20)
        }
        .background(Theme.bg)
    }
}

struct PersonCard: View {
    let person: Person
    let selected: Bool
    let onPick: () -> Void

    var body: some View {
        Button(action: onPick) {
            HStack(alignment: .top, spacing: 14) {
                Avatar(person: person, size: 44)
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 6) {
                        Text(person.first).font(.headline).foregroundStyle(Theme.ink)
                        Text(person.title).font(.subheadline).foregroundStyle(Theme.ink3)
                    }
                    ForEach(person.can, id: \.self) { line in
                        Label(line, systemImage: "checkmark").font(.footnote).foregroundStyle(Theme.ink2)
                    }
                    ForEach(person.cant, id: \.self) { line in
                        Label(line, systemImage: "minus").font(.footnote).foregroundStyle(Theme.ink3)
                    }
                }
                Spacer(minLength: 0)
                Image(systemName: selected ? "largecircle.fill.circle" : "circle")
                    .font(.title3)
                    .foregroundStyle(selected ? Theme.brand : Theme.lineStrong)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(selected ? Theme.ink : Theme.line, lineWidth: selected ? 2 : 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// A round initial: Sam forest/lime, Maya yellow, Leo grey.
struct Avatar: View {
    let person: Person
    var size: CGFloat = 32

    var body: some View {
        Text(person.initial)
            .font(.system(size: size * 0.42, weight: .bold))
            .frame(width: size, height: size)
            .foregroundStyle(fg)
            .background(bg, in: Circle())
            .accessibilityHidden(true)
    }

    private var bg: Color {
        switch person.id {
        case "sam": Theme.forest
        case "maya": Theme.maya
        default: Theme.raised
        }
    }

    private var fg: Color {
        switch person.id {
        case "sam": Theme.lime
        case "maya": Theme.mayaInk
        default: Theme.ink2
        }
    }
}
