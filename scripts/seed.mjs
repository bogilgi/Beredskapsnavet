// Seedar Beredskapsnavet med data för en fiktiv kommun (Ängsholms kommun).
// Kör: npm run db:reset
import { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync } from "node:crypto";
import { readFileSync, rmSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = join(root, "db", "beredskap.db");
for (const suffix of ["", "-wal", "-shm"]) {
  try { rmSync(dbPath + suffix); } catch {}
}
mkdirSync(join(root, "db"), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec(readFileSync(join(root, "db", "schema.sql"), "utf8"));

const ORGTABELLER = new Set([
  "units", "positions", "people", "placements", "risks", "critical_functions",
  "dependencies", "resources", "exercises", "actions", "requirement_status",
]);
let ORG = null;

const ins = (table, row) => {
  if (ORGTABELLER.has(table)) {
    if (ORG === null) throw new Error(`Ingen organisation vald vid insert i ${table}`);
    row = { org_id: ORG, ...row };
  }
  const keys = Object.keys(row);
  const sql = `INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`;
  const values = keys.map((k) => {
    const v = row[k];
    if (typeof v === "boolean") return v ? 1 : 0;
    return v === undefined ? null : v;
  });
  return db.prepare(sql).run(...values).lastInsertRowid;
};

/* ------------------------------------------------- nationellt organisationsregister */
// Samtliga kommuner och regioner i landet. Referensdata som delas av alla
// kunder, och det som gör onboarding till ett val i en lista i stället för ett
// formulär. Filen är vendorad in i repot med proveniens: registret får inte
// hämtas över nät vid seedning, eftersom installationen ska gå att köra i ett
// slutet kommunnät.
const REGISTER = JSON.parse(
  readFileSync(join(root, "scripts", "data", "organisationsregister.json"), "utf8"),
);
// Demoorganisationerna är påhittade och har med flit ingen rad i registret:
// de representerar ingen verklig kommun, och registry_id står därför som null.
const REGISTRY_ID = {};
for (const r of REGISTER.organisationer) {
  REGISTRY_ID[r.kod] = ins("org_registry", {
    kod: r.kod, namn: r.namn, kortnamn: r.kortnamn, typ: r.typ,
    lan: r.lan, tillsyn_cyber: r.tillsyn_cyber,
  });
}

/* -------------------------------------------------------------- organisationer */
// Installationen betjänar flera kommuner. Ängsholm har arbetat i systemet en
// tid, Nordmark är halvvägs, Vreta har just anslutits.
const ANGSHOLM = ins("organisations", {
  kortnamn: "angsholm",
  namn: "Ängsholms kommun",
  typ: "kommun",
  lan: "Södermanlands län",
  invanare: 31420,
  mandatperiod: "2023-2026",
  beredskapsniva: "fredstida",
  samordnare: "Marika Öhlund",
  samordnare_epost: "marika.ohlund@angsholm.se",
  tib_telefon: "0152-310 00",
  uppdaterad: "2026-10-22",
  ansluten: "2025-03-01",
  aktiv: true,
});

const NORDMARK = ins("organisations", {
  kortnamn: "nordmark",
  namn: "Nordmarks kommun",
  typ: "kommun",
  lan: "Värmlands län",
  invanare: 9840,
  mandatperiod: "2023-2026",
  beredskapsniva: "fredstida",
  samordnare: "Tove Bergqvist",
  samordnare_epost: "tove.bergqvist@nordmark.se",
  tib_telefon: "0570-820 00",
  uppdaterad: "2026-10-16",
  ansluten: "2026-01-15",
  aktiv: true,
});

const VRETA = ins("organisations", {
  kortnamn: "vreta",
  namn: "Vreta kommun",
  typ: "kommun",
  lan: "Östergötlands län",
  invanare: 4215,
  mandatperiod: "2023-2026",
  beredskapsniva: "fredstida",
  samordnare: "Johan Stenmark",
  samordnare_epost: "johan.stenmark@vreta.se",
  tib_telefon: "013-440 00",
  uppdaterad: "2026-10-20",
  ansluten: "2026-09-29",
  aktiv: true,
});

// En region i samma län som Ängsholm. Poängen med att ha båda i demon är att
// de får olika kravlistor ur samma katalog, och olika tillsynsmyndighet:
// kommunen bara länsstyrelsen, regionen även IVO i egenskap av vårdgivare.
const VASTMARK = ins("organisations", {
  kortnamn: "vastmark",
  namn: "Region Västmark",
  typ: "region",
  lan: "Örebro län",
  invanare: 298400,
  mandatperiod: "2023-2026",
  beredskapsniva: "fredstida",
  samordnare: "Helena Krantz",
  samordnare_epost: "helena.krantz@regionvastmark.se",
  tib_telefon: "019-602 00 00",
  uppdaterad: "2026-10-21",
  ansluten: "2025-11-17",
  aktiv: true,
});

ORG = ANGSHOLM;

/* ---------------------------------------------------------------------- units */
const unitRows = [
  ["Kommunledningskontoret", "KLK", "forvaltning", "Henrik Lindgren", true, 95],
  ["Socialförvaltningen", "SOC", "forvaltning", "Annika Bergström", true, 742],
  ["Barn- och utbildningsförvaltningen", "BUF", "forvaltning", "Peter Strand", true, 611],
  ["Samhällsbyggnadsförvaltningen", "SBF", "forvaltning", "Lisbeth Öman", true, 183],
  ["Ängsholms Vatten & Avfall AB", "ÄVA", "bolag", "Tobias Fredriksson", true, 64],
  ["Räddningstjänsten Ängsholm", "RTJ", "gemensam", "Jonas Hellström", true, 52],
  ["Ängsholmshem AB", "ÄHEM", "bolag", "Carina Nyberg", false, 48],
  ["Kultur- och fritidsförvaltningen", "KOF", "forvaltning", "Sofia Ek", false, 86],
];
const U = {};
for (const [namn, kortnamn, typ, chef, sv, anst] of unitRows) {
  U[kortnamn] = ins("units", { namn, kortnamn, typ, chef, samhallsviktig: sv, anstallda: anst });
}

/* ------------------------------------------------------------------ positions */
// [kortnamn, titel, niva, kritikalitet, platser, sakerhetsklass, uppgift]
const positionRows = [
  ["KLK", "Krisledningschef", "ledning", "A", 1, "2", "Leder kommunens krisledning och är ordförande i krisledningsstaben."],
  ["KLK", "Stabschef", "ledning", "A", 1, "2", "Driver stabsarbetet, stabsmetodik och dygnsrytm."],
  ["KLK", "Beredskapssamordnare", "ledning", "A", 1, "2", "Samordnar planering, övning och rapportering till länsstyrelsen."],
  ["KLK", "Säkerhetsskyddschef", "ledning", "A", 1, "1", "Ansvarar för säkerhetsskyddsanalys, registerkontroll och informationssäkerhet."],
  ["KLK", "Kommunikationsansvarig", "stab", "A", 1, "3", "Kriskommunikation, VMA-hantering och lägesbild till allmänheten."],
  ["KLK", "Lägesanalys och omvärldsbevakning", "stab", "B", 2, "3", "Sammanställer lägesbild, rapporterar i WIS."],
  ["KLK", "Stabsassistent", "stab", "B", 3, "ingen", "Dokumentation, loggföring och stabsstöd."],
  ["KLK", "Samverkansansvarig", "stab", "B", 1, "3", "Kontakt mot länsstyrelse, region, Polisen och frivilligorganisationer."],
  ["KLK", "Signalskyddschef", "stab", "A", 1, "2", "Ansvarar för signalskyddstjänst och kryptonycklar."],
  ["KLK", "Rakel- och sambandsansvarig", "operativ", "A", 2, "3", "Driftar Rakel-enheter, reservsamband och WIS-access."],
  ["KLK", "IT-driftansvarig", "operativ", "A", 2, "3", "Upprätthåller prioriterade IT-system vid avbrott."],
  ["KLK", "HR och personalförsörjning", "stab", "B", 1, "ingen", "Krigsplacering, tjänsteplikt och bemanningsplanering."],
  ["KLK", "POSOM-ledare", "stab", "B", 1, "ingen", "Leder psykiskt och socialt omhändertagande."],
  ["SOC", "Verksamhetschef vård och omsorg", "ledning", "A", 1, "3", "Prioriterar vårdinsatser vid resursbrist."],
  ["SOC", "Medicinskt ansvarig sjuksköterska", "ledning", "A", 1, "ingen", "Medicinsk prioritering och läkemedelsförsörjning."],
  ["SOC", "Enhetschef särskilt boende", "operativ", "A", 4, "ingen", "Driver boende vid el- och värmebortfall."],
  ["SOC", "Samordnare hemtjänst höjd beredskap", "operativ", "A", 2, "ingen", "Prioriterar brukarlista och trygghetslarm."],
  ["SOC", "Sjuksköterska i beredskap", "operativ", "A", 6, "ingen", "Dygnstäckande sjukvårdsberedskap."],
  ["SOC", "Socialjour", "operativ", "B", 2, "ingen", "Akut socialtjänst, mottagande av evakuerade."],
  ["BUF", "Skolchef", "ledning", "B", 1, "3", "Beslutar om stängning och omfördelning av skolverksamhet."],
  ["BUF", "Samordnare skolmåltider", "operativ", "A", 2, "ingen", "Uppehåller måltidsförsörjning till prioriterade grupper."],
  ["BUF", "Evakueringsansvarig lokaler", "operativ", "B", 3, "ingen", "Iordningställer skolor som evakueringsplatser."],
  ["SBF", "Teknisk chef", "ledning", "A", 1, "3", "Leder teknisk försörjning och fastighetsdrift."],
  ["SBF", "Drifttekniker reservkraft", "operativ", "A", 3, "ingen", "Startar, tankar och underhåller reservkraft."],
  ["SBF", "Lokalförsörjning och evakueringsplatser", "operativ", "B", 2, "ingen", "Fördelar lokaler för inkvartering."],
  ["SBF", "Väghållning och framkomlighet", "operativ", "B", 4, "ingen", "Säkrar framkomlighet för blåljus och transporter."],
  ["ÄVA", "Driftchef vatten", "ledning", "A", 1, "2", "Ansvarar för dricksvattenförsörjning vid störning."],
  ["ÄVA", "Operatör vattenverk", "operativ", "A", 4, "3", "Driver vattenverk i ö-drift."],
  ["ÄVA", "Nödvattensamordnare", "operativ", "A", 2, "ingen", "Verkställer nödvattenplan, tankar och tappställen."],
  ["ÄVA", "Samordnare avfall", "operativ", "C", 2, "ingen", "Upprätthåller renhållning av sanitära skäl."],
  ["RTJ", "Räddningschef i beredskap", "ledning", "A", 2, "3", "Räddningsledning dygnet runt."],
  ["RTJ", "Insatsledare", "operativ", "A", 2, "ingen", "Leder insatser på skadeplats."],
  ["RTJ", "Styrkeledare", "operativ", "A", 4, "ingen", "Leder räddningsstyrka."],
  ["ÄHEM", "Fastighetsjour", "operativ", "C", 2, "ingen", "Akuta fastighetsåtgärder i bostadsbestånd."],
  ["KOF", "Samordnare trygghetspunkt", "operativ", "B", 4, "ingen", "Driver trygghetspunkt med värme, vatten och information."],
];
const P = {};
for (const [kort, titel, niva, krit, platser, sk, uppgift] of positionRows) {
  P[kort + "|" + titel] = ins("positions", {
    unit_id: U[kort], titel, niva, kritikalitet: krit, platser, sakerhetsklass: sk, uppgift,
  });
}

/* --------------------------------------------------------------------- people */
// [namn, kortnamn, befattning_fred, pnr, { fm, plikt, sk, rk, risk, not }]
const peopleRows = [
  ["Henrik Lindgren", "KLK", "Kommundirektör", "19690214-XXXX", { sk: "2", rk: "klar" }],
  ["Marika Öhlund", "KLK", "Beredskapssamordnare", "19810412-XXXX", { sk: "2", rk: "klar" }],
  ["Daniel Sjögren", "KLK", "Kanslichef", "19750930-XXXX", { sk: "2", rk: "klar" }],
  ["Elin Hagström", "KLK", "Kommunikationschef", "19880605-XXXX", { sk: "3", rk: "klar" }],
  ["Pontus Ahlberg", "KLK", "Säkerhetssamordnare", "19790118-XXXX", { sk: "1", rk: "klar" }],
  ["Nina Ramberg", "KLK", "Kommunikatör", "19930727-XXXX", { sk: "3", rk: "begard" }],
  ["Oskar Wiklund", "KLK", "Utredare", "19860303-XXXX", { sk: "3", rk: "klar" }],
  ["Hanna Ljung", "KLK", "Registrator", "19910812-XXXX", {}],
  ["Fredrik Enberg", "KLK", "Nämndsekreterare", "19780523-XXXX", {}],
  ["Sara Molin", "KLK", "HR-chef", "19830209-XXXX", {}],
  ["Jens Åkerlund", "KLK", "IT-chef", "19770716-XXXX", { sk: "3", rk: "utgangen" }],
  ["Viktor Sandell", "KLK", "Systemtekniker", "19950104-XXXX", { fm: true, sk: "3", rk: "klar", not: "Krigsplacerad vid förband, Försvarsmakten." }],
  ["Linnea Falk", "KLK", "Systemtekniker", "19900621-XXXX", { sk: "3", rk: "klar" }],
  ["Mattias Bohlin", "KLK", "Telefonitekniker", "19841212-XXXX", { sk: "3", rk: "begard" }],
  ["Karin Wessman", "KLK", "Kurator, POSOM", "19740408-XXXX", {}],
  ["Johan Rydell", "KLK", "Kommunjurist", "19820917-XXXX", {}],
  ["Annika Bergström", "SOC", "Socialchef", "19710305-XXXX", { sk: "3", rk: "klar" }],
  ["Ingrid Palm", "SOC", "Medicinskt ansvarig sjuksköterska", "19680722-XXXX", {}],
  ["Camilla Nordin", "SOC", "Verksamhetschef äldreomsorg", "19760511-XXXX", {}],
  ["Petra Lindvall", "SOC", "Enhetschef Solgläntan", "19870228-XXXX", {}],
  ["Said Hamdi", "SOC", "Enhetschef Björkbacken", "19890914-XXXX", {}],
  ["Gunilla Tornberg", "SOC", "Enhetschef Ekhöjden", "19660130-XXXX", {}],
  ["Robin Kjellberg", "SOC", "Enhetschef Lindgården", "19920406-XXXX", { plikt: "Hemvärnet", not: "Avtal med Hemvärnet, samråd krävs." }],
  ["Maria Östlund", "SOC", "Samordnare hemtjänst", "19800819-XXXX", {}],
  ["Jessica Boman", "SOC", "Samordnare hemtjänst", "19851127-XXXX", {}],
  ["Anders Fält", "SOC", "Sjuksköterska", "19731008-XXXX", {}],
  ["Lovisa Hjelm", "SOC", "Sjuksköterska", "19940215-XXXX", {}],
  ["Emma Söderqvist", "SOC", "Sjuksköterska", "19900502-XXXX", {}],
  ["Niklas Berg", "SOC", "Sjuksköterska", "19831121-XXXX", { fm: true, not: "Krigsplacerad i Försvarsmaktens sjukvårdsförband." }],
  ["Tove Hallberg", "SOC", "Sjuksköterska", "19961003-XXXX", {}],
  ["Leif Nordgren", "SOC", "Socialsekreterare", "19700916-XXXX", {}],
  ["Amanda Rehn", "SOC", "Socialsekreterare", "19910328-XXXX", {}],
  ["Peter Strand", "BUF", "Skolchef", "19720624-XXXX", { sk: "3", rk: "klar" }],
  ["Ulrika Dahl", "BUF", "Kostchef", "19781105-XXXX", {}],
  ["Mikael Åström", "BUF", "Köksmästare", "19860712-XXXX", {}],
  ["Zara Nilsson", "BUF", "Rektor Centralskolan", "19820401-XXXX", {}],
  ["Håkan Isaksson", "BUF", "Fastighetsvärd", "19690203-XXXX", {}],
  ["Patrik Sjölin", "BUF", "Fastighetsvärd", "19930619-XXXX", {}],
  ["Lisbeth Öman", "SBF", "Samhällsbyggnadschef", "19700429-XXXX", { sk: "3", rk: "klar" }],
  ["Rickard Hult", "SBF", "Teknisk chef", "19751014-XXXX", { sk: "3", rk: "klar" }],
  ["Björn Lagerqvist", "SBF", "Drifttekniker", "19810726-XXXX", {}],
  ["Samuel Ohlsson", "SBF", "Drifttekniker", "19900308-XXXX", {}],
  ["Kenneth Vikman", "SBF", "Drifttekniker", "19641209-XXXX", { risk: true, not: "Uppnår pensionsålder under mandatperioden." }],
  ["Therese Almqvist", "SBF", "Lokalstrateg", "19880130-XXXX", {}],
  ["Dennis Krantz", "SBF", "Arbetsledare gata", "19790605-XXXX", {}],
  ["Marcus Thelin", "SBF", "Maskinförare", "19921117-XXXX", { plikt: "Civilplikt räddningstjänst" }],
  ["Jimmy Olander", "SBF", "Maskinförare", "19870922-XXXX", {}],
  ["Alexander Rosén", "SBF", "Maskinförare", "19950830-XXXX", { fm: true, not: "Krigsplacerad, Försvarsmakten." }],
  ["Tobias Fredriksson", "ÄVA", "VD", "19740817-XXXX", { sk: "2", rk: "klar" }],
  ["Jörgen Sandström", "ÄVA", "Driftchef", "19691126-XXXX", { sk: "2", rk: "klar" }],
  ["Emil Sundberg", "ÄVA", "Driftoperatör", "19910215-XXXX", { sk: "3", rk: "klar" }],
  ["Petter Lundell", "ÄVA", "Driftoperatör", "19860704-XXXX", { sk: "3", rk: "begard" }],
  ["Ida Carlström", "ÄVA", "Driftoperatör", "19940511-XXXX", { sk: "3", rk: "klar" }],
  ["Lennart Björk", "ÄVA", "Rörnätstekniker", "19651003-XXXX", {}],
  ["Sanna Ekvall", "ÄVA", "Miljöingenjör", "19890926-XXXX", {}],
  ["Jonas Hellström", "RTJ", "Räddningschef", "19731219-XXXX", { sk: "3", rk: "klar" }],
  ["Martin Åhlin", "RTJ", "Ställföreträdande räddningschef", "19800208-XXXX", { sk: "3", rk: "klar" }],
  ["Erik Bjurling", "RTJ", "Insatsledare", "19851030-XXXX", {}],
  ["Tomas Grip", "RTJ", "Styrkeledare", "19790411-XXXX", {}],
  ["Felix Norling", "RTJ", "Styrkeledare", "19930723-XXXX", {}],
  ["Jonna Wikander", "RTJ", "Styrkeledare", "19910107-XXXX", {}],
  ["Carina Nyberg", "ÄHEM", "VD", "19760913-XXXX", {}],
  ["Roger Täpp", "ÄHEM", "Fastighetstekniker", "19820517-XXXX", {}],
  ["Sofia Ek", "KOF", "Kultur- och fritidschef", "19840620-XXXX", {}],
  ["Malin Kjellin", "KOF", "Fritidsutvecklare", "19900415-XXXX", {}],
  ["Adrian Fors", "KOF", "Anläggningsansvarig", "19871208-XXXX", {}],
  ["Ebba Lindholm", "KOF", "Bibliotekarie", "19950222-XXXX", {}],
];
const PE = {};
for (const [namn, kort, bef, pnr, f] of peopleRows) {
  const first = namn.split(" ")[0].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const last = namn.split(" ")[1].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  PE[namn] = ins("people", {
    namn, pnr_maskerat: pnr, unit_id: U[kort], befattning_fred: bef,
    epost: `${first}.${last}@angsholm.se`,
    telefon: "0152-3" + String(10000 + Math.floor(Math.random() * 89999)).slice(0, 5),
    anstallningsform: "tillsvidare",
    fm_krigsplacerad: !!f.fm,
    annan_plikt: f.plikt || "",
    sakerhetsklass: f.sk || "ingen",
    registerkontroll: f.rk || "ej_aktuell",
    bortrest_risk: !!f.risk,
    noteringar: f.not || "",
  });
}

/* ----------------------------------------------------------------- placements */
// [positionsnyckel, personnamn, status, beslutsdatum, anmärkning]
const placementRows = [
  ["KLK|Krisledningschef", "Henrik Lindgren", "underrattad", "2026-03-12", ""],
  ["KLK|Stabschef", "Daniel Sjögren", "underrattad", "2026-03-12", ""],
  ["KLK|Beredskapssamordnare", "Marika Öhlund", "underrattad", "2026-03-12", ""],
  ["KLK|Säkerhetsskyddschef", "Pontus Ahlberg", "underrattad", "2026-03-12", ""],
  ["KLK|Kommunikationsansvarig", "Elin Hagström", "underrattad", "2026-03-12", ""],
  ["KLK|Lägesanalys och omvärldsbevakning", "Oskar Wiklund", "beslutad", "2026-06-04", ""],
  ["KLK|Lägesanalys och omvärldsbevakning", "Nina Ramberg", "foreslagen", null, "Avvaktar registerkontroll."],
  ["KLK|Stabsassistent", "Hanna Ljung", "underrattad", "2026-03-12", ""],
  ["KLK|Stabsassistent", "Fredrik Enberg", "beslutad", "2026-06-04", ""],
  ["KLK|Samverkansansvarig", "Sara Molin", "beslutad", "2026-06-04", ""],
  ["KLK|Rakel- och sambandsansvarig", "Mattias Bohlin", "foreslagen", null, "Signalskyddsutbildning ej genomförd."],
  ["KLK|IT-driftansvarig", "Jens Åkerlund", "beslutad", "2026-06-04", "Registerkontroll utgången – ska förnyas."],
  ["KLK|Rakel- och sambandsansvarig", "Viktor Sandell", "foreslagen", null, "Föreslagen av IT-chef, ej kontrollerad mot Försvarsmakten."],
  ["KLK|IT-driftansvarig", "Linnea Falk", "underrattad", "2026-03-12", ""],
  ["KLK|HR och personalförsörjning", "Sara Molin", "foreslagen", null, "Dubbelplacerad, ska lösas."],
  ["KLK|POSOM-ledare", "Karin Wessman", "underrattad", "2026-03-12", ""],
  ["SOC|Verksamhetschef vård och omsorg", "Annika Bergström", "underrattad", "2026-03-12", ""],
  ["SOC|Medicinskt ansvarig sjuksköterska", "Ingrid Palm", "underrattad", "2026-03-12", ""],
  ["SOC|Enhetschef särskilt boende", "Petra Lindvall", "beslutad", "2026-06-04", ""],
  ["SOC|Enhetschef särskilt boende", "Said Hamdi", "beslutad", "2026-06-04", ""],
  ["SOC|Enhetschef särskilt boende", "Gunilla Tornberg", "beslutad", "2026-06-04", ""],
  ["SOC|Samordnare hemtjänst höjd beredskap", "Maria Östlund", "underrattad", "2026-03-12", ""],
  ["SOC|Samordnare hemtjänst höjd beredskap", "Jessica Boman", "beslutad", "2026-06-04", ""],
  ["SOC|Sjuksköterska i beredskap", "Anders Fält", "beslutad", "2026-06-04", ""],
  ["SOC|Sjuksköterska i beredskap", "Lovisa Hjelm", "beslutad", "2026-06-04", ""],
  ["SOC|Sjuksköterska i beredskap", "Emma Söderqvist", "foreslagen", null, ""],
  ["SOC|Sjuksköterska i beredskap", "Tove Hallberg", "foreslagen", null, ""],
  ["SOC|Sjuksköterska i beredskap", "Niklas Berg", "foreslagen", null, ""],
  ["SOC|Socialjour", "Leif Nordgren", "beslutad", "2026-06-04", ""],
  ["SOC|Socialjour", "Amanda Rehn", "foreslagen", null, ""],
  ["BUF|Skolchef", "Peter Strand", "underrattad", "2026-03-12", ""],
  ["BUF|Samordnare skolmåltider", "Ulrika Dahl", "underrattad", "2026-03-12", ""],
  ["BUF|Samordnare skolmåltider", "Mikael Åström", "beslutad", "2026-06-04", ""],
  ["BUF|Evakueringsansvarig lokaler", "Håkan Isaksson", "beslutad", "2026-06-04", ""],
  ["BUF|Evakueringsansvarig lokaler", "Patrik Sjölin", "foreslagen", null, ""],
  ["SBF|Teknisk chef", "Rickard Hult", "underrattad", "2026-03-12", ""],
  ["SBF|Drifttekniker reservkraft", "Björn Lagerqvist", "beslutad", "2026-06-04", ""],
  ["SBF|Drifttekniker reservkraft", "Samuel Ohlsson", "beslutad", "2026-06-04", ""],
  ["SBF|Drifttekniker reservkraft", "Kenneth Vikman", "beslutad", "2026-06-04", "Pensionsavgång – ersättare saknas."],
  ["SBF|Lokalförsörjning och evakueringsplatser", "Therese Almqvist", "beslutad", "2026-06-04", ""],
  ["SBF|Väghållning och framkomlighet", "Dennis Krantz", "beslutad", "2026-06-04", ""],
  ["SBF|Väghållning och framkomlighet", "Marcus Thelin", "foreslagen", null, "Har civilplikt räddningstjänst – samråd krävs."],
  ["SBF|Väghållning och framkomlighet", "Jimmy Olander", "beslutad", "2026-06-04", ""],
  ["SBF|Väghållning och framkomlighet", "Alexander Rosén", "foreslagen", null, ""],
  ["ÄVA|Driftchef vatten", "Jörgen Sandström", "underrattad", "2026-03-12", ""],
  ["ÄVA|Operatör vattenverk", "Emil Sundberg", "underrattad", "2026-03-12", ""],
  ["ÄVA|Operatör vattenverk", "Petter Lundell", "foreslagen", null, "Registerkontroll begärd 2026-09-30."],
  ["ÄVA|Operatör vattenverk", "Ida Carlström", "beslutad", "2026-06-04", ""],
  ["ÄVA|Nödvattensamordnare", "Lennart Björk", "beslutad", "2026-06-04", ""],
  ["ÄVA|Samordnare avfall", "Sanna Ekvall", "beslutad", "2026-06-04", ""],
  ["RTJ|Räddningschef i beredskap", "Jonas Hellström", "underrattad", "2026-03-12", ""],
  ["RTJ|Räddningschef i beredskap", "Martin Åhlin", "underrattad", "2026-03-12", ""],
  ["RTJ|Insatsledare", "Erik Bjurling", "beslutad", "2026-06-04", ""],
  ["RTJ|Styrkeledare", "Tomas Grip", "beslutad", "2026-06-04", ""],
  ["RTJ|Styrkeledare", "Felix Norling", "beslutad", "2026-06-04", ""],
  ["RTJ|Styrkeledare", "Jonna Wikander", "beslutad", "2026-06-04", ""],
  ["ÄHEM|Fastighetsjour", "Roger Täpp", "beslutad", "2026-06-04", ""],
  ["KOF|Samordnare trygghetspunkt", "Sofia Ek", "beslutad", "2026-06-04", ""],
  ["KOF|Samordnare trygghetspunkt", "Malin Kjellin", "foreslagen", null, ""],
  ["KOF|Samordnare trygghetspunkt", "Adrian Fors", "foreslagen", null, ""],
];
for (const [pos, person, status, datum, anm] of placementRows) {
  ins("placements", {
    position_id: P[pos], person_id: PE[person], status,
    beslutsdatum: datum, beslut_av: datum ? "Kommundirektör, beslut KS 2026/184" : "",
    underrattad: status === "underrattad", anmarkning: anm,
  });
}

/* ---------------------------------------------------------------------- risks */
// [namn, kategori, S, K, ägare, kortnamn, status, beskrivning, höjdBeredskap]
const riskRows = [
  ["Långvarigt elavbrott vintertid", "teknisk", 3, 5, "Rickard Hult", "SBF", "atgardas",
   "Avbrott över 24 timmar vid temperatur under -10 °C. Påverkar värme, vatten, vård och samband samtidigt.", true],
  ["Avbrott i dricksvattenförsörjningen", "teknisk", 3, 5, "Jörgen Sandström", "ÄVA", "atgardas",
   "Haveri i Ängsåsens vattenverk eller förorenad råvattentäkt. Nödvattenbehov cirka 5 liter per person och dygn.", true],
  ["Cyberangrepp mot kommunens IT-drift", "antagonistisk", 4, 4, "Jens Åkerlund", "KLK", "atgardas",
   "Ransomware eller intrång som slår ut verksamhetssystem, journalsystem och lönehantering.", true],
  ["Bortfall av elektronisk kommunikation", "teknisk", 3, 4, "Jens Åkerlund", "KLK", "bedomd",
   "Avbrott i mobilnät och fast nät. Trygghetslarm och larmvägar påverkas.", true],
  ["Personalbortfall vid pandemi", "halsa", 3, 4, "Annika Bergström", "SOC", "bedomd",
   "Frånvaro över 25 procent i vård och omsorg under flera veckor.", false],
  ["Störning i livsmedelsförsörjning", "forsorjning", 3, 4, "Ulrika Dahl", "BUF", "atgardas",
   "Uteblivna leveranser till kök och boenden. Nuvarande lagerhållning cirka tre dygn.", true],
  ["Drivmedelsbrist", "forsorjning", 3, 5, "Rickard Hult", "SBF", "atgardas",
   "Ransonering eller leveransstopp. Reservkraft, hemtjänstfordon och räddningstjänst påverkas.", true],
  ["Skyfall och översvämning i Ängsåns dalgång", "naturhandelse", 4, 3, "Lisbeth Öman", "SBF", "atgardas",
   "Översvämning av Centralskolan, reningsverkets pumpstation och väg 571.", false],
  ["Omfattande skogsbrand", "naturhandelse", 3, 3, "Jonas Hellström", "RTJ", "bedomd",
   "Brand i Mörtsjöskogen med behov av evakuering av cirka 400 personer.", false],
  ["Värmebölja", "naturhandelse", 4, 3, "Annika Bergström", "SOC", "bedomd",
   "Över 26 °C inomhus i särskilda boenden under mer än fem dygn.", false],
  ["Sabotage mot vattenverk eller reservkraft", "antagonistisk", 2, 5, "Pontus Ahlberg", "KLK", "atgardas",
   "Fysiskt angrepp mot anläggning med svagt skalskydd och utan kameraövervakning.", true],
  ["Påverkanskampanj och desinformation", "antagonistisk", 4, 3, "Elin Hagström", "KLK", "bedomd",
   "Riktad desinformation som undergräver förtroendet för kommunens information vid kris.", true],
  ["Massflykt och mottagande av evakuerade", "forsorjning", 2, 4, "Annika Bergström", "SOC", "identifierad",
   "Mottagande av upp till 1 500 personer med behov av inkvartering och mat.", true],
  ["Bortfall av betalningssystem", "teknisk", 3, 3, "Daniel Sjögren", "KLK", "identifierad",
   "Kort- och Swishbetalningar ur funktion. Behov av kontanthantering och manuella rutiner.", true],
  ["Farligt godsolycka på väg 571", "teknisk", 2, 4, "Jonas Hellström", "RTJ", "bedomd",
   "Utsläpp som kräver inomhusvistelse i Näsby och avstängning av genomfartsväg.", false],
];
const R = {};
for (const [namn, kategori, s, k, agare, kort, status, beskrivning, hb] of riskRows) {
  R[namn] = ins("risks", {
    namn, kategori, beskrivning, sannolikhet: s, konsekvens: k, agare,
    unit_id: U[kort], status, senast_bedomd: "2026-09-18", hojd_beredskap: hb,
  });
}

/* --------------------------------------------------- kritiska funktioner + beroenden */
// [kortnamn, namn, prio, mtpd, faktisk, planstatus, plandatum, brukare, beskrivning]
const fnRows = [
  ["ÄVA", "Dricksvattenproduktion och distribution", 1, 4, 12, "faststalld", "2026-04-15", 31420,
   "Produktion vid Ängsåsens vattenverk samt distribution till tätort och tre ytterområden."],
  ["SOC", "Särskilt boende, dygnsomsorg", 1, 6, 6, "faststalld", "2026-02-20", 214,
   "Fyra boenden med sammanlagt 214 platser, varav 46 med medicinteknisk utrustning."],
  ["SOC", "Hemtjänst och trygghetslarm", 1, 4, 10, "utkast", null, 612,
   "Insatser i ordinärt boende samt 388 trygghetslarm beroende av el och mobilnät."],
  ["RTJ", "Räddningstjänst och larmmottagning", 1, 2, 2, "faststalld", "2026-05-30", 31420,
   "Heltidsstyrka i Ängsholm och deltidsstyrka i Näsby."],
  ["KLK", "Krisledning och lägesbild", 1, 4, 4, "faststalld", "2026-06-11", 31420,
   "Stabsarbete, samband via Rakel och rapportering i WIS."],
  ["KLK", "IT-drift för prioriterade system", 1, 4, 24, "utkast", null, 31420,
   "Verksamhetssystem för vård, skola, lön och diarium i egen serverhall."],
  ["ÄVA", "Avloppsrening och pumpstationer", 2, 24, 20, "faststalld", "2026-03-28", 31420,
   "Reningsverk samt 24 pumpstationer, varav 6 utan reservkraftanslutning."],
  ["SBF", "Värmeförsörjning i kommunala lokaler", 1, 6, 18, "utkast", null, 4800,
   "Fjärrvärme till skolor, boenden och trygghetspunkter."],
  ["BUF", "Måltidsförsörjning", 2, 24, 20, "faststalld", "2026-01-30", 3900,
   "Produktionskök i Centralskolan och fyra mottagningskök."],
  ["BUF", "Förskola och skola", 3, 48, 48, "utgangen", "2023-09-12", 3450,
   "Nio förskolor och fem grundskolor."],
  ["SBF", "Framkomlighet på prioriterat vägnät", 2, 8, 14, "saknas", null, 31420,
   "Snöröjning och röjning av 62 km prioriterat vägnät för blåljus och transporter."],
  ["KOF", "Trygghetspunkter", 2, 24, 48, "saknas", null, 31420,
   "Fyra planerade trygghetspunkter med värme, vatten, laddning och information."],
];
const F = {};
for (const [kort, namn, prio, mtpd, faktisk, ps, pd, brukare, beskrivning] of fnRows) {
  F[namn] = ins("critical_functions", {
    unit_id: U[kort], namn, beskrivning, prioritet: prio, mtpd_timmar: mtpd,
    faktisk_timmar: faktisk, plan_status: ps, plan_datum: pd, berorda_brukare: brukare,
  });
}

// [funktionsnamn, typ, beskrivning, reservlösning, sårbarhet]
const depRows = [
  ["Dricksvattenproduktion och distribution", "el", "Vattenverkets processtyrning och högtryckspumpar", "Fast reservkraft 400 kVA, testas kvartalsvis", 2],
  ["Dricksvattenproduktion och distribution", "it", "SCADA-system för processtyrning", "Manuell drift möjlig i begränsad omfattning", 4],
  ["Dricksvattenproduktion och distribution", "leverantor", "Leverans av fällningskemikalier", "Lager för 10 dygn", 4],
  ["Dricksvattenproduktion och distribution", "personal", "Fyra certifierade driftoperatörer", "Avtal med nabokommun ej tecknat", 4],
  ["Särskilt boende, dygnsomsorg", "el", "Belysning, larm, hiss och medicinteknisk utrustning", "Mobil reservkraft till tre av fyra boenden", 3],
  ["Särskilt boende, dygnsomsorg", "varme", "Fjärrvärme", "Inga värmeaggregat upphandlade", 4],
  ["Särskilt boende, dygnsomsorg", "personal", "Nattbemanning sjuksköterska", "Beredskapslista, ej övad", 3],
  ["Särskilt boende, dygnsomsorg", "livsmedel", "Daglig leverans från produktionskök", "Lager för 3 dygn", 3],
  ["Hemtjänst och trygghetslarm", "it", "Trygghetslarm över mobilnät", "Ingen reservväg, 388 larm påverkas", 5],
  ["Hemtjänst och trygghetslarm", "transport", "28 hemtjänstfordon", "Drivmedelslager 1 500 liter", 3],
  ["Hemtjänst och trygghetslarm", "personal", "Personal med körkort och nyckelansvar", "Prioriterad brukarlista finns, uppdaterad 2025", 3],
  ["Räddningstjänst och larmmottagning", "el", "Brandstation med fast reservkraft", "Fast aggregat 150 kVA", 1],
  ["Räddningstjänst och larmmottagning", "it", "Larmvägar via SOS Alarm", "Rakel som reservväg", 2],
  ["Räddningstjänst och larmmottagning", "drivmedel", "Släckbilar och tankbil", "Egen tank 3 000 liter diesel", 2],
  ["Krisledning och lägesbild", "el", "Ledningsplats i kommunhuset", "Reservkraft 250 kVA, dieselförråd 24 timmar", 3],
  ["Krisledning och lägesbild", "it", "WIS och Rakel", "Satellittelefon, 2 enheter", 2],
  ["Krisledning och lägesbild", "personal", "Stabsutbildad personal i tre skift", "Endast ett skift fullt utbildat", 4],
  ["IT-drift för prioriterade system", "el", "Serverhall i kommunhuset", "UPS 30 minuter, ansluten till reservkraft", 3],
  ["IT-drift för prioriterade system", "leverantor", "Extern drift av journalsystem", "Avtalet saknar krav för höjd beredskap", 5],
  ["IT-drift för prioriterade system", "personal", "Två systemtekniker", "En av dem krigsplacerad i Försvarsmakten", 5],
  ["Avloppsrening och pumpstationer", "el", "24 pumpstationer", "6 stationer saknar reservkraftanslutning", 4],
  ["Värmeförsörjning i kommunala lokaler", "el", "Cirkulationspumpar och styrning", "Reservkraft saknas vid tre undercentraler", 4],
  ["Värmeförsörjning i kommunala lokaler", "drivmedel", "Flis och olja till värmeverk", "Flislager 14 dygn", 3],
  ["Måltidsförsörjning", "el", "Produktionskök", "Mobil reservkraft kan anslutas", 3],
  ["Måltidsförsörjning", "vatten", "Vatten till matlagning och disk", "Nödvattentankar vid kök", 3],
  ["Måltidsförsörjning", "livsmedel", "Grossistleverans två gånger per vecka", "Beredskapslager 3 dygn, mål 7 dygn", 4],
  ["Förskola och skola", "varme", "Fjärrvärme till 14 enheter", "Stängning vid längre avbrott", 3],
  ["Framkomlighet på prioriterat vägnät", "drivmedel", "Entreprenörens maskiner", "Krav på drivmedelsberedskap saknas i avtal", 4],
  ["Framkomlighet på prioriterat vägnät", "leverantor", "Upphandlad snöröjningsentreprenör", "Ingen reservleverantör", 4],
  ["Trygghetspunkter", "el", "Värme, laddning och belysning", "Mobil reservkraft ej avsatt för ändamålet", 4],
  ["Trygghetspunkter", "vatten", "Tappställen för nödvatten", "Tankar finns, utkörningsplan saknas", 3],
];
for (const [fn, typ, beskrivning, reserv, sarbarhet] of depRows) {
  ins("dependencies", { function_id: F[fn], typ, beskrivning, reservlosning: reserv, sarbarhet });
}

/* ------------------------------------------------------------------- resources */
// [kategori, benämning, kapacitet, antal, enhet, placering, kortnamn, status, sista, nästa, ansvarig, not]
const resourceRows = [
  ["reservkraft", "Fast reservkraftaggregat, kommunhuset", "250 kVA", 1, "st", "Kommunhuset, Storgatan 12", "SBF", "driftklar", "2026-09-04", "2026-12-04", "Björn Lagerqvist", "Provkörs kvartalsvis med last."],
  ["reservkraft", "Fast reservkraftaggregat, Ängsåsens vattenverk", "400 kVA", 1, "st", "Ängsåsens vattenverk", "ÄVA", "driftklar", "2026-08-21", "2026-11-21", "Jörgen Sandström", ""],
  ["reservkraft", "Fast reservkraftaggregat, brandstationen", "150 kVA", 1, "st", "Brandstationen Ängsholm", "RTJ", "driftklar", "2026-09-29", "2026-12-29", "Martin Åhlin", ""],
  ["reservkraft", "Fast reservkraftaggregat, Solgläntan", "80 kVA", 1, "st", "Solgläntans äldreboende", "SOC", "service", "2026-06-12", "2026-11-05", "Samuel Ohlsson", "Startbatteri bytt, provkörning återstår."],
  ["reservkraft", "Mobilt reservkraftaggregat på släp", "100 kVA", 2, "st", "Förrådet Verkstadsgatan 4", "SBF", "driftklar", "2026-09-04", "2026-12-04", "Björn Lagerqvist", "Kräver behörig elektriker för inkoppling."],
  ["reservkraft", "Mobilt reservkraftaggregat", "40 kVA", 3, "st", "Förrådet Verkstadsgatan 4", "SBF", "ur_drift", "2026-05-18", "2026-11-18", "Kenneth Vikman", "Ett aggregat har trasig generator, väntar på reservdel."],
  ["reservkraft", "Elanslutningspunkter för mobil reservkraft", "Dokumenterade uttag", 9, "st", "Prioriterade fastigheter", "SBF", "okand", null, null, "Therese Almqvist", "Inventering ej slutförd, 6 av 15 fastigheter saknar uttag."],
  ["drivmedel", "Dieseltank, kommunens förråd", "6 000 liter", 6000, "liter", "Verkstadsgatan 4", "SBF", "driftklar", "2026-10-01", "2027-01-01", "Dennis Krantz", "Räcker cirka 36 timmar vid full reservkraftdrift."],
  ["drivmedel", "Dieseltank, brandstationen", "3 000 liter", 3000, "liter", "Brandstationen Ängsholm", "RTJ", "driftklar", "2026-10-01", "2027-01-01", "Martin Åhlin", ""],
  ["drivmedel", "Dieseltank, vattenverket", "2 000 liter", 2000, "liter", "Ängsåsens vattenverk", "ÄVA", "driftklar", "2026-09-15", "2026-12-15", "Jörgen Sandström", ""],
  ["drivmedel", "Avtal om drivmedelsleverans vid höjd beredskap", "Ej tecknat", 0, "avtal", "—", "SBF", "ur_drift", null, null, "Lisbeth Öman", "Upphandling planerad 2027."],
  ["vatten", "Nödvattentank på släp", "10 m³", 2, "st", "Ängsåsens vattenverk", "ÄVA", "driftklar", "2026-07-03", "2027-07-03", "Lennart Björk", ""],
  ["vatten", "Nödvattentank", "1 m³", 14, "st", "Förrådet Verkstadsgatan 4", "ÄVA", "driftklar", "2026-07-03", "2027-07-03", "Lennart Björk", "Avsedda för boenden och kök."],
  ["vatten", "Dunkar för utdelning till hushåll", "10 liter", 450, "st", "Förrådet Verkstadsgatan 4", "ÄVA", "driftklar", "2026-07-03", "2027-07-03", "Lennart Björk", "Behov enligt nödvattenplan: 1 200 st."],
  ["samband", "Rakel-handenheter", "RA 4", 24, "st", "Fördelade på förvaltningar", "KLK", "driftklar", "2026-09-10", "2026-12-10", "Mattias Bohlin", "Fyra enheter saknar aktuell programmering."],
  ["samband", "Rakel-fordonsstationer", "RA 2", 9, "st", "Fordon SBF, RTJ, ÄVA", "KLK", "driftklar", "2026-09-10", "2026-12-10", "Mattias Bohlin", ""],
  ["samband", "Satellittelefon", "Iridium", 2, "st", "Ledningsplatsen kommunhuset", "KLK", "service", "2026-04-22", "2026-10-31", "Jens Åkerlund", "Abonnemang förfaller 2026-10-31."],
  ["samband", "Reservkraftförsörjd WIS-arbetsplats", "2 platser", 2, "st", "Ledningsplatsen kommunhuset", "KLK", "driftklar", "2026-06-11", "2026-12-11", "Oskar Wiklund", ""],
  ["samband", "Högtalarbil för information", "—", 1, "st", "Brandstationen Ängsholm", "RTJ", "driftklar", "2026-08-14", "2027-02-14", "Erik Bjurling", ""],
  ["varme", "Mobila värmeaggregat", "25 kW", 4, "st", "Förrådet Verkstadsgatan 4", "SBF", "driftklar", "2026-09-04", "2027-03-04", "Samuel Ohlsson", "Täcker inte behovet vid fyra trygghetspunkter."],
  ["varme", "Fältkök", "200 portioner", 2, "st", "Civilförsvarsförrådet Näsby", "BUF", "okand", "2019-05-02", null, "Ulrika Dahl", "Status ej kontrollerad sedan 2019."],
  ["livsmedel", "Beredskapslager livsmedel", "3 dygn", 3, "dygn", "Produktionsköket Centralskolan", "BUF", "driftklar", "2026-10-02", "2027-01-02", "Ulrika Dahl", "Mål enligt plan: 7 dygn."],
  ["livsmedel", "Dieseldrivet reservkök", "—", 0, "st", "—", "BUF", "ur_drift", null, null, "Ulrika Dahl", "Saknas helt. Åtgärd beslutad."],
  ["sjukvard", "Förbrukningsmaterial vård", "7 dygn", 7, "dygn", "Centralförrådet SOC", "SOC", "driftklar", "2026-09-26", "2026-12-26", "Ingrid Palm", ""],
  ["sjukvard", "Syrgastuber", "—", 18, "st", "Fördelade på boenden", "SOC", "driftklar", "2026-09-26", "2027-03-26", "Ingrid Palm", ""],
  ["fordon", "Terrängfordon med lastkapacitet", "—", 2, "st", "Verkstadsgatan 4", "SBF", "driftklar", "2026-09-20", "2027-03-20", "Dennis Krantz", ""],
  ["fordon", "Minibussar för evakuering", "16 platser", 3, "st", "KOF och BUF", "KOF", "driftklar", "2026-08-30", "2027-02-28", "Adrian Fors", ""],
];
for (const [kategori, benamning, kapacitet, antal, enhet, placering, kort, status, sista, nasta, ansvarig, not] of resourceRows) {
  ins("resources", {
    kategori, benamning, kapacitet, antal, enhet, placering, unit_id: U[kort],
    status, sista_kontroll: sista, nasta_kontroll: nasta, ansvarig, noteringar: not,
  });
}

/* ------------------------------------------------------------------- exercises */
const exerciseRows = [
  ["Stabsövning Vinterstorm", "simulering", "2026-02-11", "utvarderad", "Krisledningsstaben", 23,
   "Elavbrott 36 timmar i hela kommunen vid -14 °C, samtidigt bortfall av mobilnät.", "LEH-UTB",
   "Stabsmetodiken fungerade. Brister: lägesbilden delades inte med bolagen, och endast ett stabsskift kunde bemannas."],
  ["Larmövning inkallelse krisledning", "larmovning", "2026-05-06", "utvarderad", "Krisledningsnämnd och stab", 31,
   "Oannonserad inkallelse på kvällstid. Mål: 70 procent på plats inom 90 minuter.", "LEH-UTB",
   "58 procent på plats inom 90 minuter. Fyra personer saknade aktuella kontaktuppgifter."],
  ["Seminarieövning Nödvatten", "seminarium", "2026-09-17", "utvarderad", "ÄVA, SOC, BUF, RTJ", 18,
   "Bortfall av dricksvatten i tätorten i fem dygn.", "OK-KONT",
   "Utkörningsplan för nödvatten saknas. Antalet dunkar täcker cirka 38 procent av behovet."],
  ["Utbildning krigsorganisation och tjänsteplikt", "utbildning", "2026-11-19", "planerad", "Chefer och nyckelpersonal", 0,
   "Genomgång av krigsorganisation, krigsplacering, allmän tjänsteplikt och säkerhetsskydd.", "TF-KRIGSPL", ""],
  ["Samverkansövning med länsstyrelsen", "simulering", "2027-03-24", "planerad", "Stab och samverkansansvarig", 0,
   "Höjd beredskap med störd elförsörjning och mottagande av evakuerade.", "LEH-SAMV", ""],
  ["Fältövning Trygghetspunkt Näsby", "faltovning", "2027-05-13", "planerad", "KOF, SBF, frivilligorganisationer", 0,
   "Upprättande och drift av trygghetspunkt i 24 timmar utan nätel.", "OK-KONT", ""],
];
for (const [namn, typ, datum, status, malgrupp, deltagare, scenario, krav, erf] of exerciseRows) {
  ins("exercises", { namn, typ, datum, status, malgrupp, deltagare, scenario, forankrad_lagkrav: krav, erfarenheter: erf });
}

/* ------------------------------------------------------------- kravkatalogen */
// Lagrum, intervall och förfallodatum är kontrollerade mot författningstexten
// i oktober 2026. Varje rad bär källhänvisning och rättslig status, eftersom
// regelverket på området är under omarbetning.
const LEH_UPPHOR =
  "LEH föreslås upphöra och ersättas av lagen om kommuners och regioners " +
  "grundläggande beredskap (LKRB) den 1 januari 2027 enligt prop. 2026/27:5. " +
  "Kravet förs vidare i ny form. Riksdagen hade inte fattat beslut när detta " +
  "underlag sammanställdes.";

const reqRows = [
  {
    kod: "LEH-RSA",
    rubrik: "Risk- och sårbarhetsanalys",
    lagrum: "Lag (2006:544) om extraordinära händelser (LEH), 2 kap. 1 §",
    intervall: "mandatperiod",
    status: "pagaende",
    senast: "2023-10-28",
    nasta: "2027-10-31",
    ansvarig: "Marika Öhlund",
    modul: "rsa",
    evidens: "RSA 2023, dnr KS 2023/412",
    beskrivning:
      "Kommunen ska analysera vilka extraordinära händelser i fredstid som kan inträffa " +
      "och hur dessa kan påverka den egna verksamheten, samt sammanställa resultatet i en " +
      "risk- och sårbarhetsanalys. Analysen ska göras för varje ny mandatperiod.",
    url: "https://lagen.nu/2006:544#K2P1",
    giltighet: "upphor",
    not: LEH_UPPHOR,
  },
  {
    kod: "LEH-PLAN",
    rubrik: "Plan för hantering av extraordinära händelser",
    lagrum: "Lag (2006:544) om extraordinära händelser (LEH), 2 kap. 1 §",
    intervall: "mandatperiod",
    status: "uppfylld",
    senast: "2024-02-19",
    nasta: "2027-12-31",
    ansvarig: "Marika Öhlund",
    modul: "kontinuitet",
    evidens: "Krisledningsplan, KF 2024-02-19 § 14",
    beskrivning:
      "Kommunen ska med beaktande av risk- och sårbarhetsanalysen för varje ny mandatperiod " +
      "fastställa en plan för hur extraordinära händelser ska hanteras.",
    url: "https://lagen.nu/2006:544#K2P1",
    giltighet: "upphor",
    not: LEH_UPPHOR,
  },
  {
    kod: "LEH-NAMND",
    rubrik: "Krisledningsnämnd med reglemente",
    lagrum: "Lag (2006:544) om extraordinära händelser (LEH), 2 kap. 2 §",
    intervall: "mandatperiod",
    status: "uppfylld",
    senast: "2023-01-23",
    nasta: "2027-01-31",
    ansvarig: "Daniel Sjögren",
    modul: "",
    evidens: "Reglemente KF 2023-01-23 § 6",
    beskrivning:
      "I kommuner och regioner ska det finnas en nämnd för att fullgöra uppgifter under " +
      "extraordinära händelser i fredstid (krisledningsnämnd). Nämndens verksamhet och " +
      "befogenheter regleras i 2 kap. 3 och 4 §§.",
    url: "https://lagen.nu/2006:544#K2P2",
    giltighet: "upphor",
    not: LEH_UPPHOR,
  },
  {
    kod: "LEH-SAMV",
    rubrik: "Geografiskt områdesansvar och samverkan",
    lagrum: "Lag (2006:544) om extraordinära händelser (LEH), 2 kap. 7 §",
    intervall: "lopande",
    status: "pagaende",
    senast: "2026-09-03",
    nasta: "2026-12-31",
    ansvarig: "Sara Molin",
    modul: "",
    evidens: "Protokoll krissamverkansråd 2026-09-03",
    beskrivning:
      "Kommunen ska inom sitt geografiska område verka för att olika aktörer samverkar och " +
      "uppnår samordning i planerings- och förberedelsearbetet, att krishanteringsåtgärder " +
      "samordnas vid en extraordinär händelse, och att informationen till allmänheten samordnas.",
    url: "https://lagen.nu/2006:544#K2P7",
    giltighet: "upphor",
    not: LEH_UPPHOR,
  },
  {
    kod: "LEH-UTB",
    rubrik: "Utbildning och övning av förtroendevalda och personal",
    lagrum: "Lag (2006:544) om extraordinära händelser (LEH), 2 kap. 8 §",
    intervall: "mandatperiod",
    status: "uppfylld",
    senast: "2026-05-06",
    nasta: "2027-12-31",
    ansvarig: "Marika Öhlund",
    modul: "ovningar",
    evidens: "Övningsrapporter 2026-02-11 och 2026-05-06",
    beskrivning:
      "Kommunen ska ansvara för att förtroendevalda och anställd personal får den utbildning " +
      "och övning som behövs för att de ska kunna lösa sina uppgifter vid extraordinära " +
      "händelser i fredstid. Lagen anger inget intervall; kravet följs upp per mandatperiod " +
      "enligt överenskommelsen med MCF och SKR.",
    url: "https://lagen.nu/2006:544#K2P8",
    giltighet: "upphor",
    not: LEH_UPPHOR,
  },
  {
    kod: "LEH-RAPP",
    rubrik: "Rapportering av beredskapsläget till länsstyrelsen",
    lagrum:
      "Lag (2006:544) om extraordinära händelser (LEH), 2 kap. 9 §, samt förordning (2006:637) 2 och 6 §§",
    intervall: "arligen",
    status: "pagaende",
    senast: "2026-02-27",
    nasta: "2027-02-28",
    ansvarig: "Marika Öhlund",
    modul: "",
    evidens: "Årsrapport 2025, dnr KS 2026/88",
    beskrivning:
      "Kommunen ska hålla den myndighet som regeringen bestämmer informerad om vilka åtgärder " +
      "som vidtagits och hur åtgärderna påverkat krisberedskapsläget. Enligt förordningen är " +
      "det länsstyrelsen som ska underrättas, både om beredskapsförberedelser och, vid höjd " +
      "beredskap, om beredskapsläget.",
    url: "https://lagen.nu/2006:544#K2P9",
    giltighet: "upphor",
    not: LEH_UPPHOR,
  },
  {
    kod: "LEH-KRIGSORG",
    rubrik: "Krigsorganisation och planering för dess bemanning",
    lagrum:
      "Förordning (2006:637) om kommuners och regioners åtgärder inför och vid extraordinära " +
      "händelser i fredstid och höjd beredskap, 4 §, samt LEH 3 kap. 1 §",
    intervall: "mandatperiod",
    status: "brist",
    senast: "2026-06-04",
    nasta: "2026-12-31",
    ansvarig: "Henrik Lindgren",
    modul: "krigsorganisation",
    evidens: "Beslut KS 2026/184, bemanningsgrad under mål",
    beskrivning:
      "Kommunen ska ha de planer som behövs för verksamheten under höjd beredskap. Planerna " +
      "ska ange krigsorganisationen och vilken personal som ska tjänstgöra i den, samt vad " +
      "som i övrigt behövs för att höja beredskapen.",
    url: "https://lagen.nu/2006:637",
    giltighet: "gallande",
    not: "Förordningen kan komma att följdändras när LKRB ersätter LEH 2027.",
  },
  {
    kod: "TF-KRIGSPL",
    rubrik: "Krigsplacering av personal i krigsorganisationen",
    lagrum:
      "3 kap. 15 § lagen (1994:1809) om totalförsvarsplikt samt 7–9 §§ förordningen (1995:238) om totalförsvarsplikt",
    intervall: "lopande",
    status: "brist",
    senast: "2026-06-04",
    nasta: "2026-12-31",
    ansvarig: "Sara Molin",
    modul: "krigsplacering",
    evidens: "Beslutslista krigsplacering 2026-06-04",
    beskrivning:
      "Kommunen får göra framställning om krigsplacering av totalförsvarspliktiga. Beslutet " +
      "fattas av Totalförsvarets plikt- och prövningsverk, som också underrättar den " +
      "totalförsvarspliktige. Beslut får fattas utan att den berörde först får yttra sig. " +
      "Kommunens uppgift är att fastställa behovet, bereda underlaget och samråda när en " +
      "person redan är krigsplacerad eller har annan plikt.",
    url: "https://lagen.nu/1995:238",
    giltighet: "gallande",
    not:
      "Utredningen SOU 2025:6 föreslår att kommuner och regioner blir uttryckligt " +
      "bemanningsansvariga, vilket kan ändra förfarandet. Förslaget är inte beslutat.",
  },
  {
    kod: "SASK-ANALYS",
    rubrik: "Säkerhetsskyddsanalys",
    lagrum:
      "Säkerhetsskyddslagen (2018:585) 2 kap. 1 § samt säkerhetsskyddsförordningen (2021:955)",
    intervall: "vartannat_ar",
    status: "brist",
    senast: "2024-11-08",
    nasta: "2026-11-08",
    ansvarig: "Pontus Ahlberg",
    modul: "",
    evidens: "Säkerhetsskyddsanalys 2024, ej reviderad",
    beskrivning:
      "Verksamhetsutövaren ska utreda behovet av säkerhetsskydd genom en säkerhetsskyddsanalys " +
      "som ska dokumenteras. Analysen ska identifiera säkerhetsskyddsklassificerade uppgifter " +
      "och annan säkerhetskänslig verksamhet samt hot och sårbarheter kopplade till dessa. " +
      "Enligt förordningen ska analysen uppdateras vid behov och minst vartannat år.",
    url: "https://lagen.nu/2018:585#K2P1",
    giltighet: "gallande",
    not: "",
  },
  {
    kod: "SASK-CHEF",
    rubrik: "Säkerhetsskyddschef och säkerhetsprövning",
    lagrum: "Säkerhetsskyddslagen (2018:585) 2 kap. 7 § samt 3 kap. 13–14 §§",
    intervall: "lopande",
    status: "pagaende",
    senast: "2026-09-10",
    nasta: "2026-12-31",
    ansvarig: "Pontus Ahlberg",
    modul: "krigsplacering",
    evidens: "Beslut om säkerhetsskyddschef 2025, registerkontroller pågår",
    beskrivning:
      "Det ska finnas en säkerhetsskyddschef om det inte är uppenbart obehövligt. Ansvaret får " +
      "inte delegeras och chefen ska vara direkt underställd verksamhetens chef. Registerkontroll " +
      "ska göras när en anställning har placerats i säkerhetsklass, och uppgifter ska hämtas " +
      "löpande under anställningen.",
    url: "https://lagen.nu/2018:585#K2P7",
    giltighet: "gallande",
    not: "",
  },
  {
    kod: "OK-KONT",
    rubrik: "Kontinuitetshantering för samhällsviktig verksamhet",
    lagrum:
      "Överenskommelse om kommunernas arbete med krisberedskap och civilt försvar 2024–2026 (MCF och SKR)",
    intervall: "lopande",
    status: "brist",
    senast: "2026-06-11",
    nasta: "2026-12-31",
    ansvarig: "Marika Öhlund",
    modul: "kontinuitet",
    evidens: "Kontinuitetsplaner för 6 av 12 funktioner",
    beskrivning:
      "Kommunen ska arbeta med kontinuitetshantering så att samhällsviktig verksamhet kan " +
      "upprätthållas vid störningar. Kravet följer av överenskommelsen, inte direkt av lag, " +
      "och är en förutsättning för den statliga ersättningen.",
    url: "https://www.mcf.se/sv/amnesomraden/beredskap-for-kris-och-krig/beredskap-for-aktorer/beredskap-for-kommuner-och-regioner/overenskommelser-inom-krisberedskap/overenskommelse-for-kommunernas-arbete-med-krisberedskap-och-civilt-forsvar-2024-2026-samt-tillhorande-stod/",
    giltighet: "upphor",
    not:
      "Överenskommelsen löper till och med 2026. Vad som gäller från 2027 var inte publicerat " +
      "när detta underlag sammanställdes, och påverkas av att LKRB föreslås träda i kraft.",
  },
  {
    kod: "OK-TIB",
    rubrik: "Tjänsteman i beredskap och ledningsplats",
    lagrum:
      "Överenskommelse om kommunernas arbete med krisberedskap och civilt försvar 2024–2026 (MCF och SKR)",
    intervall: "lopande",
    status: "uppfylld",
    senast: "2026-10-01",
    nasta: "2027-10-01",
    ansvarig: "Daniel Sjögren",
    modul: "resurser",
    evidens: "TIB-schema och ledningsplatsprotokoll 2026",
    beskrivning:
      "Kommunen ska ha en funktion för att ta emot larm dygnet runt samt en ledningsplats med " +
      "reservkraft och robust samband. Kravet följer av överenskommelsen.",
    url: "https://www.mcf.se/sv/amnesomraden/beredskap-for-kris-och-krig/beredskap-for-aktorer/beredskap-for-kommuner-och-regioner/overenskommelser-inom-krisberedskap/overenskommelse-for-kommunernas-arbete-med-krisberedskap-och-civilt-forsvar-2024-2026-samt-tillhorande-stod/",
    giltighet: "upphor",
    not: "Överenskommelsen löper till och med 2026.",
  },
  {
    kod: "STYREL",
    rubrik: "Styrel – planering för prioritering av samhällsviktiga elanvändare",
    lagrum:
      "Förordning (2011:931) om planering för prioritering av samhällsviktiga elanvändare samt STEMFS 2013:4",
    intervall: "lopande",
    status: "pagaende",
    senast: "2025-04-10",
    nasta: "2027-06-30",
    ansvarig: "Rickard Hult",
    modul: "kontinuitet",
    evidens: "Styrelunderlag 2025 inlämnat till länsstyrelsen",
    beskrivning:
      "Kommunen deltar i planeringen för att identifiera och rangordna samhällsviktiga " +
      "elanvändare, som underlag för manuell förbrukningsfrånkoppling. Länsstyrelsen leder " +
      "arbetet i länet och Energimyndigheten ansvarar för föreskrifterna.",
    url: "https://lagen.nu/2011:931",
    giltighet: "gallande",
    not:
      "Energimyndigheten har 2026 föreslagit att samtliga kommuner ska delta och att " +
      "totalförsvarets behov ska väga tyngre. Förslaget är inte beslutat.",
  },
  {
    kod: "VATTENPLAN",
    rubrik: "Vattentjänstplan",
    lagrum: "Lag (2006:412) om allmänna vattentjänster, 6 a §",
    intervall: "mandatperiod",
    status: "uppfylld",
    senast: "2023-12-11",
    nasta: "2027-12-31",
    ansvarig: "Tobias Fredriksson",
    modul: "",
    evidens: "Vattentjänstplan, KF 2023-12-11 § 102",
    beskrivning:
      "Varje kommun ska ha en vattentjänstplan. Planen ska bland annat redovisa kommunens " +
      "bedömning av vilka åtgärder som behövs för att de allmänna vattentjänsterna ska fungera " +
      "vid en ökad belastning, till exempel vid skyfall. Kravet gäller sedan 1 januari 2024.",
    url: "https://lagen.nu/2006:412",
    giltighet: "gallande",
    not: "",
  },
  {
    kod: "NODVATTEN",
    rubrik: "Planering för nödvattenförsörjning",
    lagrum:
      "Lag (2006:412) om allmänna vattentjänster samt Livsmedelsverkets vägledning för nödvattenförsörjning",
    intervall: "lopande",
    status: "brist",
    senast: "2024-06-04",
    nasta: "2026-12-31",
    ansvarig: "Jörgen Sandström",
    modul: "resurser",
    evidens: "Nödvattenplan 2024, utkörningsplan saknas",
    beskrivning:
      "Huvudmannen ansvarar för dricksvattenförsörjningen inom verksamhetsområdet, även vid " +
      "störningar. Någon uttrycklig författningsreglerad skyldighet att upprätta en nödvattenplan " +
      "finns inte; planeringen följer av huvudmannaansvaret, av LEH och av Livsmedelsverkets " +
      "vägledning. Förfallodatumet nedan är kommunens eget mål, inte ett lagkrav.",
    url: "https://www.livsmedelsverket.se/",
    giltighet: "gallande",
    not: "Internt mål. Ingen författning anger intervall för nödvattenplanering.",
  },
  {
    kod: "NIS2-ANMALAN",
    rubrik: "Anmälan som verksamhetsutövare enligt cybersäkerhetslagen",
    lagrum: "Cybersäkerhetslagen (2025:1506) 1 kap. 3 § och 2 kap. 2 §",
    intervall: "lopande",
    status: "uppfylld",
    senast: "2026-02-10",
    nasta: "2027-02-10",
    ansvarig: "Jens Åkerlund",
    modul: "",
    evidens: "Anmälan till gemensamma kontaktpunkten 2026-02-10, dnr KS 2026/61",
    beskrivning:
      "Kommuner, regioner och kommunalförbund omfattas av cybersäkerhetslagen, som trädde i " +
      "kraft 15 januari 2026 och ersatte lagen (2018:1174) om informationssäkerhet för " +
      "samhällsviktiga och digitala tjänster. Kommunfullmäktige är undantaget. Anmälan görs " +
      "till den gemensamma kontaktpunkten, som enligt cybersäkerhetsförordningen (2025:1507) " +
      "är Försvarets radioanstalt. Ändrade uppgifter ska anmälas inom 14 dagar.",
    kontextmall:
      "{namn} bedöms som {storlek} verksamhetsutövare enligt 1 kap. 9 §: verksamheten har " +
      "cirka {anstallda} anställda och är därmed {storleksgrund}. Tillsynsmyndighet är " +
      "{tillsyn}, enligt cybersäkerhetsförordningen (2025:1507).",
    url: "https://lagen.nu/2025:1506",
    giltighet: "gallande",
    not: "",
  },
  {
    kod: "NIS2-RISK",
    rubrik: "Riskhanteringsåtgärder för cybersäkerhet",
    lagrum: "Cybersäkerhetslagen (2025:1506) 2 kap. 3 §",
    intervall: "lopande",
    status: "brist",
    senast: null,
    nasta: "2026-12-31",
    ansvarig: "Jens Åkerlund",
    modul: "kontinuitet",
    evidens: "Åtgärderna är inte dokumenterade i sin helhet",
    beskrivning:
      "Verksamhetsutövaren ska vidta lämpliga och proportionella tekniska, operativa och " +
      "organisatoriska åtgärder utifrån en allriskansats. Åtgärderna ska som minst omfatta " +
      "riskanalys, incidenthantering, kontinuitet och krishantering, leveranskedjans säkerhet, " +
      "säker anskaffning och underhåll, cyberhygien och utbildning, kryptografi, personal- och " +
      "åtkomstkontroll samt säker autentisering. Förfallodatumet är kommunens eget mål; lagen " +
      "anger ingen frist utan kravet gäller löpande.",
    url: "https://lagen.nu/2025:1506",
    giltighet: "gallande",
    not: "",
  },
  {
    kod: "NIS2-LEDNING",
    rubrik: "Utbildning av ledningen i cybersäkerhet",
    lagrum: "Cybersäkerhetslagen (2025:1506) 2 kap. 4 §",
    intervall: "lopande",
    status: "ej_paborjad",
    senast: null,
    nasta: "2026-12-31",
    ansvarig: "Henrik Lindgren",
    modul: "ovningar",
    evidens: "Ingen utbildning genomförd",
    beskrivning:
      "Den som ingår i verksamhetsutövarens högsta ledning ska utbildas i riskhanteringsåtgärderna. " +
      "För en kommun omfattar det kommunstyrelsen och förvaltningsledningen. Kommunfullmäktige " +
      "är undantaget från lagens tillämpning.",
    url: "https://lagen.nu/2025:1506",
    giltighet: "gallande",
    not: "",
  },
  {
    kod: "NIS2-INCIDENT",
    rubrik: "Rutin för rapportering av betydande cyberincidenter",
    lagrum: "Cybersäkerhetslagen (2025:1506) 2 kap. 5–10 §§",
    intervall: "lopande",
    status: "pagaende",
    senast: "2026-09-04",
    nasta: "2026-11-30",
    ansvarig: "Pontus Ahlberg",
    modul: "",
    evidens: "Utkast till incidentrutin 2026-09-04",
    beskrivning:
      "Betydande incidenter ska rapporteras till CSIRT-enheten, som enligt " +
      "cybersäkerhetsförordningen (2025:1507) är Försvarets radioanstalt. Tidig varning ska " +
      "lämnas senast 24 timmar efter att incidenten upptäckts, incidentanmälan inom 72 timmar " +
      "och slutrapport inom en månad. Tjänstemottagare ska informeras om betydande incidenter " +
      "och betydande cyberhot. Rutinen måste fungera dygnet runt och vara känd hos TiB.",
    url: "https://lagen.nu/2025:1506",
    giltighet: "gallande",
    not: "",
  },
  {
    kod: "LKRB-INFOR",
    rubrik: "Anpassning till ny beredskapslag (LKRB)",
    lagrum:
      "Prop. 2026/27:5 Kommuners och regioners grundläggande beredskap inför kris och krig",
    intervall: "engang",
    status: "ej_paborjad",
    senast: null,
    nasta: "2027-01-01",
    ansvarig: "Marika Öhlund",
    modul: "",
    evidens: "Ingen förberedelse påbörjad",
    beskrivning:
      "Regeringen föreslår en ny lag om kommuners och regioners grundläggande beredskap som " +
      "ska ersätta LEH den 1 januari 2027. Förslaget innebär bland annat att risk- och " +
      "sårbarhetsanalys, planer och övningar ska omfatta höjd beredskap och ytterst krig, att " +
      "kommunen ska ha särskilda samlingsplatser för invånare, och att allmänheten ska kunna " +
      "informeras även när internet inte fungerar. Tillsynsbestämmelserna föreslås gälla från " +
      "1 januari 2029.",
    url: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/proposition/kommuners-och-regioners-grundlaggande-beredskap_he035/",
    giltighet: "foreslagen",
    not:
      "Propositionen lämnades till riksdagen 6 oktober 2026 och bereds i försvarsutskottet " +
      "(bet. 2026/27:FöU5). Riksdagen hade inte fattat beslut när detta underlag sammanställdes.",
  },
  /* ------------------------------------------------ krav som bara rör regioner */
  // Regioner bär hälso- och sjukvårdens beredskap ovanpå LEH. Lagrummen nedan
  // är avstämda mot källa 2026-10-23; se giltighet_not för vad som ändrats.
  {
    kod: "HSL-KATASTROF",
    rubrik: "Katastrofmedicinsk beredskap",
    lagrum: "Hälso- och sjukvårdslag (2017:30) 7 kap. 2 § tredje stycket",
    intervall: "lopande",
    status: "ej_paborjad",
    senast: null,
    nasta: null,
    ansvarig: "",
    modul: "kontinuitet",
    evidens: "Underlag saknas",
    beskrivning:
      "Regionen ska planera sin hälso- och sjukvård så att en katastrofmedicinsk beredskap " +
      "upprätthålls. Planeringen ska utgå från regionens risk- och sårbarhetsanalys och " +
      "omfatta förmåga att hantera allvarlig händelse och masskadeutfall.",
    url: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/halso--och-sjukvardslag-201730_sfs-2017-30/",
    giltighet: "gallande",
    not:
      "Socialstyrelsens föreskrifter och allmänna råd (SOSFS 2013:22) om katastrofmedicinsk " +
      "beredskap upphörde att gälla vid utgången av 2025 genom HSLF-FS 2025:69. HSLF-FS " +
      "2025:70, som trädde i kraft 1 januari 2026, reglerar endast beredskap för insatser " +
      "utomlands. Skyldigheten i 7 kap. 2 § HSL kvarstår, men den detaljerade " +
      "föreskriftsregleringen för beredskap inom landet behöver stämmas av på nytt mot " +
      "Socialstyrelsens författningssamling innan listan används som tillsynsunderlag.",
  },
  {
    kod: "HSL-UTLAND",
    rubrik: "Beredskap för katastrofmedicinska insatser utomlands",
    lagrum:
      "Lag (2008:552) om katastrofmedicin som en del av svenska insatser utomlands samt " +
      "HSLF-FS 2025:70",
    intervall: "lopande",
    status: "ej_paborjad",
    senast: null,
    nasta: null,
    ansvarig: "",
    modul: "resurser",
    evidens: "Underlag saknas",
    beskrivning:
      "Regioner med uppdrag att upprätthålla beredskap för katastrofmedicinska insatser " +
      "utomlands ska kunna leverera personal och materiel på Socialstyrelsens uppdrag med " +
      "kort varsel, och ge personalen möjlighet att delta i utbildning och övning.",
    url: "https://www.socialstyrelsen.se/publikationer/hslf-fs-202570-socialstyrelsens-foreskrifter--om-beredskap-for-katastrofmedicinska--insatser-utomlands-2025-12-9934",
    giltighet: "gallande",
    not:
      "HSLF-FS 2025:70 trädde i kraft 1 januari 2026. Kravet gäller de regioner som har " +
      "uppdraget; övriga regioner får upprätthålla sådan beredskap. Markera kravet som ej " +
      "tillämpligt om regionen saknar uppdrag.",
  },
  {
    kod: "SMITTSKYDD",
    rubrik: "Smittskyddsläkare och smittskyddsorganisation",
    lagrum: "Smittskyddslag (2004:168)",
    intervall: "lopande",
    status: "ej_paborjad",
    senast: null,
    nasta: null,
    ansvarig: "",
    modul: "",
    evidens: "Underlag saknas",
    beskrivning:
      "Regionen ansvarar för att smittskyddsåtgärder vidtas inom regionen, och det ska finnas " +
      "en smittskyddsläkare. Regionen och smittskyddsläkaren ska se till att allmänheten har " +
      "tillgång till den information och de råd som behövs för att skydda sig mot smitta som " +
      "kan hota liv eller hälsa.",
    url: "https://www.riksdagen.se/sv/dokument-lagar/dokument/_sfs-2004-168",
    giltighet: "gallande",
    not:
      "EJ AVSTÄMD MOT FÖRFATTNINGSTEXT. Paragrafhänvisningen för smittskyddsläkarens " +
      "tillsättning har inte kunnat verifieras mot Svensk författningssamling, och lagen är " +
      "ändrad t.o.m. SFS 2025:734. Komplettera lagrummet innan raden används vid tillsyn.",
  },
  {
    kod: "OK-REGION",
    rubrik: "Överenskommelse om regionernas krisberedskap och civila försvar",
    lagrum:
      "Överenskommelse om regionernas arbete med krisberedskap och civilt försvar " +
      "2024–2026 (MSB och SKR)",
    intervall: "arligen",
    status: "ej_paborjad",
    senast: null,
    nasta: "2026-12-31",
    ansvarig: "",
    modul: "ovningar",
    evidens: "Underlag saknas",
    beskrivning:
      "Regionen ska genomföra de uppgifter som följer av överenskommelsen med MSB och SKR, " +
      "bland annat risk- och sårbarhetsarbete, planering för civilt försvar, regional " +
      "samverkan samt tjänsteperson i beredskap, och redovisa arbetet som grund för den " +
      "statliga ersättningen.",
    url: "https://skr.se/download/18.7b763b4e18d54c4a4f51e7/1706524982129/WEBB-17-2024-Overenskommelse_regioner_2024-2026-krisberedskap-civilt-forsvar.PDF",
    giltighet: "upphor",
    not:
      "Överenskommelsen löper ut vid utgången av 2026. Vad som gäller därefter beror på " +
      "riksdagens beslut om LKRB och på en ny överenskommelse, som inte var träffad när " +
      "detta underlag sammanställdes.",
  },
];
/* ----------------------------------------------- vilka huvudmän kravet gäller */
// Lagen är inte densamma för en kommun och en region. LEH, säkerhetsskydds-
// lagen, totalförsvarsplikten och cybersäkerhetslagen träffar båda, medan
// vattentjänster och styrel sitter hos kommunen och katastrofmedicinsk
// beredskap och smittskydd hos regionen.
const GALLER_FOR = {
  "LEH-RSA": "bada", "LEH-PLAN": "bada", "LEH-NAMND": "bada", "LEH-SAMV": "bada",
  "LEH-UTB": "bada", "LEH-RAPP": "bada", "LEH-KRIGSORG": "bada",
  "TF-KRIGSPL": "bada", "SASK-ANALYS": "bada", "SASK-CHEF": "bada",
  // Överenskommelsen med MCF och SKR gäller kommunerna. Regionerna har en egen,
  // se OK-REGION nedan.
  "OK-KONT": "kommun", "OK-TIB": "kommun",
  "STYREL": "kommun", "VATTENPLAN": "kommun", "NODVATTEN": "kommun",
  "NIS2-ANMALAN": "bada", "NIS2-RISK": "bada", "NIS2-LEDNING": "bada",
  "NIS2-INCIDENT": "bada",
  "LKRB-INFOR": "bada",
  "OK-REGION": "region", "HSL-KATASTROF": "region", "HSL-UTLAND": "region",
  "SMITTSKYDD": "region",
};

// Proveniens per krav: mot vilken källa raden senast stämdes av. Tom sträng
// betyder att raden INTE är avstämd mot författningstext, och den visas då
// som okontrollerad i gränssnittet. Katalogen säljs som tillsynsunderlag, och
// ett krav som ingen stämt av får inte se likadant ut som ett som är stämt av.
const KONTROLLERAD = {
  __standard: { datum: "2026-10-01", av: "Marika Öhlund" },
  // Avstämda mot källa 2026-10-23, se giltighet_not på respektive rad.
  "HSL-KATASTROF": { datum: "2026-10-23", av: "Redaktionen" },
  "HSL-UTLAND": { datum: "2026-10-23", av: "Redaktionen" },
  "OK-REGION": { datum: "2026-10-23", av: "Redaktionen" },
  "LKRB-INFOR": { datum: "2026-10-23", av: "Redaktionen" },
  // Lagrummet för smittskyddsläkarens tillsättning har inte gått att stämma av
  // mot författningstexten. Raden lämnas medvetet okontrollerad.
  SMITTSKYDD: { datum: "", av: "" },
};

/* ------------------------------------------------- den delade kravkatalogen */
// Katalogen läggs in EN gång och delas av alla organisationer. Det är hela
// poängen: när ett lagrum ändras rättas det här, och ändringen når varje kund.
const KRAV_ID = {};
ORG = null;
for (const r of reqRows) {
  const k = KONTROLLERAD[r.kod] ?? KONTROLLERAD.__standard;
  KRAV_ID[r.kod] = ins("requirement_catalog", {
    kod: r.kod, rubrik: r.rubrik, lagrum: r.lagrum, beskrivning: r.beskrivning,
    kontextmall: r.kontextmall ?? "",
    intervall: r.intervall, modul: r.modul, kalla_url: r.url,
    giltighet: r.giltighet, giltighet_not: r.not,
    galler_for: GALLER_FOR[r.kod] ?? "bada",
    standard_forfallo: r.nasta ?? null,
    kontrollerad: k.datum, kontrollerad_av: k.av,
  });
}

/* -------------------------------------------- status per organisation */
// Organisationen får en statusrad för varje krav i katalogen som gäller dess
// huvudmannatyp. En kommun får aldrig regionernas krav, och tvärtom.
/**
 * Gäller kravet den här huvudmannatypen?
 *
 * Gotland är en enda juridisk person som fullgör både kommunens och regionens
 * uppgifter, och får därför båda uppsättningarna.
 */
function kravGaller(gallerFor, typ) {
  if (gallerFor === "bada" || gallerFor === typ) return true;
  return typ === "kommun_region" && (gallerFor === "kommun" || gallerFor === "region");
}

function seedaStatus(orgId, typ, standardAnsvarig, overrides) {
  ORG = orgId;
  for (const r of reqRows) {
    const galler = GALLER_FOR[r.kod] ?? "bada";
    if (!kravGaller(galler, typ)) continue;
    const o = overrides[r.kod] ?? {};
    ins("requirement_status", {
      krav_id: KRAV_ID[r.kod],
      status: o.status ?? "ej_paborjad",
      senast_genomfort: o.senast ?? null,
      nasta_forfallo: o.nasta ?? r.nasta ?? null,
      ansvarig: o.ansvarig ?? standardAnsvarig,
      evidens: o.evidens ?? "Underlag saknas",
      lokal_not: o.not ?? "",
    });
  }
}

// Ängsholms status ligger på kravraderna, eftersom demokommunen skrevs först.
const ANGSHOLM_STATUS = {};
for (const r of reqRows) {
  ANGSHOLM_STATUS[r.kod] = {
    status: r.status, senast: r.senast, nasta: r.nasta,
    ansvarig: r.ansvarig, evidens: r.evidens,
  };
}
seedaStatus(ANGSHOLM, "kommun", "Marika Öhlund", ANGSHOLM_STATUS);
ORG = ANGSHOLM;

/* -------------------------------------------------------------------- actions */
// [titel, källa, källref, ansvarig, kortnamn, prio, status, förfallo, klar, beskrivning]
const actionRows = [
  ["Teckna avtal om drivmedelsleverans vid höjd beredskap", "rsa", "Drivmedelsbrist", "Lisbeth Öman", "SBF", "hog", "pagaende", "2026-12-15", null,
   "Upphandla leveransavtal med prioritet vid ransonering. Omfattar reservkraft, hemtjänstfordon och räddningstjänst."],
  ["Upprätta utkörningsplan för nödvatten", "ovning", "Seminarieövning Nödvatten", "Jörgen Sandström", "ÄVA", "hog", "pagaende", "2026-11-30", null,
   "Ta fram tappställen, transportschema och prioritering av boenden och kök. Brist identifierad vid övning 2026-09-17."],
  ["Komplettera med 750 vattendunkar", "ovning", "Seminarieövning Nödvatten", "Lennart Björk", "ÄVA", "normal", "ej_paborjad", "2027-03-31", null,
   "Nuvarande 450 dunkar täcker 38 procent av behovet enligt nödvattenplanen."],
  ["Revidera säkerhetsskyddsanalysen", "tillsyn", "SASK-ANALYS", "Pontus Ahlberg", "KLK", "hog", "pagaende", "2026-11-30", null,
   "Analysen från 2024 är inte reviderad. Ska omfatta nya verksamhetssystem och bolagens anläggningar."],
  ["Reservväg för trygghetslarm", "kontinuitet", "Hemtjänst och trygghetslarm", "Jens Åkerlund", "KLK", "hog", "pagaende", "2027-02-28", null,
   "388 trygghetslarm är helt beroende av ett mobilnät. Utred redundans eller manuell tillsynsrutin."],
  ["Beställ reservkraftanslutning till sex pumpstationer", "kontinuitet", "Avloppsrening och pumpstationer", "Jörgen Sandström", "ÄVA", "normal", "ej_paborjad", "2027-06-30", null,
   "Sex av 24 pumpstationer saknar anslutningspunkt för mobil reservkraft."],
  ["Reparera mobilt reservkraftaggregat 40 kVA", "resurs", "Mobilt reservkraftaggregat", "Kenneth Vikman", "SBF", "normal", "pagaende", "2026-11-14", null,
   "Trasig generator. Reservdel beställd 2026-09-22."],
  ["Slutför inventering av elanslutningspunkter", "resurs", "Elanslutningspunkter för mobil reservkraft", "Therese Almqvist", "SBF", "hog", "pagaende", "2026-09-30", null,
   "Sex av 15 prioriterade fastigheter saknar dokumenterat uttag för mobil reservkraft."],
  ["Utbilda andra och tredje stabsskiftet", "ovning", "Stabsövning Vinterstorm", "Marika Öhlund", "KLK", "hog", "pagaende", "2027-04-30", null,
   "Endast ett skift kan bemannas fullt ut. Krav på dygnstäckande stabsarbete."],
  ["Uppdatera kontaktuppgifter i inkallelselistan", "ovning", "Larmövning inkallelse krisledning", "Hanna Ljung", "KLK", "normal", "klar", "2026-06-30", "2026-06-18",
   "Fyra personer hade felaktiga uppgifter vid larmövningen 2026-05-06."],
  ["Lös dubbelplacering HR och samverkansansvarig", "krigsorg", "Sara Molin", "Henrik Lindgren", "KLK", "hog", "ej_paborjad", "2026-12-01", null,
   "Samma person är föreslagen på två befattningar i krigsorganisationen."],
  ["Samråd om krigsplacerad personal med Försvarsmakten", "krigsorg", "TF-KRIGSPL", "Sara Molin", "KLK", "hog", "pagaende", "2026-12-31", null,
   "Tre medarbetare är redan krigsplacerade i Försvarsmakten och två har annan plikt. Samråd krävs innan beslut."],
  ["Förnya registerkontroll för IT-driftansvarig", "tillsyn", "Jens Åkerlund", "Pontus Ahlberg", "KLK", "hog", "pagaende", "2026-11-15", null,
   "Registerkontrollen är utgången för befattning i säkerhetsklass 3."],
  ["Säkerställ ersättare för drifttekniker reservkraft", "krigsorg", "SBF|Drifttekniker reservkraft", "Rickard Hult", "SBF", "normal", "ej_paborjad", "2027-05-31", null,
   "Pensionsavgång under mandatperioden utan identifierad ersättare."],
  ["Höj beredskapslagret av livsmedel till sju dygn", "rsa", "Störning i livsmedelsförsörjning", "Ulrika Dahl", "BUF", "normal", "pagaende", "2027-01-31", null,
   "Nuvarande lager motsvarar tre dygn. Kräver lagerutrymme och omsättningsrutin."],
  ["Anskaffa dieseldrivet reservkök", "rsa", "Störning i livsmedelsförsörjning", "Ulrika Dahl", "BUF", "normal", "ej_paborjad", "2027-08-31", null,
   "Produktionsköket kan inte drivas utan el. Investering cirka 380 000 kronor."],
  ["Kontrollera och återinventera civilförsvarsförrådet i Näsby", "resurs", "Fältkök", "Ulrika Dahl", "BUF", "lag", "ej_paborjad", "2027-02-28", null,
   "Status för fältkök och övrig materiel har inte kontrollerats sedan 2019."],
  ["Fastställ kontinuitetsplan för IT-drift", "kontinuitet", "IT-drift för prioriterade system", "Jens Åkerlund", "KLK", "hog", "pagaende", "2026-12-31", null,
   "Planen är i utkast. Faktisk återställningstid 24 timmar mot tolererade 4 timmar."],
  ["Ställ krav på höjd beredskap i avtal för journalsystem", "kontinuitet", "IT-drift för prioriterade system", "Johan Rydell", "KLK", "hog", "ej_paborjad", "2027-03-31", null,
   "Nuvarande driftavtal saknar krav på tillgänglighet vid höjd beredskap och säkerhetsskyddsavtal."],
  ["Fastställ kontinuitetsplan för värmeförsörjning", "kontinuitet", "Värmeförsörjning i kommunala lokaler", "Rickard Hult", "SBF", "normal", "pagaende", "2027-02-28", null,
   "Tre undercentraler saknar reservkraft. Plan i utkast."],
  ["Upphandla mobila värmeaggregat till trygghetspunkter", "kontinuitet", "Trygghetspunkter", "Adrian Fors", "KOF", "normal", "ej_paborjad", "2027-04-30", null,
   "Fyra aggregat täcker inte behovet vid fyra samtidiga trygghetspunkter."],
  ["Teckna avtal om ömsesidigt driftstöd för vattenverk", "rsa", "Avbrott i dricksvattenförsörjningen", "Tobias Fredriksson", "ÄVA", "hog", "ej_paborjad", "2027-01-31", null,
   "Endast fyra certifierade driftoperatörer. Avtal med nabokommun saknas."],
  ["Förstärk skalskydd vid Ängsåsens vattenverk", "rsa", "Sabotage mot vattenverk eller reservkraft", "Pontus Ahlberg", "ÄVA", "hog", "pagaende", "2027-06-30", null,
   "Saknar kameraövervakning och larmat skalskydd. Samordnas med säkerhetsskyddsanalysen."],
  ["Ta fram rutin för kontanthantering vid betalningsbortfall", "rsa", "Bortfall av betalningssystem", "Daniel Sjögren", "KLK", "lag", "ej_paborjad", "2027-09-30", null,
   "Manuella rutiner för inköp och utbetalning saknas."],
  ["Programmera om fyra Rakel-enheter", "resurs", "Rakel-handenheter", "Mattias Bohlin", "KLK", "normal", "pagaende", "2026-10-15", null,
   "Enheterna saknar aktuell programmering och talgruppsindelning."],
  ["Förnya abonnemang för satellittelefoner", "resurs", "Satellittelefon", "Jens Åkerlund", "KLK", "hog", "ej_paborjad", "2026-10-09", null,
   "Abonnemanget förfaller 2026-10-31. Enheterna blir obrukbara utan förnyelse."],
  ["Provkör reservkraft vid Solgläntan med last", "resurs", "Fast reservkraftaggregat, Solgläntan", "Samuel Ohlsson", "SBF", "normal", "pagaende", "2026-11-05", null,
   "Startbatteri bytt. Provkörning med last återstår."],
  ["Upprätta kontinuitetsplan för framkomlighet på vägnätet", "kontinuitet", "Framkomlighet på prioriterat vägnät", "Dennis Krantz", "SBF", "normal", "ej_paborjad", "2027-03-31", null,
   "Plan saknas. Entreprenörsavtalet saknar krav på drivmedelsberedskap och reservleverantör."],
  ["Revidera kontinuitetsplan för förskola och skola", "kontinuitet", "Förskola och skola", "Peter Strand", "BUF", "lag", "ej_paborjad", "2027-06-30", null,
   "Planen är från 2023 och har passerat giltighetstiden."],
  ["Dela lägesbild med kommunala bolag under stabsarbete", "ovning", "Stabsövning Vinterstorm", "Oskar Wiklund", "KLK", "normal", "klar", "2026-09-30", "2026-09-08",
   "Rutin och behörighet i WIS för ÄVA och ÄHEM. Brist identifierad vid övning 2026-02-11."],
  ["Genomför utbildning om krigsorganisation för chefer", "krigsorg", "LEH-KRIGSORG", "Marika Öhlund", "KLK", "hog", "pagaende", "2026-11-19", null,
   "Planerad utbildning 2026-11-19 för samtliga chefer och nyckelpersonal."],
  ["Rapportera beredskapsläget till länsstyrelsen", "tillsyn", "LEH-RAPP", "Marika Öhlund", "KLK", "normal", "ej_paborjad", "2027-02-28", null,
   "Årlig rapportering av beredskapsläge och vidtagna åtgärder."],
  ["Dokumentera riskhanteringsåtgärder enligt cybersäkerhetslagen", "tillsyn", "NIS2-RISK", "Jens Åkerlund", "KLK", "hog", "pagaende", "2026-12-31", null,
   "Tio åtgärdsområden ska vara dokumenterade och beslutade, från leveranskedjans säkerhet till säker autentisering. Kommunen är väsentlig verksamhetsutövare och står under tillsyn av Länsstyrelsen i Örebro län."],
  ["Utbilda kommunstyrelsen och förvaltningschefer i cybersäkerhet", "tillsyn", "NIS2-LEDNING", "Henrik Lindgren", "KLK", "hog", "ej_paborjad", "2026-12-31", null,
   "Lagkrav på att högsta ledningen utbildas i riskhanteringsåtgärderna. Ingen utbildning är genomförd sedan lagen trädde i kraft."],
  ["Fastställ rutin för incidentrapportering inom 24 och 72 timmar", "tillsyn", "NIS2-INCIDENT", "Pontus Ahlberg", "KLK", "hog", "pagaende", "2026-11-30", null,
   "Rutinen ska fungera dygnet runt och vara känd hos TiB. Tidig varning inom 24 timmar, incidentanmälan inom 72 timmar och slutrapport inom en månad till Försvarets radioanstalt."],
];
for (const [titel, kalla, ref, ansvarig, kort, prio, status, forfallo, klar, beskrivning] of actionRows) {
  ins("actions", {
    titel, beskrivning, kalla, kalla_ref: ref, ansvarig, unit_id: U[kort],
    prioritet: prio, status, forfallodatum: forfallo, klar_datum: klar, skapad: "2026-09-19",
  });
}

/* ------------------------------------------------------------------ audit_log */
const logRows = [
  ["2026-10-22T14:12:00", "Marika Öhlund", "Uppdaterade status på åtgärd", "Upprätta utkörningsplan för nödvatten"],
  ["2026-10-21T09:48:00", "Sara Molin", "Ändrade krigsplacering till föreslagen", "Marcus Thelin – Väghållning och framkomlighet"],
  ["2026-10-20T16:30:00", "Pontus Ahlberg", "Noterade utgången registerkontroll", "Jens Åkerlund"],
  ["2026-10-19T11:05:00", "Jörgen Sandström", "Registrerade kontroll av reservkraft", "Ängsåsens vattenverk, 400 kVA"],
  ["2026-10-16T13:22:00", "Marika Öhlund", "Skapade åtgärd från övningserfarenhet", "Utbilda andra och tredje stabsskiftet"],
];
for (const [tidpunkt, anvandare, handelse, objekt] of logRows) {
  ins("audit_log", { org_id: ANGSHOLM, tidpunkt, anvandare, handelse, objekt });
}

/* ============================================================== NORDMARK ===== */
// Ansluten i januari 2026. Halvvägs: krigsorganisationen är fastställd men
// långt ifrån bemannad, och flera moduler är påbörjade men inte klara.
ORG = NORDMARK;

const UN = {};
for (const [namn, kortnamn, typ, chef, sv, anst] of [
  ["Kommunstyrelsens förvaltning", "KSF", "forvaltning", "Tove Bergqvist", true, 38],
  ["Vård- och omsorgsförvaltningen", "VOF", "forvaltning", "Birgitta Hall", true, 265],
  ["Barn- och utbildningsförvaltningen", "BUN", "forvaltning", "Olof Ryd", true, 198],
  ["Teknik- och fastighetsförvaltningen", "TFF", "forvaltning", "Per Dahlgren", true, 74],
  ["Nordmarks Energi och Vatten AB", "NEV", "bolag", "Katarina Sund", true, 29],
]) UN[kortnamn] = ins("units", { namn, kortnamn, typ, chef, samhallsviktig: sv, anstallda: anst });

const PN = {};
for (const [kort, titel, niva, krit, platser, sk, uppgift] of [
  ["KSF", "Krisledningschef", "ledning", "A", 1, "2", "Leder kommunens krisledning."],
  ["KSF", "Beredskapssamordnare", "ledning", "A", 1, "2", "Samordnar planering, övning och rapportering."],
  ["KSF", "Kommunikationsansvarig", "stab", "A", 1, "3", "Kriskommunikation och VMA."],
  ["KSF", "Stabsassistent", "stab", "B", 2, "ingen", "Dokumentation och stabsstöd."],
  ["KSF", "IT- och sambandsansvarig", "operativ", "A", 1, "3", "Prioriterade system och Rakel."],
  ["VOF", "Verksamhetschef vård och omsorg", "ledning", "A", 1, "3", "Prioriterar vårdinsatser."],
  ["VOF", "Enhetschef särskilt boende", "operativ", "A", 2, "ingen", "Driver boende vid störning."],
  ["VOF", "Sjuksköterska i beredskap", "operativ", "A", 3, "ingen", "Dygnstäckande sjukvårdsberedskap."],
  ["BUN", "Skolchef", "ledning", "B", 1, "3", "Beslutar om stängning och omfördelning."],
  ["BUN", "Samordnare skolmåltider", "operativ", "A", 1, "ingen", "Måltidsförsörjning till prioriterade grupper."],
  ["TFF", "Teknisk chef", "ledning", "A", 1, "3", "Leder teknisk försörjning."],
  ["TFF", "Drifttekniker reservkraft", "operativ", "A", 2, "ingen", "Startar och underhåller reservkraft."],
  ["NEV", "Driftchef vatten och el", "ledning", "A", 1, "2", "Dricksvatten och lokal elförsörjning."],
  ["NEV", "Operatör vattenverk", "operativ", "A", 2, "3", "Driver vattenverk i ö-drift."],
]) PN[kort + "|" + titel] = ins("positions", {
  unit_id: UN[kort], titel, niva, kritikalitet: krit, platser, sakerhetsklass: sk, uppgift,
});

const PEN = {};
for (const [namn, kort, bef, pnr, f] of [
  ["Tove Bergqvist", "KSF", "Beredskapssamordnare", "19830516-XXXX", { sk: "2", rk: "klar" }],
  ["Mats Hedlund", "KSF", "Kommunchef", "19660924-XXXX", { sk: "2", rk: "klar" }],
  ["Johanna Ek", "KSF", "Kommunikatör", "19920308-XXXX", { sk: "3", rk: "begard" }],
  ["Stefan Wall", "KSF", "Kanslist", "19780711-XXXX", {}],
  ["Nina Brolin", "KSF", "IT-tekniker", "19900419-XXXX", { sk: "3", rk: "klar" }],
  ["Birgitta Hall", "VOF", "Vård- och omsorgschef", "19691202-XXXX", { sk: "3", rk: "klar" }],
  ["Carl Rundqvist", "VOF", "Enhetschef Furulund", "19850627-XXXX", {}],
  ["Lena Mörk", "VOF", "Enhetschef Granbacken", "19740130-XXXX", {}],
  ["Sofia Hane", "VOF", "Sjuksköterska", "19930814-XXXX", {}],
  ["Ali Rahimi", "VOF", "Sjuksköterska", "19880205-XXXX", { fm: true, not: "Krigsplacerad i Försvarsmakten." }],
  ["Eva Lindqvist", "VOF", "Sjuksköterska", "19761119-XXXX", {}],
  ["Olof Ryd", "BUN", "Skolchef", "19710408-XXXX", { sk: "3", rk: "klar" }],
  ["Marie Tholin", "BUN", "Kostchef", "19800923-XXXX", {}],
  ["Per Dahlgren", "TFF", "Teknisk chef", "19730615-XXXX", { sk: "3", rk: "klar" }],
  ["Håkan Selin", "TFF", "Drifttekniker", "19891007-XXXX", {}],
  ["Jonas Vik", "TFF", "Drifttekniker", "19950222-XXXX", { plikt: "Hemvärnet" }],
  ["Katarina Sund", "NEV", "VD", "19750503-XXXX", { sk: "2", rk: "klar" }],
  ["Rickard Modin", "NEV", "Driftoperatör", "19910126-XXXX", { sk: "3", rk: "klar" }],
  ["Elin Norberg", "NEV", "Driftoperatör", "19870718-XXXX", { sk: "3", rk: "ej_aktuell" }],
  ["Tomas Ahl", "NEV", "Rörnätstekniker", "19681211-XXXX", {}],
]) {
  const [f1, f2] = namn.split(" ").map((d) => d.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""));
  PEN[namn] = ins("people", {
    namn, pnr_maskerat: pnr, unit_id: UN[kort], befattning_fred: bef,
    epost: `${f1}.${f2}@nordmark.se`, telefon: "0570-8" + String(10000 + Math.floor(Math.random() * 89999)).slice(0, 5),
    anstallningsform: "tillsvidare", fm_krigsplacerad: !!f.fm, annan_plikt: f.plikt || "",
    sakerhetsklass: f.sk || "ingen", registerkontroll: f.rk || "ej_aktuell",
    bortrest_risk: false, noteringar: f.not || "",
  });
}

for (const [pos, person, status, datum, anm] of [
  ["KSF|Krisledningschef", "Mats Hedlund", "underrattad", "2026-05-20", ""],
  ["KSF|Beredskapssamordnare", "Tove Bergqvist", "underrattad", "2026-05-20", ""],
  ["KSF|Kommunikationsansvarig", "Johanna Ek", "foreslagen", null, "Avvaktar registerkontroll."],
  ["KSF|Stabsassistent", "Stefan Wall", "beslutad", "2026-05-20", ""],
  ["KSF|IT- och sambandsansvarig", "Nina Brolin", "beslutad", "2026-05-20", ""],
  ["VOF|Verksamhetschef vård och omsorg", "Birgitta Hall", "underrattad", "2026-05-20", ""],
  ["VOF|Enhetschef särskilt boende", "Carl Rundqvist", "beslutad", "2026-05-20", ""],
  ["VOF|Enhetschef särskilt boende", "Lena Mörk", "foreslagen", null, ""],
  ["VOF|Sjuksköterska i beredskap", "Sofia Hane", "beslutad", "2026-05-20", ""],
  ["VOF|Sjuksköterska i beredskap", "Ali Rahimi", "foreslagen", null, ""],
  ["BUN|Skolchef", "Olof Ryd", "beslutad", "2026-05-20", ""],
  ["BUN|Samordnare skolmåltider", "Marie Tholin", "foreslagen", null, ""],
  ["TFF|Teknisk chef", "Per Dahlgren", "underrattad", "2026-05-20", ""],
  ["TFF|Drifttekniker reservkraft", "Håkan Selin", "beslutad", "2026-05-20", ""],
  ["TFF|Drifttekniker reservkraft", "Jonas Vik", "foreslagen", null, "Har avtal med Hemvärnet, samråd krävs."],
  ["NEV|Driftchef vatten och el", "Katarina Sund", "underrattad", "2026-05-20", ""],
  ["NEV|Operatör vattenverk", "Rickard Modin", "beslutad", "2026-05-20", ""],
  ["NEV|Operatör vattenverk", "Elin Norberg", "foreslagen", null, "Registerkontroll ej begärd."],
]) ins("placements", {
  position_id: PN[pos], person_id: PEN[person], status, beslutsdatum: datum,
  beslut_av: datum ? "Kommunchef, beslut KS 2026/77" : "", underrattad: status === "underrattad",
  anmarkning: anm,
});

for (const [namn, kategori, s_, k_, agare, kort, status, beskrivning, hb] of [
  ["Långvarigt elavbrott vintertid", "teknisk", 4, 5, "Per Dahlgren", "TFF", "atgardas",
   "Avbrott över ett dygn vid sträng kyla. Stora avstånd och spridd bebyggelse försvårar insatser.", true],
  ["Avbrott i dricksvattenförsörjningen", "teknisk", 3, 5, "Katarina Sund", "NEV", "atgardas",
   "Ett vattenverk försörjer tätorten. Ingen reservvattentäkt finns.", true],
  ["Cyberangrepp mot kommunens IT-drift", "antagonistisk", 4, 4, "Nina Brolin", "KSF", "bedomd",
   "Utlagd drift hos extern leverantör utan krav för höjd beredskap.", true],
  ["Personalbortfall i vård och omsorg", "halsa", 3, 4, "Birgitta Hall", "VOF", "bedomd",
   "Liten personalstyrka ger snabb påverkan vid frånvaro.", false],
  ["Snöoväder och avskurna vägar", "naturhandelse", 4, 3, "Per Dahlgren", "TFF", "atgardas",
   "Byar kan bli oåtkomliga i flera dygn. Hemtjänst och skolskjuts påverkas.", false],
  ["Skogsbrand", "naturhandelse", 3, 4, "Per Dahlgren", "TFF", "bedomd",
   "Stora skogsarealer nära bebyggelse.", false],
  ["Drivmedelsbrist", "forsorjning", 3, 4, "Per Dahlgren", "TFF", "identifierad",
   "Inga egna drivmedelslager utöver fordonstankar.", true],
  ["Bortfall av elektronisk kommunikation", "teknisk", 3, 4, "Nina Brolin", "KSF", "identifierad",
   "Begränsad mobiltäckning i delar av kommunen redan i normalläge.", true],
]) ins("risks", {
  namn, kategori, beskrivning, sannolikhet: s_, konsekvens: k_, agare, unit_id: UN[kort],
  status, senast_bedomd: "2026-08-25", hojd_beredskap: hb,
});

const FN = {};
for (const [kort, namn, prio, mtpd, faktisk, ps, pd, brukare, beskrivning] of [
  ["NEV", "Dricksvattenproduktion", 1, 6, 18, "utkast", null, 9840,
   "Ett vattenverk utan reservtäkt försörjer tätorten och tre ytterområden."],
  ["VOF", "Särskilt boende, dygnsomsorg", 1, 4, 10, "utkast", null, 86,
   "Två boenden med sammanlagt 86 platser."],
  ["VOF", "Hemtjänst och trygghetslarm", 1, 6, 14, "saknas", null, 191,
   "Långa avstånd, 191 brukare och 142 trygghetslarm."],
  ["KSF", "Krisledning och lägesbild", 1, 4, 8, "faststalld", "2026-06-02", 9840,
   "Stabsarbete och rapportering. Endast ett stabsskift kan bemannas."],
  ["TFF", "Värme och fastighetsdrift", 2, 12, 24, "saknas", null, 1900,
   "Värme till skolor, boenden och kommunhus."],
  ["BUN", "Måltidsförsörjning", 2, 24, 24, "utkast", null, 1180,
   "Ett produktionskök och tre mottagningskök."],
]) FN[namn] = ins("critical_functions", {
  unit_id: UN[kort], namn, beskrivning, prioritet: prio, mtpd_timmar: mtpd,
  faktisk_timmar: faktisk, plan_status: ps, plan_datum: pd, berorda_brukare: brukare,
});

for (const [fn, typ, beskrivning, reserv, sarbarhet] of [
  ["Dricksvattenproduktion", "el", "Processtyrning och pumpar", "Mobilt aggregat måste köras till plats", 4],
  ["Dricksvattenproduktion", "personal", "Två certifierade operatörer", "Ingen avtalad reserv", 5],
  ["Dricksvattenproduktion", "leverantor", "Fällningskemikalier", "Lager för 7 dygn", 3],
  ["Särskilt boende, dygnsomsorg", "el", "Larm, hiss och medicinteknik", "Inget fast aggregat vid Granbacken", 4],
  ["Särskilt boende, dygnsomsorg", "varme", "Fjärrvärme", "Reservvärme saknas", 4],
  ["Hemtjänst och trygghetslarm", "it", "Trygghetslarm över mobilnät", "Ingen reservväg, svag täckning", 5],
  ["Hemtjänst och trygghetslarm", "transport", "14 fordon, långa avstånd", "Drivmedel endast i fordonstankar", 4],
  ["Krisledning och lägesbild", "el", "Ledningsplats i kommunhuset", "Fast aggregat 120 kVA", 2],
  ["Krisledning och lägesbild", "personal", "Stabsutbildad personal", "Endast ett skift utbildat", 4],
  ["Värme och fastighetsdrift", "el", "Cirkulationspumpar och styrning", "Reservkraft saknas", 4],
  ["Måltidsförsörjning", "livsmedel", "Leverans två gånger per vecka", "Lager 2 dygn", 4],
]) ins("dependencies", { function_id: FN[fn], typ, beskrivning, reservlosning: reserv, sarbarhet });

for (const [kategori, benamning, kapacitet, antal, enhet, placering, kort, status, sista, nasta, ansvarig, not] of [
  ["reservkraft", "Fast reservkraftaggregat, kommunhuset", "120 kVA", 1, "st", "Kommunhuset", "TFF", "driftklar", "2026-09-11", "2026-12-11", "Håkan Selin", ""],
  ["reservkraft", "Fast reservkraftaggregat, Furulund", "60 kVA", 1, "st", "Furulunds boende", "VOF", "driftklar", "2026-08-19", "2026-11-19", "Håkan Selin", ""],
  ["reservkraft", "Mobilt reservkraftaggregat", "60 kVA", 1, "st", "Förrådet Industrigatan", "TFF", "service", "2026-05-14", "2026-11-14", "Jonas Vik", "Service beställd, ej utförd."],
  ["reservkraft", "Reservkraft vattenverket", "—", 0, "st", "—", "NEV", "ur_drift", null, null, "Katarina Sund", "Saknas helt. Mobilt aggregat måste köras till plats."],
  ["drivmedel", "Dieseltank, förrådet", "3 000 liter", 3000, "liter", "Industrigatan 7", "TFF", "driftklar", "2026-10-02", "2027-01-02", "Per Dahlgren", ""],
  ["vatten", "Nödvattentank på släp", "8 m³", 1, "st", "Vattenverket", "NEV", "driftklar", "2026-06-18", "2027-06-18", "Rickard Modin", ""],
  ["vatten", "Dunkar för utdelning", "10 liter", 120, "st", "Förrådet Industrigatan", "NEV", "driftklar", "2026-06-18", "2027-06-18", "Rickard Modin", "Behov enligt plan: 400 st."],
  ["samband", "Rakel-handenheter", "RA 4", 8, "st", "Fördelade på förvaltningar", "KSF", "driftklar", "2026-09-01", "2026-12-01", "Nina Brolin", ""],
  ["samband", "Satellittelefon", "Iridium", 1, "st", "Ledningsplatsen", "KSF", "okand", null, null, "Nina Brolin", "Funktion ej kontrollerad sedan anskaffning."],
  ["varme", "Mobila värmeaggregat", "25 kW", 2, "st", "Förrådet Industrigatan", "TFF", "driftklar", "2026-09-11", "2027-03-11", "Håkan Selin", ""],
  ["livsmedel", "Beredskapslager livsmedel", "2 dygn", 2, "dygn", "Produktionsköket", "BUN", "driftklar", "2026-10-05", "2027-01-05", "Marie Tholin", "Mål enligt plan: 7 dygn."],
  ["fordon", "Terrängfordon", "—", 1, "st", "Industrigatan 7", "TFF", "driftklar", "2026-09-11", "2027-03-11", "Per Dahlgren", ""],
]) ins("resources", {
  kategori, benamning, kapacitet, antal, enhet, placering, unit_id: UN[kort],
  status, sista_kontroll: sista, nasta_kontroll: nasta, ansvarig, noteringar: not,
});

for (const [namn, typ, datum, status, malgrupp, deltagare, scenario, krav, erf] of [
  ["Introduktionsutbildning krisberedskap", "utbildning", "2026-03-18", "utvarderad", "Förvaltningschefer", 14,
   "Genomgång av roller, krisledningsplan och stabsmetodik.", "LEH-UTB",
   "Behov av egen stabsutbildning framkom. Ingen hade arbetat i stab tidigare."],
  ["Stabsövning Snökaos", "simulering", "2026-09-23", "genomford", "Krisledningsstaben", 11,
   "Snöoväder, avskurna byar och elavbrott i två dygn.", "LEH-UTB", ""],
  ["Samverkansövning med länsstyrelsen", "simulering", "2027-04-21", "planerad", "Stab och förvaltningschefer", 0,
   "Höjd beredskap med störd elförsörjning.", "LEH-SAMV", ""],
]) ins("exercises", {
  namn, typ, datum, status, malgrupp, deltagare, scenario, forankrad_lagkrav: krav, erfarenheter: erf,
});

for (const [titel, kalla, ref, ansvarig, kort, prio, status, forfallo, klar, beskrivning] of [
  ["Anskaffa fast reservkraft till vattenverket", "rsa", "Avbrott i dricksvattenförsörjningen", "Katarina Sund", "NEV", "hog", "pagaende", "2027-03-31", null,
   "Vattenverket saknar reservkraft. Mobilt aggregat måste i dag köras till plats, vilket tar tre timmar."],
  ["Utbilda ett andra stabsskift", "ovning", "Introduktionsutbildning krisberedskap", "Tove Bergqvist", "KSF", "hog", "pagaende", "2026-12-31", null,
   "Endast ett skift kan bemannas. Krav på dygnstäckande stabsarbete."],
  ["Upprätta kontinuitetsplan för hemtjänst", "kontinuitet", "Hemtjänst och trygghetslarm", "Birgitta Hall", "VOF", "hog", "ej_paborjad", "2027-02-28", null,
   "Plan saknas helt. 142 trygghetslarm beroende av ett mobilnät med svag täckning."],
  ["Teckna avtal om reservoperatör för vattenverket", "rsa", "Avbrott i dricksvattenförsörjningen", "Katarina Sund", "NEV", "hog", "ej_paborjad", "2027-01-31", null,
   "Endast två certifierade operatörer. Ingen avtalad reserv."],
  ["Komplettera med 280 vattendunkar", "resurs", "Dunkar för utdelning", "Rickard Modin", "NEV", "normal", "ej_paborjad", "2027-05-31", null,
   "Nuvarande 120 dunkar täcker 30 procent av behovet."],
  ["Kontrollera satellittelefonens funktion", "resurs", "Satellittelefon", "Nina Brolin", "KSF", "normal", "pagaende", "2026-11-15", null,
   "Enheten har inte kontrollerats sedan anskaffningen."],
  ["Slutför krigsplacering av föreslagen personal", "krigsorg", "LEH-KRIGSORG", "Tove Bergqvist", "KSF", "hog", "pagaende", "2026-12-31", null,
   "Sex befattningar har föreslagen men inte beslutad placering."],
]) ins("actions", {
  titel, beskrivning, kalla, kalla_ref: ref, ansvarig, unit_id: UN[kort],
  prioritet: prio, status, forfallodatum: forfallo, klar_datum: klar, skapad: "2026-08-25",
});

/* ================================================================= VRETA ===== */
// Ansluten i slutet av september 2026. Här finns nästan ingenting ännu, vilket
// är hur en kommun faktiskt ser ut veckan efter införandet.
ORG = VRETA;

const UV = {};
for (const [namn, kortnamn, typ, chef, sv, anst] of [
  ["Kommunkontoret", "KK", "forvaltning", "Johan Stenmark", true, 21],
  ["Omsorgsförvaltningen", "OF", "forvaltning", "Git Hellström", true, 118],
  ["Utbildningsförvaltningen", "UF", "forvaltning", "Rolf Agne", true, 94],
  ["Teknisk förvaltning", "TF", "forvaltning", "Sune Palm", true, 31],
]) UV[kortnamn] = ins("units", { namn, kortnamn, typ, chef, samhallsviktig: sv, anstallda: anst });

const PV = {};
for (const [kort, titel, niva, krit, platser, sk, uppgift] of [
  ["KK", "Krisledningschef", "ledning", "A", 1, "2", "Leder kommunens krisledning."],
  ["KK", "Beredskapssamordnare", "ledning", "A", 1, "2", "Samordnar beredskapsarbetet, tjänsten delas med grannkommun."],
  ["KK", "Stabsassistent", "stab", "B", 2, "ingen", "Dokumentation och stabsstöd."],
  ["OF", "Verksamhetschef omsorg", "ledning", "A", 1, "3", "Prioriterar omsorgsinsatser."],
  ["OF", "Sjuksköterska i beredskap", "operativ", "A", 2, "ingen", "Sjukvårdsberedskap."],
  ["TF", "Teknisk chef", "ledning", "A", 1, "3", "Teknisk försörjning och fastighetsdrift."],
]) PV[kort + "|" + titel] = ins("positions", {
  unit_id: UV[kort], titel, niva, kritikalitet: krit, platser, sakerhetsklass: sk, uppgift,
});

const PEV = {};
for (const [namn, kort, bef, pnr, f] of [
  ["Johan Stenmark", "KK", "Kommunchef", "19701105-XXXX", { sk: "2", rk: "begard" }],
  ["Git Hellström", "OF", "Omsorgschef", "19680317-XXXX", { sk: "3", rk: "ej_aktuell" }],
  ["Rolf Agne", "UF", "Utbildningschef", "19750829-XXXX", {}],
  ["Sune Palm", "TF", "Teknisk chef", "19640712-XXXX", { sk: "3", rk: "ej_aktuell", risk: true, not: "Går i pension 2027." }],
  ["Berit Lund", "KK", "Kanslist", "19810204-XXXX", {}],
  ["Anna Siverts", "OF", "Sjuksköterska", "19900611-XXXX", {}],
  ["Mikael Boström", "TF", "Drifttekniker", "19860928-XXXX", {}],
  ["Lisa Fahlén", "UF", "Rektor", "19930215-XXXX", {}],
]) {
  const [f1, f2] = namn.split(" ").map((d) => d.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""));
  PEV[namn] = ins("people", {
    namn, pnr_maskerat: pnr, unit_id: UV[kort], befattning_fred: bef,
    epost: `${f1}.${f2}@vreta.se`, telefon: "013-44" + String(1000 + Math.floor(Math.random() * 8999)).slice(0, 4),
    anstallningsform: "tillsvidare", fm_krigsplacerad: !!f.fm, annan_plikt: f.plikt || "",
    sakerhetsklass: f.sk || "ingen", registerkontroll: f.rk || "ej_aktuell",
    bortrest_risk: !!f.risk, noteringar: f.not || "",
  });
}

