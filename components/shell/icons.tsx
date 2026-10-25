// Shell icons: outline, stroke 1.6, currentColor (docs/design.md §5). Status is never an icon (§0.4).
import type { ReactNode } from "react";

const Line = ({ size = 18, children }: { size?: number; children: ReactNode }) => (
  <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="block flex-none">{children}</svg>
);

export const Logo = () => (
  <svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true" className="block flex-none">
    <rect x="2.5" y="6" width="17" height="10.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
    <path d="M6.5 8.5v5.5M9.5 8.5v5.5M12.5 8.5v5.5M15.5 8.5v5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const MenuIcon = () => <Line><path d="M3.5 6h13M3.5 10h13M3.5 14h13" /></Line>;
export const CloseIcon = () => <Line size={16}><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" /></Line>;
export const PlusIcon = () => <Line size={16}><path d="M10 4.5v11M4.5 10h11" /></Line>;
export const CollapseIcon = () => <Line size={16}><rect x="3" y="4" width="14" height="12" rx="2" /><path d="M8 4v12M13.5 8l-2 2 2 2" /></Line>;
export const ExpandIcon = () => <Line size={16}><rect x="3" y="4" width="14" height="12" rx="2" /><path d="M8 4v12M11.5 8l2 2-2 2" /></Line>;
export const MoreIcon = () => (
  <svg viewBox="0 0 20 20" width={16} height={16} aria-hidden="true" className="block flex-none" fill="currentColor">
    <circle cx="4.5" cy="10" r="1.5" /><circle cx="10" cy="10" r="1.5" /><circle cx="15.5" cy="10" r="1.5" />
  </svg>
);
export const SettingsIcon = () => (
  <Line size={16}>
    <circle cx="10" cy="10" r="2.6" />
    <path d="M10 2.8v2M10 15.2v2M2.8 10h2M15.2 10h2M4.9 4.9l1.4 1.4M13.7 13.7l1.4 1.4M4.9 15.1l1.4-1.4M13.7 6.3l1.4-1.4" />
  </Line>
);
