"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  showId: string;
  initialConfirmedBy: string | null;
  initialConfirmedAt: string | null;
  initialApproved: boolean;
};

export function ConfirmForm({
  showId,
  initialConfirmedBy,
  initialConfirmedAt,
  initialApproved,
}: Props) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState(initialApproved);
  const [confirmedBy, setConfirmedBy] = useState(initialConfirmedBy);
  const [confirmedAt, setConfirmedAt] = useState(initialConfirmedAt);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/shows/${showId}/deal-terms/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmedBy: name.trim() }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to confirm.");
      }
      setApproved(true);
      setConfirmedBy(data.confirmedBy ?? name.trim());
      setConfirmedAt(data.confirmedAt ?? new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm.");
    } finally {
      setSubmitting(false);
    }
  }

  if (approved) {
    return (
      <div className="rounded-xl ring-1 ring-emerald-200 bg-emerald-50/70 p-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-700 mt-0.5 shrink-0" />
          <div>
            <div className="text-[15px] font-semibold text-emerald-900">
              Deal terms confirmed. The venue has been notified.
            </div>
            {confirmedBy && (
              <div className="text-[12.5px] text-emerald-800 mt-1">
                Confirmed by {confirmedBy}
                {confirmedAt && (
                  <>
                    {" "}
                    ·{" "}
                    {new Date(confirmedAt).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl ring-1 ring-ink-200/80 bg-white p-6 space-y-4"
    >
      <div>
        <h2 className="text-[15px] font-semibold text-ink-900">
          Confirm deal terms
        </h2>
        <p className="text-[12.5px] text-ink-500 mt-1 leading-relaxed">
          Review the structured terms above. Type your name and confirm to
          sign off on these terms with the venue.
        </p>
      </div>

      <div>
        <label
          htmlFor="confirmed-by"
          className="eyebrow text-[10px] text-ink-500 mb-1.5 block"
        >
          Your name
        </label>
        <input
          id="confirmed-by"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Jordan Hayes"
          className="w-full h-10 px-3 text-[13.5px] bg-canvas-soft rounded-md ring-1 ring-inset ring-ink-200/80 focus:outline-none focus:ring-2 focus:ring-brand-700"
          autoComplete="name"
        />
      </div>

      {error && (
        <div className="rounded-lg bg-rose-50/70 ring-1 ring-rose-200/60 px-3 py-2 text-[12.5px] text-rose-800">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end">
        <Button
          type="submit"
          disabled={submitting || !name.trim()}
          className="bg-emerald-700 text-white hover:bg-emerald-800 shadow-sm shadow-emerald-700/20 ring-1 ring-inset ring-emerald-800/20"
          size="lg"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Confirm & sign off
        </Button>
      </div>
    </form>
  );
}
