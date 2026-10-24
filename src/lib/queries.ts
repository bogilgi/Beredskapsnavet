import "server-only";
import { all, one } from "@/lib/db";
import { idag } from "@/lib/format";

/* ------------------------------------------------------------------- typer */

export type Organisation = {
  id: number; kortnamn: string; namn: string; typ: string; lan: string;
  invanare: number | null; mandatperiod: string; beredskapsniva: string;
  samordnare: string; samordnare_epost: string; tib_telefon: string;
  uppdaterad: string; ansluten: string; tillsyn_cyber: string; aktiv: number;
};

export type Unit = {
  id: number; namn: string; kortnamn: string; typ: string; chef: string;
  samhallsviktig: number; anstallda: number;
};

export type Bemanning = Unit & { platser: number; placerade: number; foreslagna: number };

export type PositionRad = {
  id: number; unit_id: number; unit: string; kortnamn: string; titel: string;
  niva: string; kritikalitet: string; platser: number; sakerhetsklass: string;
  uppgift: string; placerade: number; foreslagna: number;
};

export type PlaceringRad = {
  id: number; position_id: number; titel: string; kortnamn: string; unit: string;
  kritikalitet: string; sakerhetsklass: string; person_id: number | null;
  person: string | null; pnr_maskerat: string | null; befattning_fred: string | null;
  status: string; beslutsdatum: string | null; underrattad: number; anmarkning: string;
  fm_krigsplacerad: number; annan_plikt: string; registerkontroll: string;
};

export type Person = {
  id: number; namn: string; pnr_maskerat: string; unit: string; kortnamn: string;
  befattning_fred: string; epost: string; telefon: string; fm_krigsplacerad: number;
  annan_plikt: string; sakerhetsklass: string; registerkontroll: string;
  bortrest_risk: number; noteringar: string; antal_placeringar: number;
};

export type Risk = {
  id: number; namn: string; kategori: string; beskrivning: string; sannolikhet: number;
  konsekvens: number; agare: string; status: string; senast_bedomd: string;
  hojd_beredskap: number; kortnamn: string | null; atgarder: number;
};

export type KritiskFunktion = {
  id: number; namn: string; beskrivning: string; kortnamn: string; unit: string;
  prioritet: number; mtpd_timmar: number; faktisk_timmar: number; plan_status: string;
  plan_datum: string | null; berorda_brukare: number; beroenden: number;
  max_sarbarhet: number | null;
};

export type Beroende = {
  id: number; function_id: number; typ: string; beskrivning: string;
  reservlosning: string; sarbarhet: number;
};

export type Resurs = {
  id: number; kategori: string; benamning: string; kapacitet: string; antal: number;
  enhet: string; placering: string; kortnamn: string | null; status: string;
  sista_kontroll: string | null; nasta_kontroll: string | null; ansvarig: string;
  noteringar: string;
};

export type Ovning = {
  id: number; namn: string; typ: string; datum: string; status: string; malgrupp: string;
  deltagare: number; scenario: string; forankrad_lagkrav: string; erfarenheter: string;
  atgarder: number;
};

export type Atgard = {
  id: number; titel: string; beskrivning: string; kalla: string; kalla_ref: string;
  ansvarig: string; kortnamn: string | null; prioritet: string; status: string;
  forfallodatum: string | null; klar_datum: string | null; skapad: string;
};

/**
 * Ett krav som det ser ut för en organisation: den delade katalogtexten plus
 * organisationens egen status. `id` är statusradens id, eftersom det är den
 * som skrivs; katalograden ändras bara centralt.
 */
export type Krav = {
  id: number; krav_id: number;
  kod: string; rubrik: string; lagrum: string; beskrivning: string;
  /** Katalogtextens platshållare fyllda med organisationens uppgifter. */
  kontext: string;
  intervall: string; status: string; senast_genomfort: string | null;
  nasta_forfallo: string | null; ansvarig: string; evidens: string; modul: string;
  kalla_url: string; giltighet: string; giltighet_not: string;
  galler_for: string;
  /** Tomt när kravet inte är avstämt mot författningstext. */
  kontrollerad: string; kontrollerad_av: string;
  /** Organisationens egen anteckning. Delas aldrig med andra organisationer. */
  lokal_not: string;
};

