/**
 * Svar från en serveråtgärd som drivs av ett formulär.
 *
 * Åtgärder som validerar indata får inte kasta fel. Next.js döljer
 * felmeddelanden från serveråtgärder i produktionsläge, så ett kastat fel når
 * användaren som en generisk krasch utan text. En spärr som ingen kan läsa är
 * ingen spärr: den som försöker begränsa ett krav måste få veta att det
 * stoppades för att kunder redovisat arbete på det.
 *
 * Behörighetsfel är undantaget. De leder till omdirigering och ska inte
 * besvaras med en text i formuläret.
 */
export type FormSvar = { fel?: string; klart?: string };

/** Kastat fel blir ett läsbart svar i stället för en krasch. */
export async function svara(arbete: () => Promise<string | void>): Promise<FormSvar> {
  try {
    const klart = await arbete();
    return { klart: klart || "Ändringen sparades." };
  } catch (f) {
    // redirect() och notFound() signalerar genom att kasta, och de felen ska
    // passera vidare orörda.
    if (f && typeof f === "object" && "digest" in f && typeof f.digest === "string"
        && (f.digest.startsWith("NEXT_REDIRECT") || f.digest === "NEXT_NOT_FOUND")) {
      throw f;
    }
    return { fel: f instanceof Error ? f.message : "Okänt fel." };
  }
}
