import XCTest
@testable import CargoOS

final class ChatExportTests: XCTestCase {
    func testParsesAndroidStyleExportFromScenarioA() throws {
        let text = """
        9/8/26, 9:12 AM - Derek PCL: Booking confirmed for your 40HC, booked today Sep 8
        9/8/26, 9:15 AM - Sam Bayline: great thanks
        9/28/26, 10:02 AM - Derek PCL: heads up, possible congestion at LB terminal, may be extra
        9/28/26, 10:30 AM - Sam Bayline: ok keep me posted
        """
        let chat = try XCTUnwrap(ChatExport.parse(text))
        XCTAssertEqual(chat.messages.count, 4)
        XCTAssertEqual(chat.participants, ["Derek PCL", "Sam Bayline"])
        XCTAssertEqual(chat.messages[2].text, "heads up, possible congestion at LB terminal, may be extra")
        XCTAssertEqual(chat.title, "WhatsApp: Derek PCL / Sam Bayline")
        XCTAssertEqual(chat.detail, "4 messages · 2 people")
        // Stored text keeps every message verbatim, so quotes stay exact substrings.
        XCTAssertTrue(chat.text.contains("possible congestion at LB terminal, may be extra"))
    }

    func testParsesIOSStyleWithInvisibleMarks() throws {
        let text = "[9/8/26, 9:12:03\u{202F}AM] Derek PCL: \u{200E}Booking confirmed\n[9/8/26, 9:15:10\u{202F}AM] Sam Bayline: great thanks"
        let chat = try XCTUnwrap(ChatExport.parse(text))
        XCTAssertEqual(chat.messages.map(\.author), ["Derek PCL", "Sam Bayline"])
        XCTAssertEqual(chat.messages[0].text, "Booking confirmed")
        XCTAssertEqual(chat.messages[0].stamp, "9/8/26, 9:12:03 AM")
        XCTAssertFalse(chat.text.contains("\u{200E}"))
    }

    func testParses24HourDottedDates() throws {
        let text = "08.09.2026, 09:12 - Derek: Booking confirmed\n08.09.2026, 09:15 - Sam: ok"
        XCTAssertEqual(ChatExport.parse(text)?.messages.count, 2)
    }

    func testJoinsMultilineMessages() throws {
        let text = "9/8/26, 9:12 AM - Derek: first line\nsecond line\n9/8/26, 9:15 AM - Sam: ok"
        let chat = try XCTUnwrap(ChatExport.parse(text))
        XCTAssertEqual(chat.messages[0].text, "first line\nsecond line")
    }

    func testPlainTextIsNotAChat() {
        XCTAssertNil(ChatExport.parse("Ocean freight reduced to $4,500 if booked by Sep 10."))
    }
}

final class EmailMessageTests: XCTestCase {
    func testParsesPlainEml() throws {
        let eml = """
        From: Derek Lin <derek@pacificcrest.com>\r
        To: Maya <maya@bayline.com>\r
        Subject: RE: Q-PCL-0902 revised\r
        Date: Sat, 5 Sep 2026 14:21:00 -0700\r
        Content-Type: text/plain; charset=utf-8\r
        \r
        Hi Maya, we can do better on ocean. Ocean freight reduced to $4,500 if booked by Sep 10.\r
        """
        let mail = try XCTUnwrap(EmailMessage.parse(eml))
        XCTAssertEqual(mail.subject, "RE: Q-PCL-0902 revised")
        XCTAssertEqual(EmailMessage.displayName(mail.from ?? ""), "Derek Lin")
        XCTAssertEqual(mail.date.flatMap(ISODate.parse), ISODate.parse("2026-09-05T14:21:00-07:00"))
        XCTAssertTrue(mail.text.contains("Subject: RE: Q-PCL-0902 revised"))
        XCTAssertTrue(mail.body.contains("Ocean freight reduced to $4,500 if booked by Sep 10."))
    }