export type Konflikt = {
  typ: "fm" | "plikt" | "dubbel" | "registerkontroll" | "vakans";
  allvarlig: boolean;
  person: string;
  detalj: string;
  befattning: string;
};

/* ------------------------------------------------------------- organisation */

export const hamtaOrganisation = (orgId: number) =>
  one<Organisation>("SELECT * FROM organisations WHERE id = ?", orgId)!;

export const hamtaOrganisationer = () =>
  all<Organisation>("SELECT * FROM organisations WHERE aktiv = 1 ORDER BY namn");

export const hamtaUnits = (orgId: number) =>
  all<Unit>(
    "SELECT * FROM units WHERE org_id = ? ORDER BY samhallsviktig DESC, namn",
    orgId,
  );

/* ------------------------------------------------------- krigsorganisation */

export const hamtaBemanning = (orgId: number) =>
  all<Bemanning>(`
    SELECT u.*,
      (SELECT COALESCE(SUM(p.platser), 0) FROM positions p WHERE p.unit_id = u.id) AS platser,
      (SELECT COUNT(*) FROM placements pl JOIN positions p ON p.id = pl.position_id
        WHERE p.unit_id = u.id AND pl.status IN ('beslutad','underrattad')) AS placerade,
      (SELECT COUNT(*) FROM placements pl JOIN positions p ON p.id = pl.position_id
        WHERE p.unit_id = u.id AND pl.status = 'foreslagen') AS foreslagna
    FROM units u
    WHERE u.org_id = ?
    ORDER BY u.samhallsviktig DESC, u.namn
  `, orgId);

export const hamtaPositioner = (orgId: number) =>
  all<PositionRad>(`
    SELECT p.*, u.namn AS unit, u.kortnamn,
      (SELECT COUNT(*) FROM placements pl
        WHERE pl.position_id = p.id AND pl.status IN ('beslutad','underrattad')) AS placerade,
      (SELECT COUNT(*) FROM placements pl
        WHERE pl.position_id = p.id AND pl.status = 'foreslagen') AS foreslagna
    FROM positions p
    JOIN units u ON u.id = p.unit_id
    WHERE p.org_id = ?
    ORDER BY u.samhallsviktig DESC, u.namn,
      CASE p.niva WHEN 'ledning' THEN 1 WHEN 'stab' THEN 2 ELSE 3 END,
      p.kritikalitet, p.titel
  `, orgId);

export const hamtaPlaceringar = (orgId: number) =>
  all<PlaceringRad>(`
    SELECT pl.*, p.titel, p.kritikalitet, p.sakerhetsklass, u.kortnamn, u.namn AS unit,
           pe.namn AS person, pe.pnr_maskerat, pe.befattning_fred,
           COALESCE(pe.fm_krigsplacerad, 0) AS fm_krigsplacerad,
           COALESCE(pe.annan_plikt, '') AS annan_plikt,
           COALESCE(pe.registerkontroll, 'ej_aktuell') AS registerkontroll
    FROM placements pl
    JOIN positions p ON p.id = pl.position_id
    JOIN units u ON u.id = p.unit_id
    LEFT JOIN people pe ON pe.id = pl.person_id
    WHERE pl.org_id = ?
    ORDER BY u.samhallsviktig DESC, u.namn, p.titel, pe.namn
  `, orgId);

export const hamtaPersonal = (orgId: number) =>
  all<Person>(`
    SELECT pe.*, u.namn AS unit, u.kortnamn,
      (SELECT COUNT(*) FROM placements pl WHERE pl.person_id = pe.id
        AND pl.status <> 'avslutad') AS antal_placeringar
    FROM people pe JOIN units u ON u.id = pe.unit_id
    WHERE pe.org_id = ?
    ORDER BY u.namn, pe.namn
  `, orgId);

