/**
 * Deal Terms Capture — conversational assistant and parser.
 * Follows DEAL_TERMS_SYSTEM_PROMPT; uses pattern matching when no LLM is configured.
 */

import { DEAL_TERMS_SYSTEM_PROMPT } from "./dealTermsPrompt";

export { DEAL_TERMS_SYSTEM_PROMPT };

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type DealType =
  | "flat"
  | "guarantee_vs_net"
  | "guarantee_vs_gross"
  | "percentage_only"
  | "door_deal"
  | "escalator"
  | "walkout_pot";

export type PercentageBasis = "net" | "gross";

export type DealTermsDraft = {
  dealType: DealType | "";
  guaranteeAmount: number | "";
  artistPercentage: number | "";
  percentageBasis: PercentageBasis | "";
  expenseCap: number | "";
  hospitalityCap: number | "";
  walkoutThreshold: number | "";
  walkoutType: string;
  tier1Percentage: number | "";
  tier1Threshold: number | "";
  tier2Percentage: number | "";
  tier2Threshold: number | "";
  bonus1Amount: number | "";
  bonus1Trigger: string;
  bonus2Amount: number | "";
  bonus2Trigger: string;
};

export const EMPTY_DEAL_TERMS: DealTermsDraft = {
  dealType: "",
  guaranteeAmount: "",
  artistPercentage: "",
  percentageBasis: "",
  expenseCap: "",
  hospitalityCap: "",
  walkoutThreshold: "",
  walkoutType: "",
  tier1Percentage: "",
  tier1Threshold: "",
  tier2Percentage: "",
  tier2Threshold: "",
  bonus1Amount: "",
  bonus1Trigger: "",
  bonus2Amount: "",
  bonus2Trigger: "",
};

const OPENING =
  "Paste or type the deal terms from the agent email — guarantee, split, caps, bonuses, anything ambiguous. I'll acknowledge what I've captured and ask about whatever's missing.";

export const CATCH_ALL_QUESTION =
  "Are there any performance bonuses, sellout bonuses, escalator tiers, or other conditions we haven't covered?";

export const CATCH_ALL_DONE_MESSAGE =
  "Click Generate Deal Terms below to review and edit the structured fields before saving.";

export const CAPS_QUESTION =
  "Is there an expense cap or hospitality cap for this show?";

export type ExtractedSignals = {
  dealType: DealType | null;
  guaranteeAmount: number | null;
  artistPercentage: number | null;
  percentageBasis: PercentageBasis | null;
  expenseCap: number | null;
  hospitalityCap: number | null;
  bonus1Amount: number | null;
  bonus1Trigger: string | null;
  bonus2Amount: number | null;
  bonus2Trigger: string | null;
  tier1Threshold: number | null;
  tier1Percentage: number | null;
  tier2Threshold: number | null;
  tier2Percentage: number | null;
  walkoutThreshold: number | null;
  walkoutType: string | null;
  otherNotes: string | null;
};

function allUserText(messages: ChatMessage[]): string {
  return messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");
}

function parseAmount(raw: string): number | null {
  const n = parseFloat(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function firstMatchAmount(text: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m?.[1]) {
      const n = parseAmount(m[1]);
      if (n != null) return n;
    }
  }
  return null;
}

function parseGuarantee(text: string): number | null {
  return firstMatchAmount(text, [
    /\$\s*([\d,]+(?:\.\d+)?)\s*(?:vs|versus|against)\b/i,
    /\b([\d,]+(?:\.\d+)?)\s*g['']?tee\s+vs\b/i,
    /\b([\d,]+(?:\.\d+)?)\s*g['']?tee\s+with\b/i,
    /\$\s*([\d,]+(?:\.\d+)?)[ \t]+guarantee[ \t]+vs\b/i,
    /flat\s+(?:guarantee\s+)?\$?\s*([\d,]+(?:\.\d+)?)/i,
    /flat\s+\$?\s*([\d,]+(?:\.\d+)?)/i,
    // Require $ to avoid grabbing a bare number from a later message.
    /guarantee\s+(?:of\s+)?\$\s*([\d,]+(?:\.\d+)?)/i,
    /\$\s*([\d,]+(?:\.\d+)?)[ \t]+guarantee\b/i,
  ]);
}

function parseArtistPercentage(text: string): number | null {
  const split = text.match(/(\d+)\s*\/\s*(\d+)\s+split\s+on\s+net/i);
  if (split) {
    const artist = parseInt(split[1], 10);
    const venue = parseInt(split[2], 10);
    return artist > venue ? artist / 100 : artist / (artist + venue);
  }

  const pct = text.match(
    /(\d+(?:\.\d+)?)\s*%\s*(?:of\s+)?(?:net|gross)\b|\b(\d+(?:\.\d+)?)\s*%\s+net\b/i,
  );
  if (pct) {
    const n = parseFloat(pct[1] ?? pct[2]);
    return n > 1 ? n / 100 : n;
  }

  const vsPct = text.match(/vs\s+(\d+(?:\.\d+)?)\s*%/i);
  if (vsPct) {
    const n = parseFloat(vsPct[1]);
    return n > 1 ? n / 100 : n;
  }

  return null;
}

