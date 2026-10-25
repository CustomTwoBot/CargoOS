import Foundation

/// A chat export from WhatsApp (iOS or Android, 12h or 24h clock). We keep the
/// text as exported, only cleaning invisible marks, so Claude's quotes stay
/// exact substrings of what we store.
struct ChatExport: Equatable {
    struct Message: Equatable {
        let stamp: String   // "9/8/26, 9:12 AM" as printed
        let author: String
        var text: String
    }

    let messages: [Message]
    let text: String

    var participants: [String] {
        var seen: [String] = []
        for m in messages where !seen.contains(m.author) { seen.append(m.author) }
        return seen
    }

    var title: String {
        let names = participants.prefix(3).joined(separator: " / ")
        return names.isEmpty ? "Chat" : "WhatsApp: \(names)"
    }

    var detail: String {
        let n = messages.count
        let people = participants.count
        return "\(n) message\(n == 1 ? "" : "s") · \(people) \(people == 1 ? "person" : "people")"
    }

    // "[9/8/26, 9:12:03 AM] Derek PCL: text"  (iOS)
    // "9/8/26, 9:12 AM - Derek PCL: text"      (Android, and our fixture)
    // "08.09.2026, 09:12 - Derek: text"        (24h locales)
    private static let line = try! NSRegularExpression(
        pattern: #"^\[?(\d{1,4}[./-]\d{1,2}[./-]\d{1,4},?\s+\d{1,2}[:.]\d{2}(?:[:.]\d{2})?(?:\s?[AaPp]\.?\s?[Mm]\.?)?)\]?\s*(?:-\s+)?([^:\n]{1,60}?):\s?(.*)$"#
    )

    /// Removes the marks WhatsApp adds (left-to-right marks, narrow no-break spaces).
    static func clean(_ raw: String) -> String {
        raw.replacingOccurrences(of: "\u{200E}", with: "")
            .replacingOccurrences(of: "\u{200F}", with: "")
            .replacingOccurrences(of: "\u{202F}", with: " ")
            .replacingOccurrences(of: "\u{00A0}", with: " ")
            .replacingOccurrences(of: "\r\n", with: "\n")
    }

    /// Returns nil unless at least two lines look like chat messages.
    static func parse(_ raw: String) -> ChatExport? {
        let text = clean(raw).trimmingCharacters(in: .whitespacesAndNewlines)
        var messages: [Message] = []
        for lineText in text.components(separatedBy: "\n") {
            let ns = lineText as NSString
            if let m = line.firstMatch(in: lineText, range: NSRange(location: 0, length: ns.length)) {
                messages.append(Message(
                    stamp: ns.substring(with: m.range(at: 1)),
                    author: ns.substring(with: m.range(at: 2)).trimmingCharacters(in: .whitespaces),
                    text: ns.substring(with: m.range(at: 3))
                ))
            } else if !messages.isEmpty, !lineText.isEmpty {
                messages[messages.count - 1].text += "\n" + lineText
            }
        }
        guard messages.count >= 2 else { return nil }
        return ChatExport(messages: messages, text: text)
    }
}