/**
 * Kontrollerna som annars görs manuellt: samrådsplikt, dubbelplacering,
 * saknad registerkontroll och vakanser på oumbärliga befattningar.
 */
export function hamtaKonflikter(orgId: number): Konflikt[] {
  const konflikter: Konflikt[] = [];

  for (const r of all<{ namn: string; titel: string; kortnamn: string; noteringar: string }>(`
    SELECT pe.namn, p.titel, u.kortnamn, pe.noteringar
    FROM placements pl
    JOIN people pe ON pe.id = pl.person_id
    JOIN positions p ON p.id = pl.position_id
    JOIN units u ON u.id = p.unit_id
    WHERE pl.org_id = ? AND pe.fm_krigsplacerad = 1 AND pl.status <> 'avslutad'
    ORDER BY pe.namn
  `, orgId)) {
    konflikter.push({
      typ: "fm", allvarlig: true, person: r.namn,
      befattning: `${r.titel} (${r.kortnamn})`,
      detalj: r.noteringar || "Redan krigsplacerad i Försvarsmakten. Samråd krävs före beslut.",
    });
  }

  for (const r of all<{ namn: string; titel: string; kortnamn: string; annan_plikt: string }>(`
    SELECT pe.namn, p.titel, u.kortnamn, pe.annan_plikt
    FROM placements pl
    JOIN people pe ON pe.id = pl.person_id
    JOIN positions p ON p.id = pl.position_id
    JOIN units u ON u.id = p.unit_id
    WHERE pl.org_id = ? AND pe.annan_plikt <> '' AND pl.status <> 'avslutad'
    ORDER BY pe.namn
  `, orgId)) {
    konflikter.push({
      typ: "plikt", allvarlig: false, person: r.namn,
      befattning: `${r.titel} (${r.kortnamn})`,
      detalj: `Har annan plikt: ${r.annan_plikt}. Samråd krävs.`,
    });
  }

  for (const r of all<{ namn: string; antal: number; befattningar: string }>(`
    SELECT pe.namn, COUNT(*) AS antal,
           GROUP_CONCAT(p.titel, ' · ') AS befattningar
    FROM placements pl
    JOIN people pe ON pe.id = pl.person_id
    JOIN positions p ON p.id = pl.position_id
    WHERE pl.org_id = ? AND pl.status <> 'avslutad'
    GROUP BY pe.id HAVING COUNT(*) > 1
  `, orgId)) {
    konflikter.push({
      typ: "dubbel", allvarlig: true, person: r.namn,
      befattning: r.befattningar,
      detalj: `Placerad på ${r.antal} befattningar i krigsorganisationen. Kan bara bemanna en.`,
    });
  }

  for (const r of all<{ namn: string; titel: string; kortnamn: string; sakerhetsklass: string; registerkontroll: string }>(`
    SELECT pe.namn, p.titel, u.kortnamn, p.sakerhetsklass, pe.registerkontroll
    FROM placements pl
    JOIN people pe ON pe.id = pl.person_id
    JOIN positions p ON p.id = pl.position_id
    JOIN units u ON u.id = p.unit_id
    WHERE pl.org_id = ? AND p.sakerhetsklass <> 'ingen' AND pe.registerkontroll <> 'klar'
      AND pl.status <> 'avslutad'
    ORDER BY p.sakerhetsklass, pe.namn
  `, orgId)) {
    konflikter.push({
      typ: "registerkontroll",
      allvarlig: r.registerkontroll === "utgangen",
      person: r.namn,
      befattning: `${r.titel} (${r.kortnamn})`,
      detalj: `Befattning i säkerhetsklass ${r.sakerhetsklass}, registerkontroll: ${
        r.registerkontroll === "utgangen" ? "utgången" : r.registerkontroll === "begard" ? "begärd" : "saknas"
      }.`,
    });
  }

  for (const r of all<{ titel: string; kortnamn: string; platser: number; vakanta: number }>(`
    SELECT p.titel, u.kortnamn, p.platser,
           p.platser - (SELECT COUNT(*) FROM placements pl
             WHERE pl.position_id = p.id AND pl.status <> 'avslutad') AS vakanta
    FROM positions p JOIN units u ON u.id = p.unit_id
    WHERE p.org_id = ? AND p.kritikalitet = 'A' AND vakanta > 0
    ORDER BY vakanta DESC, u.namn
  `, orgId)) {
    konflikter.push({
      typ: "vakans", allvarlig: true, person: "—",
      befattning: `${r.titel} (${r.kortnamn})`,
      detalj: `${r.vakanta} av ${r.platser} platser är obemannade på en oumbärlig befattning (kritikalitet A).`,
    });
  }

  return konflikter;
}