function parsePercentageBasis(text: string): PercentageBasis | null {
  if (/%\s*of\s*gross|\b\d+\s*%\s+of\s+gross|\b\d+\s*%\s+gross\b/i.test(text))
    return "gross";
  if (
    /%\s*of\s*net|\b\d+\s*%\s+of\s+net|\b\d+\s*%\s+net\b|\b\d+\s*\/\s*\d+\s+split\s+on\s+net/i.test(
      text,
    )
  )
    return "net";
  if (/\b100\s*%\s*gross\b/i.test(text)) return "gross";
  if (/\bgross\b/i.test(text) && !/\bnet\b/i.test(text)) return "gross";
  if (/\bnet\b/i.test(text) && !/\bgross\b/i.test(text)) return "net";
  return null;
}

function parseExpenseCap(text: string): number | null {
  return firstMatchAmount(text, [
    /expenses?\s+capped?\s+(?:at\s+)?\$?\s*([\d,]+)/i,
    /expense\s*cap\s*(?:of\s*)?\$?\s*([\d,]+)/i,
    /expenses?\s+to\s+\$?\s*([\d,]+)/i,
    /expenses?\s*\([^)]*capped\s*\$?\s*([\d,]+)/i,
    /expenses?\s+capped\s+\$?\s*([\d,]+)/i,
    /capped\s+\$?\s*([\d,]+)\s*\)/i,
    /expenses?\s*(?:is|are|=)?\s*\$\s*([\d,]+)/i,
    /\$\s*([\d,]+)\s+(?:expense|expenses)\b/i,
  ]);
}

function parseHospitalityCap(text: string): number | null {
  return firstMatchAmount(text, [
    /hospitality\s+cap\s*\$?\s*([\d,]+)/i,
    /hospitality\s+\$?\s*([\d,]+)/i,
    /hosp\.?\s*(?:cap\s*)?\$?\s*([\d,]+)/i,
    /hospitality\s*(?:is|=)?\s*\$\s*([\d,]+)/i,
    /\$\s*([\d,]+)\s+hospitality\b/i,
    /\$\s*([\d,]+)\s+hosp\b/i,
  ]);
}

function parseBonuses(text: string): {
  bonus1Amount: number | null;
  bonus1Trigger: string | null;
  bonus2Amount: number | null;
  bonus2Trigger: string | null;
} {
  const bonuses: { amount: number; trigger: string }[] = [];

  const patterns: { re: RegExp; defaultTrigger?: string }[] = [
    { re: /\+\s*\$?\s*([\d,]+)\s+if\s+([^.;\n]+)/gi },
    { re: /\+\s*\$?\s*([\d,]+)\s+on\s+([^.;\n]+)/gi },
    { re: /\$\s*([\d,]+)\s+bonus\s+(?:on|if|for)\s+([^.;\n]+)/gi },
    { re: /bonus\s+(?:of\s+)?\$?\s*([\d,]+)\s+(?:on|if|for)\s+([^.;\n]+)/gi },
    {
      re: /\$?\s*([\d,]+)\s+(?:bonus\s+)?on\s+sellout\b/gi,
      defaultTrigger: "sellout",
    },
    { re: /\$?\s*([\d,]+)\s+sellout\s+bonus\b/gi, defaultTrigger: "sellout" },
    {
      re: /\$\s*([\d,]+)\s+if\s+(?:gross|sellout|attendance)([^.;\n]*)/gi,
    },
    { re: /sellout\s+bonus\s+(?:of\s+)?\$?\s*([\d,]+)/gi, defaultTrigger: "sellout" },
  ];

  const seen = new Set<number>();
  for (const { re, defaultTrigger } of patterns) {
    for (const m of text.matchAll(re)) {
      const amount = parseAmount(m[1]);
      if (amount == null || seen.has(amount)) continue;
      const trigger = (m[2]?.trim() || defaultTrigger || "sellout").trim();
      bonuses.push({ amount, trigger });
      seen.add(amount);
    }
  }

  return {
    bonus1Amount: bonuses[0]?.amount ?? null,
    bonus1Trigger: bonuses[0]?.trigger ?? null,
    bonus2Amount: bonuses[1]?.amount ?? null,
    bonus2Trigger: bonuses[1]?.trigger ?? null,
  };
}

function parseWalkout(text: string): {
  walkoutThreshold: number | null;
  walkoutType: string | null;
} {
  const threshold = firstMatchAmount(text, [
    /walkout\s+pot[^$]*(?:above|over)\s+\$?\s*([\d,]+)/i,
    /100%\s+of\s+gross\s+above\s+\$?\s*([\d,]+)/i,
    /gross\s+above\s+\$?\s*([\d,]+)/i,
  ]);
  const typeMatch = text.match(/walkout[^\n.]{0,80}/i);
  return {
    walkoutThreshold: threshold,
    walkoutType: typeMatch?.[0]?.trim() ?? (threshold ? "100% of gross above threshold" : null),
  };
}

function parseTiers(text: string): {
  tier1Percentage: number | null;
  tier1Threshold: number | null;
  tier2Percentage: number | null;
  tier2Threshold: number | null;
} {
  const ratchet = text.match(
    /ratchet[s]?:?\s*(\d+)\s*%\s*(?:net\s+)?to\s+(\d+)\s*%[^.]*?(\d+)\s*%?\s*sold/i,
  );
  if (ratchet) {
    return {
      tier1Percentage: parseInt(ratchet[1], 10) / 100,
      tier1Threshold: null,
      tier2Percentage: parseInt(ratchet[2], 10) / 100,
      tier2Threshold: parseInt(ratchet[3], 10) / 100,
    };
  }

  const toSold = text.match(/(\d+)\s*%\s*net\s+to\s+(\d+)\s*%[^.]*?(\d+)\s*%?\s*sold/i);
  if (toSold) {
    return {
      tier1Percentage: parseInt(toSold[1], 10) / 100,
      tier1Threshold: null,
      tier2Percentage: parseInt(toSold[2], 10) / 100,
      tier2Threshold: parseInt(toSold[3], 10) / 100,
    };
  }

  const escalator = text.match(
    /(\d+)\s*%\s*net\s+at\s+base[^.]*?ratchets?\s+to\s+(\d+)\s*%/i,
  );
  if (escalator) {
    return {
      tier1Percentage: parseInt(escalator[1], 10) / 100,
      tier1Threshold: null,
      tier2Percentage: parseInt(escalator[2], 10) / 100,
      tier2Threshold: null,
    };
  }

  return {
    tier1Percentage: null,
    tier1Threshold: null,
    tier2Percentage: null,
    tier2Threshold: null,
  };
}