    func testPicksPlainPartOfMultipartAndDecodesQuotedPrintable() throws {
        let eml = """
        From: derek@pacificcrest.com
        Subject: =?UTF-8?B?UmU6IENvbmdlc3Rpb24gZmVl?=
        Content-Type: multipart/alternative; boundary="b1"

        --b1
        Content-Type: text/plain; charset=utf-8
        Content-Transfer-Encoding: quoted-printable

        Congestion fee =E2=80=94 $200, may be extra. This line is long and soft=
         wrapped.
        --b1
        Content-Type: text/html; charset=utf-8

        <p>Congestion fee</p>
        --b1--
        """
        let mail = try XCTUnwrap(EmailMessage.parse(eml))
        XCTAssertEqual(mail.subject, "Re: Congestion fee")
        XCTAssertEqual(mail.body, "Congestion fee — $200, may be extra. This line is long and soft wrapped.")
    }

    func testHTMLOnlyMailBecomesText() throws {
        let eml = "From: a@b.com\nSubject: Hi\nContent-Type: text/html\n\n<p>Rate is <b>$4,500</b></p><br>Thanks"
        let mail = try XCTUnwrap(EmailMessage.parse(eml))
        XCTAssertEqual(mail.body, "Rate is $4,500\nThanks")
    }

    func testTextWithoutHeadersIsNotAnEmail() {
        XCTAssertNil(EmailMessage.parse("just a note\n\nwith a blank line"))
    }
}

final class ZipReaderTests: XCTestCase {
    /// A WhatsApp-style export: deflated `_chat.txt` plus a media file (made with Python's zipfile).
    static let whatsAppZip = "UEsDBBQAAAAIAAitWF3WVyZqtQAAAOkAAAAJAAAAX2NoYXQudHh0ZY4xDoIwGEZ3T/EdgMSCaKSb6OCgiQkjcSjyiw20JW1JZOMEXsU7eRIhOpi4fvney8uT+XoerQIkPIw4W7yG5+Z4xo4s1ThtDxypMbXUFS5GX6VVVOJqLHrTWcRsvw1QjIdx9aYUPTJqsZ7lP9YlD9nXmgmFVPSN1MRRWRIe/iZ07SYg+hAh4yzicfwf8hoeNxKlQ9cGaI1zsmhoyqrIeWk0Rt0hhSerpBZNADX2FAS6eytmb1BLAwQUAAAACAAIrVhdpKGAbgwAAAAKAAAAEgAAADAwMDAwMDAzLVBIT1RPLmpwZ/t/Iy0xOzWrIDUdAFBLAQIUAxQAAAAIAAitWF3WVyZqtQAAAOkAAAAJAAAAAAAAAAAAAACAAQAAAABfY2hhdC50eHRQSwECFAMUAAAACAAIrVhdpKGAbgwAAAAKAAAAEgAAAAAAAAAAAAAAgAHcAAAAMDAwMDAwMDMtUEhPVE8uanBnUEsFBgAAAAACAAIAdwAAABgBAAAAAA=="

    func testReadsChatTextFromWhatsAppExport() throws {
        let zip = try XCTUnwrap(ZipReader(data: try XCTUnwrap(Data(base64Encoded: Self.whatsAppZip))))
        XCTAssertEqual(zip.entries.map(\.name), ["_chat.txt", "00000003-PHOTO.jpg"])
        let text = try XCTUnwrap(zip.chatText())
        let chat = try XCTUnwrap(ChatExport.parse(text))
        XCTAssertEqual(chat.messages.count, 3)
        XCTAssertEqual(chat.messages[2].text, "heads up, possible congestion at LB terminal, may be extra")
    }

    func testRejectsNonZipData() {
        XCTAssertNil(ZipReader(data: Data("not a zip".utf8)))
    }

    func testImportReaderOpensZipAsChat() async throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("WhatsApp Chat - Derek PCL.zip")
        try XCTUnwrap(Data(base64Encoded: Self.whatsAppZip)).write(to: url)
        let draft = await ImportReader.fromFile(url)
        XCTAssertEqual(draft.type, .chat)
        XCTAssertEqual(draft.title, "WhatsApp: Derek PCL / Sam Bayline")
        XCTAssertEqual(draft.fileURL, url)
    }
}

