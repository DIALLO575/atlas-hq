// Human labels for the edition currently displayed. These labels never decide ordering.
const EXPLICIT_PERIOD = [
  [/\bmatin\b/i, "morning"],
  [/\b(?:midi|midday|noon)\b/i, "midday"],
  [/\b(?:soir|evening|night)\b/i, "evening"],
];

const PRESENTATION = Object.freeze({
  morning: Object.freeze({ title: "Journal du matin", short: "Matin" }),
  midday: Object.freeze({ title: "Journal de midi", short: "Midi" }),
  evening: Object.freeze({ title: "Journal du soir", short: "Soir" }),
  general: Object.freeze({ title: "Journal ATLAS", short: "Édition" }),
});

export function journalEditionPeriod({ editionId, generatedAt, receivedAt } = {}) {
  const id = typeof editionId === "string" ? editionId.replace(/[_:-]+/g, " ") : "";
  for (const [expression, period] of EXPLICIT_PERIOD) if (expression.test(id)) return period;
  const instant = generatedAt ?? receivedAt;
  if (typeof instant !== "string" || Number.isNaN(Date.parse(instant))) return "general";
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Conakry", hour: "2-digit", hourCycle: "h23" }).format(new Date(instant)));
  if (!Number.isInteger(hour)) return "general";
  if (hour < 11) return "morning";
  if (hour < 17) return "midday";
  return "evening";
}

export function journalEditionPresentation(edition) {
  return PRESENTATION[journalEditionPeriod(edition)] ?? PRESENTATION.general;
}