function detectDealType(text: string): DealType | null {
  const t = text.toLowerCase();

  if (/\bdoor\s+deal\b/.test(t)) return "door_deal";
  if (/\bwalkout\s+pot\b|\+\s*walkout\b/.test(t)) return "walkout_pot";
  if (/\bescalat|\bratchet\b/.test(t)) return "escalator";
  if (/\bflat\b|\bbuyout\b/.test(t) && !/\bvs\b|versus|g['']?tee\s+vs/i.test(t))
    return "flat";
  if (
    /\bvs\b|versus|g['']?tee\s+vs|guarantee\s+vs|whichever\s+greater/i.test(t)
  ) {
    return parsePercentageBasis(text) === "gross"
      ? "guarantee_vs_gross"
      : "guarantee_vs_net";
  }
  if (/\d+\s*%\s+of\s+gross|\b\d+\s*%\s+gross\b/i.test(t) && !/\bvs\b/i.test(t))
    return "percentage_only";
  if (
    /\d+\s*%\s+of\s+net|\bno\s+guarantee\b/i.test(t) &&
    !/\bvs\b|g['']?tee/i.test(t)
  )
    return "percentage_only";
  if (/\bguarantee\b/.test(t) && /\b%/.test(t)) {
    return parsePercentageBasis(text) === "gross"
      ? "guarantee_vs_gross"
      : "guarantee_vs_net";
  }
  return null;
}

export function extractSignals(text: string): ExtractedSignals {
  const bonuses = parseBonuses(text);
  const walkout = parseWalkout(text);
  const tiers = parseTiers(text);

  const bonusesMemo = /performance\s+bonuses\s+per\s+the\s+deal\s+memo/i.test(
    text,
  )
    ? "Performance bonuses per deal memo (amounts not specified in notes)"
    : null;

  return {
    dealType: detectDealType(text),
    guaranteeAmount: parseGuarantee(text),
    artistPercentage: parseArtistPercentage(text),
    percentageBasis: parsePercentageBasis(text),
    expenseCap: parseExpenseCap(text),
    hospitalityCap: parseHospitalityCap(text),
    ...bonuses,
    ...tiers,
    ...walkout,
    otherNotes: bonusesMemo,
  };
}

/**
 * Classify what the assistant's question was asking about so we can interpret
 * a short follow-up reply (a bare number, "net"/"gross") correctly.
 */
type QuestionKind =
  | "percentage"
  | "basis"
  | "guarantee"
  | "expense_cap"
  | "hospitality_cap"
  | "caps_combined"
  | "walkout"
  | "tier"
  | "other";

