import Foundation
import PDFKit
import UniformTypeIdentifiers
import Vision

/// Something the ops lead is about to add as evidence: a chat export, an email,
/// a PDF, a photo of a paper invoice. Built on the phone, before anything is uploaded.
struct ImportDraft: Equatable, Identifiable {
    var id = UUID()
    var type: DocType
    var title: String
    var text: String
    var sender: String?
    var sentAt: String?
    var detail: String
    var sourceName: String
    /// Original file to keep next to the text (PDF, photo, zip). Lives in a temp folder until saved.
    var fileURL: URL?
    var textWasRead: Bool { !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
}

enum ImportReader {
    /// Pasted or shared plain text: a chat export, an email, or a note.
    static func fromText(_ raw: String, sourceName: String = "Pasted text") -> ImportDraft {
        if let chat = ChatExport.parse(raw) {
            return ImportDraft(type: .chat, title: chat.title, text: chat.text, detail: chat.detail, sourceName: sourceName)
        }
        if let mail = EmailMessage.parse(raw) {
            return ImportDraft(type: .email, title: mail.title, text: mail.text, sender: mail.from.map(EmailMessage.displayName),
                               sentAt: mail.date, detail: mail.detail, sourceName: sourceName)
        }
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let firstLine = text.components(separatedBy: "\n").first ?? ""
        let type = guessType(text)
        return ImportDraft(type: type, title: titleFor(type, fallback: firstLine), text: text,
                           detail: "\(text.count) characters", sourceName: sourceName)
    }

    static func fromFile(_ url: URL) async -> ImportDraft {
        let name = url.lastPathComponent
        let ext = url.pathExtension.lowercased()
        let utType = UTType(filenameExtension: ext)

        if ext == "zip", let data = try? Data(contentsOf: url),
           let zip = ZipReader(data: data), let chatText = zip.chatText() {
            var draft = fromText(chatText, sourceName: name)
            draft.fileURL = url
            return draft
        }
        if ext == "eml" || utType?.conforms(to: .emailMessage) == true,
           let raw = try? String(contentsOf: url, encoding: .utf8), let mail = EmailMessage.parse(raw) {
            return ImportDraft(type: .email, title: mail.title, text: mail.text, sender: mail.from.map(EmailMessage.displayName),
                               sentAt: mail.date, detail: mail.detail, sourceName: name, fileURL: url)
        }
        if utType?.conforms(to: .pdf) == true, let pdf = PDFDocument(url: url) {
            let text = pdf.string ?? ""
            let type = guessType(text)
            let pages = pdf.pageCount
            return ImportDraft(type: type, title: titleFor(type, fallback: url.deletingPathExtension().lastPathComponent),
                               text: text, detail: "PDF · \(pages) page\(pages == 1 ? "" : "s")", sourceName: name, fileURL: url)
        }
        if utType?.conforms(to: .image) == true {
            let text = (try? await recognizeText(in: url)) ?? ""
            let type = text.isEmpty ? .other : guessType(text)
            let firstLine = text.components(separatedBy: "\n").first ?? ""
            return ImportDraft(type: type, title: titleFor(type, fallback: firstLine.isEmpty ? "Photo" : firstLine), text: text,
                               detail: text.isEmpty ? "Photo · no text found" : "Photo · text read on this phone",
                               sourceName: name, fileURL: url)
        }
        if let raw = try? String(contentsOf: url, encoding: .utf8) {
            var draft = fromText(raw, sourceName: name)
            draft.fileURL = url
            return draft
        }
        return ImportDraft(type: .other, title: name, text: "", detail: "File · can't read text", sourceName: name, fileURL: url)
    }

    /// Copies a file the system is about to take back (picker, share sheet) into our temp
    /// folder, keeping its name so the ops lead sees "invoice.pdf", not a random id.
    static func keepCopy(of url: URL) throws -> URL {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let copy = folder.appendingPathComponent(url.lastPathComponent)
        try FileManager.default.copyItem(at: url, to: copy)
        return copy
    }

    static func fromURL(_ url: URL) -> ImportDraft {
        ImportDraft(type: .other, title: url.host() ?? url.absoluteString, text: url.absoluteString,
                    detail: "Link", sourceName: url.absoluteString)
    }

    /// A first guess the ops lead can change. Never decides anything about money.
    /// Only a printed header counts (INVOICE, QUOTATION in capitals near the top), so a note that
    /// merely mentions "the invoice" stays Other and the server doesn't look for invoice lines in it.
    static func guessType(_ text: String) -> DocType {
        let head = String(text.prefix(600))
        if head.range(of: #"\b(PRO ?FORMA|PROFORMA)\b"#, options: .regularExpression) != nil { return .proforma }
        if head.range(of: #"\bINVOICE\b"#, options: .regularExpression) != nil { return .freight_invoice }
        if head.range(of: #"\b(QUOTATION|QUOTE)\b"#, options: .regularExpression) != nil { return .quote }
        return .other
    }

    private static func titleFor(_ type: DocType, fallback: String) -> String {
        let trimmed = String(fallback.prefix(60)).trimmingCharacters(in: .whitespaces)
        return trimmed.isEmpty ? type.label : trimmed
    }

    /// On-device OCR (Vision), so a photo of a paper invoice or a chat screenshot has text to quote.
    static func recognizeText(in url: URL) async throws -> String {
        try await Task.detached(priority: .userInitiated) {
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            try VNImageRequestHandler(url: url).perform([request])
            let pieces = (request.results ?? []).compactMap { obs in
                obs.topCandidates(1).first.map { (text: $0.string, box: obs.boundingBox) }
            }
            return joinRows(pieces)
        }.value
    }

    /// Vision returns a table's columns as separate pieces. Put pieces that sit on the same
    /// line back together, left to right, so "Rush handling" stays next to "400.00".
    /// Boxes are normalized with the origin at the bottom left, as Vision gives them.
    static func joinRows(_ pieces: [(text: String, box: CGRect)]) -> String {
        var rows: [(midY: CGFloat, height: CGFloat, items: [(text: String, box: CGRect)])] = []
        for piece in pieces.sorted(by: { $0.box.midY > $1.box.midY }) {
            if let i = rows.indices.last, abs(rows[i].midY - piece.box.midY) < min(rows[i].height, piece.box.height) * 0.5 {
                rows[i].items.append(piece)
            } else {
                rows.append((piece.box.midY, piece.box.height, [piece]))
            }
        }
        return rows
            .map { $0.items.sorted { $0.box.minX < $1.box.minX }.map(\.text).joined(separator: "   ") }
            .joined(separator: "\n")
    }
}