for (const [pos, person, status, datum, anm] of [
  ["KK|Krisledningschef", "Johan Stenmark", "foreslagen", null, "Registerkontroll begärd 2026-10-06."],
  ["KK|Beredskapssamordnare", "Berit Lund", "foreslagen", null, "Tillfällig lösning, tjänsten är vakant."],
  ["OF|Verksamhetschef omsorg", "Git Hellström", "foreslagen", null, "Säkerhetsprövning ej påbörjad."],
]) ins("placements", {
  position_id: PV[pos], person_id: PEV[person], status, beslutsdatum: datum,
  beslut_av: "", underrattad: false, anmarkning: anm,
});

for (const [namn, kategori, s_, k_, agare, kort, status, beskrivning, hb] of [
  ["Långvarigt elavbrott", "teknisk", 3, 5, "Sune Palm", "TF", "identifierad",
   "Överförd från förra mandatperiodens analys. Ej ombedömd.", true],
  ["Avbrott i dricksvattenförsörjningen", "teknisk", 3, 5, "Sune Palm", "TF", "identifierad",
   "Kommunen köper vatten från grannkommunen. Beroendet är inte analyserat.", true],
  ["Personalbortfall", "halsa", 3, 4, "Git Hellström", "OF", "identifierad",
   "Liten organisation, få ersättare.", false],
]) ins("risks", {
  namn, kategori, beskrivning, sannolikhet: s_, konsekvens: k_, agare, unit_id: UV[kort],
  status, senast_bedomd: "2023-09-14", hojd_beredskap: hb,
});

