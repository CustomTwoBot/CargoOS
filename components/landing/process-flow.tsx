// The whole path of one bill on the landing page, upload to letter, with who does each step: a person,
// Claude (reads and words, never decides) or CargoOS rules (code that moves the money; CLAUDE.md rule 3).
// Six steps in a row from 1280px, two rows of three from 768px, a vertical list on phones. A lime pulse
// runs along the connector on wide screens (transform only, off under prefers-reduced-motion).
import { cx } from "@/components/case/cx";
import { Kicker } from "@/components/app/ui";

type Actor = "person" | "claude" | "rules";

const ACTOR: Record<Actor, { label: string; className: string }> = {
  person: { label: "You", className: "border border-line-strong bg-surface text-ink-2" },
  claude: { label: "Claude", className: "bg-ink text-bg" },
  rules: { label: "CargoOS rules", className: "bg-lime text-lime-ink" },
};

export const FLOW: { title: string; text: string; actor: Actor }[] = [
  { title: "Upload", actor: "person", text: "Drop the invoice, the quote, the emails and the WhatsApp chat, or send them from a phone with the QR code." },
  { title: "Read", actor: "claude", text: "Claude reads each document and pulls out what was agreed, word for word. A quote that isn't in the text is dropped." },
  { title: "Check", actor: "rules", text: "Every invoice line is compared with what was agreed. Each one lands in Pay, Hold or Ask, with the words that decided it." },
  { title: "Ask", actor: "claude", text: "When nothing settles a line, Claude asks the owner one question. The answer becomes evidence and the lines are checked again." },
  { title: "Approve", actor: "person", text: "The bookkeeper asks the owner to approve the dispute. The owner accepts or rejects it, never one they asked for." },
  { title: "Letter", actor: "claude", text: "Claude words the message to the forwarder; code puts in every number. You copy it or save a PDF. Nothing is sent." },
];

const CSS = `
@keyframes cg-flow { from { transform: translate3d(-100%, 0, 0); } to { transform: translate3d(100%, 0, 0); } }
.cg-flow { animation: cg-flow 7s cubic-bezier(0.45, 0, 0.55, 1) infinite; will-change: transform; }
@media (prefers-reduced-motion: reduce) { .cg-flow { animation: none; display: none; } }
`;

export function ProcessFlow({ className }: { className?: string }) {
  return (
    <section aria-labelledby="flow-title" className={className}>
      <style>{CSS}</style>
      <div className="mb-6 flex flex-col gap-1">
        <Kicker>The whole flow</Kicker>
        <h2 id="flow-title" className="text-[30px] font-bold leading-[36px] tracking-[-0.03em]">What happens to a bill</h2>
        <p className="max-w-[640px] text-[15px] leading-[23px] text-ink-2">
          Claude reads and writes. The rules decide what is safe to pay. People answer and approve.
        </p>
      </div>
      <div className="relative">
        {/* The connector behind the step numbers, with a lime pulse travelling along it. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-5 top-[19px] hidden h-[2px] overflow-hidden rounded-full bg-line xl:block">
          <div className="cg-flow absolute inset-0">
            <span className="absolute right-0 top-0 h-full w-[140px] rounded-full bg-[linear-gradient(90deg,transparent,var(--lime))]" />
          </div>
        </div>
        <ol className="relative grid gap-x-5 gap-y-6 md:grid-cols-3 xl:grid-cols-6">
          {FLOW.map((s, i) => {
            const actor = ACTOR[s.actor];
            return (
              <li key={s.title} className="flex gap-4 xl:flex-col xl:gap-3">
                <span aria-hidden="true" className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-line-strong bg-surface text-[15px] font-bold text-ink">
                  {i + 1}
                </span>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <h3 className="flex flex-wrap items-center gap-2 text-[17px] font-bold leading-[24px]">
                    <span className="sr-only">Step {i + 1}: </span>{s.title}
                    <span className={cx("rounded-full px-2 py-px text-[11.5px] font-semibold", actor.className)}>{actor.label}</span>
                  </h3>
                  <p className="text-[14px] leading-[22px] text-ink-2">{s.text}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
