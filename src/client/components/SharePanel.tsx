import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { copyText } from "../lib/clipboard";

export function SharePanel({ cartId, restaurantName }: { cartId: string; restaurantName: string }) {
  const url = `${window.location.origin}/c/${cartId}`;
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const canShare = typeof navigator.share === "function";

  async function copy() {
    if (await copyText(url)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function share() {
    try {
      await navigator.share({ title: `Join my ${restaurantName} order`, text: `Add what you want to our ${restaurantName} order:`, url });
    } catch {
      // User closed the share sheet.
    }
  }

  const button = "rounded-lg px-3 py-2 text-sm font-semibold ring-1 ring-stone-300 bg-white hover:bg-stone-50";

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase">Invite friends</p>
          <p className="truncate font-mono text-sm">{url.replace(/^https?:\/\//, "")}</p>
        </div>
        <button onClick={copy} className={button}>
          {copied ? "Copied ✓" : "Copy link"}
        </button>
        {canShare && (
          <button onClick={share} className={button}>
            Share
          </button>
        )}
        <button onClick={() => setShowQr((v) => !v)} className={button} aria-expanded={showQr}>
          QR
        </button>
      </div>
      {showQr && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <QRCodeSVG value={url} size={176} marginSize={2} />
          <p className="text-xs text-stone-500">Scan with a phone camera to join</p>
        </div>
      )}
    </div>
  );
}