const FV = {};
for (const [kort, namn, prio, mtpd, faktisk, ps, pd, brukare, beskrivning] of [
  ["OF", "Särskilt boende, dygnsomsorg", 1, 4, 12, "saknas", null, 42,
   "Ett boende med 42 platser."],
  ["KK", "Krisledning och lägesbild", 1, 4, 12, "saknas", null, 4215,
   "Ledningsplats saknar reservkraft."],
]) FV[namn] = ins("critical_functions", {
  unit_id: UV[kort], namn, beskrivning, prioritet: prio, mtpd_timmar: mtpd,
  faktisk_timmar: faktisk, plan_status: ps, plan_datum: pd, berorda_brukare: brukare,
});

for (const [fn, typ, beskrivning, reserv, sarbarhet] of [
  ["Särskilt boende, dygnsomsorg", "el", "Larm och medicinteknisk utrustning", "Ingen reservkraft", 5],
  ["Särskilt boende, dygnsomsorg", "varme", "Fjärrvärme", "Ingen reservvärme", 4],
  ["Krisledning och lägesbild", "el", "Ledningsplats i kommunkontoret", "Ingen reservkraft", 5],
  ["Krisledning och lägesbild", "it", "Rakel saknas, endast mobiltelefoni", "Ingen reservväg", 5],
]) ins("dependencies", { function_id: FV[fn], typ, beskrivning, reservlosning: reserv, sarbarhet });

