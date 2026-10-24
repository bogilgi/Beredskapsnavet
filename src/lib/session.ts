import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { all, logga, one, run } from "@/lib/db";
import { farLasa, farSkriva, type Modul } from "@/lib/behorighet";

export const SESSIONSKAKA = "beredskapsnavet_session";
const SESSIONSTID_TIMMAR = 8;

/**
 * Den inloggade användaren i en bestämd organisation. Rollen kommer från
 * medlemskapet och kan skilja sig mellan organisationer, så org_id och roll
 * hör ihop och ska alltid läsas tillsammans.
 */
export type Anvandare = {
  id: number;
  namn: string;
  epost: string;
  org_id: number;
  org_namn: string;
  org_kortnamn: string;
  roll: string;
  unit_id: number | null;
  antal_organisationer: number;
  /** 1 för driftpersonal hos leverantören. Styr åtkomst utanför organisationen. */
  leverantor: number;
};

export type Medlemskap = {
  org_id: number;
  kortnamn: string;
  namn: string;
  lan: string;
  invanare: number | null;
  roll: string;
};

/* ------------------------------------------------------------------ lösenord */

export function hashaLosenord(losenord: string, salt = randomBytes(16).toString("hex")) {
  return { salt, hash: scryptSync(losenord, salt, 64).toString("hex") };
}

export function verifieraLosenord(losenord: string, salt: string, hash: string): boolean {
  const test = scryptSync(losenord, salt, 64);
  const referens = Buffer.from(hash, "hex");
  // Jämförelsen ska ta lika lång tid oavsett var strängarna skiljer sig.
  return test.length === referens.length && timingSafeEqual(test, referens);
}

/* ------------------------------------------------------------------- session */

function nu(): string {
  return new Date().toISOString().slice(0, 19);
}

function omTimmar(timmar: number): string {
  return new Date(Date.now() + timmar * 3600_000).toISOString().slice(0, 19);
}

/** Organisationer användaren är medlem i, med sin roll i var och en. */
export function hamtaMedlemskap(userId: number): Medlemskap[] {
  return all<Medlemskap>(
    `SELECT o.id AS org_id, o.kortnamn, o.namn, o.lan, o.invanare, uo.roll
     FROM user_orgs uo JOIN organisations o ON o.id = uo.org_id
     WHERE uo.user_id = ? AND o.aktiv = 1
     ORDER BY o.namn`,
    userId,
  );
}

/** Skapar en session i en organisation. Får bara anropas från en serveråtgärd. */
export async function skapaSession(userId: number, orgId: number) {
  const medlem = one<{ roll: string }>(
    "SELECT roll FROM user_orgs WHERE user_id = ? AND org_id = ?",
    userId,
    orgId,
  );
  if (!medlem) throw new Error("Användaren är inte medlem i organisationen.");

  const id = randomBytes(32).toString("hex");
  run(
    "INSERT INTO sessions (id, user_id, org_id, skapad, gar_ut, senast_aktiv) VALUES (?, ?, ?, ?, ?, ?)",
    id,
    userId,
    orgId,
    nu(),
    omTimmar(SESSIONSTID_TIMMAR),
    nu(),
  );
  run("UPDATE users SET senaste_inloggning = ? WHERE id = ?", nu(), userId);
  const kakor = await cookies();
  kakor.set(SESSIONSKAKA, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSIONSTID_TIMMAR * 3600,
  });
}

/** Byter aktiv organisation på den pågående sessionen. Kräver medlemskap. */
export async function bytOrganisationPaSession(orgId: number): Promise<boolean> {
  const kakor = await cookies();
  const id = kakor.get(SESSIONSKAKA)?.value;
  if (!id) return false;

  const session = one<{ user_id: number }>("SELECT user_id FROM sessions WHERE id = ?", id);
  if (!session) return false;

  const medlem = one<{ roll: string }>(
    "SELECT roll FROM user_orgs WHERE user_id = ? AND org_id = ?",
    session.user_id,
    orgId,
  );
  if (!medlem) return false;

  run("UPDATE sessions SET org_id = ?, senast_aktiv = ? WHERE id = ?", orgId, nu(), id);
  return true;
}

export async function avslutaSession() {
  const kakor = await cookies();
  const id = kakor.get(SESSIONSKAKA)?.value;
  if (id) run("DELETE FROM sessions WHERE id = ?", id);
  kakor.delete(SESSIONSKAKA);
}