/* ---------------------------------------------------------------------- RSA */

/**
 * En lista som redigeras på plats får inte sorteras på det fält som redigeras.
 *
 * Gjorde den det hoppade raden undan i samma ögonblick som den ändrades, och
 * den som arbetade sig nedåt i listan redigerade sedan ett annat objekt än det
 * hen just såg — för en tangentbordsanvändare, vars fokus står kvar på samma
 * plats i dokumentet, blev nästa tryck en ändring på fel rad. I ett system som
 * används som tillsynsunderlag är det inte ett skönhetsfel.
 *
 * Prioriteringen finns kvar där den hör hemma: översiktens lista över vad som
 * behöver göras härnäst, som inte redigeras i.
 */
export const hamtaRisker = (orgId: number) =>
  all<Risk>(`
    SELECT r.*, u.kortnamn,
      (SELECT COUNT(*) FROM actions a
        WHERE a.org_id = r.org_id AND a.kalla = 'rsa' AND a.kalla_ref = r.namn) AS atgarder
    FROM risks r LEFT JOIN units u ON u.id = r.unit_id
    WHERE r.org_id = ?
    ORDER BY r.namn
  `, orgId);

/* --------------------------------------------------------- kontinuitet */

export const hamtaKritiskaFunktioner = (orgId: number) =>
  all<KritiskFunktion>(`
    SELECT f.*, u.kortnamn, u.namn AS unit,
      (SELECT COUNT(*) FROM dependencies d WHERE d.function_id = f.id) AS beroenden,
      (SELECT MAX(d.sarbarhet) FROM dependencies d WHERE d.function_id = f.id) AS max_sarbarhet
    FROM critical_functions f JOIN units u ON u.id = f.unit_id
    WHERE f.org_id = ?
    ORDER BY f.prioritet, (f.faktisk_timmar - f.mtpd_timmar) DESC, f.namn
  `, orgId);

export const hamtaBeroenden = (orgId: number) =>
  all<Beroende>(
    "SELECT * FROM dependencies WHERE org_id = ? ORDER BY sarbarhet DESC, typ",
    orgId,
  );

/* ------------------------------------------------------------------ resurser */

export const hamtaResurser = (orgId: number) =>
  all<Resurs>(`
    SELECT r.*, u.kortnamn FROM resources r LEFT JOIN units u ON u.id = r.unit_id
    WHERE r.org_id = ?
    ORDER BY r.kategori, r.benamning
  `, orgId);

/* ------------------------------------------------------------------ övningar */

export const hamtaOvningar = (orgId: number) =>
  all<Ovning>(`
    SELECT o.*,
      (SELECT COUNT(*) FROM actions a
        WHERE a.org_id = o.org_id AND a.kalla = 'ovning' AND a.kalla_ref = o.namn) AS atgarder
    FROM exercises o WHERE o.org_id = ? ORDER BY o.datum DESC
  `, orgId);

/* ----------------------------------------------------------------- åtgärder */

