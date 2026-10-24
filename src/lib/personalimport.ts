import "server-only";

/**
 * Inläsning av personalfil från kommunens HR-system.
 *
 * Själva formathanteringen ligger i csv.ts, som är fri från server-beroenden
 * och därför går att testa direkt. Den här filen finns för att importen bara
 * ska kunna anropas från servern.
 *
 * En riktig integration mot personalsystemet är nästa steg; filvägen finns kvar
 * ändå, eftersom alla kommuner inte har ett system som går att integrera mot.
 */
export { KOLUMNER, lasPersonalfil } from "@/lib/csv";
export type { Kolumn, Rad, Inlasning } from "@/lib/csv";