final class ImportReaderTests: XCTestCase {
    func testGuessesTypeFromText() {
        XCTAssertEqual(ImportReader.fromText("PACIFIC CREST LOGISTICS - INVOICE PCL-INV-1012").type, .freight_invoice)
        XCTAssertEqual(ImportReader.fromText("PACIFIC CREST LOGISTICS - QUOTATION Q-PCL-0902").type, .quote)
        XCTAssertEqual(ImportReader.fromText("call me tomorrow").type, .other)
        // Found on the real server: a note that mentions an invoice must not be sent as one.
        XCTAssertEqual(ImportReader.fromText("Note from Sam: forwarded invoice PCL-INV-1012 to Maya for checking.").type, .other)
        XCTAssertEqual(ImportReader.fromText("PROFORMA INVOICE PI-77").type, .proforma)
    }

    func testPastedEmailIsEmail() {
        let draft = ImportReader.fromText("From: Derek <d@pcl.com>\nSubject: RE: rate\n\nOcean freight reduced to $4,500")
        XCTAssertEqual(draft.type, .email)
        XCTAssertEqual(draft.title, "Email: RE: rate")
        XCTAssertEqual(draft.sender, "Derek")
    }
}

final class SharedInboxTests: XCTestCase {
    func testAddListAndRemoveKeepsOriginalFile() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let inbox = SharedInbox(root: root)
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".txt")
        try "9/8/26, 9:12 AM - A: x\n9/8/26, 9:13 AM - B: y".write(to: file, atomically: true, encoding: .utf8)
        var draft = ImportReader.fromText(try String(contentsOf: file, encoding: .utf8))
        draft.fileURL = file

        let item = try inbox.add(draft, caseId: "case_A", note: " ")
        XCTAssertEqual(inbox.items().map(\.id), [item.id])
        XCTAssertEqual(item.status, .onPhone)
        XCTAssertEqual(item.type, .chat)
        XCTAssertNil(SharedInbox(root: root).items().first?.note.flatMap { $0.trimmingCharacters(in: .whitespaces).nilIfEmpty })
        let original = try XCTUnwrap(inbox.originalURL(item))
        XCTAssertTrue(FileManager.default.fileExists(atPath: original.path))

        inbox.remove(item)
        XCTAssertTrue(inbox.items().isEmpty)
        XCTAssertFalse(FileManager.default.fileExists(atPath: original.path))
    }

    func testCaseListRoundTrips() {
        let inbox = SharedInbox(root: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
        XCTAssertEqual(inbox.cases(), [])
        inbox.saveCases([CaseRef(id: "case_A", title: "Bayline 40HC Ningbo-LB", shipmentRef: "PCL-INV-1012")])
        XCTAssertEqual(inbox.cases().map(\.id), ["case_A"])
        XCTAssertTrue(inbox.items().isEmpty, "cases.json must not show up as an inbox item")
    }
}

final class OCRRowsTests: XCTestCase {
    func testJoinsTableColumnsBackIntoRows() {
        // Vision order: all labels first, then all amounts (as seen on a real invoice photo).
        let pieces: [(text: String, box: CGRect)] = [
            ("6 Rush handling", CGRect(x: 0.05, y: 0.40, width: 0.3, height: 0.04)),
            ("1 Ocean freight 40HC", CGRect(x: 0.05, y: 0.60, width: 0.4, height: 0.04)),
            ("4,800.00", CGRect(x: 0.70, y: 0.605, width: 0.15, height: 0.04)),
            ("400.00", CGRect(x: 0.72, y: 0.395, width: 0.12, height: 0.04)),
        ]
        XCTAssertEqual(ImportReader.joinRows(pieces), "1 Ocean freight 40HC   4,800.00\n6 Rush handling   400.00")
    }

    func testKeepCopyKeepsTheFileName() throws {
        let src = FileManager.default.temporaryDirectory.appendingPathComponent("invoice-photo.png")
        try Data([1, 2, 3]).write(to: src)
        let copy = try ImportReader.keepCopy(of: src)
        XCTAssertEqual(copy.lastPathComponent, "invoice-photo.png")
        XCTAssertNotEqual(copy, src)
    }
}
