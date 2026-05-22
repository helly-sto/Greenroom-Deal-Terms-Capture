"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  showId: string;
};

export function ShareWithAgent({ showId }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setUrl(`${window.location.origin}/shows/${showId}/deal-terms/public`);
    }
  }, [showId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // fallback
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Share2 className="h-3.5 w-3.5" />
        Share with agent
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm px-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-md rounded-xl bg-white shadow-xl ring-1 ring-ink-200/60"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 p-1 rounded-md text-ink-400 hover:text-ink-900 hover:bg-ink-100 transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="px-6 pt-6 pb-2">
              <div className="text-[16px] font-semibold text-ink-900 tracking-tight">
                Share deal terms
              </div>
              <p className="text-[12.5px] text-ink-500 mt-1 leading-relaxed">
                Send the agent this link to review and confirm the structured
                deal terms.
              </p>
            </div>

            <div className="px-6 pt-3 pb-6">
              <label className="eyebrow text-[10px] text-ink-500">
                Public link
              </label>
              <div className="mt-1.5 flex items-stretch gap-2">
                <input
                  readOnly
                  value={url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 min-w-0 h-9 px-3 text-[12.5px] font-mono text-ink-800 bg-canvas-soft rounded-md ring-1 ring-inset ring-ink-200/80 focus:outline-none focus:ring-brand-700"
                />
                <Button
                  variant={copied ? "brand" : "secondary"}
                  size="default"
                  type="button"
                  onClick={copyLink}
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy link
                    </>
                  )}
                </Button>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="default"
                  type="button"
                  onClick={() => setOpen(false)}
                >
                  Close
                </Button>
                <a href={url} target="_blank" rel="noreferrer">
                  <Button variant="brand" size="default" type="button">
                    <ExternalLink className="h-3.5 w-3.5" />
                    View
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
