// The sidebar says "Replay" only while the screen really runs the recorded replay; live, it says nothing.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { personById } from "@/lib/people";
import { Sidebar, type SidebarProps } from "./sidebar";

afterEach(cleanup);

const props = (replay: boolean, mode: SidebarProps["mode"]): SidebarProps => ({
  mode, replay, person: personById("sam")!, view: "cases", onView: () => {},
  cases: [], activeId: "", onOpenCase: () => {}, inbox: { questions: 0, approvals: 0 },
});

describe("Sidebar Replay label", () => {
  for (const mode of ["expanded", "collapsed"] as const) {
    it(`shows "Replay" in replay (${mode})`, () => {
      render(<Sidebar {...props(true, mode)} />);
      expect(screen.getByText("Replay")).toBeInTheDocument();
    });

    it(`shows no "Replay" when live (${mode})`, () => {
      render(<Sidebar {...props(false, mode)} />);
      expect(screen.queryByText("Replay")).not.toBeInTheDocument();
    });
  }
});