for (const [kategori, benamning, kapacitet, antal, enhet, placering, kort, status, sista, nasta, ansvarig, not] of [
  ["reservkraft", "Mobilt reservkraftaggregat", "40 kVA", 1, "st", "Tekniska förrådet", "TF", "okand", null, null, "Mikael Boström", "Funktion ej kontrollerad. Inventering pågår."],
  ["vatten", "Nödvattentank", "1 m³", 2, "st", "Tekniska förrådet", "TF", "okand", null, null, "Mikael Boström", "Inventering pågår."],
  ["samband", "Rakel-handenheter", "—", 0, "st", "—", "KK", "ur_drift", null, null, "Johan Stenmark", "Kommunen saknar Rakel. Anslutning utreds."],
  ["livsmedel", "Beredskapslager livsmedel", "0 dygn", 0, "dygn", "—", "UF", "ur_drift", null, null, "Rolf Agne", "Inget lager finns."],
]) ins("resources", {
  kategori, benamning, kapacitet, antal, enhet, placering, unit_id: UV[kort],
  status, sista_kontroll: sista, nasta_kontroll: nasta, ansvarig, noteringar: not,
});

ins("exercises", {
  namn: "Uppstartsworkshop beredskapsarbete", typ: "seminarium", datum: "2026-11-26",
  status: "planerad", malgrupp: "Kommunledning och förvaltningschefer", deltagare: 0,
  scenario: "Genomgång av nuläge, lagkrav och plan för mandatperioden.",
  forankrad_lagkrav: "LEH-UTB", erfarenheter: "",
});

