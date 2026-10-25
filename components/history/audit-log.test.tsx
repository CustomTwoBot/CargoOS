import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SCENARIO_A } from "@/components/case/fixture";
import { LEO, SAM } from "@/components/inboxes/people";
import { AuditLog } from "./audit-log";

describe("AuditLog", () => {
  afterEach(cleanup);

  it("lists every step of the case, with the rechecks and answers", () => {
    render(<AuditLog x={SCENARIO_A.at("after")} viewer={SAM} />);
    const log = screen.getByRole("region", { name: "Audit log" });
    expect(within(log).getByRole("heading", { name: "Audit log" })).toBeInTheDocument();
    expect(within(log).getAllByText(/rechecked|Checked/i).length).toBeGreaterThan(0);
    expect(within(log).getByText("Answered the question")).toBeInTheDocument();
  });

  it("an uploader sees only what happened to documents: no amounts or quotes", () => {
    render(<AuditLog x={SCENARIO_A.at("after")} viewer={LEO} />);
    const log = screen.getByRole("region", { name: "Audit log" });
    expect(within(log).queryByText(/\$\d/)).not.toBeInTheDocument();
    expect(within(log).queryByText(/congestion/)).not.toBeInTheDocument();
  });
});
