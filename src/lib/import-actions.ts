"use server";

import { revalidatePath } from "next/cache";
import { all, logga, one, run } from "@/lib/db";
import { kravSkriv, type Anvandare } from "@/lib/session";
import { lasPersonalfil, type Rad } from "@/lib/personalimport";
import { svara, type FormSvar } from "@/lib/formsvar";

/**
 * Import av personal från kommunens HR-system.
 *
 * Importen körs alltid som torrkörning först. En fil från ett personalsystem
 * innehåller fel — stavade verksamhetsnamn, dubbla anställningsnummer, rader
 * utan nyckel — och den som importerar ska se vad som kommer att hända innan
 * det händer, inte efteråt.
 *
 * Importen rör aldrig krigsplaceringar. Den uppdaterar personuppgifter och
 * anställning; vem som är placerad på vilken befattning är ett beslut som
 * fattas i systemet och ska inte kunna ändras av en fil.
 */

const ANSTALLNINGSFORMER = ["tillsvidare", "visstid", "timavlonad", "uppdrag"];

type Bedomning = {
  rapport: string[];
  nya: Rad[];
  andrade: { rad: Rad; id: number; skillnader: string[] }[];
  ororda: number;
  fel: string[];
};

function bedom(orgId: number, innehall: string): Bedomning {
  const { rader, fel } = lasPersonalfil(innehall);
  const rapport: string[] = [];
  const nya: Rad[] = [];
  const andrade: { rad: Rad; id: number; skillnader: string[] }[] = [];
  let ororda = 0;

  const enheter = new Map(
    all<{ id: number; kortnamn: string; namn: string }>(
      "SELECT id, kortnamn, namn FROM units WHERE org_id = ?", orgId,
    ).flatMap((u) => [
      [u.kortnamn.toLowerCase(), u.id] as [string, number],
      [u.namn.toLowerCase(), u.id] as [string, number],
    ]),
  );

  const sedda = new Set<string>();

  for (const rad of rader) {
    const nyckel = (rad.extern_id ?? "").trim();
    if (!nyckel) {
      fel.push(`Rad ${rad.radnummer}: saknar extern_id. Utan nyckel går raden inte att matcha.`);
      continue;
    }
    if (sedda.has(nyckel)) {
      fel.push(`Rad ${rad.radnummer}: extern_id ${nyckel} förekommer flera gånger i filen.`);
      continue;
    }
    sedda.add(nyckel);

    if (!(rad.namn ?? "").trim()) {
      fel.push(`Rad ${rad.radnummer}: saknar namn.`);
      continue;
    }

    const verksamhet = (rad.verksamhet ?? "").trim().toLowerCase();
    const unitId = enheter.get(verksamhet);
    if (!unitId) {
      fel.push(
        `Rad ${rad.radnummer}: verksamheten "${rad.verksamhet}" finns inte i organisationen.`,
      );
      continue;
    }

    const form = (rad.anstallningsform ?? "").trim();
    if (form && !ANSTALLNINGSFORMER.includes(form)) {
      fel.push(
        `Rad ${rad.radnummer}: okänd anställningsform "${form}". ` +
        `Giltiga: ${ANSTALLNINGSFORMER.join(", ")}.`,
      );
      continue;
    }

    const upphorde = (rad.anstallning_upphorde ?? "").trim();
    if (upphorde && !/^\d{4}-\d{2}-\d{2}$/.test(upphorde)) {
      fel.push(`Rad ${rad.radnummer}: anstallning_upphorde ska vara ÅÅÅÅ-MM-DD.`);
      continue;
    }

    const befintlig = one<{
      id: number; namn: string; unit_id: number; befattning_fred: string;
      epost: string; telefon: string; anstallningsform: string;
      anstallning_upphorde: string | null;
    }>(
      `SELECT id, namn, unit_id, befattning_fred, epost, telefon, anstallningsform,
              anstallning_upphorde
       FROM people WHERE org_id = ? AND extern_id = ?`,
      orgId, nyckel,
    );

    if (!befintlig) {
      nya.push({ ...rad, verksamhet: String(unitId) });
      continue;
    }

    const skillnader: string[] = [];
    const jamfor = (falt: string, gammalt: string | null, nytt: string) => {
      if (nytt !== "" && nytt !== (gammalt ?? "")) {
        skillnader.push(`${falt}: "${gammalt ?? ""}" → "${nytt}"`);
      }
    };
    jamfor("namn", befintlig.namn, (rad.namn ?? "").trim());
    jamfor("befattning", befintlig.befattning_fred, (rad.befattning_fred ?? "").trim());
    jamfor("e-post", befintlig.epost, (rad.epost ?? "").trim());
    jamfor("telefon", befintlig.telefon, (rad.telefon ?? "").trim());
    jamfor("anställningsform", befintlig.anstallningsform, form);
    jamfor("anställning upphörde", befintlig.anstallning_upphorde, upphorde);
    if (unitId !== befintlig.unit_id) skillnader.push("verksamhet byts");

    if (skillnader.length === 0) ororda++;
    else andrade.push({ rad: { ...rad, verksamhet: String(unitId) }, id: befintlig.id, skillnader });
  }

  rapport.push(`Lästa rader: ${rader.length}`);
  rapport.push(`Nya personer: ${nya.length}`);
  rapport.push(`Ändrade personer: ${andrade.length}`);
  rapport.push(`Oförändrade: ${ororda}`);
  rapport.push(`Rader med fel: ${fel.length}`);
  for (const a of andrade.slice(0, 15)) {
    rapport.push(`  ändras: ${a.rad.namn} — ${a.skillnader.join("; ")}`);
  }
  if (andrade.length > 15) rapport.push(`  … och ${andrade.length - 15} till`);
  for (const n of nya.slice(0, 15)) rapport.push(`  ny: ${n.namn} (${n.extern_id})`);
  if (nya.length > 15) rapport.push(`  … och ${nya.length - 15} till`);
  for (const f of fel.slice(0, 20)) rapport.push(`  FEL ${f}`);
  if (fel.length > 20) rapport.push(`  … och ${fel.length - 20} fel till`);

  return { rapport, nya, andrade, ororda, fel };
}

