// The phone link as a QR code: one SVG path of dark modules on a white square with the 4-module quiet
// zone. White and the dark forest stay dark-on-light in both themes so phone cameras always read it.
import { useMemo } from "react";
import { cx } from "@/components/case/cx";
import { encodeQr } from "./qr";

const QUIET = 4;

export function QrCode({ url, size = 168, className }: { url: string; size?: number; className?: string }) {
  const { path, n } = useMemo(() => {
    const qr = encodeQr(url);
    let d = "";
    qr.modules.forEach((row, r) => {
      // One run of dark modules per segment keeps the path short.
      for (let c = 0; c < row.length; c++) {
        if (!row[c]) continue;
        let end = c;
        while (end + 1 < row.length && row[end + 1]) end++;
        d += `M${c + QUIET} ${r + QUIET}h${end - c + 1}v1h${-(end - c + 1)}z`;
        c = end;
      }
    });
    return { path: d, n: qr.size + QUIET * 2 };
  }, [url]);

  return (
    <svg role="img" aria-label={`QR code for ${url}`} width={size} height={size} viewBox={`0 0 ${n} ${n}`}
      shapeRendering="crispEdges" className={cx("block rounded-[12px]", className)}>
      <rect width={n} height={n} rx={2} className="fill-white" />
      <path d={path} className="fill-[var(--lime-ink)]" />
    </svg>
  );
}