function classifyAssistantQuestion(assistantText: string): QuestionKind {
  const t = assistantText.toLowerCase();
  // Match specific follow-up phrases first so a preceding acknowledgment that
  // mentions other field names doesn't change the classification.
  if (/is there an expense cap as well\?/.test(t)) return "expense_cap";
  if (/is there a hospitality cap as well\?/.test(t)) return "hospitality_cap";
  if (/expense cap or hospitality cap/.test(t)) return "caps_combined";
  if (/walkout threshold/.test(t)) return "walkout";
  if (/escalator tier percentages?|tier percentages?/.test(t)) return "tier";
  if (/(of\s+net\s+or\s+gross|\bnet\s+or\s+gross\b)/.test(t)) return "basis";
  if (/artist'?s percentage|percentage on the split|percent on the split/.test(t))
    return "percentage";
  if (/what'?s the guarantee amount|what'?s the guarantee\b/.test(t))
    return "guarantee";
  return "other";
}

/** True when the user reply is just a number, with optional $/%/comma decoration. */
function parseBareNumber(text: string): number | null {
  const m = text.trim().match(/^\$?\s*([\d,]+(?:\.\d+)?)\s*%?\.?$/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function isBareNet(text: string): boolean {
  return /^net\.?$/i.test(text.trim());
}
function isBareGross(text: string): boolean {
  return /^gross\.?$/i.test(text.trim());
}

/**
 * Walk the conversation in order. For each user reply, infer the field they
 * are answering based on the most recent assistant question. Skip if the base
 * parser already filled the field. The result is treated as monotonic: once a
 * field is captured, it stays captured forever.
 */
function inferFromConversation(
  messages: ChatMessage[],
  base: ExtractedSignals,
): Partial<ExtractedSignals> {
  const override: Partial<ExtractedSignals> = {};
  const has = <K extends keyof ExtractedSignals>(k: K): boolean =>
    base[k] != null || override[k] != null;

  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role !== "user") continue;
    const prev = messages[i - 1];
    if (!prev || prev.role !== "assistant") continue;

    const userText = messages[i].content.trim();
    const kind = classifyAssistantQuestion(prev.content);

    if (kind === "basis") {
      if (!has("percentageBasis")) {
        if (isBareNet(userText)) override.percentageBasis = "net";
        else if (isBareGross(userText)) override.percentageBasis = "gross";
      }
      continue;
    }

    const num = parseBareNumber(userText);
    if (num == null) continue;

    switch (kind) {
      case "percentage":
        if (!has("artistPercentage")) {
          override.artistPercentage = num > 1 ? num / 100 : num;
        }
        break;
      case "guarantee":
        if (!has("guaranteeAmount")) override.guaranteeAmount = num;
        break;
      case "expense_cap":
        if (!has("expenseCap")) override.expenseCap = num;
        break;
      case "hospitality_cap":
        if (!has("hospitalityCap")) override.hospitalityCap = num;
        break;
      case "caps_combined":
        // Ambiguous single number to the combined caps question — default to
        // expense cap since it's the more common settlement input.
        if (!has("expenseCap")) override.expenseCap = num;
        break;
      case "walkout":
        if (!has("walkoutThreshold")) override.walkoutThreshold = num;
        break;
      case "tier":
        if (!has("tier1Percentage")) {
          override.tier1Percentage = num > 1 ? num / 100 : num;
        } else if (!has("tier2Percentage")) {
          override.tier2Percentage = num > 1 ? num / 100 : num;
        }
        break;
    }
  }

  // Infer deal type once we have enough conversational signal.
  const guarantee = override.guaranteeAmount ?? base.guaranteeAmount;
  const pct = override.artistPercentage ?? base.artistPercentage;
  const basis = override.percentageBasis ?? base.percentageBasis;
  if (base.dealType == null && pct != null) {
    if (guarantee != null) {
      override.dealType =
        basis === "gross" ? "guarantee_vs_gross" : "guarantee_vs_net";
    } else {
      override.dealType = "percentage_only";
    }
  }

  return override;
}

/**
 * Like extractSignals but conversation-aware: bare-number / bare-net/gross
 * replies are interpreted in the context of the assistant's last question.
 */
export function extractSignalsFromMessages(
  messages: ChatMessage[],
): ExtractedSignals {
  const base = extractSignals(allUserText(messages));
  const override = inferFromConversation(messages, base);
  return { ...base, ...override };
}

const DEAL_TYPE_LABELS: Record<DealType, string> = {
  flat: "Flat guarantee",
  guarantee_vs_net: "Guarantee vs % of net",
  guarantee_vs_gross: "Guarantee vs % of gross",
  percentage_only: "% of net/gross (no guarantee)",
  door_deal: "Door deal",
  escalator: "Escalator / ratchet",
  walkout_pot: "Guarantee vs % + walkout pot",
};

function formatMoney(n: number): string {
  return `$${n.toLocaleString()}`;
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

function bonusesReferenced(text: string): boolean {
  return /\bbonus|sellout|per\s+the\s+deal\s+memo|\+\s*\$/i.test(text);
}

function walkoutReferenced(text: string, signals: ExtractedSignals): boolean {
  return (
    signals.dealType === "walkout_pot" ||
    /\bwalkout\b/i.test(text) ||
    signals.walkoutThreshold != null
  );
}

function tiersReferenced(text: string, signals: ExtractedSignals): boolean {
  return (
    signals.dealType === "escalator" ||
    /\bescalat|\bratchet|\btier\b/i.test(text) ||
    signals.tier1Percentage != null ||
    signals.tier2Percentage != null
  );
}

type FieldRelevance = {
  label: string;
  relevant: boolean;
  required: boolean;
  value: string | null;
};

type CapsAbsent = { expense?: boolean; hospitality?: boolean };

function capsWaivedByDealText(text: string): boolean {
  return /\bno\s+expenses?\b|\bno\s+expense\s+deductions?\b|\btour\s+routing\s+fill\b|\bbuyout\b|\bno\s+upside\b/i.test(
    text,
  );
}

function getFieldRelevance(
  signals: ExtractedSignals,
  text: string,
  capsAbsent: CapsAbsent = {},
): FieldRelevance[] {
  const capsWaived = capsWaivedByDealText(text);
  const noExpenses =
    capsWaived ||
    capsAbsent.expense === true ||
    /\bno\s+expenses?\b|\bno\s+expense\s+(?:cap|deductions?)\b/i.test(text);
  const noGuarantee = /\bno\s+guarantee\b/i.test(text);
  const noHospitality =
    capsWaived ||
    capsAbsent.hospitality === true ||
    /\bno\s+hospitality(?:\s+cap)?\b/i.test(text);
  const dt = signals.dealType;

  const isFlat = dt === "flat";
  const isDoor = dt === "door_deal";
  const isVs = dt === "guarantee_vs_net" || dt === "guarantee_vs_gross";
  const isPctOnly = dt === "percentage_only";
  const isWalkout = dt === "walkout_pot";
  const isEscalator = dt === "escalator";

  const showGuarantee =
    !!dt &&
    !noGuarantee &&
    (isFlat || isVs || isWalkout || isEscalator);
  const showPct =
    !!dt && !isFlat && !isDoor && (isVs || isPctOnly || isWalkout || isEscalator);
  const showBasis = showPct;
  // Expense & hospitality caps required for settlement on every deal type
  const showExpense = !!dt;
  const showHospitality = !!dt;
  const showWalkout = walkoutReferenced(text, signals);
  const showTiers = tiersReferenced(text, signals);
  const showBonuses = bonusesReferenced(text) || signals.bonus1Amount != null;

  const fields: FieldRelevance[] = [
    {
      label: "Deal type",
      relevant: true,
      required: true,
      value: dt ? DEAL_TYPE_LABELS[dt] : null,
    },
    {
      label: "Guarantee",
      relevant: showGuarantee,
      required: showGuarantee,
      value:
        signals.guaranteeAmount != null
          ? formatMoney(signals.guaranteeAmount)
          : noGuarantee && isPctOnly
            ? "None"
            : null,
    },
    {
      label: "Artist percentage",
      relevant: showPct,
      required: showPct,
      value:
        signals.artistPercentage != null
          ? formatPct(signals.artistPercentage)
          : null,
    },
    {
      label: "Percentage basis (net/gross)",
      relevant: showBasis,
      required: showBasis,
      value: signals.percentageBasis,
    },
    {
      label: "Expense cap",
      relevant: showExpense,
      required: showExpense && signals.expenseCap == null && !noExpenses,
      value:
        signals.expenseCap != null
          ? formatMoney(signals.expenseCap)
          : noExpenses
            ? "None"
            : null,
    },
    {
      label: "Hospitality cap",
      relevant: showHospitality,
      required:
        showHospitality && signals.hospitalityCap == null && !noHospitality,
      value:
        signals.hospitalityCap != null
          ? formatMoney(signals.hospitalityCap)
          : noHospitality
            ? "None"
            : null,
    },
    {
      label: "Walkout threshold / terms",
      relevant: showWalkout,
      required: isWalkout && signals.walkoutThreshold == null,
      value:
        signals.walkoutThreshold != null
          ? `${signals.walkoutType ?? "Walkout pot"} (threshold ${formatMoney(signals.walkoutThreshold)})`
          : signals.walkoutType,
    },
    {
      label: "Tier 1 (escalator/ratchet)",
      relevant: showTiers,
      required: isEscalator && signals.tier1Percentage == null,
      value:
        signals.tier1Percentage != null
          ? formatPct(signals.tier1Percentage) +
            (signals.tier1Threshold != null
              ? ` up to ${(signals.tier1Threshold * 100).toFixed(0)}% sold`
              : " at base")
          : null,
    },
    {
      label: "Tier 2 (escalator/ratchet)",
      relevant: showTiers && signals.tier2Percentage != null,
      required: false,
      value:
        signals.tier2Percentage != null
          ? formatPct(signals.tier2Percentage) +
            (signals.tier2Threshold != null
              ? ` above ${(signals.tier2Threshold * 100).toFixed(0)}% sold`
              : "")
          : null,
    },
    {
      label: "Bonus 1",
      relevant: showBonuses,
      required: false,
      value:
        signals.bonus1Amount != null
          ? `${formatMoney(signals.bonus1Amount)}${signals.bonus1Trigger ? ` if ${signals.bonus1Trigger}` : ""}`
          : null,
    },
    {
      label: "Bonus 2",
      relevant: showBonuses && signals.bonus2Amount != null,
      required: false,
      value:
        signals.bonus2Amount != null
          ? `${formatMoney(signals.bonus2Amount)}${signals.bonus2Trigger ? ` if ${signals.bonus2Trigger}` : ""}`
          : null,
    },
    {
      label: "Other notes",
      relevant: !!signals.otherNotes,
      required: false,
      value: signals.otherNotes,
    },
  ];

  return fields;
}

/** Fields that should never appear as "Not stated" — hide instead. */
const HIDE_WHEN_MISSING = new Set(["Expense cap", "Hospitality cap"]);

export function buildCapturedInventory(
  signals: ExtractedSignals,
  text = "",
  capsAbsent: CapsAbsent = {},
): string {
  const lines: string[] = [];

  for (const field of getFieldRelevance(signals, text, capsAbsent)) {
    if (!field.relevant) continue;
    if (field.value != null) {
      lines.push(`- ${field.label}: ${field.value}`);
    } else if (field.required && !HIDE_WHEN_MISSING.has(field.label)) {
      lines.push(`- ${field.label}: Not stated`);
    }
  }

  if (lines.length === 0) {
    lines.push(`- Deal type: Not stated`);
  }

  return lines.join("\n");
}

/** Plain-prose summary of captured terms, e.g. "flat guarantee of $1,136, expense cap $200". */
function buildDealSentence(
  signals: ExtractedSignals,
  text: string,
  capsAbsent: CapsAbsent = {},
): string {
  const dt = signals.dealType;
  if (!dt) return "";

  const parts: string[] = [];
  const pct =
    signals.artistPercentage != null
      ? formatPct(signals.artistPercentage)
      : null;
  const basis = signals.percentageBasis;
  const splitPhrase = pct
    ? basis
      ? `${pct} of ${basis}`
      : pct
    : null;

  if (dt === "flat") {
    parts.push(
      signals.guaranteeAmount != null
        ? `flat guarantee of ${formatMoney(signals.guaranteeAmount)}`
        : "flat guarantee",
    );
  } else if (dt === "door_deal") {
    parts.push("door deal");
  } else if (dt === "percentage_only") {
    parts.push(splitPhrase ? `${splitPhrase} deal` : "percentage-only deal");
  } else if (dt === "guarantee_vs_net" || dt === "guarantee_vs_gross") {
    if (signals.guaranteeAmount != null && splitPhrase) {
      parts.push(`${formatMoney(signals.guaranteeAmount)} vs ${splitPhrase}`);
    } else if (signals.guaranteeAmount != null) {
      parts.push(`${formatMoney(signals.guaranteeAmount)} guarantee vs split`);
    } else if (splitPhrase) {
      parts.push(`guarantee vs ${splitPhrase}`);
    } else {
      parts.push("guarantee vs % deal");
    }
  } else if (dt === "walkout_pot") {
    const base =
      signals.guaranteeAmount != null && splitPhrase
        ? `${formatMoney(signals.guaranteeAmount)} vs ${splitPhrase}`
        : signals.guaranteeAmount != null
          ? `${formatMoney(signals.guaranteeAmount)} guarantee`
          : "guarantee vs % deal";
    const walkout =
      signals.walkoutThreshold != null
        ? ` with walkout pot above ${formatMoney(signals.walkoutThreshold)}`
        : " with walkout pot";
    parts.push(`${base}${walkout}`);
  } else if (dt === "escalator") {
    const base =
      signals.guaranteeAmount != null
        ? `${formatMoney(signals.guaranteeAmount)} guarantee`
        : "escalator deal";
    let tier = "";
    if (signals.tier1Percentage != null && signals.tier2Percentage != null) {
      tier = ` with escalator from ${formatPct(signals.tier1Percentage)} to ${formatPct(signals.tier2Percentage)}`;
    } else if (signals.tier1Percentage != null) {
      tier = ` starting at ${formatPct(signals.tier1Percentage)}`;
    } else {
      tier = " with escalator";
    }
    parts.push(`${base}${tier}`);
  } else {
    const label = DEAL_TYPE_LABELS[dt as DealType];
    if (label) parts.push(label.toLowerCase());
  }

  // Caps — only mention if a value or confirmed-absent state exists.
  const capsWaived = capsWaivedByDealText(text);
  const noExpenses =
    capsWaived ||
    capsAbsent.expense === true ||
    /\bno\s+expense\s+(?:cap|deductions?)\b|\bno\s+expenses?\b/i.test(text);
  const noHospitality =
    capsWaived ||
    capsAbsent.hospitality === true ||
    /\bno\s+hospitality(?:\s+cap)?\b/i.test(text);

  if (signals.expenseCap != null) {
    parts.push(`expense cap ${formatMoney(signals.expenseCap)}`);
  } else if (noExpenses) {
    parts.push("no expense cap");
  }
  if (signals.hospitalityCap != null) {
    parts.push(`hospitality cap ${formatMoney(signals.hospitalityCap)}`);
  } else if (noHospitality) {
    parts.push("no hospitality cap");
  }

  // Walkout when not already folded into the deal-type phrase
  if (dt !== "walkout_pot" && signals.walkoutThreshold != null) {
    parts.push(`walkout pot above ${formatMoney(signals.walkoutThreshold)}`);
  }

  // Tiers (only outside escalator base phrase)
  if (
    dt !== "escalator" &&
    (signals.tier1Percentage != null || signals.tier2Percentage != null)
  ) {
    if (signals.tier1Percentage != null && signals.tier2Percentage != null) {
      parts.push(
        `escalator from ${formatPct(signals.tier1Percentage)} to ${formatPct(signals.tier2Percentage)}`,
      );
    } else if (signals.tier1Percentage != null) {
      parts.push(`tier at ${formatPct(signals.tier1Percentage)}`);
    }
  }

  // Bonuses
  if (signals.bonus1Amount != null) {
    parts.push(
      `${formatMoney(signals.bonus1Amount)} bonus${signals.bonus1Trigger ? ` if ${signals.bonus1Trigger}` : ""}`,
    );
  }
  if (signals.bonus2Amount != null) {
    parts.push(
      `${formatMoney(signals.bonus2Amount)} bonus${signals.bonus2Trigger ? ` if ${signals.bonus2Trigger}` : ""}`,
    );
  }

  return parts.join(", ");
}

function missingForComplete(
  signals: ExtractedSignals,
  text: string,
  capsAbsent: CapsAbsent = {},
): string[] {
  if (!signals.dealType) {
    return ["deal structure (flat, vs, door, % of gross, etc.)"];
  }

  return getFieldRelevance(signals, text, capsAbsent)
    .filter((f) => f.relevant && f.required && f.value == null)
    .map((f) => f.label.toLowerCase());
}

function nextQuestionForMissing(
  missing: string[],
  signals?: ExtractedSignals,
): string {
  const otherFields = missing.filter(
    (m) => !m.includes("expense cap") && !m.includes("hospitality"),
  );

  if (otherFields.includes("deal structure (flat, vs, door, % of gross, etc.)")) {
    return "I don't have the deal structure yet — is this a flat, vs, door, % of gross, or some other deal?";
  }
  if (otherFields.includes("percentage basis (net/gross)")) {
    return "Is that of net or gross?";
  }
  if (otherFields.includes("artist percentage")) {
    return "What's the artist's percentage on the split?";
  }
  if (otherFields.includes("guarantee")) {
    return "What's the guarantee amount?";
  }
  if (otherFields.includes("walkout threshold / terms")) {
    return "What's the walkout threshold dollar amount?";
  }
  if (otherFields.includes("tier 1 (escalator/ratchet)")) {
    return "What are the escalator tier percentages?";
  }
  if (otherFields.length > 0) {
    return `Could you share the ${otherFields.join(" and ")} from the agent thread?`;
  }

  // Only caps are missing. If one is already known, ask only about the other.
  const needsExpense = missing.some((m) => m.includes("expense cap"));
  const needsHospitality = missing.some((m) => m.includes("hospitality"));
  if (needsExpense && !needsHospitality && signals?.hospitalityCap != null) {
    return "Is there an expense cap as well?";
  }
  if (needsHospitality && !needsExpense && signals?.expenseCap != null) {
    return "Is there a hospitality cap as well?";
  }
  return CAPS_QUESTION;
}

/** Necessary fields for this deal type resolved before the catch-all question. */
export function coreFieldsComplete(
  signals: ExtractedSignals,
  text: string,
  capsAbsent: CapsAbsent = {},
): boolean {
  if (!signals.dealType) return false;
  return missingForComplete(signals, text, capsAbsent).length === 0;
}

type CapAskKind = "combined" | "expense_only" | "hospitality_only" | null;

function classifyCapAsk(assistantText: string): CapAskKind {
  if (assistantText.includes(CAPS_QUESTION)) return "combined";
  if (/is there an expense cap as well\?/i.test(assistantText))
    return "expense_only";
  if (/is there a hospitality cap as well\?/i.test(assistantText))
    return "hospitality_only";
  return null;
}

function capsQuestionAskIndex(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (
      messages[i].role === "assistant" &&
      classifyCapAsk(messages[i].content) !== null
    ) {
      return i;
    }
  }
  return -1;
}

function getCapsQuestionReply(messages: ChatMessage[]): string | null {
  const idx = capsQuestionAskIndex(messages);
  if (idx < 0) return null;
  const replies = messages.slice(idx + 1).filter((m) => m.role === "user");
  return replies[replies.length - 1]?.content ?? null;
}

/**
 * Track which caps are confirmed absent by looking at every cap question
 * (combined, expense-only, hospitality-only) and its negative answer.
 */
function capsAbsentFromMessages(messages: ChatMessage[]): CapsAbsent {
  const out: CapsAbsent = {};
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role !== "assistant") continue;
    const kind = classifyCapAsk(messages[i].content);
    if (!kind) continue;
    // Find the next user reply
    let userReply: string | null = null;
    for (let j = i + 1; j < messages.length; j++) {
      if (messages[j].role === "user") {
        userReply = messages[j].content;
        break;
      }
      if (messages[j].role === "assistant") break;
    }
    if (!userReply || !isNegativeShortAnswer(userReply)) continue;
    if (kind === "combined") {
      out.expense = true;
      out.hospitality = true;
    } else if (kind === "expense_only") {
      out.expense = true;
    } else if (kind === "hospitality_only") {
      out.hospitality = true;
    }
  }
  return out;
}

