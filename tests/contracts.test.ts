import { describe, expect, it } from "vitest";
import {
  ExtractionOutputSchema, QuestionPlanSchema, ReplyInterpretationSchema,
} from "@/lib/schemas";

// The LLM output examples from SPEC.md §5.4 must parse against the shared schemas.
describe("SPEC §5.4 LLM output formats", () => {
  it("parses the extraction example", () => {
    const out = ExtractionOutputSchema.parse({
      facts: [
        { kind: "agreed_rate", chargeType: "ocean_freight", amountCents: 450000, currency: "USD",
          condition: { bookedBy: "2026-09-10" }, effectiveAt: "2026-09-05T14:21:00-07:00",
          statedBy: "forwarder", origin: "extraction", confidence: 0.95,
          span: { docId: "doc_email", locator: "email body", quote: "Ocean freight reduced to $4,500 if booked by Sep 10" } },
      ],
      charges: [
        { lineNo: 1, billedBy: "forwarder", chargeType: "ocean_freight", description: "Ocean freight 40HC Ningbo-Long Beach",
          amountCents: 480000, currency: "USD",
          span: { docId: "doc_invoice", locator: "line 1", quote: "Ocean freight 40HC Ningbo-Long Beach   4,800.00" } },
      ],
    });
    expect(out.charges[0].amountCents).toBe(480000);
  });

  it("parses the question plan example and the no-question form", () => {
    expect(QuestionPlanSchema.parse({
      ask: true, to: "ops_lead", findingKeys: ["chg_4", "chg_6"],
      text: "Did anyone agree to either charge?",
      citations: [{ docId: "doc_chat", locator: "msg 2026-09-28 10:02", quote: "possible congestion at LB terminal, may be extra" }],
    }).ask).toBe(true);
    expect(QuestionPlanSchema.parse({ ask: false, reason: "math error, no question needed" }).ask).toBe(false);
  });

  it("parses the reply interpretation example", () => {
    const out = ReplyInterpretationSchema.parse({
      interpretation: "partial",
      facts: [
        { kind: "approval", chargeType: "congestion", amountCents: 20000, currency: "USD", statedBy: "ops_lead",
          effectiveAt: "2026-10-24T14:05:00-07:00", origin: "reply",
          span: { docId: "doc_reply_1", locator: "reply", quote: "approved the $200 congestion fee on WhatsApp" } },
        { kind: "rejection", chargeType: "handling", amountCents: 40000, currency: "USD", statedBy: "ops_lead",
          effectiveAt: "2026-10-24T14:05:00-07:00", origin: "reply",
          span: { docId: "doc_reply_1", locator: "reply", quote: "nobody agreed to $400 rush handling" } },
      ],
    });
    expect(out.facts).toHaveLength(2);
  });

  it("rejects fractional cents", () => {
    expect(() => ReplyInterpretationSchema.parse({
      interpretation: "yes",
      facts: [{ kind: "approval", amountCents: 200.5, effectiveAt: "2026-10-24", statedBy: "ops_lead", origin: "reply",
        span: { docId: "d", locator: "reply", quote: "ok" } }],
    })).toThrow();
  });
});
