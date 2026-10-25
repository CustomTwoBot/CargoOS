// Shared pieces of the redesign (docs/design.md §0.5): cards, buttons, the pay/hold/ask bar, the
// logo, avatars. Tokens only; every page builds from these so the look stays one system.
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { Person } from "@/lib/types";
import { cx } from "@/components/case/cx";
import { firstName } from "@/components/shell/person";

export function Logo({ className, label = true, labelClassName }: { className?: string; label?: boolean; labelClassName?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2.5 text-[16px] font-extrabold tracking-[-0.02em] text-ink", className)}>
      <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="1" y="1" width="22" height="22" rx="7" className="fill-[var(--lime-ink)] dark:fill-[var(--lime)]" />
        <rect x="5" y="10" width="9" height="4" rx="2" className="fill-[var(--lime)] dark:fill-[var(--lime-ink)]" />
        <rect x="15" y="10" width="4" height="4" rx="2" className="fill-hold-fill" />
      </svg>
      {label && <span className={labelClassName}>CargoOS</span>}
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

// Every button: a short color/opacity transition, a slight press (not with reduced motion) and the
// app's focus ring (globals.css :focus-visible).
const PRESS = "transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-150 ease-out active:scale-[.98] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:active:scale-100 aria-disabled:active:scale-100";
const BTN = cx("inline-flex h-[46px] items-center justify-center gap-2 whitespace-nowrap rounded-[12px] px-[18px] text-[14px] font-semibold disabled:cursor-not-allowed aria-disabled:cursor-not-allowed", PRESS);
export const BUTTON = {
  primary: cx(BTN, "bg-brand text-brand-ink hover:opacity-90 disabled:bg-raised disabled:text-ink-4 aria-disabled:bg-raised aria-disabled:text-ink-4"),
  secondary: cx(BTN, "border border-line-strong bg-surface text-ink hover:border-ink-4 hover:bg-sunken"),
  danger: cx(BTN, "bg-hold-fill text-white hover:opacity-90"),
  ghost: cx(BTN.replace("h-[46px] ", "").replace("px-[18px] ", ""), "h-auto text-ink-2 underline underline-offset-4 hover:text-ink active:scale-100"),
  lime: cx(BTN, "bg-lime text-lime-ink hover:opacity-90"),
  small: cx("inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border border-line-strong bg-surface px-3 text-[13px] font-semibold text-ink hover:border-ink-4 hover:bg-sunken", PRESS),
} as const;

/** An icon next to a button's words (never instead of them). `end` puts it after, e.g. Continue →. */
type IconProps = { icon?: LucideIcon; iconEnd?: boolean };
const withIcon = (children: ReactNode, Icon?: LucideIcon, end?: boolean) => {
  if (!Icon) return children;
  const glyph = <Icon aria-hidden="true" strokeWidth={2} className={cx("size-4 shrink-0", end && "transition-transform duration-150 group-hover/btn:translate-x-0.5 motion-reduce:transition-none")} />;
  return end ? <>{children}{glyph}</> : <>{glyph}{children}</>;
};

type ButtonProps = ComponentProps<"button"> & { variant?: keyof typeof BUTTON } & IconProps;
export function Button({ variant = "primary", className, type = "button", icon, iconEnd, children, ...rest }: ButtonProps) {
  return <button type={type} {...rest} className={cx(BUTTON[variant], icon && "group/btn", className)}>{withIcon(children, icon, iconEnd)}</button>;
}

type LinkButtonProps = ComponentProps<typeof Link> & { variant?: keyof typeof BUTTON } & IconProps;
export function LinkButton({ variant = "primary", className, icon, iconEnd, children, ...rest }: LinkButtonProps) {
  return <Link {...rest} className={cx(BUTTON[variant], icon && "group/btn", className)}>{withIcon(children, icon, iconEnd)}</Link>;
}

/** The pay / hold / ask bar. Widths follow the engine's cents; the ask part is striped. On mount the
 *  fill sweeps in from the left (900ms, ease-move); later changes slide each segment (.seg-grow).
 *  Both are off with prefers-reduced-motion. */
export function SplitBar({ pay, hold, ask, height = 16, label, animate = true }: { pay: number; hold: number; ask: number; height?: number; label?: string; animate?: boolean }) {
  const total = pay + hold + ask;
  const part = (cents: number) => (total ? cents / total : 0);
  return (
    <div role="img" aria-label={label} title={label} className="w-full overflow-hidden rounded-full bg-raised" style={{ height }}>
      <div className={cx("flex h-full w-full",
        animate && "animate-in slide-in-from-left fade-in-50 duration-[900ms] ease-[var(--ease-move)] motion-reduce:animate-none")}>
        <div className="seg-grow rounded-l-full bg-pay-fill" style={{ flexGrow: part(pay), flexBasis: 0 }} />
        <div className="seg-grow bg-hold-fill" style={{ flexGrow: part(hold), flexBasis: 0, marginLeft: pay && hold ? 3 : 0 }} />
        <div className="seg-grow ask-stripes rounded-r-full" style={{ flexGrow: part(ask), flexBasis: 0, marginLeft: ask && (pay || hold) ? 3 : 0 }} />
      </div>
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