for (const [titel, kalla, ref, ansvarig, kort, prio, status, forfallo, beskrivning] of [
  ["Genomför ny risk- och sårbarhetsanalys", "tillsyn", "LEH-RSA", "Johan Stenmark", "KK", "hog", "ej_paborjad", "2027-10-31",
   "Senaste analysen är från 2023 och har inte ombedömts. Ska göras för ny mandatperiod."],
  ["Slutför inventering av reservkraft och förnödenheter", "resurs", "Mobilt reservkraftaggregat", "Mikael Boström", "TF", "hog", "pagaende", "2026-12-31",
   "Status för befintlig materiel är okänd. Inventeringen påbörjades vid anslutningen."],
  ["Utred anslutning till Rakel", "rsa", "Långvarigt elavbrott", "Johan Stenmark", "KK", "hog", "ej_paborjad", "2027-06-30",
   "Kommunen saknar robust samband. All krisledning sker i dag över mobilnätet."],
]) ins("actions", {
  titel, beskrivning, kalla, kalla_ref: ref, ansvarig, unit_id: UV[kort],
  prioritet: prio, status, forfallodatum: forfallo, klar_datum: null, skapad: "2026-10-01",
});

seedaStatus(NORDMARK, "kommun", "Tove Bergqvist", {
  "LEH-RSA": { status: "uppfylld", senast: "2023-09-26", evidens: "RSA 2023, dnr KS 2023/198" },
  "LEH-PLAN": { status: "uppfylld", senast: "2024-03-14", evidens: "Krisledningsplan KF 2024-03-14 § 22" },
  "LEH-NAMND": { status: "uppfylld", senast: "2023-02-07", evidens: "Reglemente KF 2023-02-07 § 9" },
  "LEH-SAMV": { status: "pagaende", senast: "2026-06-11", evidens: "Protokoll krissamverkan 2026-06-11" },
  "LEH-UTB": { status: "pagaende", senast: "2026-09-23", evidens: "Stabsövning Snökaos 2026-09-23, ej utvärderad" },
  "LEH-RAPP": { status: "uppfylld", senast: "2026-02-20", evidens: "Årsrapport 2025, dnr KS 2026/31" },
  "LEH-KRIGSORG": { status: "pagaende", senast: "2026-05-20", evidens: "Krigsorganisation fastställd KS 2026/77" },
  "TF-KRIGSPL": { status: "brist", senast: "2026-05-20", evidens: "Sex befattningar endast föreslagna" },
  "SASK-ANALYS": { status: "brist", senast: "2023-05-30", evidens: "Analys från 2023, ej uppdaterad" },
  "SASK-CHEF": { status: "pagaende", senast: "2026-02-03", ansvarig: "Mats Hedlund", evidens: "Säkerhetsskyddschef utsedd, registerkontroller pågår" },
  "OK-KONT": { status: "brist", senast: "2026-06-02", evidens: "Kontinuitetsplan för 1 av 6 funktioner" },
  "OK-TIB": { status: "pagaende", senast: "2026-04-01", evidens: "TIB-funktion delas med grannkommun" },
  "STYREL": { status: "uppfylld", senast: "2025-05-22", ansvarig: "Per Dahlgren", evidens: "Styrelunderlag 2025 inlämnat" },
  "VATTENPLAN": { status: "uppfylld", senast: "2023-11-20", ansvarig: "Katarina Sund", evidens: "Vattentjänstplan KF 2023-11-20 § 88" },
  "NODVATTEN": { status: "brist", senast: "2022-04-12", ansvarig: "Katarina Sund", evidens: "Nödvattenplan från 2022" },
  "NIS2-ANMALAN": { status: "uppfylld", senast: "2026-02-18", ansvarig: "Nina Brolin", evidens: "Anmälan 2026-02-18" },
  "NIS2-RISK": { status: "brist", ansvarig: "Nina Brolin", evidens: "Åtgärderna ej dokumenterade" },
  "NIS2-LEDNING": { status: "ej_paborjad", ansvarig: "Mats Hedlund", evidens: "Ingen utbildning genomförd" },
  "NIS2-INCIDENT": { status: "ej_paborjad", ansvarig: "Nina Brolin", evidens: "Rutin saknas" },
  "LKRB-INFOR": { status: "ej_paborjad", evidens: "Ingen förberedelse påbörjad" },
});

