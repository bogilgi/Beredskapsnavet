"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { logga, one, run } from "@/lib/db";
import { kravSkriv } from "@/lib/session";
import { hashaLosenord, verifieraLosenord, type Anvandare } from "@/lib/session";
import { ROLLER, type Roll } from "@/lib/behorighet";
import { svara, type FormSvar } from "@/lib/formsvar";
import { hamtaInbjudanRad } from "@/lib/inbjudan";

/**
 * Inbjudan av användare till en organisation.
 *
 * Tillfällig lösning i väntan på federerad inloggning. När inloggningen går mot
 * kommunens katalogtjänst blir det här en fråga om att koppla en grupp, inte om
 * att skapa konton. Koden är skriven med det i åtanke och gör inget mer än den
 * måste.
 *
 * Inbjudan hanteras av organisationens egen administratör och gäller bara den
 * organisationen, till skillnad från att ansluta en ny organisation som kräver
 * leverantörsbehörighet.
 */

const GILTIG_I_DYGN = 7;
const MINSTA_LOSENORD = 12;

function nu() {
  return new Date().toISOString().slice(0, 19);
}

function omDygn(dygn: number) {
  return new Date(Date.now() + dygn * 86_400_000).toISOString().slice(0, 19);
}

function text(formData: FormData, falt: string) {
  return String(formData.get(falt) ?? "").trim();
}

