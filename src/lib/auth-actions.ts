"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { logga, one } from "@/lib/db";
import {
  avslutaSession, bytOrganisationPaSession, hamtaAnvandare, hamtaMedlemskap,
  skapaSession, verifieraLosenord,
} from "@/lib/session";
import { startsida } from "@/lib/behorighet";

type Rad = {
  id: number;
  namn: string;
  aktiv: number;
  losenord_hash: string;
  losenord_salt: string;
};

/*
 * Salt för en hashning som aldrig kan stämma. Finns bara för att en okänd
 * adress ska kosta lika mycket arbete som en känd: scrypt tar tiotals
 * millisekunder, och hoppades det över när adressen saknas skulle
 * svarstiden avslöja precis det som feltexten döljer.
 */
const BLINDSALT = randomBytes(16).toString("hex");

export async function loggaIn(_tidigare: string | null, formData: FormData): Promise<string | null> {
  const epost = String(formData.get("epost") ?? "").trim().toLowerCase();
  const losenord = String(formData.get("losenord") ?? "");
  if (!epost || !losenord) return "Fyll i både e-postadress och lösenord.";

  const rad = one<Rad>(
    "SELECT id, namn, aktiv, losenord_hash, losenord_salt FROM users WHERE epost = ?",
    epost,
  );

  // Samma svar oavsett om kontot saknas eller lösenordet är fel, så att
  // inloggningssidan inte avslöjar vilka adresser som finns. Hashningen görs
  // alltid, även när adressen är okänd, så att inte heller svarstiden gör det.
  const stammer = verifieraLosenord(
    losenord,
    rad ? rad.losenord_salt : BLINDSALT,
    rad ? rad.losenord_hash : "",
  );
  if (!rad || !stammer) {
    logga(null, epost || "okänd", "Misslyckad inloggning", "");
    return "Fel e-postadress eller lösenord.";
  }
  if (rad.aktiv !== 1) {
    logga(null, rad.namn, "Inloggningsförsök på avaktiverat konto", "");
    return "Kontot är avaktiverat. Kontakta systemadministratören.";
  }

  const medlemskap = hamtaMedlemskap(rad.id);
  if (medlemskap.length === 0) {
    logga(null, rad.namn, "Inloggning utan medlemskap i någon organisation", "");
    return "Kontot saknar behörighet till någon organisation. Kontakta systemadministratören.";
  }

  // Den som har flera organisationer börjar i den första och byter i topbaren.
  const forsta = medlemskap[0];
  await skapaSession(rad.id, forsta.org_id);
  logga(forsta.org_id, rad.namn, "Loggade in", `${forsta.namn} som ${forsta.roll}`);
  redirect(startsida(forsta.roll));
}

export async function bytOrganisation(orgId: number) {
  const anvandare = await hamtaAnvandare();
  if (!anvandare) redirect("/logga-in");

  const ok = await bytOrganisationPaSession(orgId);
  if (!ok) {
    logga(anvandare.org_id, anvandare.namn, "Nekat organisationsbyte", String(orgId));
    throw new Error("Du har inte behörighet till den organisationen.");
  }

  const ny = hamtaMedlemskap(anvandare.id).find((m) => m.org_id === orgId);
  logga(orgId, anvandare.namn, "Bytte organisation", ny ? ny.namn : String(orgId));
  revalidatePath("/", "layout");
  redirect(ny ? startsida(ny.roll) : "/");
}

export async function loggaUt() {
  const anvandare = await hamtaAnvandare();
  if (anvandare) logga(anvandare.org_id, anvandare.namn, "Loggade ut", "");
  await avslutaSession();
  redirect("/logga-in");
}
