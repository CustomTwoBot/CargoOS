import Compression
import Foundation

/// Just enough of the zip format to open a WhatsApp "Export chat" archive:
/// reads the central directory and inflates stored or deflated entries.
/// Foundation has no unzip, and we don't add dependencies without asking.
struct ZipReader {
    struct Entry: Equatable {
        let name: String
        let method: UInt16
        let compressedSize: Int
        let size: Int
        let localHeaderOffset: Int
    }

    let data: Data
    let entries: [Entry]

    init?(data: Data) {
        self.data = data
        guard let entries = Self.readDirectory(data) else { return nil }
        self.entries = entries
    }

    func contents(of entry: Entry) -> Data? {
        let base = entry.localHeaderOffset
        guard u32(base) == 0x0403_4b50 else { return nil }
        let start = base + 30 + Int(u16(base + 26)) + Int(u16(base + 28))
        guard start + entry.compressedSize <= data.count else { return nil }
        let raw = data.subdata(in: start..<(start + entry.compressedSize))
        switch entry.method {
        case 0: return raw
        case 8: return Self.inflate(raw, size: entry.size)
        default: return nil
        }
    }

    /// WhatsApp names it `_chat.txt` (iOS) or `WhatsApp Chat with X.txt` (Android).
    func chatText() -> String? {
        let texts = entries.filter { $0.name.lowercased().hasSuffix(".txt") && !$0.name.hasPrefix("__MACOSX") }
        let pick = texts.first { $0.name.hasSuffix("_chat.txt") } ?? texts.first
        return pick.flatMap(contents).flatMap { String(data: $0, encoding: .utf8) }
    }

    // MARK: - Private

    private static func readDirectory(_ data: Data) -> [Entry]? {
        guard data.count >= 22 else { return nil }
        let reader = Bytes(data: data)
        // End of central directory: scan back over a possible comment (max 64 KB).
        var eocd: Int?
        var i = data.count - 22
        while i >= max(0, data.count - 22 - 65_535) {
            if reader.u32(i) == 0x0605_4b50 { eocd = i; break }
            i -= 1
        }
        guard let end = eocd else { return nil }
        let count = Int(reader.u16(end + 10))
        var offset = Int(reader.u32(end + 16))
        var entries: [Entry] = []
        for _ in 0..<count {
            guard offset + 46 <= data.count, reader.u32(offset) == 0x0201_4b50 else { return nil }
            let nameLength = Int(reader.u16(offset + 28))
            let extraLength = Int(reader.u16(offset + 30))
            let commentLength = Int(reader.u16(offset + 32))
            guard offset + 46 + nameLength <= data.count else { return nil }
            let nameData = data.subdata(in: (offset + 46)..<(offset + 46 + nameLength))
            entries.append(Entry(
                name: String(data: nameData, encoding: .utf8) ?? "",
                method: reader.u16(offset + 10),
                compressedSize: Int(reader.u32(offset + 20)),
                size: Int(reader.u32(offset + 24)),
                localHeaderOffset: Int(reader.u32(offset + 42))
            ))
            offset += 46 + nameLength + extraLength + commentLength
        }
        return entries
    }

    /// COMPRESSION_ZLIB is raw DEFLATE (RFC 1951), which is what zip stores.
    private static func inflate(_ raw: Data, size: Int) -> Data? {
        guard size > 0 else { return Data() }
        var out = Data(count: size)
        let written = out.withUnsafeMutableBytes { dst in
            raw.withUnsafeBytes { src in
                compression_decode_buffer(
                    dst.bindMemory(to: UInt8.self).baseAddress!, size,
                    src.bindMemory(to: UInt8.self).baseAddress!, raw.count,
                    nil, COMPRESSION_ZLIB
                )
            }
        }
        return written == size ? out : nil
    }

    private func u16(_ at: Int) -> UInt16 { Bytes(data: data).u16(at) }
    private func u32(_ at: Int) -> UInt32 { Bytes(data: data).u32(at) }

    private struct Bytes {
        let data: Data
        func u16(_ at: Int) -> UInt16 {
            guard at + 2 <= data.count else { return 0 }
            let s = data.startIndex + at
            return UInt16(data[s]) | UInt16(data[s + 1]) << 8
        }
        func u32(_ at: Int) -> UInt32 {
            guard at + 4 <= data.count else { return 0 }
            let s = data.startIndex + at
            return UInt32(data[s]) | UInt32(data[s + 1]) << 8 | UInt32(data[s + 2]) << 16 | UInt32(data[s + 3]) << 24
        }
    }
}
