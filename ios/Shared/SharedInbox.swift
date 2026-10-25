import Foundation

/// Evidence the ops lead added on this phone (from the share sheet, Files, or paste),
/// waiting to be uploaded to the case. Stored in the App Group container so the
/// share extension and the app see the same list.
struct SharedItem: Codable, Identifiable, Hashable {
    enum Status: String, Codable { case onPhone = "on_phone", uploaded }

    let id: UUID
    let createdAt: String
    var caseId: String
    var type: DocType
    var title: String
    var text: String
    var sender: String?
    var sentAt: String?
    var detail: String
    var note: String?
    let sourceName: String
    /// File name of the kept original inside the inbox folder.
    var originalFile: String?
    var status: Status
    /// The server's document id once uploaded (`addDocument`).
    var docId: String? = nil
    /// Why the last upload didn't go through; the item stays on the phone and is retried.
    var uploadError: String? = nil
}

/// A case the share extension can offer in its picker. The app writes this list.
struct CaseRef: Codable, Hashable, Identifiable {
    let id: String
    let title: String
    let shipmentRef: String
}

struct SharedInbox {
    static let appGroup = "group.app.cargoos.ops"

    let root: URL

    init(root: URL? = nil) {
        let base = root
            ?? FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Self.appGroup)
            ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        self.root = base.appendingPathComponent("Inbox", isDirectory: true)
        try? FileManager.default.createDirectory(at: self.root, withIntermediateDirectories: true)
    }

    private var casesURL: URL { root.appendingPathComponent("cases.json") }

    func items() -> [SharedItem] {
        let files = (try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
        return files
            .filter { $0.pathExtension == "json" && $0.lastPathComponent != "cases.json" }
            .compactMap { try? JSONDecoder().decode(SharedItem.self, from: Data(contentsOf: $0)) }
            .sorted { $0.createdAt > $1.createdAt }
    }

    @discardableResult
    func add(_ draft: ImportDraft, caseId: String, note: String?, now: Date = Date()) throws -> SharedItem {
        let id = UUID()
        var original: String?
        if let file = draft.fileURL {
            let name = "\(id.uuidString).\(file.pathExtension.isEmpty ? "bin" : file.pathExtension)"
            try FileManager.default.copyItem(at: file, to: root.appendingPathComponent(name))
            original = name
        }
        let item = SharedItem(
            id: id, createdAt: ISODate.string(now), caseId: caseId, type: draft.type,
            title: draft.title, text: draft.text, sender: draft.sender, sentAt: draft.sentAt,
            detail: draft.detail, note: note?.nilIfEmpty, sourceName: draft.sourceName,
            originalFile: original, status: .onPhone
        )
        try save(item)
        return item
    }

    func save(_ item: SharedItem) throws {
        let data = try JSONEncoder().encode(item)
        try data.write(to: root.appendingPathComponent("\(item.id.uuidString).json"), options: .atomic)
    }

    func remove(_ item: SharedItem) {
        try? FileManager.default.removeItem(at: root.appendingPathComponent("\(item.id.uuidString).json"))
        if let original = item.originalFile {
            try? FileManager.default.removeItem(at: root.appendingPathComponent(original))
        }
    }

    func originalURL(_ item: SharedItem) -> URL? {
        item.originalFile.map { root.appendingPathComponent($0) }
    }

    func cases() -> [CaseRef] {
        (try? JSONDecoder().decode([CaseRef].self, from: Data(contentsOf: casesURL))) ?? []
    }

    func saveCases(_ cases: [CaseRef]) {
        try? JSONEncoder().encode(cases).write(to: casesURL, options: .atomic)
    }
}
