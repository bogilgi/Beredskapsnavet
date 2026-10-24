"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { logga, one, run } from "@/lib/db";
import { aterkallaSessioner, hashaLosenord, kravSkriv, type Anvandare } from "@/lib/session";
import { hamtaAterstallning } from "@/lib/losenord";
import { verifieraLosenord } from "@/lib/session";
import { svara, type FormSvar } from "@/lib/formsvar";
import { hinderForAterstallning } from "@/lib/aterstallningsregel";

const GILTIG_I_TIMMAR = 24;
const MINSTA_LOSENORD = 12;

function nu() {
  return new Date().toISOString().slice(0, 19);
}

async function begarInre(a: Anvandare, formData: FormData): Promise<string> {
  const userId = Number(formData.get("user_id"));

  // Återställningen gäller en medlem i den egna organisationen. En
  // administratör i en kommun ska inte kunna återställa lösenordet för någon
  // i en annan.
  const medlem = one<{
    namn: string; epost: string; aktiv: number; leverantor: number;
    andra_organisationer: number; utan_losenord: number;
  }>(
    `SELECT u.namn, u.epost, u.aktiv, u.leverantor,
       (SELECT COUNT(*) FROM user_orgs x WHERE x.user_id = u.id AND x.org_id <> uo.org_id)
         AS andra_organisationer,
       CASE WHEN u.losenord_hash = '' THEN 1 ELSE 0 END AS utan_losenord
     FROM user_orgs uo JOIN users u ON u.id = uo.user_id
     WHERE uo.user_id = ? AND uo.org_id = ?`,
    userId, a.org_id,
  );
  if (!medlem) throw new Error("Användaren är inte medlem i din organisation.");
  if (medlem.aktiv !== 1) throw new Error("Kontot är avaktiverat och kan inte återställas.");

  // Medlemskapet ovan visar att kontot finns HÄR. Det visar inte att det bara
  // finns här, och det är skillnaden som avgör vem som får återställa.
  // Regeln, och skälet till den, står i aterstallningsregel.ts.
  const hinder = hinderForAterstallning(a, medlem);
  if (hinder) throw new Error(`${medlem.epost} ${hinder.forklaring}`);

  // Tidigare obesvarade länkar slutar gälla, så att bara den senaste fungerar.
  run("DELETE FROM password_resets WHERE user_id = ? AND anvand IS NULL", userId);

  const token = randomBytes(24).toString("base64url");
  const { salt, hash } = hashaLosenord(token);
  const id = Number(
    run(
      `INSERT INTO password_resets (user_id, token_hash, token_salt, skapad, gar_ut, begard_av)
       VALUES (?, ?, ?, ?, ?, ?)`,
      userId, hash, salt, nu(),
      new Date(Date.now() + GILTIG_I_TIMMAR * 3600_000).toISOString().slice(0, 19),
      a.namn,
    ).lastInsertRowid,
  );

  logga(a.org_id, a.namn, "Begärde lösenordsåterställning", medlem.epost);
  revalidatePath("/anvandare");
  return (
    `Återställningslänk skapad för ${medlem.epost}. Den visas bara nu och gäller i ` +
    `${GILTIG_I_TIMMAR} timmar:  /aterstall?i=${id}&t=${token}`
  );
}

export async function begarAterstallning(formData: FormData): Promise<FormSvar> {
  const a = await kravSkriv("anvandare");
  return svara(() => begarInre(a, formData));
}

async function satNyttInre(formData: FormData): Promise<never> {
  const id = Number(formData.get("i"));
  const token = String(formData.get("t") ?? "");

  const rad = hamtaAterstallning(id);
  const ogiltig = new Error("Länken är ogiltig, använd eller har gått ut.");
  if (!rad || rad.anvand !== null || rad.gar_ut < nu() || rad.aktiv !== 1) throw ogiltig;
  if (!verifieraLosenord(token, rad.token_salt, rad.token_hash)) throw ogiltig;

  const losenord = String(formData.get("losenord") ?? "");
  if (losenord.length < MINSTA_LOSENORD) {
    throw new Error(`Lösenordet måste vara minst ${MINSTA_LOSENORD} tecken.`);
  }
  if (losenord !== String(formData.get("losenord_igen") ?? "")) {
    throw new Error("Lösenorden stämmer inte överens.");
  }

  const { salt, hash } = hashaLosenord(losenord);
  run("UPDATE users SET losenord_hash = ?, losenord_salt = ? WHERE id = ?", hash, salt, rad.user_id);
  run("UPDATE password_resets SET anvand = ? WHERE id = ?", nu(), id);

  // Alla pågående sessioner avslutas. Har någon annan kommit åt kontot ska
  // återställningen kasta ut den, inte låta den sitta kvar.
  aterkallaSessioner(rad.user_id);

  logga(null, rad.epost, "Satte nytt lösenord efter återställning", "");
  // Eget besked: inbjudans "du har nu behörighet" stämmer inte här, det är
  // samma konto som förut med ett nytt lösenord.
  redirect("/logga-in?aterstallt=1");
}

export async function satNyttLosenord(formData: FormData): Promise<FormSvar> {
  // Ingen inloggningsspärr: den som har koden är den som äger kontot.
  return svara(() => satNyttInre(formData));
}