/** True when the last user message was a short-negative reply to a cap question. */
function capsJustAnsweredNegatively(messages: ChatMessage[]): boolean {
  const askIdx = capsQuestionAskIndex(messages);
  if (askIdx < 0) return false;
  const lastUserIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") return i;
    }
    return -1;
  })();
  if (lastUserIdx <= askIdx) return false;
  // No assistant message has been sent after the user's reply yet.
  const hasAssistantAfter = messages
    .slice(askIdx + 1)
    .some((m, i) => m.role === "assistant" && askIdx + 1 + i > lastUserIdx);
  if (hasAssistantAfter) return false;
  const lastUser = messages[lastUserIdx]?.content ?? "";
  return isNegativeShortAnswer(lastUser);
}

function catchAllWasAsked(messages: ChatMessage[]): boolean {
  return messages.some(
    (m) =>
      m.role === "assistant" &&
      m.content.includes("performance bonuses, sellout bonuses"),
  );
}

function catchAllAskIndex(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (
      messages[i].role === "assistant" &&
      messages[i].content.includes("performance bonuses, sellout bonuses")
    ) {
      return i;
    }
  }
  return -1;
}

function getCatchAllUserReply(messages: ChatMessage[]): string | null {
  const idx = catchAllAskIndex(messages);
  if (idx < 0) return null;
  const replies = messages.slice(idx + 1).filter((m) => m.role === "user");
  return replies[replies.length - 1]?.content ?? null;
}

