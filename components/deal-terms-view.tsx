import type { DealTermsConfirmed } from "@/db/schema";
import { Field } from "@/components/ui/card";
import { DealTypeBadge, PlainBadge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import { TrendingUp } from "lucide-react";

function formatPct(n: number | null | undefined): string | null {
  if (n == null) return null;
  return `${(n * 100).toFixed(0)}%`;
}

function nonEmpty(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.trim().length > 0;
  return true;
}

type Props = {
  terms: DealTermsConfirmed;
  /** Show a small "Confirmed by" footer */
  showConfirmation?: boolean;
};

/** Renders structured deal terms, hiding any empty/null/zero fields. */
export function DealTermsView({ terms, showConfirmation = false }: Props) {
  const guaranteeStr =
    terms.guaranteeAmount != null ? formatMoney(terms.guaranteeAmount) : null;
  const percentageStr = (() => {
    const pct = formatPct(terms.artistPercentage);
    if (!pct) return null;
    return terms.percentageBasis ? `${pct} of ${terms.percentageBasis}` : pct;
  })();
  const expenseCapStr =
    terms.expenseCap != null ? formatMoney(terms.expenseCap) : null;
  const hospitalityCapStr =
    terms.hospitalityCap != null ? formatMoney(terms.hospitalityCap) : null;
  const walkoutStr =
    terms.walkoutThreshold != null
      ? `${terms.walkoutType ?? "Walkout pot"} (above ${formatMoney(terms.walkoutThreshold)})`
      : null;
  const tier1Str =
    terms.tier1Percentage != null
      ? `${formatPct(terms.tier1Percentage)}${terms.tier1Threshold ? ` up to ${(terms.tier1Threshold * 100).toFixed(0)}% sold` : ""}`
      : null;
  const tier2Str =
    terms.tier2Percentage != null
      ? `${formatPct(terms.tier2Percentage)}${terms.tier2Threshold ? ` above ${(terms.tier2Threshold * 100).toFixed(0)}% sold` : ""}`
      : null;

  const fields: { label: string; value: string }[] = [];
  if (guaranteeStr) fields.push({ label: "Guarantee", value: guaranteeStr });
  if (percentageStr)
    fields.push({ label: "Artist split", value: percentageStr });
  if (expenseCapStr) fields.push({ label: "Expense cap", value: expenseCapStr });
  if (hospitalityCapStr)
    fields.push({ label: "Hospitality cap", value: hospitalityCapStr });
  if (walkoutStr) fields.push({ label: "Walkout", value: walkoutStr });
  if (tier1Str) fields.push({ label: "Tier 1", value: tier1Str });
  if (tier2Str) fields.push({ label: "Tier 2", value: tier2Str });

  const bonuses: { amount: string; trigger: string | null }[] = [];
  if (nonEmpty(terms.bonus1Amount)) {
    bonuses.push({
      amount: formatMoney(terms.bonus1Amount!),
      trigger: terms.bonus1Trigger ?? null,
    });
  }
  if (nonEmpty(terms.bonus2Amount)) {
    bonuses.push({
      amount: formatMoney(terms.bonus2Amount!),
      trigger: terms.bonus2Trigger ?? null,
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1.5">
        {terms.dealType && <DealTypeBadge type={terms.dealType} />}
        {terms.status === "approved" && (
          <PlainBadge variant="brand">Approved</PlainBadge>
        )}
        {terms.status === "sent" && (
          <PlainBadge variant="amber">Sent</PlainBadge>
        )}
        {terms.status === "draft" && (
          <PlainBadge variant="default">Draft</PlainBadge>
        )}
      </div>

      {fields.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {fields.map((f) => (
            <Field key={f.label} label={f.label} value={f.value} mono />
          ))}
        </div>
      )}

      {bonuses.length > 0 && (
        <div className="rounded-lg ring-1 ring-brand-200/50 bg-brand-50/20 p-4">
          <div className="flex items-center gap-1.5 mb-2.5">
            <TrendingUp className="h-3.5 w-3.5 text-brand-700" />
            <div className="eyebrow text-[10px] text-brand-800">Bonuses</div>
          </div>
          <ul className="space-y-2">
            {bonuses.map((b, i) => (
              <li
                key={i}
                className="text-[12.5px] text-ink-800 leading-relaxed"
              >
                <span className="font-mono tabular font-semibold">
                  {b.amount}
                </span>
                {b.trigger ? ` if ${b.trigger}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {fields.length === 0 && bonuses.length === 0 && (
        <div className="text-[13px] text-ink-400">
          No structured deal terms captured.
        </div>
      )}

      {showConfirmation && terms.status === "approved" && terms.confirmedBy && (
        <div className="rounded-lg ring-1 ring-emerald-200/60 bg-emerald-50/40 p-4">
          <div className="eyebrow text-[10px] text-emerald-800 mb-1">
            Confirmed
          </div>
          <div className="text-[13px] text-ink-800">
            {terms.confirmedBy}
            {terms.confirmedAt && (
              <span className="text-ink-500">
                {" "}
                ·{" "}
                {new Date(terms.confirmedAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