export const hamtaAtgarder = (orgId: number) =>
  all<Atgard>(`
    SELECT a.*, u.kortnamn FROM actions a LEFT JOIN units u ON u.id = a.unit_id
    WHERE a.org_id = ?
    ORDER BY a.forfallodatum IS NULL, a.forfallodatum, a.id
  `, orgId);

/* ------------------------------------------------------------------- lagkrav */

/**
 * Fyller katalogens kontextmall med organisationens egna uppgifter.
 *
 * Katalogtexten är delad, men några krav betyder olika saker beroende på hur
 * stor organisationen är och i vilket län den ligger: storleken avgör om den
 * är väsentlig eller viktig verksamhetsutövare, länet avgör tillsynsmyndighet.
 * Sådan text får därför inte skrivas in i den delade beskrivningen, utan fylls
 * här vid läsning.
 */
function fyllKontext(mall: string, org: Organisation, anstallda: number): string {
  if (!mall) return "";
  // Gränsen för medelstor går vid 250 anställda enligt EU:s definition, som
  // cybersäkerhetslagen bygger på.
  const vasentlig = anstallda > 250;
  const siffra = (n: number) => n.toLocaleString("sv-SE");
  return mall
    .replaceAll("{namn}", org.namn)
    .replaceAll("{typ}", org.typ)
    .replaceAll("{lan}", org.lan)
    .replaceAll("{invanare}", org.invanare === null ? "okänt antal" : siffra(org.invanare))
    .replaceAll("{anstallda}", siffra(anstallda))
    .replaceAll("{storlek}", vasentlig ? "väsentlig" : "viktig")
    .replaceAll("{storleksgrund}", vasentlig ? "större än medelstor" : "medelstor eller mindre")
    .replaceAll("{tillsyn}", org.tillsyn_cyber || "den myndighet som anges i förordningen");
}

/**
 * Organisationens kravlista: den delade katalogen sammanfogad med
 * organisationens status. Bara de krav som gäller organisationens
 * huvudmannatyp får en statusrad, så filtreringen sker redan vid upplägget.
 */
export function hamtaKrav(orgId: number): Krav[] {
  const org = hamtaOrganisation(orgId);
  const anstallda =
    one<{ v: number }>("SELECT COALESCE(SUM(anstallda), 0) AS v FROM units WHERE org_id = ?", orgId)
      ?.v ?? 0;

  const rader = all<Krav & { kontextmall: string }>(`
    SELECT s.id, s.krav_id, s.status, s.senast_genomfort, s.nasta_forfallo,
           s.ansvarig, s.evidens, s.lokal_not,
           k.kod, k.rubrik, k.lagrum, k.beskrivning, k.kontextmall, k.intervall,
           k.modul, k.kalla_url, k.giltighet, k.giltighet_not, k.galler_for,
           k.kontrollerad, k.kontrollerad_av
    FROM requirement_status s
    JOIN requirement_catalog k ON k.id = s.krav_id
    WHERE s.org_id = ?
    ORDER BY k.kod
  `, orgId);

  return rader.map(({ kontextmall, ...rad }) => ({
    ...rad,
    kontext: fyllKontext(kontextmall, org, anstallda),
  }));
}

export const hamtaLogg = (orgId: number, gransvarde = 12) =>
  all<{ id: number; tidpunkt: string; anvandare: string; handelse: string; objekt: string }>(
    "SELECT * FROM audit_log WHERE org_id = ? ORDER BY tidpunkt DESC LIMIT ?",
    orgId,
    gransvarde,
  );

/* ----------------------------------------------------------------- översikt */

export type Oversikt = {
  platser: number;
  placerade: number;
  foreslagna: number;
  konflikter: number;
  allvarligaKonflikter: number;
  kravBrist: number;
  kravTotalt: number;
  kravUppfyllda: number;
  kravForfaller: number;
  atgarderOppna: number;
  atgarderForsenade: number;
  atgarderKlara: number;
  riskerHoga: number;
  riskerTotalt: number;
  funktionerGap: number;
  funktionerTotalt: number;
  planSaknas: number;
  resurserUrDrift: number;
  resurserKontrollForsenad: number;
  ovningarGenomforda12mdr: number;
};

