"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  MessageSquare,
  Sparkles,
  Send,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlainBadge } from "@/components/ui/badge";
import {
  EMPTY_DEAL_TERMS,
  type ChatMessage,
  type DealTermsDraft,
  type DealType,
  type PercentageBasis,
} from "@/lib/dealTermsCapture";

const DEAL_TYPE_OPTIONS: { value: DealType; label: string }[] = [
  { value: "flat", label: "Flat guarantee" },
  { value: "guarantee_vs_net", label: "Guarantee vs % of net" },
  { value: "guarantee_vs_gross", label: "Guarantee vs % of gross" },
  { value: "percentage_only", label: "Percentage only" },
  { value: "door_deal", label: "Door deal" },
  { value: "escalator", label: "Escalator / tiers" },
  { value: "walkout_pot", label: "Walkout pot" },
];

const inputClass =
  "w-full px-3 py-2 text-[13px] bg-white border border-ink-200/60 rounded-lg text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-300 transition-all";
const labelClass = "eyebrow text-[10px] text-ink-500 mb-1 block";

export function NewShowForm() {
  const router = useRouter();
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [artistName, setArtistName] = useState("");
  const [date, setDate] = useState("");
  const [doorsTime, setDoorsTime] = useState("");
  const [setTime, setSetTime] = useState("");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [conversationComplete, setConversationComplete] = useState(false);

  // Mirror of `messages` that is always up to date when async callbacks fire.
  // React state reads in async functions can be stale; ref reads cannot.
  const messagesRef = useRef<ChatMessage[]>([]);

  /** Authoritative writer for the conversation: updates state and ref together. */
  function commitMessages(next: ChatMessage[]) {
    messagesRef.current = next;
    setMessages(next);
  }

  // Keep the ref in sync with state for any external code paths that
  // happen to mutate `messages` (defensive — commitMessages is preferred).
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const [dealTerms, setDealTerms] = useState<DealTermsDraft | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (messagesRef.current.length === 0) {
      commitMessages([
        {
          role: "assistant",
          content:
            "Paste or type the deal terms from the agent email — guarantee, split, caps, bonuses, anything ambiguous. I'll acknowledge what I've captured and ask about whatever's missing.",
        },
      ]);
    }
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatLoading]);

  async function sendChatMessage() {
    const text = chatInput.trim();
    if (!text || chatLoading) return;

    // Read from the ref so we capture the freshest history even when this
    // callback was created with a stale `messages` closure.
    const prevMessages = messagesRef.current;
    const nextMessages: ChatMessage[] = [
      ...prevMessages,
      { role: "user", content: text },
    ];
    commitMessages(nextMessages);
    setChatInput("");
    setChatLoading(true);
    setError(null);
    setDealTerms(null);

    try {
      const res = await fetch("/api/deal-terms/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Always send the up-to-date conversation, sourced from the ref.
        body: JSON.stringify({ messages: messagesRef.current }),
      });
      if (!res.ok) throw new Error("Chat request failed");
      const data = await res.json();
      commitMessages([
        ...messagesRef.current,
        { role: "assistant", content: data.message },
      ]);
      setConversationComplete(!!data.complete);
    } catch {
      setError("Couldn't reach the deal terms assistant. Try again.");
      commitMessages(prevMessages);
    } finally {
      setChatLoading(false);
    }
  }

  async function generateDealTerms() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/deal-terms/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messagesRef.current,
          action: "generate",
        }),
      });
      if (!res.ok) throw new Error("Generate failed");
      const data = await res.json();
      setDealTerms(data.terms ?? { ...EMPTY_DEAL_TERMS });
    } catch {
      setError("Couldn't generate deal terms. Try again.");
    } finally {
      setGenerating(false);
    }
  }

  function updateDealField<K extends keyof DealTermsDraft>(
    key: K,
    value: DealTermsDraft[K],
  ) {
    setDealTerms((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function saveShow() {
    if (!artistName.trim() || !date) {
      setError("Event name and show date are required.");
      return;
    }
    if (!dealTerms?.dealType) {
      setError("Generate and confirm deal terms before saving.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/shows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artistName: artistName.trim(),
          date,
          doorsTime: doorsTime || undefined,
          setTime: setTime || undefined,
          dealTerms,
          messages: messagesRef.current,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      router.push(`/shows/${data.showId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save show");
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    const dirty =
      artistName ||
      date ||
      messages.some((m) => m.role === "user") ||
      dealTerms;
    if (
      dirty &&
      !window.confirm("Discard this show? Nothing will be saved.")
    ) {
      return;
    }
    router.push("/shows");
  }

  const canGenerate =
    conversationComplete && messages.some((m) => m.role === "user");

  return (
    <div className="max-w-7xl">
      <div className="px-12 pt-10 pb-14 bg-gradient-to-b from-brand-50/30 to-canvas">
        <Link
          href="/shows"
          className="inline-flex items-center gap-1 text-[12px] text-ink-400 hover:text-ink-900 mb-8 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All shows
        </Link>

        <div>
          <div className="eyebrow mb-3">The Crescent · Nashville</div>
          <h1
            className="font-display text-[52px] font-medium text-ink-900 leading-[1.02]"
            style={{ letterSpacing: "-0.025em", fontOpticalSizing: "auto" }}
          >
            New show
          </h1>
          <p className="text-[14px] text-ink-500 mt-3 max-w-lg leading-relaxed">
            Book a date and capture deal terms from the agent thread before
            they live only in email.
          </p>
        </div>
      </div>

      <div className="px-12 pb-12 space-y-6">
        {error && (
          <div className="rounded-lg bg-rose-50/60 ring-1 ring-rose-200/60 px-4 py-3 text-[13px] text-rose-800">
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Show details</CardTitle>
              <CardDescription>
                Basic info for the calendar and advance.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
              <div className="sm:col-span-2">
                <label className={labelClass}>Event name</label>
                <input
                  type="text"
                  value={artistName}
                  onChange={(e) => setArtistName(e.target.value)}
                  placeholder="e.g. Coastal Spell"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Show date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div />
              <div>
                <label className={labelClass}>Doors time</label>
                <input
                  type="text"
                  value={doorsTime}
                  onChange={(e) => setDoorsTime(e.target.value)}
                  placeholder="7:00 PM"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Set time</label>
                <input
                  type="text"
                  value={setTime}
                  onChange={(e) => setSetTime(e.target.value)}
                  placeholder="8:30 PM"
                  className={inputClass}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card accent="brand" className="flex flex-col min-h-[420px]">
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-3.5 w-3.5 text-brand-700" />
                  Deal terms
                </CardTitle>
                <CardDescription>
                  Type deal terms from the agent email. Greenroom AI will ask
                  follow-ups.
                </CardDescription>
              </div>
              {conversationComplete && (
                <PlainBadge variant="brand">Ready to generate</PlainBadge>
              )}
            </CardHeader>
            <CardContent className="flex flex-col flex-1 min-h-0 pb-3">
              <div className="flex-1 overflow-y-auto max-h-[320px] space-y-3 pr-1 mb-3">
                {messages.map((msg, i) => (
                  <ChatBubble key={i} message={msg} />
                ))}
                {chatLoading && (
                  <div className="flex items-center gap-2 text-[12px] text-ink-400 pl-1">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Thinking…
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="flex gap-2 mt-auto pt-3 border-t border-ink-100/80">
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendChatMessage();
                    }
                  }}
                  placeholder="Paste agent email terms or answer a follow-up…"
                  rows={2}
                  className={`${inputClass} resize-none flex-1`}
                />
                <Button
                  variant="brand"
                  size="icon"
                  onClick={sendChatMessage}
                  disabled={chatLoading || !chatInput.trim()}
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>

              {canGenerate && !dealTerms && (
                <Button
                  variant="secondary"
                  className="w-full mt-3"
                  onClick={generateDealTerms}
                  disabled={generating}
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Generate deal terms
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className={dealTerms ? "" : "opacity-60"}>
            <CardHeader>
              <div>
                <CardTitle>Structured deal terms</CardTitle>
                <CardDescription>
                  {dealTerms
                    ? "Edit any field before saving — this becomes the source of truth."
                    : "Complete the conversation, then generate."}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {dealTerms ? (
                <DealTermsEditor draft={dealTerms} onChange={updateDealField} />
              ) : (
                <div className="py-12 text-center text-[13px] text-ink-400">
                  Generated terms will appear here for review.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end items-center gap-2 pt-8 border-t border-ink-200/40">
          <Button variant="ghost" size="sm" onClick={handleDiscard}>
            Discard
          </Button>
          <Button
            variant="brand"
            size="lg"
            onClick={saveShow}
            disabled={saving || !dealTerms}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save show
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[90%] rounded-lg px-3 py-2.5 text-[13px] leading-relaxed ${
          isUser
            ? "bg-brand-700 text-white"
            : "bg-canvas-soft text-ink-800 ring-1 ring-ink-200/50"
        }`}
      >
        <div
          className={`text-[9px] font-medium uppercase tracking-[0.08em] mb-1 ${
            isUser ? "text-brand-200" : "text-ink-400"
          }`}
        >
          {isUser ? "Mariana" : "Greenroom AI"}
        </div>
        <div className="whitespace-pre-wrap">{message.content}</div>
      </div>
    </div>
  );
}

function hasMoneyValue(value: number | ""): boolean {
  return value !== "" && value !== 0;
}

function hasPercentValue(value: number | ""): boolean {
  return value !== "" && value !== 0;
}

function hasTextValue(value: string): boolean {
  return value.trim().length > 0;
}

function DealTermsEditor({
  draft,
  onChange,
}: {
  draft: DealTermsDraft;
  onChange: <K extends keyof DealTermsDraft>(
    key: K,
    value: DealTermsDraft[K],
  ) => void;
}) {
  const optionalFields = [
    hasMoneyValue(draft.guaranteeAmount),
    hasPercentValue(draft.artistPercentage),
    !!draft.percentageBasis,
    hasMoneyValue(draft.expenseCap),
    hasMoneyValue(draft.hospitalityCap),
    hasMoneyValue(draft.walkoutThreshold),
    hasTextValue(draft.walkoutType),
    hasPercentValue(draft.tier1Percentage),
    hasMoneyValue(draft.tier1Threshold),
    hasPercentValue(draft.tier2Percentage),
    hasMoneyValue(draft.tier2Threshold),
    hasMoneyValue(draft.bonus1Amount),
    hasTextValue(draft.bonus1Trigger),
    hasMoneyValue(draft.bonus2Amount),
    hasTextValue(draft.bonus2Trigger),
  ].some(Boolean);

  return (
    <div className="space-y-4 max-h-[520px] overflow-y-auto pr-1">
      <div>
        <label className={labelClass}>Deal type</label>
        <select
          value={draft.dealType}
          onChange={(e) =>
            onChange("dealType", e.target.value as DealType | "")
          }
          className={inputClass}
        >
          <option value="">Select…</option>
          {DEAL_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {optionalFields ? (
        <div className="grid grid-cols-2 gap-3">
          {hasMoneyValue(draft.guaranteeAmount) && (
            <NumberField
              label="Guarantee ($)"
              value={draft.guaranteeAmount}
              onChange={(v) => onChange("guaranteeAmount", v)}
            />
          )}
          {hasPercentValue(draft.artistPercentage) && (
            <PercentField
              label="Artist %"
              value={draft.artistPercentage}
              onChange={(v) => onChange("artistPercentage", v)}
            />
          )}
          {draft.percentageBasis && (
            <div>
              <label className={labelClass}>Percentage basis</label>
              <select
                value={draft.percentageBasis}
                onChange={(e) =>
                  onChange(
                    "percentageBasis",
                    e.target.value as PercentageBasis | "",
                  )
                }
                className={inputClass}
              >
                <option value="net">Net</option>
                <option value="gross">Gross</option>
              </select>
            </div>
          )}
          {hasMoneyValue(draft.expenseCap) && (
            <NumberField
              label="Expense cap ($)"
              value={draft.expenseCap}
              onChange={(v) => onChange("expenseCap", v)}
            />
          )}
          {hasMoneyValue(draft.hospitalityCap) && (
            <NumberField
              label="Hospitality cap ($)"
              value={draft.hospitalityCap}
              onChange={(v) => onChange("hospitalityCap", v)}
            />
          )}
          {hasMoneyValue(draft.walkoutThreshold) && (
            <NumberField
              label="Walkout threshold ($)"
              value={draft.walkoutThreshold}
              onChange={(v) => onChange("walkoutThreshold", v)}
            />
          )}
          {hasTextValue(draft.walkoutType) && (
            <div className="col-span-2">
              <label className={labelClass}>Walkout type</label>
              <input
                type="text"
                value={draft.walkoutType}
                onChange={(e) => onChange("walkoutType", e.target.value)}
                className={inputClass}
              />
            </div>
          )}
          {hasPercentValue(draft.tier1Percentage) && (
            <PercentField
              label="Tier 1 %"
              value={draft.tier1Percentage}
              onChange={(v) => onChange("tier1Percentage", v)}
            />
          )}
          {hasMoneyValue(draft.tier1Threshold) && (
            <NumberField
              label="Tier 1 threshold ($)"
              value={draft.tier1Threshold}
              onChange={(v) => onChange("tier1Threshold", v)}
            />
          )}
          {hasPercentValue(draft.tier2Percentage) && (
            <PercentField
              label="Tier 2 %"
              value={draft.tier2Percentage}
              onChange={(v) => onChange("tier2Percentage", v)}
            />
          )}
          {hasMoneyValue(draft.tier2Threshold) && (
            <NumberField
              label="Tier 2 threshold ($)"
              value={draft.tier2Threshold}
              onChange={(v) => onChange("tier2Threshold", v)}
            />
          )}
          {hasMoneyValue(draft.bonus1Amount) && (
            <NumberField
              label="Bonus 1 ($)"
              value={draft.bonus1Amount}
              onChange={(v) => onChange("bonus1Amount", v)}
            />
          )}
          {hasTextValue(draft.bonus1Trigger) && (
            <div>
              <label className={labelClass}>Bonus 1 trigger</label>
              <input
                type="text"
                value={draft.bonus1Trigger}
                onChange={(e) => onChange("bonus1Trigger", e.target.value)}
                className={inputClass}
              />
            </div>
          )}
          {hasMoneyValue(draft.bonus2Amount) && (
            <NumberField
              label="Bonus 2 ($)"
              value={draft.bonus2Amount}
              onChange={(v) => onChange("bonus2Amount", v)}
            />
          )}
          {hasTextValue(draft.bonus2Trigger) && (
            <div>
              <label className={labelClass}>Bonus 2 trigger</label>
              <input
                type="text"
                value={draft.bonus2Trigger}
                onChange={(e) => onChange("bonus2Trigger", e.target.value)}
                className={inputClass}
              />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Stored as decimal (0.85); displayed and edited as percent points (85). */
function PercentField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | "";
  onChange: (v: number | "") => void;
}) {
  const display =
    value === "" ? "" : String(Math.round((value as number) * 100));

  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="relative">
        <input
          type="number"
          step="1"
          min="0"
          max="100"
          placeholder="85"
          value={display}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") onChange("");
            else {
              const n = parseFloat(raw);
              onChange(Number.isFinite(n) ? n / 100 : "");
            }
          }}
          className={`${inputClass} font-mono tabular pr-7`}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-ink-400 pointer-events-none">
          %
        </span>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step,
  placeholder,
}: {
  label: string;
  value: number | "";
  onChange: (v: number | "") => void;
  step?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <input
        type="number"
        step={step}
        placeholder={placeholder}
        value={value === "" ? "" : value}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === "" ? "" : parseFloat(raw));
        }}
        className={`${inputClass} font-mono tabular`}
      />
    </div>
  );
}
