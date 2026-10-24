"use server";

import { revalidatePath } from "next/cache";
import { all, logga, one, run } from "@/lib/db";
import { kravLeverantor, type Anvandare } from "@/lib/session";
import { svara, type FormSvar } from "@/lib/formsvar";

/**
 * Redigering av den delade kravkatalogen.
 *
 * Katalogen är gemensam för samtliga kunder. En rättelse här är produktens
 * främsta värde — ett ändrat lagrum når alla på en gång — men av samma skäl är
 * varje ändring en ändring hos hundratals organisationer. Därför gäller tre
 * regler i hela filen:
 *
 * 1. Åtgärderna kräver leverantörsbehörighet, inte bara rollen administratör.
 * 2. Varje ändrat fält skrivs till catalog_revisions med före- och eftervärde,
 *    vem som gjorde den, varför, och hur många organisationer den nådde.
 * 3. En ändring som skulle radera kundernas eget arbete stoppas.
 */

const TEXTFALT = [
  "rubrik", "lagrum", "beskrivning", "kontextmall", "intervall", "modul",
  "kalla_url", "giltighet", "giltighet_not", "standard_forfallo",
] as const;

const GILTIGHETER = ["gallande", "upphor", "foreslagen"];
const INTERVALLER = ["mandatperiod", "arligen", "lopande", "engang"];
const HUVUDMAN = ["kommun", "region", "bada"];

type Katalograd = Record<string, string | number | null>;

function nu() {
  return new Date().toISOString().slice(0, 19);
}

function text(formData: FormData, falt: string) {
  return String(formData.get(falt) ?? "").trim();
}

/** Organisationer som ska ha kravet, givet vilka huvudmän det gäller. */
function organisationerFor(gallerFor: string) {
  return all<{ id: number }>(
    `SELECT id FROM organisations
     WHERE ? = 'bada'
        OR typ = ?
        OR (typ = 'kommun_region' AND ? IN ('kommun', 'region'))`,
    gallerFor, gallerFor, gallerFor,
  );
}

