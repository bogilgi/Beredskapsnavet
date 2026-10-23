"use server";

import { revalidatePath } from "next/cache";
import { logga, one, run } from "@/lib/db";
import { aterkallaSessionerIOrg, kravSkriv } from "@/lib/session";
import { ROLLER, type Roll } from "@/lib/behorighet";

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
