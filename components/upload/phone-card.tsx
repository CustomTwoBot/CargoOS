"use client";
// "Add from a phone" on /bills/new: the QR code for /upload/<caseId>, the link with Copy link, and, live,
// a quiet "Waiting for the phone…" until the first file arrives from it.
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Smartphone } from "@/components/app/icons";
import { useBills } from "@/components/app/bills-provider";
import { BUTTON, Button, Card } from "@/components/app/ui";
import { cx } from "@/components/case/cx";
import { QrCode } from "./qr-code";

export const PHONE_CARD_COPY = {
  title: "Add from a phone",
  body: "Scan with a phone camera to send a WhatsApp export, a PDF or a photo. Leo can add files but sees no amounts.",
  getLink: "Get a phone link",
  copy: "Copy link",
  copied: "Copied",
  copyFailed: "Couldn't copy the link. Select it and copy it instead.",
  waiting: "Waiting for the phone…",
} as const;

export function PhoneCard({ url, onGetLink, waiting }: { url?: string; onGetLink?: () => void; waiting?: boolean }) {
  const { toast } = useBills();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast(PHONE_CARD_COPY.copyFailed);
    }
  };

  return (
    <Card className="flex flex-col items-start gap-3 p-5">
      <h2 className="inline-flex items-center gap-2 text-[15px] font-bold text-ink">
        <Smartphone aria-hidden="true" strokeWidth={1.8} className="size-[18px] text-brand" />
        {PHONE_CARD_COPY.title}
      </h2>
      <p className="text-[13.5px] text-ink-2">{PHONE_CARD_COPY.body}</p>
      {url ? (
        <>
          <QrCode url={url} size={176} className="border border-line" />
          <a href={url} target="_blank" rel="noreferrer" className="max-w-full break-all text-meta text-ink-3 underline-offset-4 hover:underline">
            {url.replace(/^https?:\/\//, "")}
          </a>
          <button type="button" onClick={() => void copy()} className={cx(BUTTON.small, "min-w-[112px]")}>
            {copied
              ? <Check aria-hidden="true" strokeWidth={2.4} className="size-3.5 text-pay animate-in zoom-in-50 duration-200 motion-reduce:animate-none" />
              : <Copy aria-hidden="true" strokeWidth={2} className="size-3.5 text-ink-2" />}
            {copied ? PHONE_CARD_COPY.copied : PHONE_CARD_COPY.copy}
          </button>
          <span role="status" className="sr-only">{copied ? "Link copied" : ""}</span>
          {waiting && (
            <p className="inline-flex items-center gap-2 text-meta font-semibold text-ink-2">
              <span aria-hidden="true" className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex size-2 rounded-full bg-brand" />
              </span>
              {PHONE_CARD_COPY.waiting}
            </p>
          )}
        </>
      ) : onGetLink ? (
        <Button variant="secondary" onClick={onGetLink}>
          <Smartphone aria-hidden="true" strokeWidth={1.8} className="size-4 text-ink-2" />{PHONE_CARD_COPY.getLink}
        </Button>
      ) : null}
    </Card>
  );
}
