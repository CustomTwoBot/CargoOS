import SwiftUI
import UIKit

/// Graphite tokens from docs/design.md §3.1, light and dark.
enum Theme {
    static let bg = dynamic(0xF2F3F5, 0x0D0E10)
    static let surface = dynamic(0xFFFFFF, 0x15171A)
    static let sunken = dynamic(0xF6F7F9, 0x1D2024)
    static let line = dynamic(0xE3E6EA, 0x272B30)
    static let lineStrong = dynamic(0xCFD4DA, 0x363B42)
    static let ink = dynamic(0x111315, 0xEDEEF0)
    static let ink2 = dynamic(0x4A5159, 0xA4AAB2)
    static let ink3 = dynamic(0x656C75, 0x7A818A)
    static let primary = dynamic(0x111315, 0xF2F3F5)
    static let primaryInk = dynamic(0xFFFFFF, 0x0D0E10)
    static let link = dynamic(0x1F4A8C, 0xD3DAE3)
    static let dispute = dynamic(0xC93A2C, 0xFF6B5E)
    static let disputeInk = dynamic(0xFFFFFF, 0x1E0906)
    static let waiting = dynamic(0x946100, 0xF2B84B)
    static let waitingFill = dynamic(0xEFB33F, 0xF2B84B)
    static let waitingTint = dynamic(0xFFF5DC, 0x2A2312)
    static let cleared = dynamic(0x1E8A55, 0x5BC48E)
    static let highlight = dynamic(0xFFE27A, 0xFFE066)
    static let highlightInk = Color(hex: 0x17140A)

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

/// White card on the page background, as on the web.
struct Card<Content: View>: View {
    var padding: CGFloat = 16
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content }
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Theme.line))
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .frame(maxWidth: .infinity, minHeight: 50)
            .foregroundStyle(Theme.primaryInk)
            .background(Theme.primary.opacity(isEnabled ? (configuration.isPressed ? 0.8 : 1) : 0.3),
                        in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.medium))
            .frame(maxWidth: .infinity, minHeight: 46)
            .foregroundStyle(Theme.ink)
            .background(Theme.surface.opacity(configuration.isPressed ? 0.7 : 1),
                        in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.lineStrong))
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
                .frame(width: 38, height: 38)
                .background(Theme.sunken, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
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
