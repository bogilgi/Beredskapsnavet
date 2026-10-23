"use server";

import { revalidatePath } from "next/cache";
import { logga, one, run } from "@/lib/db";
import { idag } from "@/lib/format";
import { kravSkriv } from "@/lib/session";

function uppdateraAllt() {
  for (const p of [
    "/", "/efterlevnad", "/atgarder", "/krigsorganisation", "/krigsplacering",
    "/rsa", "/kontinuitet", "/resurser", "/ovningar", "/rapport", "/anvandare",
  ]) {
    revalidatePath(p);
  }
}

/**
 * Varje skrivning filtrerar på organisationen i sessionen. Träffar den ingen
 * rad hörde objektet till en annan organisation, eller fanns inte, och då ska
 * skrivningen inte tyst passera.
 */
function skrivEn(beskrivning: string, sql: string, ...params: unknown[]) {
  const resultat = run(sql, ...params);
  if (Number(resultat.changes) === 0) {
    throw new Error(`${beskrivning}: objektet finns inte i din organisation.`);
  }
}

/** Läser ett fält ur en rad som måste tillhöra organisationen. */
function faltIOrg<T>(sql: string, id: number, orgId: number): T | undefined {
  return one<T>(sql, id, orgId);
}

/* ------------------------------------------------------------------ åtgärder */

const ATGARDSSTATUSAR = ["ej_paborjad", "pagaende", "klar", "avbruten"];

export async function satAtgardsStatus(id: number, status: string) {
  const a = await kravSkriv("atgarder");
  if (!ATGARDSSTATUSAR.includes(status)) throw new Error("Okänd status: " + status);

  const rad = faltIOrg<{ titel: string }>(
    "SELECT titel FROM actions WHERE id = ? AND org_id = ?", id, a.org_id);
  skrivEn(
    "Kunde inte ändra åtgärden",
    `UPDATE actions SET status = ?,
       klar_datum = CASE WHEN ? = 'klar' THEN ? ELSE NULL END
     WHERE id = ? AND org_id = ?`,
    status, status, idag(), id, a.org_id,
  );
  logga(a.org_id, a.namn, `Satte åtgärdsstatus till ${status}`, rad?.titel ?? String(id));
  uppdateraAllt();
}

export async function skapaAtgard(formData: FormData): Promise<void> {
  const a = await kravSkriv("atgarder");
  const titel = String(formData.get("titel") ?? "").trim();
  if (!titel) return;

  // Verksamheten måste tillhöra samma organisation.
  const unitId = formData.get("unit_id") ? Number(formData.get("unit_id")) : null;
  if (unitId !== null) {
    const unit = faltIOrg<{ id: number }>(
      "SELECT id FROM units WHERE id = ? AND org_id = ?", unitId, a.org_id);
    if (!unit) throw new Error("Verksamheten tillhör inte din organisation.");
  }

  run(
    `INSERT INTO actions (org_id, titel, beskrivning, kalla, kalla_ref, ansvarig, unit_id,
       prioritet, status, forfallodatum, skapad)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ej_paborjad', ?, ?)`,
    a.org_id,
    titel,
    String(formData.get("beskrivning") ?? ""),
    String(formData.get("kalla") ?? "annan"),
    String(formData.get("kalla_ref") ?? ""),
    String(formData.get("ansvarig") ?? ""),
    unitId,
    String(formData.get("prioritet") ?? "normal"),
    String(formData.get("forfallodatum") ?? "") || null,
    idag(),
  );
  logga(a.org_id, a.namn, "Skapade åtgärd", titel);
  uppdateraAllt();
}

/* ------------------------------------------------------------------- lagkrav */

export async function satKravStatus(id: number, status: string) {
  const a = await kravSkriv("efterlevnad");
  if (!["uppfylld", "pagaende", "brist", "ej_paborjad"].includes(status)) return;

  const rad = faltIOrg<{ kod: string }>(
    "SELECT kod FROM requirements WHERE id = ? AND org_id = ?", id, a.org_id);
  skrivEn(
    "Kunde inte ändra kravet",
    `UPDATE requirements
     SET status = ?, senast_genomfort = CASE WHEN ? = 'uppfylld' THEN ? ELSE senast_genomfort END
     WHERE id = ? AND org_id = ?`,
    status, status, idag(), id, a.org_id,
  );
  logga(a.org_id, a.namn, `Satte kravstatus till ${status}`, rad?.kod ?? String(id));
  uppdateraAllt();
}

