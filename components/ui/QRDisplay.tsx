"use client";

import { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Copy, Share2, Download, Check } from "lucide-react";
import { GlassSurface } from "./GlassSurface";

interface QRDisplayProps {
  /** The deep-link payload encoded in the QR, e.g. https://nexus.app/join/school/SCH-7F82K91 */
  value: string;
  /** The human-readable code shown alongside the QR, e.g. SCH-7F82K91 */
  code: string;
  label?: string;
  size?: number;
}

export function QRDisplay({ value, code, label = "Code", size = 176 }: QRDisplayProps) {
  const [copied, setCopied] = useState(false);
  const canvasWrapRef = useRef<HTMLDivElement>(null);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleShare = async () => {
    const shareData = { title: "Join NEXUS", text: `Use code ${code} to join on NEXUS.`, url: value };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // user cancelled — no-op
      }
    } else {
      await navigator.clipboard.writeText(`${shareData.text} ${value}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const handleDownload = () => {
    const canvas = canvasWrapRef.current?.querySelector("canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `nexus-${code}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div className="flex flex-col items-center">
      <GlassSurface rounded="3xl" className="flex flex-col items-center gap-4" padded>
        <div ref={canvasWrapRef} className="rounded-2xl bg-white p-3">
          <QRCodeCanvas value={value} size={size} bgColor="#ffffff" fgColor="#0A0A11" level="M" />
        </div>
        <div className="flex w-full items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
          <div>
            <p className="text-xs text-ink-faint">{label}</p>
            <p className="text-base font-semibold tracking-wide text-ink">{code}</p>
          </div>
          <button
            onClick={handleCopy}
            aria-label="Copy code"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/8"
          >
            {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4 text-ink-muted" />}
          </button>
        </div>
      </GlassSurface>

      <div className="mt-4 flex items-center gap-3">
        <button onClick={handleShare} className="flex items-center gap-1.5 text-sm font-medium text-ink-muted">
          <Share2 className="h-4 w-4" /> Share
        </button>
        <span className="text-ink-faint">·</span>
        <button onClick={handleDownload} className="flex items-center gap-1.5 text-sm font-medium text-ink-muted">
          <Download className="h-4 w-4" /> Download
        </button>
      </div>
    </div>
  );
}
