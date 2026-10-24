/**
 * Skapar en tom installation: schema, det nationella registret och ett
 * driftkonto hos leverantören.
 *
 *   node --experimental-sqlite scripts/installera.mjs \
 *     --organisation 1880 --namn "Elsa Wikner" --epost elsa@leverantoren.se
 *
 * Varför den finns vid sidan av seed.mjs: seedningen bygger en DEMO. Dess
 * konton står med lösenord i scripts/seed.mjs och därmed i
 * versionshanteringen, och dess organisationer är påhittade. Så länge
 * seedningen var enda vägen till en databas var en driftsättning gjord enligt
 * dokumentationen en driftsättning med offentligt kända inloggningar. Den här
 * vägen skapar ingen demodata alls.
 *
 * Den första organisationen läggs upp på en gång, eftersom en session kräver
 * ett medlemskap: ett konto utan organisation kan inte logga in. Driftkontot
 * blir administratör där under införandet och bjuder därifrån in kommunens
 * egna användare. Resten av kunderna läggs upp i gränssnittet, under
 * Organisationer.
 *
 * Lösenordet slumpas och skrivs ut en gång. Det lagras bara som hash.
 */
import { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync } from "node:crypto";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = process.env.BEREDSKAP_DB || join(root, "db", "beredskap.db");

/* ------------------------------------------------------------- argument */

const arg = (namn) => {
  const i = process.argv.indexOf(`--${namn}`);
  return i > 0 && i + 1 < process.argv.length ? process.argv[i + 1] : "";
};

const kod = arg("organisation").trim();
const namn = arg("namn").trim();
const epost = arg("epost").trim().toLowerCase();

const anvandning = `
Användning:

  node --experimental-sqlite scripts/installera.mjs \\
    --organisation <kommunkod|länskod> \\
    --namn "<namn på driftansvarig>" \\
    --epost <adress till driftansvarig>

  --organisation  SCB:s kommunkod (fyra siffror) eller länskod (två) för den
                  första kunden. Finns i scripts/data/organisationsregister.json.
  --namn          Namnet på leverantörens driftansvariga.
  --epost         Adressen hen loggar in med.

Databasens plats styrs med BEREDSKAP_DB.
`;

const brister = [];
if (!kod) brister.push("--organisation saknas");
if (namn.length < 2) brister.push("--namn saknas");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(epost)) brister.push("--epost är inte en giltig adress");
if (brister.length) {
  console.error(brister.join("\n") + anvandning);
  process.exit(2);
}

/*
 * Installationen skapar, den skriver inte över. Finns filen redan är det
 * antingen en installation i drift eller ett avbrutet försök, och i båda
 * fallen är det fel att radera den härifrån.
 */
if (existsSync(dbPath)) {
  console.error(
    `${dbPath} finns redan. Installationen skapar en ny databas och skriver\n` +
    "aldrig över en befintlig. Flytta eller ta bort filen själv om det är\n" +
    "avsikten, eller peka ut en annan plats med BEREDSKAP_DB.\n",
  );
  process.exit(3);
}

/* ---------------------------------- nationellt organisationsregister */

// Referensdata som delas av alla kunder. Filen är vendorad in i repot med
// proveniens: registret får inte hämtas över nät, eftersom installationen ska
// gå att köra i ett slutet kommunnät.
//
// Läses och kontrolleras före databasen skapas. Gjordes det efteråt lämnade en
// felstavad kod en halv installation bakom sig — register men ingen
// organisation och inget konto — och nästa försök hade mötts av "finns redan".
const REGISTER = JSON.parse(
  readFileSync(join(root, "scripts", "data", "organisationsregister.json"), "utf8"),
);
const reg = REGISTER.organisationer.find((r) => r.kod === kod);
if (!reg) {
  console.error(
    `Koden ${kod} finns inte i registret. Kommunkoder har fyra siffror och\n` +
    "länskoder två. Slå upp den i scripts/data/organisationsregister.json.\n",
  );
  process.exit(2);
}

/* -------------------------------------------------------------- databasen */

mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");
db.exec(readFileSync(join(root, "db", "schema.sql"), "utf8"));

const ins = (tabell, rad) => {
  const nycklar = Object.keys(rad);
  const sats = db.prepare(
    `INSERT INTO ${tabell} (${nycklar.join(", ")}) ` +
    `VALUES (${nycklar.map(() => "?").join(", ")})`,
  );
  return Number(sats.run(...nycklar.map((n) => rad[n])).lastInsertRowid);
};

const idag = new Date().toISOString().slice(0, 10);

/* ------------------------------------------- registret in i databasen */

const registryId = {};
for (const r of REGISTER.organisationer) {
  registryId[r.kod] = ins("org_registry", {
    kod: r.kod, namn: r.namn, kortnamn: r.kortnamn, typ: r.typ,
    lan: r.lan, tillsyn_cyber: r.tillsyn_cyber,
  });
}

/* ---------------------------------------------- den första organisationen */

const orgId = ins("organisations", {
  kortnamn: reg.kortnamn, namn: reg.namn, registry_id: registryId[reg.kod],
  typ: reg.typ, lan: reg.lan, invanare: null,
  mandatperiod: "2027-2030", beredskapsniva: "fredstida",
  // Kommunens egna uppgifter fylls i under Organisationer när de är kända.
  // Driftkontot står där till dess, så att fälten inte innehåller en gissning.
  samordnare: namn, samordnare_epost: epost, tib_telefon: "",
  uppdaterad: idag, ansluten: idag, tillsyn_cyber: reg.tillsyn_cyber, aktiv: 1,
});

/* ------------------------------------------------------------ driftkontot */

// 18 slumpade byte i base64url: kort nog att skriva av, långt nog att inte
// gå att gissa. Lösenordet ska bytas vid första inloggningen.
const losenord = randomBytes(18).toString("base64url");
const salt = randomBytes(16).toString("hex");

const userId = ins("users", {
  namn, epost,
  losenord_hash: scryptSync(losenord, salt, 64).toString("hex"),
  losenord_salt: salt,
  aktiv: 1,
  // Behörighet utanför alla organisationer: att lägga upp nya kunder och att
  // förvalta den delade kravkatalogen.
  leverantor: 1,
  skapad: new Date().toISOString().slice(0, 19),
});

ins("user_orgs", { user_id: userId, org_id: orgId, roll: "administrator", unit_id: null });

ins("audit_log", {
  org_id: orgId, tidpunkt: new Date().toISOString().slice(0, 19),
  anvandare: namn, handelse: "Installerade systemet", objekt: reg.namn,
});

db.close();

/* --------------------------------------------------------------- besked */

console.log(`
Installationen är klar.

  Databas        ${dbPath}
  Register       ${REGISTER.organisationer.length} kommuner och regioner
  Organisation   ${reg.namn} (${reg.typ}, ${reg.lan})
  Tillsyn        ${reg.tillsyn_cyber}

Driftkonto hos leverantören, med behörighet att lägga upp fler kunder och att
förvalta den delade kravkatalogen:

  ${epost}
  ${losenord}

Lösenordet visas bara nu och finns inte sparat i klartext någonstans. Byt det
vid första inloggningen, under Användare.

Ingen demodata är skapad. Rutan med demokonton på inloggningssidan visas därför
inte. Kommunens egna användare bjuds in under Användare, och fler kunder läggs
upp under Organisationer.
`);