/* ------------------------------------------------------------- krigsplacering */

export async function satPlaceringsStatus(id: number, status: string) {
  const a = await kravSkriv("krigsplacering");
  if (!["foreslagen", "beslutad", "underrattad", "avslutad"].includes(status)) return;

  const rad = faltIOrg<{ person: string; titel: string }>(
    `SELECT COALESCE(pe.namn, 'vakant') AS person, p.titel
     FROM placements pl JOIN positions p ON p.id = pl.position_id
     LEFT JOIN people pe ON pe.id = pl.person_id
     WHERE pl.id = ? AND pl.org_id = ?`,
    id, a.org_id,
  );
  skrivEn(
    "Kunde inte ändra krigsplaceringen",
    `UPDATE placements
     SET status = ?,
         beslutsdatum = CASE WHEN ? IN ('beslutad','underrattad')
                             THEN COALESCE(beslutsdatum, ?) ELSE NULL END,
         beslut_av = CASE WHEN ? IN ('beslutad','underrattad')
                          THEN 'Kommundirektör, delegationsbeslut' ELSE '' END,
         underrattad = CASE WHEN ? = 'underrattad' THEN 1 ELSE 0 END
     WHERE id = ? AND org_id = ?`,
    status, status, idag(), status, status, id, a.org_id,
  );
  logga(
    a.org_id, a.namn,
    `Ändrade krigsplacering till ${status}`,
    rad ? `${rad.person} – ${rad.titel}` : String(id),
  );
  uppdateraAllt();
}

/** Beslutar samtliga föreslagna placeringar som saknar öppen avvikelse. */
export async function beslutaAllaUtanKonflikt() {
  const a = await kravSkriv("krigsplacering");
  const antal = one<{ v: number }>(
    `SELECT COUNT(*) AS v FROM placements pl
     JOIN people pe ON pe.id = pl.person_id
     JOIN positions p ON p.id = pl.position_id
     WHERE pl.org_id = ? AND pl.status = 'foreslagen'
       AND pe.fm_krigsplacerad = 0 AND pe.annan_plikt = ''
       AND (p.sakerhetsklass = 'ingen' OR pe.registerkontroll = 'klar')`,
    a.org_id,
  )?.v ?? 0;

  run(
    `UPDATE placements SET status = 'beslutad', beslutsdatum = ?,
       beslut_av = 'Kommundirektör, delegationsbeslut'
     WHERE org_id = ? AND status = 'foreslagen' AND id IN (
       SELECT pl.id FROM placements pl
       JOIN positions p ON p.id = pl.position_id
       JOIN people pe ON pe.id = pl.person_id
       WHERE pl.org_id = ?
         AND pe.fm_krigsplacerad = 0 AND pe.annan_plikt = ''
         AND (p.sakerhetsklass = 'ingen' OR pe.registerkontroll = 'klar')
     )`,
    idag(), a.org_id, a.org_id,
  );
  logga(a.org_id, a.namn, `Beslutade ${antal} krigsplaceringar utan avvikelse`, "Massbeslut");
  uppdateraAllt();
}

/* ------------------------------------------------------------------ resurser */

export async function satResursStatus(id: number, status: string) {
  const a = await kravSkriv("resurser");
  if (!["driftklar", "service", "ur_drift", "okand"].includes(status)) return;

  const rad = faltIOrg<{ benamning: string }>(
    "SELECT benamning FROM resources WHERE id = ? AND org_id = ?", id, a.org_id);
  skrivEn(
    "Kunde inte ändra resursen",
    "UPDATE resources SET status = ? WHERE id = ? AND org_id = ?",
    status, id, a.org_id,
  );
  logga(a.org_id, a.namn, `Satte resursstatus till ${status}`, rad?.benamning ?? String(id));
  uppdateraAllt();
}

