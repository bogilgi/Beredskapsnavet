import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { hinderForAterstallning } from "../.test-build/aterstallningsregel.js";

/**
 * Vem som får återställa vems lösenord.
 *
 * Regeln prövas två gånger. Först direkt, som ren funktion, för att alla
 * utfall ska gå att pröva utan att en databas behöver innehålla just den
 * kombinationen. Sedan med den SQL serveråtgärden faktiskt frågar, mot en
 * seedad databas, för att de värden regeln läser ska vara de värden databasen
 * ger.
 *
 * Det andra är det som fångar felet. Regeln kan vara rätt och ändå aldrig få
 * de uppgifter den behöver.
 */

/* ------------------------------------------------------------ regeln direkt */

const ENKELT = { leverantor: 0, andra_organisationer: 0, utan_losenord: 0 };
const KOMMUNADMIN = { leverantor: 0 };
const LEVERANTOR = { leverantor: 1 };

test("ett konto som bara finns i den egna organisationen får återställas", () => {
  assert.equal(hinderForAterstallning(KOMMUNADMIN, ENKELT), null);
});

test("ett leverantörskonto återställs inte av en kommunadministratör", () => {
  const h = hinderForAterstallning(KOMMUNADMIN, { ...ENKELT, leverantor: 1 });
  assert.notEqual(h, null, "leverantörskontot gick att återställa");
  assert.match(h.kort, /leverantör/i);
});

test("ett konto med behörighet i en annan organisation återställs inte heller", () => {
  const h = hinderForAterstallning(KOMMUNADMIN, { ...ENKELT, andra_organisationer: 3 });
  assert.notEqual(h, null, "kontot gick att återställa trots behörighet på annat håll");
  // Skälet ska säga hur många organisationer kontot når, inte bara att det
  // når fler: det är den uppgiften som gör beskedet begripligt.
  assert.match(h.kort, /4 organisationer/);
});

test("leverantören får återställa båda, eftersom behörigheten redan täcker dem", () => {
  assert.equal(hinderForAterstallning(LEVERANTOR, { ...ENKELT, leverantor: 1 }), null);
  assert.equal(hinderForAterstallning(LEVERANTOR, { ...ENKELT, andra_organisationer: 3 }), null);
});

test("ett konto utan lösenord återställs inte av någon, inte heller leverantören", () => {
  // Ett lösenord på ett konto som inte har något blir en inloggningsväg förbi
  // katalogtjänsten och dess krav på autentiseringsmetod.
  for (const begarare of [KOMMUNADMIN, LEVERANTOR]) {
    const h = hinderForAterstallning(begarare, { ...ENKELT, utan_losenord: 1 });
    assert.notEqual(h, null, "ett federerat konto gick att sätta lösenord på");
    assert.match(h.kort, /katalogtjänsten/);
  }
});

/* ------------------------------------------- regeln mot en seedad databas */

let katalog;
let db;

before(() => {
  katalog = mkdtempSync(join(tmpdir(), "beredskap-aterst-"));
  const fil = join(katalog, "test.db");
  execFileSync("node", ["--experimental-sqlite", "scripts/seed.mjs"], {
    env: { ...process.env, BEREDSKAP_DB: fil },
    stdio: "pipe",
  });
  db = new DatabaseSync(fil, { readOnly: true });
});

after(() => {
  db?.close();
  rmSync(katalog, { recursive: true, force: true });
});

/** Samma fråga som begarInre ställer, med samma fält. */
function kontot(userId, orgId) {
  return db.prepare(`
    SELECT u.namn, u.epost, u.aktiv, u.leverantor,
      (SELECT COUNT(*) FROM user_orgs x WHERE x.user_id = u.id AND x.org_id <> uo.org_id)
        AS andra_organisationer,
      CASE WHEN u.losenord_hash = '' THEN 1 ELSE 0 END AS utan_losenord
    FROM user_orgs uo JOIN users u ON u.id = uo.user_id
    WHERE uo.user_id = ? AND uo.org_id = ?
  `).get(userId, orgId);
}

const epostTillId = (epost) =>
  db.prepare("SELECT id, leverantor FROM users WHERE epost = ?").get(epost);

/**
 * Angreppet som granskningen beskrev, hela vägen.
 *
 * Jens är administratör i Ängsholm och har inte leverantörsflaggan. Elsa är
 * bara kommunledning i Ängsholm — en roll som inte ändrar något — men hennes
 * konto bär leverantörsflaggan och är administratör i tre andra
 * organisationer. Lösenordet sitter på kontot, så ett nytt lösenord satt av
 * Jens hade gett honom allt det.
 */
test("en kommunadministratör kan inte ta över ett konto som når längre", () => {
  const jens = epostTillId("jens.akerlund@angsholm.se");
  const elsa = epostTillId("elsa.wikner@beredskapsnavet.se");
  const angsholm = db.prepare("SELECT id FROM organisations WHERE kortnamn = 'angsholm'").get();

  // Förutsättningarna i demodatan, så att testet inte tystnar om de ändras.
  assert.equal(jens.leverantor, 0, "Jens har leverantörsflaggan, angreppet saknar poäng");
  assert.equal(elsa.leverantor, 1, "Elsa har inte leverantörsflaggan längre");
  const elsaHarRoll = db
    .prepare("SELECT roll FROM user_orgs WHERE user_id = ? AND org_id = ?")
    .get(elsa.id, angsholm.id);
  assert.equal(elsaHarRoll.roll, "kommunledning", "Elsas roll i Ängsholm har ändrats");

  const maal = kontot(elsa.id, angsholm.id);
  assert.ok(maal, "Elsa är inte längre medlem i Ängsholm, välj ett annat mål");
  assert.ok(maal.andra_organisationer >= 1, "frågan räknar inte medlemskapen utanför");

  const hinder = hinderForAterstallning({ leverantor: jens.leverantor }, maal);
  assert.notEqual(
    hinder, null,
    "en administratör i Ängsholm kan återställa lösenordet för ett leverantörskonto",
  );
});

test("en administratör kan återställa ett konto som bara finns i den egna kommunen", () => {
  const sara = epostTillId("sara.molin@angsholm.se");
  const angsholm = db.prepare("SELECT id FROM organisations WHERE kortnamn = 'angsholm'").get();
  const maal = kontot(sara.id, angsholm.id);

  assert.equal(maal.andra_organisationer, 0, "Sara har fått behörighet på annat håll");
  assert.equal(
    hinderForAterstallning({ leverantor: 0 }, maal), null,
    "spärren tar också de återställningar som är hela poängen med funktionen",
  );
});
