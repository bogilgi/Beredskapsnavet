"use server";

import { revalidatePath } from "next/cache";
import { logga, one, run } from "@/lib/db";
import { aterkallaSessionerIOrg, kravLeverantor, kravSkriv, type Anvandare } from "@/lib/session";
import { svara, type FormSvar } from "@/lib/formsvar";
import { ROLLER, type Roll } from "@/lib/behorighet";
import { idag } from "@/lib/format";

/**
 * Administrationen gäller medlemskapet i den aktiva organisationen, inte
 * användarkontot som sådant. En administratör i en kommun ska varken kunna se
 * eller ändra en persons behörighet i en annan kommun.
 */
function medlem(userId: number, orgId: number) {
  return one<{ namn: string; roll: string }>(
    `SELECT u.namn, uo.roll FROM user_orgs uo JOIN users u ON u.id = uo.user_id
     WHERE uo.user_id = ? AND uo.org_id = ?`,
    userId,
    orgId,
  );
}

export async function satRoll(userId: number, roll: string) {
  const a = await kravSkriv("anvandare");
  if (!ROLLER.includes(roll as Roll)) throw new Error("Okänd roll: " + roll);

  const rad = medlem(userId, a.org_id);
  if (!rad) throw new Error("Användaren är inte medlem i din organisation.");

  run("UPDATE user_orgs SET roll = ? WHERE user_id = ? AND org_id = ?", roll, userId, a.org_id);
  // Rollen läses vid varje begäran, men sessionen återkallas ändå så att en
  // sänkt behörighet aldrig hinner användas i en pågående vy.
  aterkallaSessionerIOrg(userId, a.org_id);
  logga(a.org_id, a.namn, `Ändrade roll till ${roll}`, rad.namn);
  revalidatePath("/anvandare");
}

export async function taBortMedlemskap(userId: number) {
  const a = await kravSkriv("anvandare");
  if (a.id === userId) throw new Error("Du kan inte ta bort din egen behörighet.");

  const rad = medlem(userId, a.org_id);
  if (!rad) return;

  run("DELETE FROM user_orgs WHERE user_id = ? AND org_id = ?", userId, a.org_id);
  aterkallaSessionerIOrg(userId, a.org_id);
  logga(a.org_id, a.namn, "Tog bort behörighet till organisationen", rad.namn);
  revalidatePath("/anvandare");
}

export async function tvingaUtloggning(userId: number) {
  const a = await kravSkriv("anvandare");
  const rad = medlem(userId, a.org_id);
  if (!rad) throw new Error("Användaren är inte medlem i din organisation.");

  aterkallaSessionerIOrg(userId, a.org_id);
  logga(a.org_id, a.namn, "Återkallade sessioner i organisationen", rad.namn);
  revalidatePath("/anvandare");
}

/* --------------------------------------------------- anslut ny organisation */

/**
 * Lägger upp en kommun eller region ur det nationella registret som kund.
 *
 * Uppgifterna om vem organisationen är hämtas ur registret och skrivs inte in
 * för hand: namn, län, huvudmannatyp och tillsynsmyndighet är fakta om landet,
 * inte något en säljare ska kunna skriva fel. Det som matas in är kontaktvägar.
 *
 * Kravlistan skapas ur den delade katalogen efter huvudmannatyp. Gotland är
 * både kommun och region och får därför båda uppsättningarna.
 */
async function laggUppOrganisationInre(a: Anvandare, formData: FormData): Promise<string> {

  const registryId = Number(formData.get("registry_id"));
  const reg = one<{
    id: number; kod: string; namn: string; kortnamn: string; typ: string;
    lan: string; tillsyn_cyber: string;
  }>("SELECT * FROM org_registry WHERE id = ?", registryId);
  if (!reg) throw new Error("Organisationen finns inte i registret.");

  if (one<{ id: number }>("SELECT id FROM organisations WHERE registry_id = ?", registryId)) {
    throw new Error(`${reg.namn} är redan upplagd.`);
  }

  const text = (falt: string, fallback = "") =>
    String(formData.get(falt) ?? "").trim() || fallback;

  const samordnare = text("samordnare");
  if (!samordnare) throw new Error("Beredskapssamordnare måste anges.");
  const epost = text("samordnare_epost");
  if (!epost.includes("@")) throw new Error("Ange en giltig e-postadress till samordnaren.");

  const invanareRa = text("invanare");
  // Lämnas fältet tomt står det kvar som okänt. Antalet invånare styr ingen
  // bedömning i systemet, så en gissning gör mer skada än ett tomt fält.
  const invanare = invanareRa ? Number(invanareRa.replace(/\s/g, "")) : null;
  if (invanare !== null && (!Number.isInteger(invanare) || invanare <= 0)) {
    throw new Error("Antal invånare måste vara ett positivt heltal, eller lämnas tomt.");
  }

  const orgId = Number(
    run(
      `INSERT INTO organisations
         (kortnamn, namn, registry_id, typ, lan, invanare, mandatperiod, beredskapsniva,
          samordnare, samordnare_epost, tib_telefon, uppdaterad, ansluten, tillsyn_cyber, aktiv)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'fredstida', ?, ?, ?, ?, ?, ?, 1)`,
      reg.kortnamn, reg.namn, reg.id, reg.typ, reg.lan, invanare,
      text("mandatperiod", "2027-2030"),
      samordnare, epost, text("tib_telefon"), idag(), idag(), reg.tillsyn_cyber,
    ).lastInsertRowid,
  );

  // Kravlistan ur den delade katalogen, filtrerad på huvudmannatyp.
  run(
    `INSERT INTO requirement_status
       (org_id, krav_id, status, nasta_forfallo, ansvarig, evidens)
     SELECT ?, id, 'ej_paborjad', standard_forfallo, ?, 'Underlag saknas'
     FROM requirement_catalog
     WHERE galler_for = 'bada'
        OR galler_for = ?
        OR (? = 'kommun_region' AND galler_for IN ('kommun', 'region'))`,
    orgId, samordnare, reg.typ, reg.typ,
  );

  // Den som lägger upp organisationen får administratörsbehörighet i den, så
  // att införandet kan fortsätta utan ett andra verktyg.
  run(
    "INSERT INTO user_orgs (user_id, org_id, roll, unit_id) VALUES (?, ?, 'administrator', NULL)",
    a.id, orgId,
  );

  const antal = one<{ v: number }>(
    "SELECT COUNT(*) AS v FROM requirement_status WHERE org_id = ?", orgId,
  )?.v ?? 0;

  logga(orgId, a.namn, "Anslöt organisationen", `${reg.namn} (${reg.kod}), ${antal} krav`);
  logga(a.org_id, a.namn, "Anslöt ny organisation", reg.namn);
  revalidatePath("/organisationer");
  revalidatePath("/anvandare");
  return (
    `${reg.namn} är ansluten med ${antal} krav ur katalogen. ` +
    `Du har administratörsbehörighet i organisationen och kan byta till den i topbaren.`
  );
}

/* ------------------------------------------------------------------ omslag */
// Spärren körs utanför felhanteringen, eftersom den omdirigerar genom att
// kasta. Valideringsfel besvaras med text i formuläret.
export async function laggUppOrganisation(formData: FormData): Promise<FormSvar> {
  const a = await kravLeverantor("organisationer");
  return svara(() => laggUppOrganisationInre(a, formData));
}