export function hamtaOversikt(orgId: number): Oversikt {
  const d = idag();
  // Varje räkning filtreras på organisationen. En saknad filtrering här skulle
  // visa en annan kommuns siffror på översikten.
  const num = (sql: string, ...p: unknown[]) => one<{ v: number }>(sql, orgId, ...p)?.v ?? 0;

  const konflikter = hamtaKonflikter(orgId);

  return {
    platser: num("SELECT COALESCE(SUM(platser), 0) AS v FROM positions WHERE org_id = ?"),
    placerade: num(
      "SELECT COUNT(*) AS v FROM placements WHERE org_id = ? AND status IN ('beslutad','underrattad')",
    ),
    foreslagna: num("SELECT COUNT(*) AS v FROM placements WHERE org_id = ? AND status = 'foreslagen'"),
    konflikter: konflikter.length,
    allvarligaKonflikter: konflikter.filter((k) => k.allvarlig).length,
    kravTotalt: num("SELECT COUNT(*) AS v FROM requirement_status WHERE org_id = ?"),
    kravBrist: num(
      "SELECT COUNT(*) AS v FROM requirement_status WHERE org_id = ? AND status IN ('brist','ej_paborjad')",
    ),
    kravUppfyllda: num("SELECT COUNT(*) AS v FROM requirement_status WHERE org_id = ? AND status = 'uppfylld'"),
    kravForfaller: num(
      `SELECT COUNT(*) AS v FROM requirement_status
       WHERE org_id = ? AND nasta_forfallo IS NOT NULL
         AND nasta_forfallo <= date(?, '+90 days') AND status <> 'uppfylld'`,
      d,
    ),
    atgarderOppna: num(
      "SELECT COUNT(*) AS v FROM actions WHERE org_id = ? AND status IN ('ej_paborjad','pagaende')",
    ),
    atgarderForsenade: num(
      `SELECT COUNT(*) AS v FROM actions
       WHERE org_id = ? AND status IN ('ej_paborjad','pagaende')
         AND forfallodatum IS NOT NULL AND forfallodatum < ?`,
      d,
    ),
    atgarderKlara: num("SELECT COUNT(*) AS v FROM actions WHERE org_id = ? AND status = 'klar'"),
    riskerHoga: num(
      "SELECT COUNT(*) AS v FROM risks WHERE org_id = ? AND sannolikhet * konsekvens >= 15",
    ),
    riskerTotalt: num("SELECT COUNT(*) AS v FROM risks WHERE org_id = ?"),
    funktionerGap: num(
      "SELECT COUNT(*) AS v FROM critical_functions WHERE org_id = ? AND faktisk_timmar > mtpd_timmar",
    ),
    funktionerTotalt: num("SELECT COUNT(*) AS v FROM critical_functions WHERE org_id = ?"),
    planSaknas: num(
      "SELECT COUNT(*) AS v FROM critical_functions WHERE org_id = ? AND plan_status IN ('saknas','utgangen')",
    ),
    resurserUrDrift: num("SELECT COUNT(*) AS v FROM resources WHERE org_id = ? AND status = 'ur_drift'"),
    resurserKontrollForsenad: num(
      `SELECT COUNT(*) AS v FROM resources
       WHERE org_id = ? AND (nasta_kontroll IS NULL OR nasta_kontroll < ?)`,
      d,
    ),
    ovningarGenomforda12mdr: num(
      `SELECT COUNT(*) AS v FROM exercises
       WHERE org_id = ? AND status IN ('genomford','utvarderad') AND datum >= date(?, '-12 months')`,
      d,
    ),
  };
}

/* ------------------------------------------- personuppgifter och gallring */

