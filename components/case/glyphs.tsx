// SVG glyphs from docs/design.md §5 and the reference's IC object. currentColor everywhere.
import type { ReactNode } from "react";
import type { UiGroup } from "./view-model";

const Line = ({ size = 18, children }: { size?: number; children: ReactNode }) => (
  <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="block flex-none">{children}</svg>
);

export function StatusGlyph({ group }: { group: UiGroup }) {
  const p = { viewBox: "0 0 14 14", width: 14, height: 14, "aria-hidden": true, className: "block flex-none" } as const;
  if (group === "dispute") return (
    <svg {...p}><circle cx="7" cy="7" r="5.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4.9 4.9l4.2 4.2M9.1 4.9l-4.2 4.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
  );
  if (group === "waiting") return (
    <svg {...p}><circle cx="7" cy="7" r="5.75" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2.1 1.7" />
      <path d="M5.5 5.6a1.6 1.6 0 1 1 2.3 1.45c-.5.27-.8.6-.8 1.1v.3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="7" cy="10.2" r=".85" fill="currentColor" /></svg>
  );
  return (
    <svg {...p}><path d="M3.2 7.4l2.6 2.6 5-5.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
  );
}

export const Logo = () => (
  <svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true" className="block flex-none">
    <rect x="2.5" y="6" width="17" height="10.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
    <path d="M6.5 8.5v5.5M9.5 8.5v5.5M12.5 8.5v5.5M15.5 8.5v5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const CasesIcon = () => <Line><rect x="3" y="4" width="14" height="5" rx="1.5" /><rect x="3" y="11" width="14" height="5" rx="1.5" /></Line>;
export const ListIcon = () => <Line><path d="M7.5 5.5h9M7.5 10h9M7.5 14.5h9M3.6 5.5h.01M3.6 10h.01M3.6 14.5h.01" /></Line>;
export const QuestionsIcon = () => <Line><path d="M3.5 4.5h13v8.5H9.5l-4 3v-3h-2z" /></Line>;
export const DocumentsIcon = () => <Line><path d="M5.5 2.8h6l3.2 3.2v11.2H5.5zM11.5 2.8V6h3.2" /></Line>;
export const HistoryIcon = () => <Line><circle cx="10" cy="10" r="6.5" /><path d="M10 6.5V10l2.5 1.6" /></Line>;
export const SunIcon = () => (
  <Line size={15}><circle cx="10" cy="10" r="3.2" />
    <path d="M10 2.5v1.8M10 15.7v1.8M2.5 10h1.8M15.7 10h1.8M4.7 4.7l1.3 1.3M14 14l1.3 1.3M4.7 15.3L6 14M14 6l1.3-1.3" /></Line>
);
export const MoonIcon = () => <Line size={15}><path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z" /></Line>;

// Evidence chain icons (reference IC.inv, mail, chat, quote, scale), 15px.
export const ChainGlyph = ({ icon }: { icon: "invoice" | "mail" | "chat" | "quote" | "answer" | "check" | "result" }) => {
  if (icon === "invoice") return <Line size={15}><path d="M5 2.8h10v14.4l-2.2-1.4-2.3 1.4-2.3-1.4L5 17.2zM8 7h4M8 10h4" /></Line>;
  if (icon === "mail") return <Line size={15}><rect x="2.8" y="4.5" width="14.4" height="11" rx="1.5" /><path d="M3.2 5.5l6.8 5 6.8-5" /></Line>;
  if (icon === "chat" || icon === "answer") return <Line size={15}><path d="M3.5 4.5h13v8.5H9.5l-4 3v-3h-2z" /></Line>;
  if (icon === "result") return <Line size={15}><path d="M10 3v14M5 17h10M4 7h12M4 7l-2 5h4zM16 7l-2 5h4z" /></Line>;
  if (icon === "check") return <Line size={15}><circle cx="9" cy="9" r="5" /><path d="M13 13l4 4" /></Line>;
  return <Line size={15}><path d="M5.5 2.8h6l3.2 3.2v11.2H5.5zM11.5 2.8V6h3.2M8 10h4.5M8 13h4.5" /></Line>;
};

export const CollapseIcon = () => <Line size={16}><rect x="3" y="4" width="14" height="12" rx="2" /><path d="M8 4v12M13.5 8l-2 2 2 2" /></Line>;
export const ExpandIcon = () => <Line size={16}><rect x="3" y="4" width="14" height="12" rx="2" /><path d="M8 4v12M11.5 8l2 2-2 2" /></Line>;
export const PlusIcon = () => <Line size={14}><path d="M10 4.5v11M4.5 10h11" /></Line>;
export const OverviewIcon = () => <Line size={14}><rect x="3.5" y="3.5" width="5.5" height="5.5" rx="1.2" /><rect x="11" y="3.5" width="5.5" height="5.5" rx="1.2" /><rect x="3.5" y="11" width="5.5" height="5.5" rx="1.2" /><rect x="11" y="11" width="5.5" height="5.5" rx="1.2" /></Line>;
export const DraftIcon = () => <Line size={14}><rect x="2.8" y="4.5" width="14.4" height="11" rx="1.5" /><path d="M3.2 5.5l6.8 5 6.8-5" /></Line>;
