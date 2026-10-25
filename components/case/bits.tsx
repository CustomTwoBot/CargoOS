// Small shared pieces: status tag, row tag, "?" hint (docs/design.md §7.5, §7.13).
import { Tooltip } from "@base-ui/react/tooltip";
import { cx } from "./cx";
import { StatusGlyph } from "./glyphs";
import { GROUP_NAME, type UiGroup } from "./view-model";

/** Status by shape: solid red, dashed amber, or a green check with no fill. */
export function StatusTag({ group, label }: { group: UiGroup; label?: string }) {
  const text = label ?? (group === "waiting" ? "Waiting" : GROUP_NAME[group]);
  return (
    <span className={cx(
      "inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-sm px-2 text-meta font-semibold leading-5",
      group === "dispute" && "bg-dispute text-dispute-ink",
      group === "waiting" && "border border-dashed border-waiting-line bg-waiting-tint text-waiting",
      group === "cleared" && "pl-0 text-ink [&_svg]:text-cleared",
    )}>
      <StatusGlyph group={group} />{text}
    </span>
  );
}

export const RowTagChip = ({ children }: { children: string }) => (
  <span className="rounded-[5px] border border-primary-ring px-1.5 text-[11px] font-semibold leading-[18px] text-ink">{children}</span>
);

export const HINTS = {
  atStake: "Money on this invoice that doesn't match what was agreed. You may not owe it. Nothing is paid or sent automatically.",
  dispute: "Charges that are higher than what was agreed, or that someone said were never agreed.",
  waiting: "Charges nobody has agreed to yet. CargoOS asked the person who would know.",
  cleared: "Charges that match the quote, an email or a chat, or that someone approved.",
} as const;

export function Hint({ label, text }: { label: string; text: string }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        aria-label={`What is ${label}?`}
        className="inline-grid size-[15px] flex-none cursor-help place-items-center rounded-full border border-line-strong text-[10px] font-bold leading-none text-ink-3"
      >?</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={6} className="z-50">
          <Tooltip.Popup className="w-[250px] rounded-[10px] bg-tip-bg px-3 py-2.5 text-meta text-tip-ink shadow-[0_8px_24px_rgba(0,0,0,.25)]">
            <b className="mb-0.5 block text-[13px]">{label}</b>{text}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
