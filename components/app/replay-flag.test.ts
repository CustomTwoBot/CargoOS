// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { readReplay } from "./bills-provider";

const at = (url: string) => window.history.replaceState({}, "", url);

afterEach(() => { at("/"); sessionStorage.clear(); });

describe("readReplay", () => {
  it("?replay=1 sticks for the tab, and ?replay=0 turns it off again", () => {
    at("/bills");
    expect(readReplay()).toBe(false);

    at("/bills?replay=1");
    expect(readReplay()).toBe(true);
    expect(sessionStorage.getItem("cargoos.replay")).toBe("1");
    at("/bills/case_A");
    expect(readReplay()).toBe(true);

    at("/settings?replay=0");
    expect(readReplay()).toBe(false);
    expect(sessionStorage.getItem("cargoos.replay")).toBeNull();
    at("/bills");
    expect(readReplay()).toBe(false);
  });
});