export type Gallringsregel = {
  kategori: string;
  frist_manader: number | null;
  beslutad_av: string;
  beslutsdatum: string | null;
  anmarkning: string;
};

export const hamtaGallringsregler = (orgId: number) =>
  all<Gallringsregel>(
    "SELECT kategori, frist_manader, beslutad_av, beslutsdatum, anmarkning FROM gallringsregler WHERE org_id = ?",
    orgId,
  );

export type Gallringsbar = {
  id: number; namn: string; unit: string; befattning_fred: string;
  anstallning_upphorde: string; sakerhetsklass: string; registerkontroll: string;
  /** Placeringar som inte är avslutade. En sådan ska avslutas före gallring. */
  oppna_placeringar: number;
};

/**
 * Personer vars anställning upphört, med underlag för gallringsbedömningen.
 *
 * Själva fristen tillämpas inte här utan i gränssnittet, eftersom den är ett
 * beslut per kommun och kan saknas. En lista som tyst utelämnade personer för
 * att fristen inte är satt vore värre än en som visar dem som obedömda.
 */
export const hamtaGallringsbara = (orgId: number) =>
  all<Gallringsbar>(`
    SELECT pe.id, pe.namn, pe.befattning_fred, pe.anstallning_upphorde,
           pe.sakerhetsklass, pe.registerkontroll, u.namn AS unit,
      (SELECT COUNT(*) FROM placements pl
        WHERE pl.person_id = pe.id AND pl.status <> 'avslutad') AS oppna_placeringar
    FROM people pe JOIN units u ON u.id = pe.unit_id
    WHERE pe.org_id = ? AND pe.anstallning_upphorde IS NOT NULL
    ORDER BY pe.anstallning_upphorde
  `, orgId);

/* ------------------------------------------------------- kravkatalogen */

export type Katalograd = {
  id: number; kod: string; rubrik: string; lagrum: string; beskrivning: string;
  kontextmall: string; intervall: string; modul: string; kalla_url: string;
  giltighet: string; giltighet_not: string; galler_for: string;
  standard_forfallo: string | null;
  kontrollerad: string; kontrollerad_av: string; katalogversion: number;
  /** Antal organisationer som har kravet i sin lista. */
  berorda: number;
  /** Hur många av dem som redovisat arbete på kravet. */
  paborjade: number;
  revisioner: number;
};

/**
 * Hela den delade katalogen, med hur många kunder varje rad slår igenom hos.
 *
 * Siffran berorda är det som gör redaktionsarbetet begripligt: den som rättar
 * ett lagrum ska se att ändringen når 287 kommuner, inte tro att den gäller en.
 */
export const hamtaKatalog = () =>
  all<Katalograd>(`
    SELECT k.*,
      (SELECT COUNT(*) FROM requirement_status s WHERE s.krav_id = k.id) AS berorda,
      (SELECT COUNT(*) FROM requirement_status s
        WHERE s.krav_id = k.id AND s.status <> 'ej_paborjad') AS paborjade,
      (SELECT COUNT(*) FROM catalog_revisions v WHERE v.krav_id = k.id) AS revisioner
    FROM requirement_catalog k
    ORDER BY k.kontrollerad = '' DESC, k.galler_for, k.kod
  `);

export type Revision = {
  id: number; krav_id: number; kod: string; rubrik: string; tidpunkt: string;
  anvandare: string; falt: string; fran: string; till: string;
  motivering: string; berorda: number;
};

export const hamtaRevisioner = (gransvarde = 40) =>
  all<Revision>(`
    SELECT v.*, k.kod, k.rubrik
    FROM catalog_revisions v JOIN requirement_catalog k ON k.id = v.krav_id
    ORDER BY v.id DESC LIMIT ?
  `, gransvarde);

/* --------------------------------------------------- nationellt register */

export type Registerrad = {
  id: number; kod: string; namn: string; kortnamn: string; typ: string;
  lan: string; tillsyn_cyber: string;
  /** Satt när organisationen är upplagd som kund. */
  org_id: number | null;
  ansluten: string | null;
  aktiv: number | null;
};

