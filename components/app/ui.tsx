// Shared pieces of the redesign (docs/design.md §0.5): cards, buttons, the pay/hold/ask bar, the
// logo, avatars. Tokens only; every page builds from these so the look stays one system.
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { Person } from "@/lib/types";
import { cx } from "@/components/case/cx";
import { firstName } from "@/components/shell/person";

export function Logo({ className, label = true }: { className?: string; label?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-2.5 text-[16px] font-extrabold tracking-[-0.02em] text-ink", className)}>
      <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="1" y="1" width="22" height="22" rx="7" className="fill-[var(--lime-ink)] dark:fill-[var(--lime)]" />
        <rect x="5" y="10" width="9" height="4" rx="2" className="fill-[var(--lime)] dark:fill-[var(--lime-ink)]" />
        <rect x="15" y="10" width="4" height="4" rx="2" className="fill-hold-fill" />
      </svg>
      {label && "CargoOS"}
    </span>
  );
}

/** The focus ring for the logo's link home (app frame, /start, landing). */
export const HOME_FOCUS = "rounded-[8px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand";

type CardProps = ComponentProps<"section"> & { focus?: boolean; tone?: "plain" | "pay" | "hold" | "brand" };
/** A white card; `focus` marks the one card that needs this person now. */
export function Card({ focus, tone = "plain", className, ...rest }: CardProps) {
  return (
    <section {...rest} className={cx(
      "rounded-[20px] border shadow-card",
      tone === "plain" && "bg-surface",
      tone === "pay" && "border-pay bg-surface",
      tone === "hold" && "border-hold bg-surface",
      tone === "brand" && "border-transparent bg-[var(--lime-ink)] text-white dark:bg-raised",
      focus ? "border-2 border-ink" : tone === "plain" ? "border-line" : "border-2",
      className,
    )} />
  );
}

export function Kicker({ tone = "muted", children, className }: { tone?: "muted" | "pay" | "hold" | "ask" | "ink" | "lime"; children: ReactNode; className?: string }) {
  return (
    <span className={cx("text-[12px] font-semibold uppercase tracking-[0.04em]",
      tone === "muted" && "text-ink-3", tone === "pay" && "text-pay", tone === "hold" && "text-hold",
      tone === "ask" && "text-ask", tone === "ink" && "text-ink", tone === "lime" && "text-lime", className)}>
      {children}
    </span>
  );
}

const BTN = "inline-flex h-[46px] items-center justify-center gap-2 whitespace-nowrap rounded-[12px] px-[18px] text-[14px] font-semibold transition-colors disabled:cursor-not-allowed aria-disabled:cursor-not-allowed";
export const BUTTON = {
  primary: cx(BTN, "bg-brand text-brand-ink hover:opacity-90 disabled:bg-raised disabled:text-ink-4 aria-disabled:bg-raised aria-disabled:text-ink-4"),
  secondary: cx(BTN, "border border-line-strong bg-surface text-ink hover:bg-sunken"),
  danger: cx(BTN, "bg-hold-fill text-white hover:opacity-90"),
  ghost: cx(BTN, "h-auto px-0 text-ink-2 underline underline-offset-4 hover:text-ink"),
  lime: cx(BTN, "bg-lime text-lime-ink hover:opacity-90"),
  small: "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border border-line-strong bg-surface px-3 text-[13px] font-semibold text-ink hover:bg-sunken",
} as const;

type ButtonProps = ComponentProps<"button"> & { variant?: keyof typeof BUTTON };
export function Button({ variant = "primary", className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} {...rest} className={cx(BUTTON[variant], className)} />;
}

type LinkButtonProps = ComponentProps<typeof Link> & { variant?: keyof typeof BUTTON };
export function LinkButton({ variant = "primary", className, ...rest }: LinkButtonProps) {
  return <Link {...rest} className={cx(BUTTON[variant], className)} />;
}

/** The pay / hold / ask bar. Widths follow the engine's cents; the ask part is striped. */
export function SplitBar({ pay, hold, ask, height = 16, label }: { pay: number; hold: number; ask: number; height?: number; label?: string }) {
  const total = pay + hold + ask;
  const part = (cents: number) => (total ? cents / total : 0);
  return (
    <div role="img" aria-label={label} className="flex w-full gap-[3px] overflow-hidden rounded-full bg-raised" style={{ height }}>
      <div className="seg-grow rounded-l-full bg-pay-fill" style={{ flexGrow: part(pay), flexBasis: 0 }} />
      <div className="seg-grow bg-hold-fill" style={{ flexGrow: part(hold), flexBasis: 0 }} />
      <div className="seg-grow ask-stripes rounded-r-full" style={{ flexGrow: part(ask), flexBasis: 0 }} />
    </div>
  );
}

/** The person's avatar: Sam forest + lime, Maya yellow, Leo grey. */
export function PersonAvatar({ person, size = 26 }: { person: Person; size?: number }) {
  const tone = person.id === "maya" ? "bg-maya text-maya-ink" : person.id === "sam" ? "bg-[var(--lime-ink)] text-lime dark:bg-lime dark:text-lime-ink" : "bg-raised text-ink-2";
  return (
    <span aria-hidden="true" className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-bold", tone)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}>
      {firstName(person).charAt(0)}
    </span>
  );
}

/** A small "Moved" / "New" tag on lime. */
export function Tag({ children }: { children: ReactNode }) {
  return <span className="rounded-[5px] bg-lime px-1.5 py-px text-[11px] font-bold text-lime-ink">{children}</span>;
}

/** Visually hidden label text for inputs whose label is shown elsewhere. */
export const SR_ONLY = "sr-only";