seedaStatus(VRETA, "kommun", "Johan Stenmark", {
  "LEH-RSA": { status: "brist", senast: "2023-09-14", evidens: "RSA 2023, ej ombedömd" },
  "LEH-PLAN": { status: "brist", senast: "2019-06-11", evidens: "Krisledningsplan från 2019" },
  "LEH-NAMND": { status: "uppfylld", senast: "2023-01-30", evidens: "Reglemente KF 2023-01-30 § 4" },
  "LEH-RAPP": { status: "brist", senast: "2024-02-28", evidens: "Ingen rapportering 2025 eller 2026" },
  "VATTENPLAN": { status: "pagaende", ansvarig: "Sune Palm", evidens: "Arbete påbörjat hösten 2026" },
});

/* ------------------------------------------ kommunspecifika tillägg till krav */
// Kravkatalogen är gemensam och får bara beskriva lagen. Det som skiljer sig
// mellan kommuner räknas ut per organisation och läggs till här, så att en
// kommuns uppgifter aldrig följer med in i en annan kommuns kravlista.

// Tillsynsmyndighet för kommuner enligt cybersäkerhetsförordningen (2025:1507)
// 10–15 §§. Sex länsstyrelser delar upp landet mellan sig.
const TILLSYN_PER_LAN = {
  "Jämtlands län": "Länsstyrelsen i Norrbottens län",
  "Norrbottens län": "Länsstyrelsen i Norrbottens län",
  "Västerbottens län": "Länsstyrelsen i Norrbottens län",
  "Västernorrlands län": "Länsstyrelsen i Norrbottens län",
  "Blekinge län": "Länsstyrelsen i Skåne län",
  "Kronobergs län": "Länsstyrelsen i Skåne län",
  "Skåne län": "Länsstyrelsen i Skåne län",
  "Gotlands län": "Länsstyrelsen i Stockholms län",
  "Stockholms län": "Länsstyrelsen i Stockholms län",
  "Hallands län": "Länsstyrelsen i Västra Götalands län",
  "Västra Götalands län": "Länsstyrelsen i Västra Götalands län",
  "Dalarnas län": "Länsstyrelsen i Örebro län",
  "Gävleborgs län": "Länsstyrelsen i Örebro län",
  "Södermanlands län": "Länsstyrelsen i Örebro län",
  "Uppsala län": "Länsstyrelsen i Örebro län",
  "Värmlands län": "Länsstyrelsen i Örebro län",
  "Västmanlands län": "Länsstyrelsen i Örebro län",
  "Örebro län": "Länsstyrelsen i Örebro län",
  "Jönköpings län": "Länsstyrelsen i Östergötlands län",
  "Kalmar län": "Länsstyrelsen i Östergötlands län",
  "Östergötlands län": "Länsstyrelsen i Östergötlands län",
};

