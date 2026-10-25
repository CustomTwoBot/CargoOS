// Shell icons, drawn like the ones in components/case/glyphs.tsx: outline, stroke 1.6, currentColor.
const Line = ({ size = 18, d }: { size?: number; d: string }) => (
  <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="block flex-none"><path d={d} /></svg>
);

export const MenuIcon = () => <Line d="M3.5 6h13M3.5 10h13M3.5 14h13" />;
export const CloseIcon = () => <Line size={16} d="M5.5 5.5l9 9M14.5 5.5l-9 9" />;
export const SettingsIcon = () => (
  <svg viewBox="0 0 20 20" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="block flex-none">
    <circle cx="10" cy="10" r="2.6" />
    <path d="M10 2.8v2M10 15.2v2M2.8 10h2M15.2 10h2M4.9 4.9l1.4 1.4M13.7 13.7l1.4 1.4M4.9 15.1l1.4-1.4M13.7 6.3l1.4-1.4" />
  </svg>
);
