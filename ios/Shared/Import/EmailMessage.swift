import Foundation

/// An email as a .eml file, or pasted text that starts with mail headers.
/// Keeps the plain-text body; HTML-only mail is stripped to text.
struct EmailMessage: Equatable {
    let subject: String?
    let from: String?
    let date: String?       // ISO 8601 when the Date header parses
    let body: String

    var title: String { "Email: " + (subject ?? "(no subject)") }

    /// What we store as the document text: subject line first, as in the seeded email.
    var text: String {
        var lines: [String] = []
        if let from { lines.append("From: \(from)") }
        if let subject { lines.append("Subject: \(subject)") }
        lines.append(body)
        return lines.joined(separator: "\n")
    }

    var detail: String {
        [from.map { "From \(Self.displayName($0))" }, ISODate.short(date).nilIfEmpty]
            .compactMap { $0 }.joined(separator: " · ")
    }

    static func displayName(_ from: String) -> String {
        if let lt = from.firstIndex(of: "<") {
            let name = from[..<lt].trimmingCharacters(in: CharacterSet(charactersIn: " \""))
            if !name.isEmpty { return name }
        }
        return from
    }

    static func parse(_ raw: String) -> EmailMessage? {
        let text = raw.replacingOccurrences(of: "\r\n", with: "\n")
        guard let split = text.range(of: "\n\n") else { return nil }
        let headers = parseHeaders(String(text[..<split.lowerBound]))
        guard headers["from"] != nil || headers["subject"] != nil else { return nil }
        let body = decodeBody(headers: headers, body: String(text[split.upperBound...]))
        let date = headers["date"].flatMap(parseMailDate).map(ISODate.string)
        return EmailMessage(
            subject: headers["subject"].map(decodeWords),
            from: headers["from"].map(decodeWords),
            date: date,
            body: body.trimmingCharacters(in: .whitespacesAndNewlines)
        )
    }

    // MARK: - Headers

    static func parseHeaders(_ block: String) -> [String: String] {
        var result: [String: String] = [:]
        var lastKey: String?
        for line in block.components(separatedBy: "\n") {
            if let first = line.first, first == " " || first == "\t", let key = lastKey {
                result[key, default: ""] += " " + line.trimmingCharacters(in: .whitespaces)
            } else if let colon = line.firstIndex(of: ":") {
                let key = line[..<colon].lowercased().trimmingCharacters(in: .whitespaces)
                guard !key.contains(" ") else { continue }
                result[key] = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
                lastKey = key
            }
        }
        return result
    }

    private static func parseMailDate(_ s: String) -> Date? {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        let cleaned = s.replacingOccurrences(of: #"\s*\([^)]*\)$"#, with: "", options: .regularExpression)
        for format in ["EEE, d MMM yyyy HH:mm:ss Z", "d MMM yyyy HH:mm:ss Z", "EEE, d MMM yyyy HH:mm Z"] {
            f.dateFormat = format
            if let d = f.date(from: cleaned) { return d }
        }
        return nil
    }

    /// RFC 2047 encoded words: =?UTF-8?B?...?= and =?UTF-8?Q?...?=
    static func decodeWords(_ input: String) -> String {
        // Whitespace between two encoded words is not part of the text.
        let s = input.replacingOccurrences(of: #"\?=\s+=\?"#, with: "?==?", options: .regularExpression)
        let regex = try! NSRegularExpression(pattern: #"=\?([^?]+)\?([BbQq])\?([^?]*)\?="#)
        var out = s
        for m in regex.matches(in: s, range: NSRange(s.startIndex..., in: s)).reversed() {
            guard let whole = Range(m.range, in: s),
                  let enc = Range(m.range(at: 2), in: s),
                  let payload = Range(m.range(at: 3), in: s) else { continue }
            let data: Data?
            if s[enc].uppercased() == "B" {
                data = Data(base64Encoded: String(s[payload]))
            } else {
                data = decodeQuotedPrintable(String(s[payload]).replacingOccurrences(of: "_", with: " "))
            }
            if let data, let decoded = String(data: data, encoding: .utf8) {
                out.replaceSubrange(whole, with: decoded)
            }
        }
        return out
    }

    // MARK: - Body

    private static func decodeBody(headers: [String: String], body: String) -> String {
        let contentType = headers["content-type"]?.lowercased() ?? "text/plain"
        if contentType.hasPrefix("multipart/"), let boundary = parameter("boundary", in: headers["content-type"] ?? "") {
            let parts = body.components(separatedBy: "--" + boundary)
                .dropFirst()
                .filter { !$0.hasPrefix("--") }
            var htmlFallback: String?
            for part in parts {
                let trimmed = part.hasPrefix("\n") ? String(part.dropFirst()) : part
                guard let split = trimmed.range(of: "\n\n") else { continue }
                let partHeaders = parseHeaders(String(trimmed[..<split.lowerBound]))
                let partBody = String(trimmed[split.upperBound...])
                let type = partHeaders["content-type"]?.lowercased() ?? "text/plain"
                if type.hasPrefix("multipart/") {
                    let nested = decodeBody(headers: partHeaders, body: partBody)
                    if !nested.isEmpty { return nested }
                } else if type.hasPrefix("text/plain") {
                    return decodeTransfer(partHeaders, partBody)
                } else if type.hasPrefix("text/html"), htmlFallback == nil {
                    htmlFallback = stripHTML(decodeTransfer(partHeaders, partBody))
                }
            }
            return htmlFallback ?? ""
        }
        let decoded = decodeTransfer(headers, body)
        return contentType.hasPrefix("text/html") ? stripHTML(decoded) : decoded
    }

    private static func decodeTransfer(_ headers: [String: String], _ body: String) -> String {
        switch headers["content-transfer-encoding"]?.lowercased() {
        case "base64":
            let compact = body.components(separatedBy: .whitespacesAndNewlines).joined()
            return Data(base64Encoded: compact).flatMap { String(data: $0, encoding: .utf8) } ?? body
        case "quoted-printable":
            let joined = body.replacingOccurrences(of: "=\n", with: "")
            return decodeQuotedPrintable(joined).flatMap { String(data: $0, encoding: .utf8) } ?? body
        default:
            return body
        }
    }

    static func decodeQuotedPrintable(_ s: String) -> Data? {
        var bytes: [UInt8] = []
        let chars = Array(s.utf8)
        var i = 0
        while i < chars.count {
            if chars[i] == UInt8(ascii: "="), i + 2 < chars.count,
               let byte = UInt8(String(bytes: chars[(i + 1)...(i + 2)], encoding: .ascii) ?? "", radix: 16) {
                bytes.append(byte)
                i += 3
            } else {
                bytes.append(chars[i])
                i += 1
            }
        }
        return Data(bytes)
    }

    private static func parameter(_ name: String, in header: String) -> String? {
        for piece in header.components(separatedBy: ";") {
            let kv = piece.trimmingCharacters(in: .whitespaces)
            if kv.lowercased().hasPrefix(name + "=") {
                return String(kv.dropFirst(name.count + 1)).trimmingCharacters(in: CharacterSet(charactersIn: "\""))
            }
        }
        return nil
    }

    private static func stripHTML(_ html: String) -> String {
        html.replacingOccurrences(of: #"<br\s*/?>|</p>|</div>"#, with: "\n", options: [.regularExpression, .caseInsensitive])
            .replacingOccurrences(of: #"<[^>]+>"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: "&nbsp;", with: " ")
            .replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">")
            .replacingOccurrences(of: #"\n\s*\n+"#, with: "\n", options: .regularExpression)
    }
}

extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
