import Foundation

/// The seeded people (lib/people.ts, SPEC §5.5). Each phone is set to one of them on the first
/// screen or in Settings; there is no login. Mutations carry the person's id and the server checks it.
struct Person: Identifiable, Hashable {
    let id: String
    let first: String
    let title: String
    let roles: Set<Role>
    let can: [String]
    let cant: [String]

    func holds(_ role: Role) -> Bool { roles.contains(role) }

    /// Only documents: no amounts, findings or disputes (CLAUDE.md rule 12).
    var isUploaderOnly: Bool { roles == [.uploader] }

    var initial: String { String(first.prefix(1)) }
}

enum People {
    static let sam = Person(
        id: "sam", first: "Sam", title: "Owner", roles: [.clerk, .ops_lead, .controller, .uploader],
        can: ["Answers CargoOS's questions", "Accepts or rejects disputes", "Writes to the seller"],
        cant: ["Can't accept a dispute they asked for"])
    static let maya = Person(
        id: "maya", first: "Maya", title: "Bookkeeper", roles: [.clerk, .uploader],
        can: ["Checks the lines", "Asks Sam to approve a dispute", "Adds documents"],
        cant: ["Can't accept disputes or answer CargoOS"])
    static let leo = Person(
        id: "leo", first: "Leo", title: "Uploader", roles: [.uploader],
        can: ["Sends chats, PDFs and photos to a bill"],
        cant: ["Sees no amounts or disputes"])

    static let all = [sam, maya, leo]

    static func byId(_ id: String?) -> Person? { all.first { $0.id == id } }

    /// Who CargoOS asks and who decides disputes.
    static let owner = sam
}

/// What this phone remembers about its person. Stored in the App Group so the share extension
/// uploads as the same person.
enum DeviceSettings {
    private static let defaults = UserDefaults(suiteName: SharedInbox.appGroup) ?? .standard
    private static let personKey = "cargoos.person"
    private static let onboardedKey = "cargoos.onboarded"

    static var person: Person {
        get { People.byId(defaults.string(forKey: personKey)) ?? People.sam }
        set { defaults.set(newValue.id, forKey: personKey) }
    }

    static var onboarded: Bool {
        get { defaults.bool(forKey: onboardedKey) }
        set { defaults.set(newValue, forKey: onboardedKey) }
    }
}