function catchAllWasAnswered(messages: ChatMessage[]): boolean {
  return getCatchAllUserReply(messages) != null;
}

/** Short-negative reply ("no", "nope", "none", "that's it", etc.). */
export function isNegativeShortAnswer(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[.!]+$/, "");
  const patterns = [
    /^no$/,
    /^nope$/,
    /^none$/,
    /^nothing else$/,
    /^nothing$/,
    /^that'?s it$/,
    /^thats it$/,
    /^we'?re good$/,
    /^were good$/,
    /^all good$/,
    /^that covers it$/,
    /^nah$/,
    /^no bonuses?$/,
    /^no caps?$/,
    /^no expense cap$/,
    /^no hospitality cap$/,
    /^nothing more$/,
    /^nothing else to add$/,
    /^we'?re done$/,
    /^all set$/,
    /^that'?ll do$/,
  ];
  if (patterns.some((p) => p.test(t))) return true;

  // Lenient: reply starts with a clear negative and carries no numeric info,
  // e.g. "no, that's it" / "nope, all good" / "nothing else to add here".
  if (
    /^(?:no|nope|nah|none|nothing)\b/.test(t) &&
    !/[\d$%]/.test(t)
  ) {
    return true;
  }
  return false;
}

/** Alias kept for backwards compatibility. */
export const isCatchAllNegativeAnswer = isNegativeShortAnswer;