/** Återkallar samtliga sessioner för en användare. */
export function aterkallaSessioner(userId: number) {
  run("DELETE FROM sessions WHERE user_id = ?", userId);
}

/** Återkallar en användares sessioner i en viss organisation. */
export function aterkallaSessionerIOrg(userId: number, orgId: number) {
  run("DELETE FROM sessions WHERE user_id = ? AND org_id = ?", userId, orgId);
}

/**
 * Hämtar inloggad användare med aktiv organisation och rollen där, eller null.
 * Saknas medlemskapet avslutas sessionen, så att en borttagen behörighet får
 * omedelbart genomslag.
 */
export async function hamtaAnvandare(): Promise<Anvandare | null> {
  const id = (await cookies()).get(SESSIONSKAKA)?.value;
  if (!id) return null;

  const rad = one<Anvandare & { gar_ut: string; senast_aktiv: string; aktiv: number }>(
    `SELECT u.id, u.namn, u.epost, u.aktiv, u.leverantor,
            s.org_id, s.gar_ut, s.senast_aktiv,
            o.namn AS org_namn, o.kortnamn AS org_kortnamn,
            uo.roll, uo.unit_id,
            (SELECT COUNT(*) FROM user_orgs x JOIN organisations oo ON oo.id = x.org_id
              WHERE x.user_id = u.id AND oo.aktiv = 1) AS antal_organisationer
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     JOIN organisations o ON o.id = s.org_id
     JOIN user_orgs uo ON uo.user_id = u.id AND uo.org_id = s.org_id
     WHERE s.id = ? AND o.aktiv = 1`,
    id,
  );

  if (!rad || rad.gar_ut < nu() || rad.aktiv !== 1) {
    run("DELETE FROM sessions WHERE id = ?", id);
    return null;
  }

  const femMinuterSedan = new Date(Date.now() - 300_000).toISOString().slice(0, 19);
  if (rad.senast_aktiv < femMinuterSedan) {
    run(
      "UPDATE sessions SET senast_aktiv = ?, gar_ut = ? WHERE id = ?",
      nu(),
      omTimmar(SESSIONSTID_TIMMAR),
      id,
    );
  }

  const { gar_ut: _g, senast_aktiv: _s, aktiv: _a, ...anvandare } = rad;
  return anvandare;
}

/* -------------------------------------------------------------------- spärrar */

export async function kravInloggad(): Promise<Anvandare> {
  const anvandare = await hamtaAnvandare();
  if (!anvandare) redirect("/logga-in");
  return anvandare;
}

/** Spärr för sidvisning i den aktiva organisationen. */
export async function kravLas(modul: Modul): Promise<Anvandare> {
  const anvandare = await kravInloggad();
  if (!farLasa(anvandare.roll, modul)) {
    logga(anvandare.org_id, anvandare.namn, "Nekad åtkomst till modul", modul);
    redirect(`/ingen-behorighet?modul=${modul}`);
  }
  return anvandare;
}

/**
 * Spärr för skrivning. Anropas först i varje serveråtgärd. Returnerad användare
 * bär org_id, som varje skrivning ska filtrera på.
 */
/**
 * Spärr för åtgärder som sträcker sig utanför den egna organisationen, som att
 * lägga upp en ny kund.
 *
 * Rollen räcker inte. En administratör i en kommun är administratör där, inte
 * i installationen som helhet, och ska varken kunna lägga upp nya
 * organisationer eller se vilka andra kommuner som är kunder. Därför krävs
 * både skrivbehörighet i modulen och leverantörsflaggan på kontot.
 */
export async function kravLeverantor(modul: Modul): Promise<Anvandare> {
  const anvandare = await kravInloggad();
  if (!farSkriva(anvandare.roll, modul) || anvandare.leverantor !== 1) {
    logga(anvandare.org_id, anvandare.namn, "Nekad leverantörsåtgärd", modul);
    redirect(`/ingen-behorighet?modul=${modul}`);
  }
  return anvandare;
}

export async function kravSkriv(modul: Modul): Promise<Anvandare> {
  const anvandare = await kravInloggad();
  if (!farSkriva(anvandare.roll, modul)) {
    logga(anvandare.org_id, anvandare.namn, "Nekad skrivning i modul", modul);
    throw new Error(
      `Behörighet saknas: rollen ${anvandare.roll} får inte ändra i modulen ${modul}.`,
    );
  }
  return anvandare;
}
