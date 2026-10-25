import Foundation

/// Talks to the team's Convex deployment over its HTTP API (`POST /api/query`, `/api/mutation`).
/// No SDK, so no new dependency. Not reactive: `CaseStore` polls `getCaseView` instead.
struct ConvexClient {
    let deploymentURL: URL
    var session: URLSession = .shared

    enum Failure: Error, LocalizedError, Equatable {
        /// The deployment has no such public function (e.g. `uploads:addDocument` not shipped yet).
        case missingFunction(String)
        /// The function ran and threw (a `ConvexError`, a validator mismatch, ...).
        case server(String)
        case transport(String)

        var errorDescription: String? {
            switch self {
            case .missingFunction(let path): "The server doesn't have \(path) yet."
            case .server(let message): message
            case .transport(let message): message
            }
        }
    }

    func query<Value: Decodable>(_ path: String, _ args: some Encodable = Empty()) async throws -> Value {
        try await call("query", path, args)
    }

    func mutation<Value: Decodable>(_ path: String, _ args: some Encodable = Empty()) async throws -> Value {
        try await call("mutation", path, args)
    }

    /// Uploads raw bytes to a URL from `generateUploadUrl`; returns the storage id.
    func upload(_ data: Data, contentType: String, to url: URL) async throws -> String {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        let (body, response) = try await send(request, data)
        guard (response as? HTTPURLResponse)?.statusCode == 200,
              let result = try? JSONDecoder().decode(StorageResult.self, from: body) else {
            throw Failure.server("The file upload was refused.")
        }
        return result.storageId
    }

    struct Empty: Encodable {}

    // MARK: - Private

    private struct Request<Args: Encodable>: Encodable {
        let path: String
        let args: Args
        let format = "json"
    }

    private struct Envelope<Value: Decodable>: Decodable {
        let status: String
        let value: Value?
        let errorMessage: String?
    }

    private struct ErrorOnly: Decodable {
        let status: String
        let errorMessage: String?
    }

    private struct StorageResult: Decodable { let storageId: String }

    private func call<Value: Decodable>(_ kind: String, _ path: String, _ args: some Encodable) async throws -> Value {
        var request = URLRequest(url: deploymentURL.appendingPathComponent("api/\(kind)"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 20
        let (body, _) = try await send(request, try JSONEncoder().encode(Request(path: path, args: args)))

        if let failure = try? JSONDecoder().decode(ErrorOnly.self, from: body), failure.status == "error" {
            let message = failure.errorMessage ?? "Unknown server error"
            if message.contains("Could not find public function") { throw Failure.missingFunction(path) }
            throw Failure.server(Self.readable(message))
        }
        do {
            let envelope = try JSONDecoder().decode(Envelope<Value>.self, from: body)
            if let value = envelope.value { return value }
            // `null` results (e.g. getDemoCase before a reset) decode as Optional.none.
            if let nullable = Value.self as? ExpressibleByNilLiteral.Type, let none = nullable.init(nilLiteral: ()) as? Value {
                return none
            }
            throw Failure.server("Empty response from \(path)")
        } catch let error as Failure {
            throw error
        } catch {
            throw Failure.server("Couldn't read the response from \(path): \(error)")
        }
    }

    private func send(_ request: URLRequest, _ body: Data) async throws -> (Data, URLResponse) {
        do {
            return try await session.upload(for: request, from: body)
        } catch {
            throw Failure.transport("Can't reach the CargoOS server. \(error.localizedDescription)")
        }
    }

    /// `ConvexError("...")` arrives wrapped in "[Request ID: ...] Server Error\nUncaught ConvexError: ..."; keep the message.
    static func readable(_ message: String) -> String {
        if let range = message.range(of: "ConvexError: ") {
            return String(message[range.upperBound...]).components(separatedBy: "\n").first ?? message
        }
        return message
    }
}

/// `getCaseView` (convex/cases.ts): everything the case screen needs in one query.
extension CaseTotals {
    init(_ findings: [Finding], server t: CaseView.Totals) {
        self.init(findings, billed: t.billed, agreed: t.agreed, atStake: t.atStake, waiting: t.waiting)
    }
}

struct CaseView: Decodable {
    struct Totals: Decodable, Equatable {
        let billed: Int
        let agreed: Int
        let atStake: Int
        let waiting: Int
        let waived: Int
    }

    let `case`: CaseInfo
    let documents: [SourceDoc]
    let facts: [Fact]
    let charges: [Charge]
    let findings: [Finding]
    let changes: [FindingChange]
    let totals: Totals
    let questions: [Question]
    let replies: [Reply]
    let draft: Draft?
    let events: [CaseEvent]
}

/// The deployment URL: an in-app override first, then the build setting `CONVEX_URL`
/// (ios/Config/Local.xcconfig, written by ios/scripts/convex-env.sh). Empty means replay.
enum ServerConfig {
    static let overrideKey = "convexURL"

    static var deploymentURL: URL? {
        let override = UserDefaults.standard.string(forKey: overrideKey) ?? ""
        let built = Bundle.main.object(forInfoDictionaryKey: "ConvexURL") as? String ?? ""
        let raw = (override.isEmpty ? built : override).trimmingCharacters(in: .whitespaces)
        guard raw.hasPrefix("https://") || raw.hasPrefix("http://"), let url = URL(string: raw) else { return nil }
        return url
    }
}