export function isConversationComplete(messages: ChatMessage[]): boolean {
  if (messages.filter((m) => m.role === "user").length === 0) return false;

  const text = allUserText(messages);
  const signals = extractSignalsFromMessages(messages);
  const capsAbsent = capsAbsentFromMessages(messages);
  return (
    coreFieldsComplete(signals, text, capsAbsent) &&
    catchAllWasAnswered(messages)
  );
}

export function getAssistantReply(messages: ChatMessage[]): {
  message: string;
  complete: boolean;
} {
  const userMessages = messages.filter((m) => m.role === "user");
  if (userMessages.length === 0) {
    return { message: OPENING, complete: false };
  }

  const text = allUserText(messages);
  const signals = extractSignalsFromMessages(messages);
  const capsAbsent = capsAbsentFromMessages(messages);
  const missing = missingForComplete(signals, text, capsAbsent);
  const sentence = buildDealSentence(signals, text, capsAbsent);
  const ack = sentence ? `Got it — ${sentence}.` : "";
  const coreComplete = coreFieldsComplete(signals, text, capsAbsent);

  // Booker just said "no" to the caps question — skip recap, go straight to catch-all.
  if (
    coreComplete &&
    capsJustAnsweredNegatively(messages) &&
    !catchAllWasAsked(messages)
  ) {
    return { message: CATCH_ALL_QUESTION, complete: false };
  }

  if (coreComplete && catchAllWasAnswered(messages)) {
    const catchAllReply = getCatchAllUserReply(messages) ?? "";
    if (isNegativeShortAnswer(catchAllReply)) {
      return { message: CATCH_ALL_DONE_MESSAGE, complete: true };
    }
    // Booker gave a non-negative reply — capture and confirm what we have,
    // then keep the door open until they explicitly say there's nothing more.
    return {
      message: ack
        ? `${ack} Anything else to add?`
        : "Anything else to add?",
      complete: false,
    };
  }

  if (missing.length > 0) {
    if (!signals.dealType) {
      return {
        message:
          "I don't have the deal structure yet — is this a flat, vs, door, % of gross, or some other deal?",
        complete: false,
      };
    }
    const question = nextQuestionForMissing(missing, signals);
    return {
      message: ack ? `${ack} ${question}` : question,
      complete: false,
    };
  }

  if (coreComplete && !catchAllWasAsked(messages)) {
    return {
      message: ack ? `${ack} ${CATCH_ALL_QUESTION}` : CATCH_ALL_QUESTION,
      complete: false,
    };
  }

  if (
    coreComplete &&
    catchAllWasAsked(messages) &&
    !catchAllWasAnswered(messages)
  ) {
    return {
      message: ack ? `${ack} ${CATCH_ALL_QUESTION}` : CATCH_ALL_QUESTION,
      complete: false,
    };
  }

  return {
    message: ack
      ? `${ack} Anything else from the agent email?`
      : "Could you share the deal terms from the agent email?",
    complete: false,
  };
}

