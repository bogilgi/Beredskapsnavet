"use server";

import { revalidatePath } from "next/cache";
import { logga, one, run } from "@/lib/db";
import { kravSkriv, type Anvandare } from "@/lib/session";
import { KATEGORI } from "@/lib/personuppgifter";
import { svara, type FormSvar } from "@/lib/formsvar";
import { idag } from "@/lib/format";

/**
 * Gallring av personuppgifter.
 *
 * Fristen är ett arkivrättsligt beslut och inte en teknisk inställning. Systemet
 * tillhandahåller därför beslutet som en uppgift kommunen fattar och
 * dokumenterar, inte som ett förvalt värde: en inbyggd frist vore en gissning
 * som ser ut som ett lagkrav. Se personuppgifter.ts.
 */

function manader(d: string, antal: number): string {
  const t = new Date(d + "T00:00:00Z");
  t.setUTCMonth(t.getUTCMonth() + antal);
  return t.toISOString().slice(0, 10);
}

async function satFristInre(a: Anvandare, formData: FormData): Promise<string> {
  const kategori = String(formData.get("kategori") ?? "");
  if (!KATEGORI[kategori]) throw new Error("Okänd kategori av personuppgifter.");

  const fristRa = String(formData.get("frist_manader") ?? "").trim();
  const frist = fristRa ? Number(fristRa) : null;
  if (frist !== null && (!Number.isInteger(frist) || frist < 0 || frist > 1200)) {
    throw new Error("Fristen anges i hela månader, 0–1200. Lämna tomt för ej beslutad.");
  }

  const beslutadAv = String(formData.get("beslutad_av") ?? "").trim();
  if (frist !== null && !beslutadAv) {
    throw new Error(
      "Ange vem som beslutat fristen. En gallringsfrist utan beslut går inte att " +
      "försvara vid tillsyn.",
    );
  }

  run(
    `INSERT INTO gallringsregler (org_id, kategori, frist_manader, beslutad_av, beslutsdatum, anmarkning)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (org_id, kategori) DO UPDATE SET
       frist_manader = excluded.frist_manader,
       beslutad_av = excluded.beslutad_av,
       beslutsdatum = excluded.beslutsdatum,
       anmarkning = excluded.anmarkning`,
    a.org_id, kategori, frist, beslutadAv,
    frist === null ? null : (String(formData.get("beslutsdatum") ?? "").trim() || idag()),
    String(formData.get("anmarkning") ?? "").trim(),
  );

  logga(
    a.org_id, a.namn,
    frist === null ? "Återtog gallringsfrist" : `Beslutade gallringsfrist ${frist} månader`,
    KATEGORI[kategori].namn,
  );
  revalidatePath("/personuppgifter");
  return frist === null
    ? `Fristen för ${KATEGORI[kategori].namn} är åter obeslutad.`
    : `Fristen för ${KATEGORI[kategori].namn} är ${frist} månader, beslutad av ${beslutadAv}.`;
}

export async function satGallringsfrist(formData: FormData): Promise<FormSvar> {
  const a = await kravSkriv("personuppgifter");
  return svara(() => satFristInre(a, formData));
}

/**
 * Gallrar en persons uppgifter.
 *
 * Raden tas bort. Placeringar personen haft blir vakanser, vilket är riktigt:
 * befattningen finns kvar, personen gör det inte.
 *
 * Loggposten nämner varken namn eller personnummer. Att skriva in den gallrade
 * personens namn i spårbarhetsloggen skulle göra gallringen meningslös — det
 * som ska gå att visa vid tillsyn är ATT gallring skett enligt beslutad frist,
 * inte vem den gällde.
 */
export async function gallraPerson(id: number) {
  const a = await kravSkriv("personuppgifter");

  const person = one<{ id: number; unit: string; upphorde: string | null; oppna: number }>(
    `SELECT pe.id, u.kortnamn AS unit, pe.anstallning_upphorde AS upphorde,
       (SELECT COUNT(*) FROM placements pl
         WHERE pl.person_id = pe.id AND pl.status <> 'avslutad') AS oppna
     FROM people pe JOIN units u ON u.id = pe.unit_id
     WHERE pe.id = ? AND pe.org_id = ?`,
    id, a.org_id,
  );
  if (!person) throw new Error("Personen finns inte i din organisation.");
  if (!person.upphorde) {
    throw new Error("Personen är inte registrerad som avslutad och ska inte gallras.");
  }
  if (person.oppna > 0) {
    throw new Error(
      "Personen har en krigsplacering som inte är avslutad. Avsluta placeringen först, " +
      "så att befattningen syns som vakant i stället för att tyst tömmas.",
    );
  }

  const regel = one<{ frist_manader: number | null }>(
    "SELECT frist_manader FROM gallringsregler WHERE org_id = ? AND kategori = 'krigsplacering'",
    a.org_id,
  );
  if (!regel || regel.frist_manader === null) {
    throw new Error(
      "Gallringsfristen för krigsplacering är inte beslutad. Besluta fristen först — " +
      "gallring utan beslut går inte att försvara vid tillsyn.",
    );
  }
  const far = manader(person.upphorde, regel.frist_manader);
  if (far > idag()) {
    throw new Error(`Fristen löper ut ${far}. Uppgifterna får inte gallras dessförinnan.`);
  }

  run("DELETE FROM people WHERE id = ? AND org_id = ?", id, a.org_id);

  logga(
    a.org_id, a.namn, "Gallrade personuppgifter enligt beslutad frist",
    `Krigsplacering, verksamhet ${person.unit}, frist ${regel.frist_manader} månader`,
  );
  revalidatePath("/personuppgifter");
  revalidatePath("/krigsplacering");
  revalidatePath("/krigsorganisation");
}