/** Registrerar genomförd kontroll och sätter nästa kontroll om 90 dagar. */
export async function registreraKontroll(id: number) {
  const a = await kravSkriv("resurser");
  const rad = faltIOrg<{ benamning: string }>(
    "SELECT benamning FROM resources WHERE id = ? AND org_id = ?", id, a.org_id);
  skrivEn(
    "Kunde inte registrera kontrollen",
    `UPDATE resources
     SET sista_kontroll = ?, nasta_kontroll = date(?, '+90 days'),
         status = CASE WHEN status = 'okand' THEN 'driftklar' ELSE status END
     WHERE id = ? AND org_id = ?`,
    idag(), idag(), id, a.org_id,
  );
  logga(a.org_id, a.namn, "Registrerade genomförd kontroll", rad?.benamning ?? String(id));
  uppdateraAllt();
}

/* ----------------------------------------------------------------------- RSA */

export async function satRiskBedomning(id: number, sannolikhet: number, konsekvens: number) {
  const a = await kravSkriv("rsa");
  if (![1, 2, 3, 4, 5].includes(sannolikhet) || ![1, 2, 3, 4, 5].includes(konsekvens)) return;

  const rad = faltIOrg<{ namn: string }>(
    "SELECT namn FROM risks WHERE id = ? AND org_id = ?", id, a.org_id);
  skrivEn(
    "Kunde inte ändra bedömningen",
    "UPDATE risks SET sannolikhet = ?, konsekvens = ?, senast_bedomd = ? WHERE id = ? AND org_id = ?",
    sannolikhet, konsekvens, idag(), id, a.org_id,
  );
  logga(a.org_id, a.namn, `Ombedömde risk till S${sannolikhet}/K${konsekvens}`, rad?.namn ?? String(id));
  uppdateraAllt();
}

/* --------------------------------------------------------------- kontinuitet */

export async function satPlanStatus(id: number, status: string) {
  const a = await kravSkriv("kontinuitet");
  if (!["saknas", "utkast", "faststalld", "utgangen"].includes(status)) return;

  const rad = faltIOrg<{ namn: string }>(
    "SELECT namn FROM critical_functions WHERE id = ? AND org_id = ?", id, a.org_id);
  skrivEn(
    "Kunde inte ändra kontinuitetsplanen",
    `UPDATE critical_functions
     SET plan_status = ?, plan_datum = CASE WHEN ? = 'faststalld' THEN ? ELSE plan_datum END
     WHERE id = ? AND org_id = ?`,
    status, status, idag(), id, a.org_id,
  );
  logga(a.org_id, a.namn, `Satte kontinuitetsplan till ${status}`, rad?.namn ?? String(id));
  uppdateraAllt();
}

/* ------------------------------------------------------------------ övningar */

export async function sparaErfarenhet(formData: FormData) {
  const a = await kravSkriv("ovningar");
  const id = Number(formData.get("id"));
  const text = String(formData.get("erfarenheter") ?? "");

  const rad = faltIOrg<{ namn: string }>(
    "SELECT namn FROM exercises WHERE id = ? AND org_id = ?", id, a.org_id);
  skrivEn(
    "Kunde inte spara erfarenheterna",
    "UPDATE exercises SET erfarenheter = ?, status = 'utvarderad' WHERE id = ? AND org_id = ?",
    text, id, a.org_id,
  );
  logga(a.org_id, a.namn, "Dokumenterade erfarenheter från övning", rad?.namn ?? String(id));
  uppdateraAllt();
}

/* --------------------------------------------------------- beredskapsläge */

export async function satBeredskapsniva(niva: string) {
  const a = await kravSkriv("oversikt");
  if (!["fredstida", "beredskapslarm", "hojd_beredskap"].includes(niva)) return;

  skrivEn(
    "Kunde inte ändra beredskapsläget",
    "UPDATE organisations SET beredskapsniva = ?, uppdaterad = ? WHERE id = ?",
    niva, idag(), a.org_id,
  );
  logga(a.org_id, a.namn, "Ändrade beredskapsläge", niva);
  uppdateraAllt();
}

/** Variant med (id, värde) för att kunna användas av Växlare-komponenten. */
export async function satBeredskapsnivaVia(_id: number, niva: string) {
  await satBeredskapsniva(niva);
}