/* ============================================================== VÄSTMARK ===== */
// Region. Bär hälso- och sjukvårdens beredskap ovanpå LEH, och får därför en
// annan kravlista än kommunerna ur samma katalog.
ORG = VASTMARK;

const UR = {};
for (const [namn, kortnamn, typ, chef, sv, anst] of [
  ["Hälso- och sjukvårdsförvaltningen", "HSF", "forvaltning", "Dr Ingrid Falk", true, 9240],
  ["Regionservice", "RS", "forvaltning", "Tomas Nyberg", true, 1180],
  ["Kollektivtrafikförvaltningen", "KTF", "forvaltning", "Marie Löfgren", true, 310],
  ["Regionkontoret", "RK", "forvaltning", "Helena Krantz", true, 420],
  ["Folktandvården", "FTV", "bolag", "Dr Samir Haddad", false, 540],
]) UR[kortnamn] = ins("units", { namn, kortnamn, typ, chef, samhallsviktig: sv, anstallda: anst });

const PR = {};
for (const [kort, titel, niva, krit, platser, sk, uppgift] of [
  ["RK", "Regional krisledningschef", "ledning", "A", 1, "1", "Leder regionens krisledning vid allvarlig händelse och höjd beredskap."],
  ["RK", "Beredskapschef", "ledning", "A", 1, "2", "Samordnar regionens krisberedskap och civila försvar."],
  ["RK", "Tjänsteperson i beredskap", "ledning", "A", 4, "2", "Nås dygnet runt, initierar regionens krisledning."],
  ["HSF", "Katastrofmedicinsk ledningsläkare", "ledning", "A", 3, "2", "Medicinsk ledning vid masskadehändelse."],
  ["HSF", "Regional sjukvårdsledare", "ledning", "A", 3, "2", "Leder sjukvårdsinsats i regional särskild sjukvårdsledning."],
  ["HSF", "Smittskyddsläkare", "ledning", "A", 1, "2", "Ansvarar för smittskyddet i regionen enligt smittskyddslagen."],
  ["HSF", "Sjuksköterska, akutmottagning", "operativ", "B", 18, "ingen", "Akut omhändertagande vid masskadeutfall."],
  ["RS", "Driftchef försörjning", "stab", "A", 1, "3", "Reservkraft, medicinska gaser och förnödenheter."],
  ["KTF", "Trafikledare i beredskap", "operativ", "B", 2, "ingen", "Omfördelar kollektivtrafik, transportstöd vid evakuering."],
]) PR[kort + "|" + titel] = ins("positions", {
  unit_id: UR[kort], titel, niva, kritikalitet: krit, platser, sakerhetsklass: sk, uppgift,
});