/**
 * Samtliga kommuner och regioner i landet, med uppgift om vilka som är kunder.
 *
 * Till skillnad från allt annat i den här filen filtreras den INTE på
 * organisation, eftersom den är referensdata och inte kunddata. Att den
 * dessutom avslöjar vilka andra kommuner som är kunder gör att läsningen måste
 * spärras på leverantörsnivå; se kravLeverantor() i session.ts.
 */
export const hamtaRegister = () =>
  all<Registerrad>(`
    SELECT r.id, r.kod, r.namn, r.kortnamn, r.typ, r.lan, r.tillsyn_cyber,
           o.id AS org_id, o.ansluten, o.aktiv
    FROM org_registry r
    LEFT JOIN organisations o ON o.registry_id = r.id
    ORDER BY r.typ <> 'region', r.namn
  `);

/** Hur många krav en organisation av en viss typ får ur katalogen. */
export const hamtaKravantalPerTyp = () =>
  all<{ typ: string; antal: number }>(`
    SELECT t.typ, COUNT(*) AS antal
    FROM (SELECT 'kommun' AS typ UNION SELECT 'region' UNION SELECT 'kommun_region') t
    JOIN requirement_catalog k
      ON k.galler_for = 'bada'
      OR k.galler_for = t.typ
      OR (t.typ = 'kommun_region' AND k.galler_for IN ('kommun', 'region'))
    GROUP BY t.typ
  `);

/* ---------------------------------------------------------------- användare */

export type AnvandarRad = {
  id: number; namn: string; epost: string; roll: string; unit_id: number | null;
  kortnamn: string | null; aktiv: number; senaste_inloggning: string | null;
  skapad: string; aktiva_sessioner: number; antal_organisationer: number;
  leverantor: number; utan_losenord: number;
};

export type Inbjudan = {
  id: number; epost: string; roll: string; unit_id: number | null;
  kortnamn: string | null; skapad: string; gar_ut: string;
  inbjuden_av: string; accepterad: string | null; har_konto: number;
};

/** Obesvarade inbjudningar till organisationen. */
export const hamtaInbjudningar = (orgId: number) =>
  all<Inbjudan>(`
    SELECT i.id, i.epost, i.roll, i.unit_id, i.skapad, i.gar_ut, i.inbjuden_av,
           i.accepterad, u.kortnamn,
           (SELECT COUNT(*) FROM users x WHERE x.epost = i.epost) AS har_konto
    FROM invitations i
    LEFT JOIN units u ON u.id = i.unit_id
    WHERE i.org_id = ? AND i.accepterad IS NULL
    ORDER BY i.skapad DESC
  `, orgId);

/** Användare med behörighet till organisationen. Andra kommuners konton syns inte. */
export const hamtaAnvandarlista = (orgId: number) =>
  all<AnvandarRad>(`
    SELECT u.id, u.namn, u.epost, uo.roll, uo.unit_id, u.aktiv, u.senaste_inloggning,
           u.skapad, un.kortnamn, u.leverantor,
      -- Tomt lösenordsfält betyder att kontot loggar in mot katalogtjänsten.
      CASE WHEN u.losenord_hash = '' THEN 1 ELSE 0 END AS utan_losenord,
      (SELECT COUNT(*) FROM sessions s
        WHERE s.user_id = u.id AND s.org_id = uo.org_id AND s.gar_ut > ?) AS aktiva_sessioner,
      (SELECT COUNT(*) FROM user_orgs x WHERE x.user_id = u.id) AS antal_organisationer
    FROM user_orgs uo
    JOIN users u ON u.id = uo.user_id
    LEFT JOIN units un ON un.id = uo.unit_id
    WHERE uo.org_id = ?
    ORDER BY u.aktiv DESC, u.namn
  `, new Date().toISOString().slice(0, 19), orgId);
