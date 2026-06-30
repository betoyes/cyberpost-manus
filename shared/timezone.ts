/**
 * Timezone utilities for America/Sao_Paulo.
 * Brazil is permanently UTC-3 (no DST since 2019).
 * All DB values are stored as UTC unix ms; these helpers convert for display/input only.
 */

const SP_TZ = "America/Sao_Paulo";

/**
 * Converts UTC ms to a "YYYY-MM-DDTHH:MM" string in São Paulo time,
 * suitable for use as the value of a <input type="datetime-local">.
 */
export function toSaoPauloInput(ms: number | null | undefined): string {
  if (!ms) return "";
  // sv-SE locale produces "YYYY-MM-DD HH:MM" — swap space for T
  const formatted = new Intl.DateTimeFormat("sv-SE", {
    timeZone: SP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
  return formatted.replace(" ", "T").slice(0, 16);
}

/**
 * Parses a datetime-local input string ("YYYY-MM-DDTHH:MM") as São Paulo time
 * and returns UTC ms.  Appending ":00-03:00" makes the Date constructor treat
 * the string as UTC-3 (SP is always UTC-3 since DST was abolished in 2019).
 */
export function parseSaoPauloInput(localStr: string): number {
  if (!localStr) return 0;
  return new Date(`${localStr}:00-03:00`).getTime();
}

/**
 * Formats UTC ms as a human-readable São Paulo date/time string for display.
 * Returns "—" for null/undefined/0.
 */
export function formatSaoPaulo(ms: number | null | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("pt-BR", { timeZone: SP_TZ });
}