async function bjudInInre(a: Anvandare, formData: FormData): Promise<string> {
  const epost = text(formData, "epost").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(epost)) {
    throw new Error("Ange en giltig e-postadress.");
  }

  const roll = text(formData, "roll");
  if (!ROLLER.includes(roll as Roll)) throw new Error("Okänd roll: " + roll);

  const unitRa = text(formData, "unit_id");
  const unitId = unitRa ? Number(unitRa) : null;
  if (unitId !== null) {
    // Verksamheten måste tillhöra den egna organisationen. Ett id från en
    // annan kommun får inte gå igenom.
    const enhet = one<{ id: number }>(
      "SELECT id FROM units WHERE id = ? AND org_id = ?", unitId, a.org_id,
    );
    if (!enhet) throw new Error("Verksamheten finns inte i din organisation.");
  }

  const redanMedlem = one<{ id: number }>(
    `SELECT u.id FROM users u JOIN user_orgs uo ON uo.user_id = u.id
     WHERE u.epost = ? AND uo.org_id = ?`,
    epost, a.org_id,
  );
  if (redanMedlem) throw new Error(`${epost} har redan behörighet till organisationen.`);

  const oppen = one<{ id: number }>(
    "SELECT id FROM invitations WHERE org_id = ? AND epost = ? AND accepterad IS NULL",
    a.org_id, epost,
  );
  if (oppen) {
    throw new Error(
      `${epost} har redan en obesvarad inbjudan. Återkalla den först om du vill ändra rollen.`,
    );
  }

  // Koden visas en gång och lagras aldrig i klartext.
  const token = randomBytes(24).toString("base64url");
  const { salt, hash } = hashaLosenord(token);

  const id = Number(
    run(
      `INSERT INTO invitations
         (org_id, epost, roll, unit_id, token_hash, token_salt, skapad, gar_ut, inbjuden_av)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      a.org_id, epost, roll, unitId, hash, salt, nu(), omDygn(GILTIG_I_DYGN), a.namn,
    ).lastInsertRowid,
  );

  logga(a.org_id, a.namn, `Bjöd in användare som ${roll}`, epost);
  revalidatePath("/anvandare");

  // Det finns ingen e-postutskick i installationen, och ska inte finnas:
  // en kommun kör systemet i eget nät. Länken lämnas därför till den som
  // bjuder in, att förmedla på det sätt kommunen själv valt.
  return (
    `Inbjudan skapad. Ge den här länken till ${epost}, den visas bara nu och ` +
    `gäller i ${GILTIG_I_DYGN} dygn:  /inbjudan?i=${id}&t=${token}`
  );
}

export async function bjudInAnvandare(formData: FormData): Promise<FormSvar> {
  const a = await kravSkriv("anvandare");
  return svara(() => bjudInInre(a, formData));
}

export async function aterkallaInbjudan(id: number) {
  const a = await kravSkriv("anvandare");
  const rad = one<{ epost: string }>(
    "SELECT epost FROM invitations WHERE id = ? AND org_id = ? AND accepterad IS NULL",
    id, a.org_id,
  );
  if (!rad) throw new Error("Inbjudan finns inte i din organisation.");

  run("DELETE FROM invitations WHERE id = ? AND org_id = ?", id, a.org_id);
  logga(a.org_id, a.namn, "Återkallade inbjudan", rad.epost);
  revalidatePath("/anvandare");
}

/* ------------------------------------------------------- acceptera inbjudan */

async function accepteraInre(formData: FormData): Promise<never> {
  const id = Number(formData.get("i"));
  const token = String(formData.get("t") ?? "");

  const rad = hamtaInbjudanRad(id);
  // Ett och samma svar för saknad, besvarad, utgången och felaktig kod.
  const ogiltig = new Error("Inbjudan är ogiltig, besvarad eller har gått ut.");
  if (!rad || rad.accepterad !== null || rad.gar_ut < nu()) throw ogiltig;
  if (!verifieraLosenord(token, rad.token_salt, rad.token_hash)) throw ogiltig;

  const befintlig = one<{ id: number; namn: string }>(
    "SELECT id, namn FROM users WHERE epost = ?", rad.epost,
  );

  let userId: number;
  if (befintlig) {
    // Kontot finns redan, till exempel för att personen arbetar i en annan
    // kommun. Då tillkommer bara medlemskapet; lösenordet rörs inte.
    userId = befintlig.id;
  } else {
    const namn = String(formData.get("namn") ?? "").trim();
    if (namn.length < 2) throw new Error("Ange ditt namn.");

    const losenord = String(formData.get("losenord") ?? "");
    if (losenord.length < MINSTA_LOSENORD) {
      throw new Error(`Lösenordet måste vara minst ${MINSTA_LOSENORD} tecken.`);
    }
    if (losenord !== String(formData.get("losenord_igen") ?? "")) {
      throw new Error("Lösenorden stämmer inte överens.");
    }

    const { salt, hash } = hashaLosenord(losenord);
    userId = Number(
      run(
        `INSERT INTO users (namn, epost, losenord_hash, losenord_salt, aktiv, leverantor, skapad)
         VALUES (?, ?, ?, ?, 1, 0, ?)`,
        namn, rad.epost, hash, salt, nu(),
      ).lastInsertRowid,
    );
  }

  run(
    "INSERT OR IGNORE INTO user_orgs (user_id, org_id, roll, unit_id) VALUES (?, ?, ?, ?)",
    userId, rad.org_id, rad.roll, rad.unit_id,
  );
  run("UPDATE invitations SET accepterad = ? WHERE id = ?", nu(), rad.id);

  logga(
    rad.org_id, rad.epost,
    befintlig ? "Accepterade inbjudan, befintligt konto" : "Accepterade inbjudan, nytt konto",
    `Roll: ${rad.roll}`,
  );
  revalidatePath("/anvandare");

  // Länken är förbrukad i och med det här, så sidan skulle vid en omritning
  // visa "inbjudan går inte att öppna" — vilket vore fel besked till någon som
  // just lyckats. Skicka till inloggningen med en bekräftelse i stället.
  redirect(`/logga-in?valkommen=${encodeURIComponent(rad.org_namn)}`);
}

export async function accepteraInbjudan(formData: FormData): Promise<FormSvar> {
  // Ingen inloggningsspärr: den som har koden är den inbjudna.
  return svara(() => accepteraInre(formData));
}
