import Foundation
import UIKit

/// The person this phone is set to (SPEC §5.5, lib/people.ts): Sam, the owner, holds
/// `ops_lead` (answers questions) and `uploader` (adds documents). No login.
let devicePersonId = "sam"

/// Sends evidence kept on the phone to the case through `convex/uploads.ts` (Pranav):
/// a file goes to storage (`generateUploadUrl`, POST) and becomes a document (`addDocument`);
/// text with no file goes in as `addPastedText`. The server reads the text (how, from the
/// file name's extension), extracts and recomputes. Every call is made as Sam (uploader).
struct Uploader {
    let client: ConvexClient
    let inbox: SharedInbox

    struct UploadURLArgs: Encodable {
        let personId = devicePersonId
    }

    struct AddDocumentArgs: Encodable, Equatable {
        let caseId: String
        let personId = devicePersonId
        let storageId: String
        let fileName: String
        let docType: String
    }

    struct AddPastedTextArgs: Encodable, Equatable {
        let caseId: String
        let personId = devicePersonId
        let text: String
        let docType: String
        let title: String
    }

    /// What goes to the server for one item.
    enum Payload: Equatable {
        case file(data: Data, contentType: String, fileName: String)
        case pasted(text: String)
        case unsupported(String)
    }

    /// The server reads PDF, .eml, .txt, PNG, JPEG and WebP by file extension (uploads.ts).
    /// A WhatsApp .zip goes up as its chat .txt (the server can't unzip); HEIC and other photos
    /// go up as JPEG (the server can't read HEIC yet); text with no file goes up as pasted text.
    static func payload(for item: SharedItem, original: URL?) -> Payload {
        guard let original, let data = try? Data(contentsOf: original) else {
            return item.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? .unsupported("Nothing to send: no file and no text.") : .pasted(text: item.text)
        }
        let name = fileName(item, original)
        let base = (name as NSString).deletingPathExtension
        switch original.pathExtension.lowercased() {
        case "pdf": return .file(data: data, contentType: "application/pdf", fileName: name)
        case "eml": return .file(data: data, contentType: "message/rfc822", fileName: name)
        case "txt": return .file(data: data, contentType: "text/plain; charset=utf-8", fileName: name)
        case "zip": return .file(data: Data(item.text.utf8), contentType: "text/plain; charset=utf-8", fileName: base + ".txt")
        case "png": return .file(data: data, contentType: "image/png", fileName: name)
        case "jpg", "jpeg": return .file(data: data, contentType: "image/jpeg", fileName: name)
        case "webp": return .file(data: data, contentType: "image/webp", fileName: name)
        case "heic", "heif", "gif", "tiff", "tif", "bmp":
            guard let jpeg = UIImage(data: data)?.jpegData(compressionQuality: 0.85) else {
                return .unsupported("CargoOS couldn't convert this photo.")
            }
            return .file(data: jpeg, contentType: "image/jpeg", fileName: base + ".jpg")
        default:
            return item.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? .unsupported("CargoOS can't read .\(original.pathExtension) files. Send a PDF, .eml, .txt or a photo.")
                : .pasted(text: item.text)
        }
    }

    /// The server uses the file name as the document's title, so send the name the person saw.
    private static func fileName(_ item: SharedItem, _ original: URL) -> String {
        let source = (item.sourceName as NSString).lastPathComponent
        return source.lowercased().hasSuffix("." + original.pathExtension.lowercased()) ? source : original.lastPathComponent
    }

    /// Errors worth retrying on their own (no server function yet, no connection) start with this;
    /// anything else (a refused file, a validation error) waits for "Try sending again".
    static let autoRetryPrefix = "Waiting"

    /// Uploads every item still on the phone that can be retried. Returns the items as saved afterwards.
    @discardableResult
    func syncAll() async -> [SharedItem] {
        var result: [SharedItem] = []
        for item in inbox.items() where item.status == .onPhone
            && (item.uploadError == nil || item.uploadError!.hasPrefix(Self.autoRetryPrefix)) {
            result.append(await upload(item))
        }
        return result
    }

    func upload(_ item: SharedItem) async -> SharedItem {
        var item = item
        do {
            switch Self.payload(for: item, original: inbox.originalURL(item)) {
            case .file(let data, let contentType, let fileName):
                let urlString: String = try await client.mutation("uploads:generateUploadUrl", UploadURLArgs())
                guard let url = URL(string: urlString) else { throw ConvexClient.Failure.server("Bad upload URL") }
                let storageId = try await client.upload(data, contentType: contentType, to: url)
                item.docId = try await client.mutation("uploads:addDocument", AddDocumentArgs(
                    caseId: item.caseId, storageId: storageId, fileName: fileName, docType: item.type.rawValue)) as String
            case .pasted(let text):
                item.docId = try await client.mutation("uploads:addPastedText", AddPastedTextArgs(
                    caseId: item.caseId, text: text, docType: item.type.rawValue, title: item.title)) as String
            case .unsupported(let reason):
                item.uploadError = reason
                try? inbox.save(item)
                return item
            }
            item.status = .uploaded
            item.uploadError = nil
        } catch ConvexClient.Failure.missingFunction {
            item.uploadError = "Waiting: the server can't take uploads yet. Goes up automatically later."
        } catch ConvexClient.Failure.transport {
            item.uploadError = "Waiting for a connection. Goes up automatically."
        } catch {
            item.uploadError = error.localizedDescription
        }
        try? inbox.save(item)
        return item
    }
}
