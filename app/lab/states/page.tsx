"use client";
// Lab: three styles for the case screen's states (SPEC.md §8, docs/design.md §7.14), side by side
// on Scenario A. Pick one; it applies to every state. Not linked from the product UI.
import { useState } from "react";
import { cx } from "@/components/case/cx";
import { ThemeToggle } from "@/components/case/theme-toggle";
import { SCENE_TITLE, VARIANTS, type Handlers, type Variant } from "@/components/states/variants";

export default function StatesLab() {
  const [id, setId] = useState<Variant["id"]>("A");
  const [pressed, setPressed] = useState<string>();
  const v = VARIANTS.find((x) => x.id === id)!;
  const h: Handlers = {
    onPaste: () => setPressed("Paste the text instead"),
    onLoad: () => setPressed("Load Scenario A"),
    onUndo: () => setPressed("Undo"),
    onKeepWaiting: () => setPressed("Keep them waiting"),
  };

  return (
    <main className="min-h-dvh min-w-[1280px] bg-bg text-ink">
      <div className="mx-auto max-w-[1232px] px-6 py-6">
        <header className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-title font-[650] tracking-[-0.012em]">Screen states</h1>
            <p className="mt-0.5 text-[13px] text-ink-2">
              Three styles for loading, rechecking, extraction failed, empty case and toasts. Pick one; it applies to all of them.
            </p>
          </div>
          <div className="flex flex-none items-center gap-2.5">
            <div role="group" aria-label="Variation" className="inline-flex rounded-[9px] border border-line bg-surface p-[3px] text-[13px] font-semibold">
              {VARIANTS.map((x) => (
                <button key={x.id} type="button" aria-pressed={x.id === id} onClick={() => setId(x.id)}
                  className={cx("rounded-[6px] px-3 py-1", x.id === id ? "bg-line-strong text-ink" : "text-ink-3 hover:text-ink")}>
                  {x.id} · {x.name}
                </button>
              ))}
            </div>
            <ThemeToggle />
          </div>
        </header>

        <dl className="mt-4 grid gap-1 text-[13px]">
          {VARIANTS.map((x) => (
            <div key={x.id} className={cx("flex gap-2", x.id === id ? "text-ink" : "text-ink-3")}>
              <dt className="w-[150px] flex-none font-semibold">{x.id} · {x.name}</dt>
              <dd>{x.idea} <span className={x.id === id ? "text-ink-2" : undefined}>Trade-off: {x.tradeoff}</span></dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 h-[18px] text-meta text-ink-3" aria-live="polite">
          {pressed ? `Pressed “${pressed}”. Buttons in the lab only report back.` : "Buttons in the lab only report back."}
        </p>

        <div className="mt-4 grid gap-7" data-testid={`variant-${v.id}`}>
          {v.scenes.map((s) => (
            <section key={s.key} aria-labelledby={`scene-${s.key}`} data-testid={`scene-${s.key}`}>
              <h2 id={`scene-${s.key}`} className="mb-2 text-body font-semibold">{SCENE_TITLE[s.key]}</h2>
              <div className="relative h-[430px] overflow-hidden rounded-xl border border-line-strong">{s.render(h)}</div>
              {s.below && <div className="mt-2">{s.below(h)}</div>}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