const PER = {};
for (const [namn, kort, bef, pnr, f] of [
  ["Helena Krantz", "RK", "Beredskapschef", "19740922-XXXX", { sk: "2", rk: "klar" }],
  ["Ingrid Falk", "HSF", "Hälso- och sjukvårdsdirektör", "19660408-XXXX", { sk: "1", rk: "klar" }],
  ["Oskar Rydell", "HSF", "Överläkare akutkliniken", "19800115-XXXX", { sk: "2", rk: "klar" }],
  ["Nadia Persson", "HSF", "Smittskyddsläkare", "19770630-XXXX", { sk: "2", rk: "utgangen" }],
  ["Tomas Nyberg", "RS", "Servicedirektör", "19690213-XXXX", { sk: "3", rk: "klar" }],
  ["Marie Löfgren", "KTF", "Trafikdirektör", "19830507-XXXX", { sk: "3", rk: "begard" }],
  ["Petra Lindqvist", "HSF", "Avdelningschef IVA", "19880319-XXXX", { sk: "ingen", rk: "ej_aktuell" }],
  ["Jonas Ek", "RS", "Drifttekniker", "19910824-XXXX", { fm: true, not: "Krigsplacerad i Försvarsmakten sedan 2019. Samråd krävs före beslut." }],
  ["Camilla Wahl", "RK", "Säkerhetschef", "19720111-XXXX", { sk: "1", rk: "klar" }],
  ["Henrik Aune", "KTF", "Trafikledare", "19950702-XXXX", { plikt: "Räddningstjänstplikt, deltidsbrandman" }],
]) {
  const [f1, f2] = namn.split(" ").map((d) => d.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  PER[namn] = ins("people", {
    namn, pnr_maskerat: pnr, unit_id: UR[kort], befattning_fred: bef,
    epost: `${f1}.${f2}@regionvastmark.se`,
    telefon: "019-602 " + String(10 + Math.floor(Math.random() * 89)) + " " + String(10 + Math.floor(Math.random() * 89)),
    anstallningsform: "tillsvidare", fm_krigsplacerad: !!f.fm, annan_plikt: f.plikt || "",
    sakerhetsklass: f.sk || "ingen", registerkontroll: f.rk || "ej_aktuell",
    bortrest_risk: !!f.risk, noteringar: f.not || "",
  });
}

for (const [pos, person, status, datum, anm] of [
  ["RK|Regional krisledningschef", "Ingrid Falk", "beslutad", "2026-03-12", ""],
  ["RK|Beredskapschef", "Helena Krantz", "underrattad", "2026-03-12", "Underrättad 2026-04-02."],
  ["RK|Tjänsteperson i beredskap", "Camilla Wahl", "beslutad", "2026-03-12", ""],
  // Dubbelplacering: smittskyddsläkaren är placerad både som ledningsläkare och
  // på sin egen befattning. Kontrollen i hamtaKonflikter ska fånga det.
  ["HSF|Katastrofmedicinsk ledningsläkare", "Nadia Persson", "foreslagen", null, "Registerkontrollen är utgången."],
  ["HSF|Smittskyddsläkare", "Nadia Persson", "beslutad", "2026-03-12", ""],
  ["HSF|Regional sjukvårdsledare", "Oskar Rydell", "beslutad", "2026-03-12", ""],
  ["RS|Driftchef försörjning", "Tomas Nyberg", "beslutad", "2026-03-12", ""],
  // Samrådsplikt mot Försvarsmakten.
  ["RS|Driftchef försörjning", "Jonas Ek", "foreslagen", null, "Redan krigsplacerad i Försvarsmakten."],
  ["KTF|Trafikledare i beredskap", "Henrik Aune", "foreslagen", null, "Har räddningstjänstplikt, samråd krävs."],
]) ins("placements", {
  position_id: PR[pos], person_id: PER[person], status, beslutsdatum: datum,
  beslut_av: status === "foreslagen" ? "" : "Regionstyrelsen 2026-03-12 § 31", 
  underrattad: status === "underrattad", anmarkning: anm,
});

for (const [namn, kategori, s_, k_, agare, kort, status, beskrivning, hb] of [
  ["Masskadehändelse", "halsa", 3, 5, "Ingrid Falk", "HSF", "atgardas",
   "Händelse med fler skadade än regionens ordinarie akutkapacitet klarar.", true],
  ["Långvarigt elavbrott vid länssjukhuset", "teknisk", 2, 5, "Tomas Nyberg", "RS", "atgardas",
   "Reservkraft täcker prioriterade avdelningar i 72 timmar.", true],
  ["Haveri i journalsystemet", "teknisk", 3, 5, "Ingrid Falk", "HSF", "bedomd",
   "Vårddokumentation och läkemedelsordination slås ut. Reservrutin på papper.", true],
  ["Utbrott av smittsam sjukdom", "halsa", 4, 4, "Nadia Persson", "HSF", "bedomd",
   "Belastar vårdplatser och personal samtidigt.", true],
  ["Antagonistisk påverkan mot vårdinformationssystem", "antagonistisk", 3, 5, "Camilla Wahl", "RK", "atgardas",
   "Ransomware mot regionens vårdsystem.", true],
  ["Bortfall av medicinska gaser", "forsorjning", 2, 5, "Tomas Nyberg", "RS", "bedomd",
   "Syrgasförsörjning till IVA och vårdavdelningar.", true],
]) ins("risks", {
  namn, kategori, beskrivning, sannolikhet: s_, konsekvens: k_, agare, unit_id: UR[kort],
  status, senast_bedomd: "2026-05-28", hojd_beredskap: hb,
});

const FR = {};
for (const [kort, namn, prio, mtpd, faktisk, ps, pd, brukare, beskrivning] of [
  ["HSF", "Akutmottagning länssjukhuset", 1, 0, 2, "faststalld", "2026-04-15", 298400,
   "Dygnetruntöppen akutmottagning, cirka 62 000 besök per år."],
  ["HSF", "Intensivvård", 1, 0, 1, "faststalld", "2026-04-15", 14,
   "14 IVA-platser, varav 8 med respirator."],
  ["HSF", "Ambulanssjukvård", 1, 0, 1, "faststalld", "2026-02-20", 298400,
   "17 ambulanser och en akutläkarbil."],
  ["HSF", "Vårdinformationssystem", 1, 2, 24, "utkast", null, 298400,
   "Journal, läkemedelsordination och remisshantering."],
  ["HSF", "Dialysverksamhet", 2, 24, 48, "utgangen", "2023-06-01", 96,
   "96 patienter i kronisk hemodialys, tre behandlingar per vecka."],
  ["KTF", "Regional kollektivtrafik", 2, 12, 36, "saknas", null, 298400,
   "Busstrafik och sjukresor. Transportresurs vid evakuering."],
  ["FTV", "Akuttandvård", 3, 72, 72, "faststalld", "2025-09-10", 298400,
   "Akut smärtlindring och infektionsbehandling."],
]) FR[namn] = ins("critical_functions", {
  unit_id: UR[kort], namn, beskrivning, prioritet: prio, mtpd_timmar: mtpd,
  faktisk_timmar: faktisk, plan_status: ps, plan_datum: pd, berorda_brukare: brukare,
});

for (const [fn, typ, beskrivning, reserv, sarbarhet] of [
  ["Akutmottagning länssjukhuset", "el", "Belysning, medicinteknik, diagnostik", "Reservkraft 72 h", 3],
  ["Akutmottagning länssjukhuset", "personal", "Akutläkare och sjuksköterskor", "Inkallelseplan", 4],
  ["Intensivvård", "el", "Respiratorer och övervakning", "Reservkraft 72 h, UPS 30 min", 3],
  ["Intensivvård", "leverantor", "Medicinska gaser, syrgas", "Tankbil, leveranstid 6 h", 5],
  ["Ambulanssjukvård", "drivmedel", "Dieselförsörjning", "Egen tank, 5 dygn", 3],
  ["Ambulanssjukvård", "it", "Larmöverföring via SOS Alarm", "Rakel som reservväg", 2],
  ["Vårdinformationssystem", "it", "Regionens datacenter", "Reservrutin på papper, ej övad", 5],
  ["Vårdinformationssystem", "leverantor", "Extern systemleverantör", "Avtal utan beredskapsklausul", 5],
  ["Dialysverksamhet", "vatten", "Renat vatten till dialysmaskiner", "Ingen reservlösning", 5],
  ["Dialysverksamhet", "el", "Dialysmaskiner", "Reservkraft", 3],
  ["Regional kollektivtrafik", "drivmedel", "Diesel och HVO till bussflottan", "Avtal utan prioritet vid ransonering", 4],
]) ins("dependencies", { function_id: FR[fn], typ, beskrivning, reservlosning: reserv, sarbarhet });

for (const [kategori, benamning, kapacitet, antal, enhet, placering, kort, status, sk, nk, ansvarig, not] of [
  ["reservkraft", "Stationärt reservkraftverk, länssjukhuset", "2 x 1 600 kVA", 2, "st", "Länssjukhuset Västmark", "RS", "driftklar", "2026-09-04", "2026-12-04", "Tomas Nyberg", "Provkörs månadsvis med last."],
  ["reservkraft", "Mobilt reservkraftverk", "150 kVA", 3, "st", "Regionservice depå", "RS", "service", "2026-06-12", "2026-09-12", "Tomas Nyberg", "Ett aggregat på service sedan juni, kontrollintervallet passerat."],
  ["drivmedel", "Dieseltank, ambulansstation", "18 000 liter", 18000, "liter", "Ambulansstation Västmark", "HSF", "driftklar", "2026-10-02", "2027-01-02", "Tomas Nyberg", "Täcker ambulansdrift i cirka 5 dygn."],
  ["sjukvard", "Syrgas, flytande", "22 000 liter", 22000, "liter", "Länssjukhuset, gascentral", "RS", "driftklar", "2026-10-10", "2026-11-10", "Tomas Nyberg", "Förbrukning vid normaldrift cirka 1 800 liter per dygn."],
  ["sjukvard", "Katastrofberedskapslager, förbrukningsmateriel", "500 skadade", 1, "lager", "Länssjukhuset, plan -1", "HSF", "okand", null, null, "Ingrid Falk", "Inventering ej genomförd sedan 2024."],
  ["samband", "Rakel-terminaler", "Ledning och ambulans", 180, "st", "Fördelade per verksamhet", "RK", "driftklar", "2026-08-19", "2027-02-19", "Camilla Wahl", ""],
  ["vatten", "Reservvattentank, dialysen", "6 000 liter", 6000, "liter", "Länssjukhuset, plan 3", "HSF", "ur_drift", "2026-05-30", "2026-08-30", "Tomas Nyberg", "Läckage konstaterat i maj. Dialysen saknar därmed reservvatten."],
  ["fordon", "Sjuktransportbussar", "12 bårplatser vardera", 2, "st", "Kollektivtrafikdepån", "KTF", "driftklar", "2026-07-08", "2027-01-08", "Marie Löfgren", "Kan användas vid masskadehändelse."],
]) ins("resources", {
  kategori, benamning, kapacitet, antal, enhet, placering, unit_id: UR[kort],
  status, sista_kontroll: sk, nasta_kontroll: nk, ansvarig, noteringar: not,
});

for (const [namn, typ, datum, status, malgrupp, deltagare, scenario, krav, erf] of [
  ["Regional masskadeövning Sirius", "faltovning", "2026-05-08", "utvarderad", "Särskild sjukvårdsledning, akutmottagning, ambulans", 140,
   "Bussolycka med 48 skadade, varav 12 prio 1.", "OK-REGION",
   "Larmvägen till katastrofmedicinsk ledningsläkare tog 34 minuter mot målsatta 15. Reservrutin för journal på papper var inte känd av personalen."],
  ["Stabsövning smittskydd", "simulering", "2026-09-17", "genomford", "Regional krisledning, smittskyddsenheten", 22,
   "Utbrott av luftburen smitta med behov av kohortvård.", "HSL-KATASTROF", ""],
  ["Utbildning i krigsplacering", "utbildning", "2026-02-11", "utvarderad", "HR och verksamhetschefer", 35,
   "Genomgång av samrådsplikt och säkerhetsprövning.", "TF-KRIGSPL",
   "Verksamhetscheferna saknade underlag om vilka som har annan plikt."],
  ["Reservkraftprov länssjukhuset", "larmovning", "2026-11-19", "planerad", "Regionservice, HSF", 0,
   "Avbrott i ordinarie kraftmatning under 8 timmar.", "", ""],
]) ins("exercises", { namn, typ, datum, status, malgrupp, deltagare, scenario, forankrad_lagkrav: krav, erfarenheter: erf });

for (const [titel, kalla, ref, ansvarig, kort, prio, status, forfallo, klar, beskrivning] of [
  ["Åtgärda larmvägen till katastrofmedicinsk ledningsläkare", "ovning", "Regional masskadeövning Sirius", "Oskar Rydell", "HSF", "hog", "pagaende", "2026-11-30", null,
   "Larmvägen tog 34 minuter mot målsatta 15. Ny larmrutin via TiB ska införas och övas."],
  ["Öva reservrutin för journal på papper", "ovning", "Regional masskadeövning Sirius", "Petra Lindqvist", "HSF", "hog", "ej_paborjad", "2027-02-28", null,
   "Personalen kände inte till reservrutinen vid övningen."],
  ["Reparera reservvattentank till dialysen", "resurs", "Reservvattentank, dialysen", "Tomas Nyberg", "RS", "hog", "pagaende", "2026-11-15", null,
   "Tanken är ur drift sedan maj. Dialysverksamheten saknar reservvatten och har 96 patienter i kronisk behandling."],
  ["Förnya registerkontroll för smittskyddsläkaren", "krigsorg", "SASK-CHEF", "Camilla Wahl", "RK", "hog", "pagaende", "2026-11-30", null,
   "Registerkontrollen är utgången för en befattning i säkerhetsklass 2."],
  ["Ta fram kontinuitetsplan för regional kollektivtrafik", "kontinuitet", "Regional kollektivtrafik", "Marie Löfgren", "KTF", "normal", "ej_paborjad", "2027-03-31", null,
   "Planen saknas helt. Trafiken är transportresurs vid evakuering."],
  ["Förhandla beredskapsklausul med systemleverantören", "rsa", "Haveri i journalsystemet", "Camilla Wahl", "RK", "normal", "ej_paborjad", "2027-06-30", null,
   "Nuvarande avtal saknar krav på återställningstid vid allvarlig händelse."],
  ["Inventera katastrofberedskapslagret", "resurs", "Katastrofberedskapslager, förbrukningsmateriel", "Ingrid Falk", "HSF", "normal", "ej_paborjad", "2026-12-31", null,
   "Ingen inventering sedan 2024. Lagrets status är okänd."],
]) ins("actions", {
  titel, beskrivning, kalla, kalla_ref: ref, ansvarig, unit_id: UR[kort],
  prioritet: prio, status, forfallodatum: forfallo, klar_datum: klar, skapad: "2026-05-20",
});

seedaStatus(VASTMARK, "region", "Helena Krantz", {
  "LEH-RSA": { status: "uppfylld", senast: "2026-05-28", evidens: "RSA 2026, dnr RS 2026/244" },
  "LEH-PLAN": { status: "uppfylld", senast: "2026-06-18", evidens: "Krisledningsplan RF 2026-06-18 § 71" },
  "LEH-NAMND": { status: "uppfylld", senast: "2023-02-21", evidens: "Reglemente RF 2023-02-21 § 12" },
  "LEH-SAMV": { status: "uppfylld", senast: "2026-09-03", evidens: "Regionalt samverkansråd, protokoll 2026-09-03" },
  "LEH-UTB": { status: "uppfylld", senast: "2026-05-08", evidens: "Masskadeövning Sirius, utvärderad 2026-06-04" },
  "LEH-RAPP": { status: "uppfylld", senast: "2026-02-26", evidens: "Årsrapport 2025, dnr RS 2026/58" },
  "LEH-KRIGSORG": { status: "uppfylld", senast: "2026-03-12", evidens: "Krigsorganisation fastställd RS 2026-03-12 § 31" },
  "TF-KRIGSPL": { status: "pagaende", senast: "2026-03-12", ansvarig: "Camilla Wahl",
    evidens: "Tre befattningar föreslagna, samråd pågår", not: "Samråd med Försvarsmakten begärt 2026-09-30 för en person." },
  "SASK-ANALYS": { status: "uppfylld", senast: "2025-11-04", ansvarig: "Camilla Wahl", evidens: "Säkerhetsskyddsanalys 2025, dnr RS 2025/501" },
  "SASK-CHEF": { status: "brist", senast: "2026-01-15", ansvarig: "Camilla Wahl", evidens: "Registerkontroll utgången för en befattning i säkerhetsklass 2" },
  "NIS2-ANMALAN": { status: "uppfylld", senast: "2026-03-04", ansvarig: "Camilla Wahl", evidens: "Anmälan 2026-03-04" },
  "NIS2-RISK": { status: "pagaende", ansvarig: "Camilla Wahl", evidens: "Åtgärdsplan beslutad, införande pågår" },
  "NIS2-LEDNING": { status: "uppfylld", senast: "2026-04-22", ansvarig: "Camilla Wahl", evidens: "Utbildning för regionstyrelsen 2026-04-22" },
  "NIS2-INCIDENT": { status: "pagaende", ansvarig: "Camilla Wahl", evidens: "Rutin framtagen, ej övad" },
  "OK-REGION": { status: "uppfylld", senast: "2026-02-26", evidens: "Redovisning till MSB 2026-02-26" },
  "HSL-KATASTROF": { status: "pagaende", senast: "2026-04-15", ansvarig: "Ingrid Falk",
    evidens: "Katastrofmedicinsk beredskapsplan 2026-04-15",
    not: "Planen bygger på SOSFS 2013:22, som upphörde vid utgången av 2025. Ska ses över när föreskriftsläget klarnat." },
  "HSL-UTLAND": { status: "ej_paborjad", ansvarig: "Ingrid Falk",
    evidens: "Regionen saknar uppdrag", not: "Region Västmark har inte uppdrag om insatser utomlands." },
  SMITTSKYDD: { status: "uppfylld", senast: "2026-01-08", ansvarig: "Nadia Persson", evidens: "Smittskyddsläkare förordnad, smittskyddsenhet med 6 tjänster" },
  "LKRB-INFOR": { status: "pagaende", ansvarig: "Helena Krantz", evidens: "Gapanalys mot prop. 2026/27:5 påbörjad" },
});

// Tillsynsmyndigheten följer av länet, och för en region dessutom av att
// regionen är vårdgivare: enligt cybersäkerhetsförordningen 7 § är IVO
// tillsynsmyndighet för vårdgivare, medan länsstyrelsen svarar för offentlig
// förvaltning. 16 § säger att myndigheter som delar verksamhetsutövare ska
// komma överens om hur tillsynen genomförs.
for (const o of db.prepare("SELECT id, typ, lan FROM organisations").all()) {
  const lst = TILLSYN_PER_LAN[o.lan] ?? "den länsstyrelse som anges i förordningen";
  const tillsyn =
    o.typ === "region"
      ? `${lst} (offentlig förvaltning) och Inspektionen för vård och omsorg (vårdgivare)`
      : lst;
  db.prepare("UPDATE organisations SET tillsyn_cyber = ? WHERE id = ?").run(tillsyn, o.id);
}

/* ------------------------------------------------------------- användare */
// Demolösenord. I skarp drift ersätts lokala lösenord av federerad inloggning
// mot respektive kommuns katalogtjänst; medlemskap och roll blir kvar här.
function hasha(losenord) {
  const salt = randomBytes(16).toString("hex");
  return { salt, hash: scryptSync(losenord, salt, 64).toString("hex") };
}

// [namn, epost, lösenord, [[org, roll, enhetskortnamn eller null], ...]]
const userRows = [
  ["Marika Öhlund", "marika.ohlund@angsholm.se", "beredskap2026",
   [[ANGSHOLM, "beredskapssamordnare", "KLK"]]],
  ["Pontus Ahlberg", "pontus.ahlberg@angsholm.se", "sakerhet2026",
   [[ANGSHOLM, "sakerhetsskyddschef", "KLK"]]],
  ["Sara Molin", "sara.molin@angsholm.se", "personal2026",
   [[ANGSHOLM, "hr", "KLK"]]],
  ["Annika Bergström", "annika.bergstrom@angsholm.se", "social2026",
   [[ANGSHOLM, "forvaltningschef", "SOC"]]],
  ["Henrik Lindgren", "henrik.lindgren@angsholm.se", "ledning2026",
   [[ANGSHOLM, "kommunledning", "KLK"]]],
  ["Jens Åkerlund", "jens.akerlund@angsholm.se", "drift2026",
   [[ANGSHOLM, "administrator", "KLK"]]],
  ["Tove Bergqvist", "tove.bergqvist@nordmark.se", "nordmark2026",
   [[NORDMARK, "beredskapssamordnare", null]]],
  ["Johan Stenmark", "johan.stenmark@vreta.se", "vreta2026",
   [[VRETA, "beredskapssamordnare", null]]],
  // Region. Samma roller, men kravlistan och modulinnehållet skiljer sig,
  // eftersom katalogen typar kraven på huvudmannatyp.
  ["Helena Krantz", "helena.krantz@regionvastmark.se", "vastmark2026",
   [[VASTMARK, "beredskapssamordnare", "RK"]]],
  ["Camilla Wahl", "camilla.wahl@regionvastmark.se", "sakerhet2026",
   [[VASTMARK, "sakerhetsskyddschef", "RK"]]],
  ["Ingrid Falk", "ingrid.falk@regionvastmark.se", "sjukvard2026",
   [[VASTMARK, "forvaltningschef", "HSF"]]],
  // Driftansvarig hos leverantören, med åtkomst till flera kommuner men olika
  // roll i var och en. Visar att behörigheten följer medlemskapet.
  // Leverantörsflaggan, sista fältet, ger åtkomst till det nationella registret
  // och rätten att ansluta nya organisationer. Den följer kontot, inte rollen:
  // Jens är administratör i Ängsholm men ska inte kunna lägga upp andra
  // kommuner, medan Elsa ska det.
  ["Elsa Wikner", "elsa.wikner@beredskapsnavet.se", "leverantor2026",
   [[ANGSHOLM, "kommunledning", null], [NORDMARK, "administrator", null],
    [VRETA, "administrator", null], [VASTMARK, "administrator", null]], true],
];

const ENHETER_PER_ORG = { [ANGSHOLM]: U, [NORDMARK]: UN, [VRETA]: UV, [VASTMARK]: UR };

for (const [namn, epost, losenord, medlemskap, leverantor] of userRows) {
  const { salt, hash } = hasha(losenord);
  const userId = ins("users", {
    namn, epost, losenord_hash: hash, losenord_salt: salt,
    aktiv: true, leverantor: !!leverantor, senaste_inloggning: null, skapad: "2026-01-15",
  });
  for (const [org, roll, kort] of medlemskap) {
    ins("user_orgs", {
      user_id: userId, org_id: org, roll,
      unit_id: kort ? ENHETER_PER_ORG[org][kort] : null,
    });
  }
}

// Räknas ur databasen, inte ur de hårdkodade listorna, så att summeringen
// stämmer även när en organisation läggs till.
const antal = (t) => db.prepare(`SELECT COUNT(*) AS v FROM ${t}`).get().v;
const perTyp = db
  .prepare("SELECT typ, COUNT(*) AS v FROM organisations GROUP BY typ ORDER BY typ")
  .all()
  .map((r) => `${r.v} ${r.typ}${r.v === 1 ? "" : r.typ === "kommun" ? "er" : "er"}`)
  .join(" och ");

console.log(
  `Seedat: ${antal("units")} verksamheter, ${antal("positions")} befattningar, ` +
  `${antal("people")} personer, ${antal("placements")} placeringar, ${antal("risks")} risker, ` +
  `${antal("critical_functions")} kritiska funktioner, ${antal("dependencies")} beroenden, ` +
  `${antal("resources")} resurser, ${antal("exercises")} övningar, ${antal("actions")} åtgärder, ` +
  `${antal("users")} användare i ${perTyp}.\n` +
  `Register: ${antal("org_registry")} kommuner och regioner i landet.\n` +
  `Kravkatalog: ${antal("requirement_catalog")} krav delade av alla, ` +
  `${antal("requirement_status")} statusrader. ` +
  (() => {
    const v = db
      .prepare("SELECT COUNT(*) AS v FROM requirement_catalog WHERE kontrollerad = ''")
      .get().v;
    return v === 1
      ? "1 krav är inte avstämt mot författningstext."
      : `${v} krav är inte avstämda mot författningstext.`;
  })()
);
db.close();
