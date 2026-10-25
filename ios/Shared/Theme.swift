import SwiftUI
import UIKit

/// CargoOS redesign tokens (docs/design.md §0.5): forest + lime brand, money as Pay / Hold / Ask.
/// Light and dark, the same values as `app/globals.css`.
enum Theme {
    static let bg = dynamic(0xF2F3F5, 0x0C0F0E)
    static let surface = dynamic(0xFFFFFF, 0x151A18)
    static let sunken = dynamic(0xF7F8FA, 0x1B211F)
    static let raised = dynamic(0xE7E9EC, 0x222A27)
    static let line = dynamic(0xE4E6EA, 0x26302C)
    static let lineStrong = dynamic(0xD5D9DF, 0x34413B)
    static let ink = dynamic(0x101418, 0xEEF2EF)
    static let ink2 = dynamic(0x4B5563, 0xB5BEB9)
    static let ink3 = dynamic(0x5B6470, 0x98A29D)
    static let ink4 = dynamic(0x8A929C, 0x7C8681)

    /// Primary buttons and the brand mark: forest in light, lime in dark.
    static let brand = dynamic(0x0F3D2E, 0xB7F36B)
    static let brandInk = dynamic(0xFFFFFF, 0x0C1A12)
    static let forest = Color(hex: 0x0F3D2E)
    static let lime = Color(hex: 0xB7F36B)
    static let limeInk = Color(hex: 0x0F3D2E)
    static let brandSoft = dynamic(0xC9E8C0, 0x2E5E4B)

    static let pay = dynamic(0x1F7A4D, 0x6FD69B)
    static let payFill = dynamic(0x1F7A4D, 0x3FA56C)
    static let payTint = dynamic(0xF3FBE6, 0x17261D)
    static let hold = dynamic(0xB42318, 0xFF8A7E)
    static let holdFill = dynamic(0xD9382C, 0xE5483B)
    static let holdTint = dynamic(0xFEF1EF, 0x2A1916)
    static let ask = dynamic(0x93600A, 0xF2C062)
    static let askFill = dynamic(0xE7A81E, 0xE7A81E)
    static let askFill2 = dynamic(0xF6D27A, 0x8A6418)
    static let askTint = dynamic(0xFBF6E9, 0x2A2312)

    static let maya = Color(hex: 0xFFE36E)
    static let mayaInk = Color(hex: 0x3B2F00)
    static let highlight = dynamic(0xFFE36E, 0xFFE066)
    static let highlightInk = Color(hex: 0x17140A)

    // Names the import screens still use.
    static let primary = brand
    static let primaryInk = brandInk
    static let link = brand
    static let dispute = hold
    static let disputeInk = dynamic(0xFFFFFF, 0x1E0906)
    static let waiting = ask
    static let waitingFill = askFill
    static let waitingTint = askTint
    static let cleared = pay

    private static func dynamic(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(UIColor { traits in
            UIColor(hex: traits.userInterfaceStyle == .dark ? dark : light)
        })
    }
}

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1
        )
    }
}

extension Color {
    init(hex: UInt32) { self.init(UIColor(hex: hex)) }
}

/// White card on the page background. `emphasized` is the one card that needs this person now.
struct Card<Content: View>: View {
    var padding: CGFloat = 18
    var emphasized = false
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content }
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(emphasized ? Theme.ink : Theme.line, lineWidth: emphasized ? 2 : 1))
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    var tint: Color = Theme.brand
    var ink: Color = Theme.brandInk
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .frame(maxWidth: .infinity, minHeight: 50)
            .foregroundStyle(ink)
            .background(tint.opacity(isEnabled ? (configuration.isPressed ? 0.82 : 1) : 0.3),
                        in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .frame(maxWidth: .infinity, minHeight: 48)
            .foregroundStyle(Theme.ink)
            .background(Theme.surface.opacity(configuration.isPressed ? 0.7 : 1),
                        in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Theme.lineStrong))
    }
}

/// Small uppercase label above a card's title: "CargoOS asks you", "Hold".
struct Kicker: View {
    let text: String
    var color: Color = Theme.ink3

    init(_ text: String, color: Color = Theme.ink3) {
        self.text = text
        self.color = color
    }

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .tracking(0.6)
            .textCase(.uppercase)
            .foregroundStyle(color)
    }
}

/// The diagonal stripes of the Ask part of a bar.
struct AskStripes: View {
    var body: some View {
        Canvas { ctx, size in
            ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Theme.askFill2))
            var x: CGFloat = -size.height
            while x < size.width + size.height {
                var p = Path()
                p.move(to: CGPoint(x: x, y: size.height))
                p.addLine(to: CGPoint(x: x + size.height, y: 0))
                p.addLine(to: CGPoint(x: x + size.height + 4, y: 0))
                p.addLine(to: CGPoint(x: x + 4, y: size.height))
                p.closeSubpath()
                ctx.fill(p, with: .color(Theme.askFill))
                x += 8
            }
        }
    }
}

/// The brand mark: a forest tile with a lime (pay) and a coral (hold) bar.
struct LogoMark: View {
    var size: CGFloat = 26
    /// On the forest welcome screen the tile is a lighter green so the mark stays visible.
    var onDark = false

    var body: some View {
        RoundedRectangle(cornerRadius: size * 0.3, style: .continuous)
            .fill(onDark ? Color(hex: 0x2E5E4B) : Theme.forest)
            .frame(width: size, height: size)
            .overlay(alignment: .center) {
                HStack(spacing: size * 0.06) {
                    Capsule().fill(Theme.lime).frame(width: size * 0.38, height: size * 0.17)
                    Capsule().fill(Color(hex: 0xFF8A7A)).frame(width: size * 0.17, height: size * 0.17)
                }
            }
            .accessibilityHidden(true)
    }
}

/// A document preview line: icon, title, detail.
struct DocBadge: View {
    let type: DocType
    let title: String
    let detail: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: type.symbol)
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(Theme.ink2)
                .frame(width: 40, height: 40)
                .background(Theme.sunken, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink).lineLimit(2)
                if !detail.isEmpty {
                    Text(detail).font(.footnote).foregroundStyle(Theme.ink3).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
    }
}
