/** Studio V5 M2 — FAL pricing-sentence parser (Lock L). Pure string parsing (no server-only marker so the golden suite can import it). */
import { asIcu, type IcuAmount } from "../../contracts/money";

export type FalPriceMeterUnit = "image" | "second" | "character" | "task_unit";

/** Candidate `studio_v5_price_configs` row: exact parse, unconfirmed (DERIVED). */
export interface FalPriceCandidate {
  endpointId: string;
  taskName: string;
  priceVersion: string;
  meterUnit: FalPriceMeterUnit;
  unitPriceIcu: IcuAmount;
  /** Neutral 1:1 settlement calibration; M4 calibrates per provider. */
  minorPerIcu: number;
  skuRate: number;
  /** Must equal the source `pricing.raw_hash`. */
  evidenceHash: string;
  confidence: "exact";
  sourceSentence: string;
}

export type FalPriceParse =
  | { status: "DERIVED"; candidate: FalPriceCandidate }
  | { status: "UNKNOWN"; reason: string };

export interface ParsePriceSentencesInput {
  endpointId: string;
  taskName: string;
  sentences: readonly string[];
  evidenceHash: string | null;
  priceVersion?: string;
}

function normalize(sentence: string): string {
  // "0.29 $ per second" -> "$0.29 per second".
  return sentence.replace(/(\d+(?:\.\d+)?)\s*\$/g, "$$$1").toLowerCase();
}

function amountsOf(normalized: string): number[] {
  const out: number[] = [];
  for (const match of normalized.matchAll(/\$(\d+(?:\.\d+)?)/g)) out.push(Number(match[1]));
  return out;
}

function decimalLiteralsOf(normalized: string): number {
  return (normalized.match(/\d+\.\d+/g) ?? []).length;
}

type UnitHit = { unit: FalPriceMeterUnit; divisor: number };

function unitsOf(normalized: string): UnitHit[] {
  const hits: UnitHit[] = [];
  if (/\bmegapixels?\b|\bcredits?\b|\btokens?\b/.test(normalized)) return [{ unit: "task_unit", divisor: -1 }];
  if (
    /\/second\b|per\s+(?:input\s+|output\s+|generated\s+|enhanced\s+)?(?:video\s+|audio\s+)?seconds?\b|per\s+sec\b/.test(
      normalized,
    )
  ) {
    hits.push({ unit: "second", divisor: 1 });
  }
  if (/per\s+(?:generated\s+|output\s+)?images?\b/.test(normalized)) hits.push({ unit: "image", divisor: 1 });
  const charMatch = normalized.match(/per\s+(1,?000\s+)?characters?\b/);
  if (charMatch) hits.push({ unit: "character", divisor: charMatch[1] ? 1000 : 1 });
  if (/per\s+minutes?\b/.test(normalized)) hits.push({ unit: "second", divisor: 60 });
  if (
    /per\s+(?:generated\s+|output\s+)?videos?\b(?!\s+seconds?\b)|per\s+requests?\b|per\s+calls?\b|per\s+generations?\b|per\s+runs?\b|per\s+tasks?\b|\bflat\s+(?:rate|fee|price)\b/.test(
      normalized,
    )
  ) {
    hits.push({ unit: "task_unit", divisor: 1 });
  }
  // Deduplicate identical hits (e.g. "per second ... /second").
  const seen = new Set<string>();
  return hits.filter((hit) => {
    const key = `${hit.unit}/${hit.divisor}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toMicroDollars(amount: number): number | null {
  // Integer-space conversion: "$0.0225" -> 22500 micro-dollars.
  const text = String(amount);
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const [whole, frac = ""] = text.split(".");
  const padded = (frac + "000000").slice(0, 6);
  return Number(whole) * 1_000_000 + Number(padded);
}

interface SentenceParse {
  kind: "rate" | "none" | "ambiguous";
  amount?: number;
  unit?: FalPriceMeterUnit;
  divisor?: number;
  reason?: string;
}

function parseSentence(sentence: string): SentenceParse {
  if (/for example/i.test(sentence)) return { kind: "none", reason: "worked example, not a rate" };
  if (/\benabled\b/i.test(sentence)) return { kind: "none", reason: "conditional variant, not a base rate" };
  const normalized = normalize(sentence);
  const amounts = amountsOf(normalized);
  if (amounts.length === 0) return { kind: "none", reason: "no price signal" };
  if (new Set(amounts).size !== 1 || amounts.length !== 1) {
    return { kind: "ambiguous", reason: "tiered or multi-price sentence" };
  }
  if (decimalLiteralsOf(normalized) > amounts.length) {
    return { kind: "ambiguous", reason: "unlabelled bare amounts" };
  }
  const units = unitsOf(normalized);
  if (units.length !== 1 || units[0]!.divisor === -1) {
    return { kind: "ambiguous", reason: units.length === 0 ? "no meter unit" : "conflicting meter units" };
  }
  return { kind: "rate", amount: amounts[0]!, unit: units[0]!.unit, divisor: units[0]!.divisor };
}

/**
 * Turn an endpoint's raw pricing sentences into at most one DERIVED price
 * candidate. Endpoint-level DERIVED requires exactly one exact sentence
 * parse and no other price signal; anything tiered, conditional,
 * resolution-dependent or sub-ICU is UNKNOWN (fail closed).
 */
export function parsePriceSentences(input: ParsePriceSentencesInput): FalPriceParse {
  const evidenceHash = input.evidenceHash;
  if (!evidenceHash) return { status: "UNKNOWN", reason: "missing pricing evidence hash" };
  if (input.sentences.length === 0) return { status: "UNKNOWN", reason: "no pricing sentences" };
  const parsed = input.sentences.map((sentence) => ({ sentence, parse: parseSentence(sentence) }));
  if (parsed.some((entry) => entry.parse.kind === "ambiguous")) {
    return { status: "UNKNOWN", reason: "ambiguous pricing sentence" };
  }
  const rates = parsed.filter((entry) => entry.parse.kind === "rate");
  if (rates.length !== 1) {
    return {
      status: "UNKNOWN",
      reason: rates.length === 0 ? "no rate sentence" : "multiple rate sentences (tiered or conditional)",
    };
  }
  const rate = rates[0]!;
  const micro = toMicroDollars(rate.parse.amount!);
  if (micro === null || micro <= 0) return { status: "UNKNOWN", reason: "unparseable amount" };
  const divisor = 1000 * rate.parse.divisor!;
  if (micro % divisor !== 0) return { status: "UNKNOWN", reason: "sub-ICU unit price" };
  const unitPrice = micro / divisor;
  if (!Number.isInteger(unitPrice) || unitPrice <= 0) return { status: "UNKNOWN", reason: "sub-ICU unit price" };
  return {
    status: "DERIVED",
    candidate: {
      endpointId: input.endpointId,
      taskName: input.taskName,
      priceVersion: input.priceVersion ?? "1.0.0",
      meterUnit: rate.parse.unit!,
      unitPriceIcu: asIcu(unitPrice),
      minorPerIcu: 1,
      skuRate: 1,
      evidenceHash,
      confidence: "exact",
      sourceSentence: rate.sentence,
    },
  };
}