async function importeraInre(a: Anvandare, formData: FormData): Promise<FormSvar> {
  const fil = formData.get("fil");
  const inklistrat = String(formData.get("innehall") ?? "").trim();

  let innehall = inklistrat;
  if (fil instanceof File && fil.size > 0) {
    if (fil.size > 5_000_000) throw new Error("Filen är större än 5 MB.");
    innehall = await fil.text();
  }
  if (!innehall) throw new Error("Välj en fil eller klistra in innehållet.");

  const b = bedom(a.org_id, innehall);
  const skarpt = formData.get("skarpt") === "ja";

  if (!skarpt) {
    return {
      klart:
        `Torrkörning. Ingenting har ändrats. ${b.nya.length} nya och ` +
        `${b.andrade.length} ändrade personer skulle skrivas, ${b.fel.length} rader har fel.`,
      rader: b.rapport,
    };
  }

  // Fel stoppar hela importen. En halvt genomförd import av ett personalregister
  // är värre än ingen: den som rättar filen vet inte längre vad som redan gått in.
  if (b.fel.length > 0) {
    return {
      fel:
        `Importen avbröts. ${b.fel.length} rader har fel, och en halvt genomförd ` +
        `import av ett personalregister är värre än ingen. Rätta filen och försök igen.`,
      rader: b.rapport,
    };
  }

  for (const rad of b.nya) {
    run(
      `INSERT INTO people
         (org_id, extern_id, namn, pnr_maskerat, unit_id, befattning_fred, epost, telefon,
          anstallningsform, anstallning_upphorde)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      a.org_id, rad.extern_id, rad.namn, (rad.pnr_maskerat ?? "").trim(),
      Number(rad.verksamhet), (rad.befattning_fred ?? "").trim(),
      (rad.epost ?? "").trim(), (rad.telefon ?? "").trim(),
      (rad.anstallningsform ?? "").trim() || "tillsvidare",
      (rad.anstallning_upphorde ?? "").trim() || null,
    );
  }

  for (const { rad, id } of b.andrade) {
    // Varje fält som är tomt i filen lämnas orört. En HR-export innehåller inte
    // alltid alla kolumner, och ett tomt fält ska inte radera en uppgift som
    // matats in för hand.
    run(
      `UPDATE people SET
         namn = COALESCE(NULLIF(?, ''), namn),
         befattning_fred = COALESCE(NULLIF(?, ''), befattning_fred),
         epost = COALESCE(NULLIF(?, ''), epost),
         telefon = COALESCE(NULLIF(?, ''), telefon),
         anstallningsform = COALESCE(NULLIF(?, ''), anstallningsform),
         anstallning_upphorde = COALESCE(NULLIF(?, ''), anstallning_upphorde),
         unit_id = ?
       WHERE id = ? AND org_id = ?`,
      (rad.namn ?? "").trim(), (rad.befattning_fred ?? "").trim(),
      (rad.epost ?? "").trim(), (rad.telefon ?? "").trim(),
      (rad.anstallningsform ?? "").trim(), (rad.anstallning_upphorde ?? "").trim(),
      Number(rad.verksamhet), id, a.org_id,
    );
  }

  logga(
    a.org_id, a.namn, "Importerade personal från fil",
    `${b.nya.length} nya, ${b.andrade.length} ändrade, ${b.ororda} oförändrade`,
  );
  revalidatePath("/krigsplacering");
  revalidatePath("/krigsorganisation");
  revalidatePath("/personuppgifter");

  return {
    klart:
      `Importen är klar. ${b.nya.length} nya personer, ${b.andrade.length} ändrade, ` +
      `${b.ororda} oförändrade. Krigsplaceringar är orörda.`,
    rader: b.rapport,
  };
}

export async function importeraPersonal(formData: FormData): Promise<FormSvar> {
  const a = await kravSkriv("krigsplacering");
  return svara(() => importeraInre(a, formData));
}