export function generateDealTermsFromConversation(
  messages: ChatMessage[],
): DealTermsDraft {
  const signals = extractSignalsFromMessages(messages);
  const draft: DealTermsDraft = { ...EMPTY_DEAL_TERMS };

  if (signals.dealType) draft.dealType = signals.dealType;
  if (signals.guaranteeAmount != null) draft.guaranteeAmount = signals.guaranteeAmount;
  if (signals.artistPercentage != null)
    draft.artistPercentage = signals.artistPercentage;
  if (signals.percentageBasis) draft.percentageBasis = signals.percentageBasis;
  if (signals.expenseCap != null) draft.expenseCap = signals.expenseCap;
  if (signals.hospitalityCap != null) draft.hospitalityCap = signals.hospitalityCap;
  if (signals.walkoutThreshold != null)
    draft.walkoutThreshold = signals.walkoutThreshold;
  if (signals.walkoutType) draft.walkoutType = signals.walkoutType;
  if (signals.tier1Percentage != null) draft.tier1Percentage = signals.tier1Percentage;
  if (signals.tier1Threshold != null) draft.tier1Threshold = signals.tier1Threshold;
  if (signals.tier2Percentage != null) draft.tier2Percentage = signals.tier2Percentage;
  if (signals.tier2Threshold != null) draft.tier2Threshold = signals.tier2Threshold;
  if (signals.bonus1Amount != null) draft.bonus1Amount = signals.bonus1Amount;
  if (signals.bonus1Trigger) draft.bonus1Trigger = signals.bonus1Trigger;
  if (signals.bonus2Amount != null) draft.bonus2Amount = signals.bonus2Amount;
  if (signals.bonus2Trigger) draft.bonus2Trigger = signals.bonus2Trigger;

  return draft;
}

export function serializeConversation(messages: ChatMessage[]): string {
  return messages
    .map((m) => `${m.role === "user" ? "Mariana" : "Greenroom AI"}: ${m.content}`)
    .join("\n\n");
}

export function draftToDbValues(draft: DealTermsDraft) {
  const num = (v: number | ""): number | null =>
    v === "" || v == null ? null : Number(v);

  return {
    dealType: draft.dealType || null,
    guaranteeAmount: num(draft.guaranteeAmount),
    artistPercentage: num(draft.artistPercentage),
    percentageBasis: draft.percentageBasis || null,
    expenseCap: num(draft.expenseCap),
    hospitalityCap: num(draft.hospitalityCap),
    walkoutThreshold: num(draft.walkoutThreshold),
    walkoutType: draft.walkoutType || null,
    tier1Percentage: num(draft.tier1Percentage),
    tier1Threshold: num(draft.tier1Threshold),
    tier2Percentage: num(draft.tier2Percentage),
    tier2Threshold: num(draft.tier2Threshold),
    bonus1Amount: num(draft.bonus1Amount),
    bonus1Trigger: draft.bonus1Trigger || null,
    bonus2Amount: num(draft.bonus2Amount),
    bonus2Trigger: draft.bonus2Trigger || null,
  };
}
