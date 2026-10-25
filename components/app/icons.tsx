// One icon set for the whole app (lucide-react, already a dependency). Icons sit next to words,
// never instead of them: a status is always also written out. Stroke 1.8, sized by the caller.
import {
  CircleAlert, CircleCheck, CircleHelp, FileImage, FileText, Mail, MessageCircle, MessageSquareReply, Receipt, StickyNote,
  type LucideIcon, type LucideProps,
} from "lucide-react";
import type { DocType } from "@/lib/types";
import { cx } from "@/components/case/cx";

export * from "lucide-react";

/** The icon for each kind of document: invoice, quote, email, chat, the owner's answer, a note. */
export const DOC_ICON: Record<DocType, LucideIcon> = {
  freight_invoice: Receipt, quote: FileText, proforma: FileText, email: Mail, chat: MessageCircle,
  reply: MessageSquareReply, other: StickyNote,
};

export function DocIcon({ type, image, className, ...rest }: LucideProps & { type: DocType; image?: boolean }) {
  const Icon = image ? FileImage : DOC_ICON[type] ?? StickyNote;
  return <Icon aria-hidden="true" strokeWidth={1.8} className={cx("size-4 shrink-0", className)} {...rest} />;
}

/** Pay / Hold / Ask, as icons that go next to the word (never alone). */
export const MONEY_ICON = { pay: CircleCheck, hold: CircleAlert, ask: CircleHelp } as const;

export function MoneyIcon({ kind, className, ...rest }: LucideProps & { kind: keyof typeof MONEY_ICON }) {
  const Icon = MONEY_ICON[kind];
  return <Icon aria-hidden="true" strokeWidth={2} className={cx("size-[15px] shrink-0", className)} {...rest} />;
}