function skrivRevision(
  kravId: number, anvandare: string, falt: string,
  fran: unknown, till: unknown, motivering: string, berorda: number,
) {
  run(
    `INSERT INTO catalog_revisions
       (krav_id, tidpunkt, anvandare, falt, fran, till, motivering, berorda)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    kravId, nu(), anvandare, falt,
    fran === null || fran === undefined ? "" : String(fran),
    till === null || till === undefined ? "" : String(till),
    motivering, berorda,
  );
}

/**
 * Ändrar ett krav i katalogen.
 *
 * Texten är delad, så en ändring av lagrum eller beskrivning kräver ingen
 * skrivning hos kunderna: det är hela vinsten med modellen. Ändras däremot
 * vilka huvudmän kravet gäller måste kundernas kravlistor följa med.
 */
async function andraKravInre(a: Anvandare, formData: FormData): Promise<string> {

  const id = Number(formData.get("id"));
  const krav = one<Katalograd>("SELECT * FROM requirement_catalog WHERE id = ?", id);
  if (!krav) throw new Error("Kravet finns inte i katalogen.");

  const motivering = text(formData, "motivering");
  if (motivering.length < 5) {
    throw new Error("Ange varför kravet ändras. Motiveringen sparas i katalogens historik.");
  }

  const berorda =
    one<{ v: number }>("SELECT COUNT(*) AS v FROM requirement_status WHERE krav_id = ?", id)?.v ?? 0;

  const andrade: string[] = [];

  for (const falt of TEXTFALT) {
    if (formData.get(falt) === null) continue;
    const nytt = text(formData, falt);
    const gammalt = krav[falt] === null ? "" : String(krav[falt]);
    if (nytt === gammalt) continue;

    if (falt === "giltighet" && !GILTIGHETER.includes(nytt)) {
      throw new Error("Okänd rättslig status: " + nytt);
    }
    if (falt === "intervall" && !INTERVALLER.includes(nytt)) {
      throw new Error("Okänt intervall: " + nytt);
    }
    if (falt === "rubrik" && !nytt) throw new Error("Rubriken får inte vara tom.");
    if (falt === "lagrum" && !nytt) throw new Error("Lagrummet får inte vara tomt.");

    run(
      `UPDATE requirement_catalog SET ${falt} = ? WHERE id = ?`,
      falt === "standard_forfallo" && !nytt ? null : nytt,
      id,
    );
    skrivRevision(id, a.namn, falt, krav[falt], nytt, motivering, berorda);
    andrade.push(falt);
  }

  // Huvudmannatypen styr vilka kunder som har kravet och hanteras separat.
  const nyGallerFor = text(formData, "galler_for");
  if (nyGallerFor && nyGallerFor !== krav.galler_for) {
    if (!HUVUDMAN.includes(nyGallerFor)) throw new Error("Okänd huvudman: " + nyGallerFor);

    const ska = new Set(organisationerFor(nyGallerFor).map((o) => o.id));
    const har = all<{ org_id: number; status: string; evidens: string; senast_genomfort: string | null }>(
      "SELECT org_id, status, evidens, senast_genomfort FROM requirement_status WHERE krav_id = ?",
      id,
    );

    // Att smalna av kravet skulle ta bort det ur kundernas listor. Hos en kund
    // som redovisat arbete på kravet innebär det att underlag, ansvarig och
    // genomförandedatum försvinner. Det får inte ske av ett felklick.
    const medArbete = har.filter(
      (r) => !ska.has(r.org_id) &&
        (r.status !== "ej_paborjad" || r.senast_genomfort !== null || r.evidens !== "Underlag saknas"),
    );
    if (medArbete.length > 0) {
      throw new Error(
        `Kravet kan inte begränsas till ${nyGallerFor}: ${medArbete.length} ` +
        `organisation(er) har redovisat arbete på det, och den redovisningen ` +
        `skulle raderas. Markera kravet som upphört i stället.`,
      );
    }

    const borttagna = har.filter((r) => !ska.has(r.org_id)).length;
    run(
      `DELETE FROM requirement_status WHERE krav_id = ? AND org_id NOT IN (
         SELECT id FROM organisations
         WHERE ? = 'bada' OR typ = ? OR (typ = 'kommun_region' AND ? IN ('kommun','region')))`,
      id, nyGallerFor, nyGallerFor, nyGallerFor,
    );

    const fanns = new Set(har.map((r) => r.org_id));
    let tillagda = 0;
    for (const o of ska) {
      if (fanns.has(o)) continue;
      run(
        `INSERT INTO requirement_status (org_id, krav_id, status, nasta_forfallo, ansvarig, evidens)
         VALUES (?, ?, 'ej_paborjad', ?, '', 'Underlag saknas')`,
        o, id, krav.standard_forfallo,
      );
      tillagda++;
    }

    run("UPDATE requirement_catalog SET galler_for = ? WHERE id = ?", nyGallerFor, id);
    skrivRevision(
      id, a.namn, "galler_for", krav.galler_for, nyGallerFor,
      `${motivering} (+${tillagda} organisationer, -${borttagna})`, berorda,
    );
    andrade.push("galler_for");
  }

  if (andrade.length === 0) throw new Error("Inget fält ändrades.");

  run(
    "UPDATE requirement_catalog SET katalogversion = katalogversion + 1 WHERE id = ?",
    id,
  );
  logga(
    a.org_id, a.namn,
    `Ändrade kravkatalogen (${andrade.join(", ")})`,
    `${krav.kod}, slår igenom hos ${berorda} organisationer`,
  );
  revalidatePath("/katalog");
  revalidatePath("/efterlevnad");
  return `${krav.kod} ändrades (${andrade.join(", ")}). Ändringen gäller nu hos ${berorda} organisationer.`;
}

/**
 * Markerar ett krav som avstämt mot författningstext.
 *
 * Proveniensen är det som skiljer katalogen från en lista någon skrivit ihop.
 * Att stämma av är därför en egen åtgärd med egen historikpost, inte ett fält
 * bland andra.
 */
async function stamAvKravInre(a: Anvandare, formData: FormData): Promise<string> {
  const id = Number(formData.get("id"));
  const krav = one<Katalograd>("SELECT * FROM requirement_catalog WHERE id = ?", id);
  if (!krav) throw new Error("Kravet finns inte i katalogen.");

  const kalla = text(formData, "kalla_url") || String(krav.kalla_url ?? "");
  if (!kalla) {
    throw new Error("En avstämning kräver en källhänvisning till författningstexten.");
  }
  const motivering = text(formData, "motivering") || "Avstämd mot källa.";
  const datum = text(formData, "kontrollerad") || nu().slice(0, 10);

  const berorda =
    one<{ v: number }>("SELECT COUNT(*) AS v FROM requirement_status WHERE krav_id = ?", id)?.v ?? 0;

  run(
    `UPDATE requirement_catalog
     SET kontrollerad = ?, kontrollerad_av = ?, kalla_url = ?,
         katalogversion = katalogversion + 1
     WHERE id = ?`,
    datum, a.namn, kalla, id,
  );
  skrivRevision(id, a.namn, "kontrollerad", krav.kontrollerad, datum, motivering, berorda);
  logga(a.org_id, a.namn, "Stämde av krav mot källa", `${krav.kod} (${berorda} organisationer)`);
  revalidatePath("/katalog");
  revalidatePath("/efterlevnad");
  return `${krav.kod} är markerat som avstämt ${datum}. Markeringen syns hos ${berorda} organisationer.`;
}

/**
 * Lägger till ett nytt krav i katalogen och i kundernas listor.
 *
 * Det här är vägen in för en ny lag. Kravet skrivs en gång och hamnar direkt
 * hos varje kund av rätt huvudmannatyp, vilket är precis vad omläggningen till
 * LKRB kräver.
 */
async function laggTillKravInre(a: Anvandare, formData: FormData): Promise<string> {

  const kod = text(formData, "kod").toUpperCase();
  if (!/^[A-ZÅÄÖ0-9-]{3,24}$/.test(kod)) {
    throw new Error("Koden ska vara 3–24 tecken, versaler, siffror och bindestreck.");
  }
  if (one<{ id: number }>("SELECT id FROM requirement_catalog WHERE kod = ?", kod)) {
    throw new Error(`Koden ${kod} finns redan i katalogen.`);
  }

  const rubrik = text(formData, "rubrik");
  const lagrum = text(formData, "lagrum");
  if (!rubrik || !lagrum) throw new Error("Rubrik och lagrum måste anges.");

  const gallerFor = text(formData, "galler_for") || "bada";
  if (!HUVUDMAN.includes(gallerFor)) throw new Error("Okänd huvudman: " + gallerFor);
  const intervall = text(formData, "intervall") || "lopande";
  if (!INTERVALLER.includes(intervall)) throw new Error("Okänt intervall: " + intervall);
  const giltighet = text(formData, "giltighet") || "gallande";
  if (!GILTIGHETER.includes(giltighet)) throw new Error("Okänd rättslig status: " + giltighet);

  const forfallo = text(formData, "standard_forfallo") || null;

  const id = Number(
    run(
      `INSERT INTO requirement_catalog
         (kod, rubrik, lagrum, beskrivning, kontextmall, intervall, modul, kalla_url,
          giltighet, giltighet_not, galler_for, standard_forfallo,
          kontrollerad, kontrollerad_av, katalogversion)
       VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, '', '', 1)`,
      kod, rubrik, lagrum, text(formData, "beskrivning"), intervall,
      text(formData, "modul"), text(formData, "kalla_url"), giltighet,
      text(formData, "giltighet_not"), gallerFor, forfallo,
    ).lastInsertRowid,
  );

  // Nya krav läggs in som ej avstämda. Den som skrivit in ett lagrum har inte
  // därmed kontrollerat det mot författningstexten, och raden ska synas som
  // okontrollerad tills någon gjort det.
  const organisationer = organisationerFor(gallerFor);
  for (const o of organisationer) {
    run(
      `INSERT INTO requirement_status (org_id, krav_id, status, nasta_forfallo, ansvarig, evidens)
       VALUES (?, ?, 'ej_paborjad', ?, '', 'Underlag saknas')`,
      o.id, id, forfallo,
    );
  }

  skrivRevision(
    id, a.namn, "nytt krav", "", kod,
    text(formData, "motivering") || "Nytt krav i katalogen.", organisationer.length,
  );
  logga(
    a.org_id, a.namn, "Lade till krav i katalogen",
    `${kod}, infört hos ${organisationer.length} organisationer`,
  );
  revalidatePath("/katalog");
  revalidatePath("/efterlevnad");
  return `${kod} lades till i katalogen och finns nu hos ${organisationer.length} organisationer. Kravet är ej avstämt mot källa.`;
}

/* ------------------------------------------------------------------ omslag */
// Spärren körs här, utanför felhanteringen, eftersom den omdirigerar genom att
// kasta. Resten besvaras med text i formuläret i stället för att krascha.

export async function andraKrav(formData: FormData): Promise<FormSvar> {
  const a = await kravLeverantor("katalog");
  return svara(() => andraKravInre(a, formData));
}

export async function stamAvKrav(formData: FormData): Promise<FormSvar> {
  const a = await kravLeverantor("katalog");
  return svara(() => stamAvKravInre(a, formData));
}

export async function laggTillKrav(formData: FormData): Promise<FormSvar> {
  const a = await kravLeverantor("katalog");
  return svara(() => laggTillKravInre(a, formData));
}
