import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Invarianter i datamodellen, provade mot en riktigt seedad databas.
 *
 * Testerna kör det skarpa seed-skriptet mot en egen fil, så att de bygger på
 * samma schema och samma data som demon. Det som vaktas här är de egenskaper
 * produkten säljs på: att en kommuns uppgifter aldrig syns hos en annan, att
 * kravkatalogen är delad men typad per huvudman, och att registret stämmer.
 */

let db;
let katalog;

const alla = (sql, ...p) => db.prepare(sql).all(...p);
const en = (sql, ...p) => db.prepare(sql).get(...p);
const antal = (sql, ...p) => en(sql, ...p).v;

/** Tabeller som bär kunddata och därför måste ha org_id. */
const ORGTABELLER = [
  "units", "positions", "people", "placements", "risks", "critical_functions",
  "dependencies", "resources", "exercises", "actions", "requirement_status",
  "gallringsregler",
];

before(() => {
  katalog = mkdtempSync(join(tmpdir(), "beredskap-test-"));
  const fil = join(katalog, "test.db");
  execFileSync("node", ["--experimental-sqlite", "scripts/seed.mjs"], {
    env: { ...process.env, BEREDSKAP_DB: fil },
    stdio: "pipe",
  });
  db = new DatabaseSync(fil, { readOnly: true });
});

after(() => {
  db?.close();
  if (katalog) rmSync(katalog, { recursive: true, force: true });
});

/* ------------------------------------------------- isolering mellan kunder */

test("varje tabell med kunddata har org_id", () => {
  for (const tabell of ORGTABELLER) {
    const kolumner = alla(`PRAGMA table_info(${tabell})`).map((k) => k.name);
    assert.ok(kolumner.includes("org_id"), `${tabell} saknar org_id`);
  }
});

test("den delade kravkatalogen har inget org_id", () => {
  // Katalogen är delad av alla kunder. Ett org_id där vore början på att den
  // kopieras per kommun igen, vilket är precis det modellen ska undvika.
  const kolumner = alla("PRAGMA table_info(requirement_catalog)").map((k) => k.name);
  assert.ok(!kolumner.includes("org_id"), "requirement_catalog har org_id");
});

test("inget org_id pekar på en organisation som inte finns", () => {
  for (const tabell of ORGTABELLER) {
    assert.equal(
      antal(`SELECT COUNT(*) AS v FROM ${tabell} t
             WHERE NOT EXISTS (SELECT 1 FROM organisations o WHERE o.id = t.org_id)`),
      0, `${tabell} har rader utan giltig organisation`,
    );
  }
});

test("kopplingar mellan tabeller håller sig inom samma organisation", () => {
  // Det här är den isolering som kan gå sönder tyst: en placering som pekar på
  // en befattning i en annan kommun syns inte i gränssnittet men blandar data.
  const kopplingar = [
    ["positions", "unit_id", "units"],
    ["people", "unit_id", "units"],
    ["placements", "position_id", "positions"],
    ["placements", "person_id", "people"],
    ["critical_functions", "unit_id", "units"],
    ["dependencies", "function_id", "critical_functions"],
    ["resources", "unit_id", "units"],
    ["risks", "unit_id", "units"],
    ["actions", "unit_id", "units"],
  ];
  for (const [barn, falt, foralder] of kopplingar) {
    assert.equal(
      antal(`SELECT COUNT(*) AS v FROM ${barn} b
             JOIN ${foralder} f ON f.id = b.${falt}
             WHERE f.org_id <> b.org_id`),
      0, `${barn}.${falt} pekar utanför den egna organisationen`,
    );
  }
});

test("användarnas enhetskoppling ligger i rätt organisation", () => {
  assert.equal(
    antal(`SELECT COUNT(*) AS v FROM user_orgs uo
           JOIN units u ON u.id = uo.unit_id
           WHERE u.org_id <> uo.org_id`),
    0,
  );
});

test("en användare har högst en roll per organisation", () => {
  assert.equal(
    antal(`SELECT COUNT(*) AS v FROM (
             SELECT user_id, org_id FROM user_orgs GROUP BY user_id, org_id HAVING COUNT(*) > 1)`),
    0,
  );
});

/* ------------------------------------------------------ kravkatalogen */

test("katalogen är delad och statusraderna är per organisation", () => {
  const krav = antal("SELECT COUNT(*) AS v FROM requirement_catalog");
  const orgar = antal("SELECT COUNT(*) AS v FROM organisations");
  const status = antal("SELECT COUNT(*) AS v FROM requirement_status");
  assert.ok(krav > 0 && orgar > 0);
  // Statusraderna är fler än kraven men färre än kraven gånger organisationer,
  // just eftersom kraven är typade per huvudman.
  assert.ok(status > krav, "ingen organisation har fått statusrader");
  assert.ok(status < krav * orgar, "alla organisationer har fått alla krav");
});

test("galler_for har bara kända värden", () => {
  assert.equal(
    antal(`SELECT COUNT(*) AS v FROM requirement_catalog
           WHERE galler_for NOT IN ('kommun', 'region', 'bada')`),
    0,
  );
});

test("en organisation har bara de krav som gäller dess huvudman", () => {
  const fel = alla(`
    SELECT o.namn, o.typ, k.kod, k.galler_for
    FROM requirement_status s
    JOIN requirement_catalog k ON k.id = s.krav_id
    JOIN organisations o ON o.id = s.org_id
    WHERE k.galler_for <> 'bada'
      AND k.galler_for <> o.typ
      AND NOT (o.typ = 'kommun_region' AND k.galler_for IN ('kommun', 'region'))
  `);
  assert.deepEqual(fel, [], "organisation har krav som inte gäller dess huvudmannatyp");
});

test("en organisation saknar inget krav som gäller den", () => {
  const saknade = alla(`
    SELECT o.namn, k.kod FROM organisations o
    JOIN requirement_catalog k
      ON k.galler_for = 'bada' OR k.galler_for = o.typ
      OR (o.typ = 'kommun_region' AND k.galler_for IN ('kommun', 'region'))
    WHERE NOT EXISTS (
      SELECT 1 FROM requirement_status s WHERE s.org_id = o.id AND s.krav_id = k.id)
  `);
  assert.deepEqual(saknade, [], "organisation saknar krav som gäller den");
});

test("en kommun får fler krav än en region, och båda får de gemensamma", () => {
  const per = Object.fromEntries(
    alla(`SELECT o.typ, COUNT(*) AS n FROM requirement_status s
          JOIN organisations o ON o.id = s.org_id
          GROUP BY o.typ, o.id HAVING o.id = MIN(o.id)`).map((r) => [r.typ, r.n]),
  );
  const gemensamma = antal(
    "SELECT COUNT(*) AS v FROM requirement_catalog WHERE galler_for = 'bada'");
  assert.ok(per.kommun > gemensamma, "kommunen fick inga kommunspecifika krav");
  assert.ok(per.region > gemensamma, "regionen fick inga regionspecifika krav");
  assert.notEqual(per.kommun, per.region, "kommun och region fick samma kravlista");
});

test("statusvärden och rättslig status har bara kända värden", () => {
  assert.equal(
    antal(`SELECT COUNT(*) AS v FROM requirement_status
           WHERE status NOT IN ('uppfylld', 'pagaende', 'brist', 'ej_paborjad')`), 0);
  assert.equal(
    antal(`SELECT COUNT(*) AS v FROM requirement_catalog
           WHERE giltighet NOT IN ('gallande', 'upphor', 'foreslagen')`), 0);
});

test("varje krav bär källhänvisning eller är markerat som ej avstämt", () => {
  // Ett krav utan källa som samtidigt utger sig för att vara avstämt vore det
  // värsta av två världar.
  const fel = alla(`SELECT kod FROM requirement_catalog
                    WHERE kontrollerad <> '' AND kalla_url = ''`);
  assert.deepEqual(fel, [], "avstämt krav saknar källhänvisning");
});

test("kontextmallen använder bara kända platshållare", () => {
  const kanda = new Set([
    "namn", "typ", "lan", "invanare", "anstallda", "storlek", "storleksgrund", "tillsyn",
  ]);
  for (const { kod, kontextmall } of alla(
    "SELECT kod, kontextmall FROM requirement_catalog WHERE kontextmall <> ''")) {
    for (const m of kontextmall.matchAll(/\{(\w+)\}/g)) {
      assert.ok(kanda.has(m[1]), `${kod} använder okänd platshållare {${m[1]}}`);
    }
  }
});

/* -------------------------------------------------- nationella registret */

test("registret innehåller 310 organisationer", () => {
  // 290 kommuner och 21 regioner, men Gotlands kommun är en juridisk person
  // som fullgör båda uppgifterna.
  assert.equal(antal("SELECT COUNT(*) AS v FROM org_registry"), 310);
  const per = Object.fromEntries(
    alla("SELECT typ, COUNT(*) AS n FROM org_registry GROUP BY typ").map((r) => [r.typ, r.n]));
  assert.deepEqual(per, { kommun: 289, kommun_region: 1, region: 20 });
});

test("registret har 21 län och varje rad har tillsynsmyndighet", () => {
  assert.equal(antal("SELECT COUNT(DISTINCT lan) AS v FROM org_registry"), 21);
  assert.equal(antal("SELECT COUNT(*) AS v FROM org_registry WHERE tillsyn_cyber = ''"), 0);
});

test("kod, namn och kortnamn är unika i registret", () => {
  for (const falt of ["kod", "namn", "kortnamn"]) {
    assert.equal(
      antal(`SELECT COUNT(*) AS v FROM (
               SELECT ${falt} FROM org_registry GROUP BY ${falt} HAVING COUNT(*) > 1)`),
      0, `${falt} förekommer flera gånger`,
    );
  }
});

test("kommuner har fyrsiffrig kod, regioner tvåsiffrig", () => {
  assert.equal(
    antal(`SELECT COUNT(*) AS v FROM org_registry
           WHERE typ <> 'region' AND LENGTH(kod) <> 4`), 0);
  assert.equal(
    antal("SELECT COUNT(*) AS v FROM org_registry WHERE typ = 'region' AND LENGTH(kod) <> 2"), 0);
});

test("kommunkodens två första siffror är länets kod", () => {
  const fel = alla(`
    SELECT k.kod, k.lan, r.kod AS lanskod FROM org_registry k
    JOIN org_registry r ON r.lan = k.lan AND r.typ = 'region'
    WHERE k.typ <> 'region' AND SUBSTR(k.kod, 1, 2) <> r.kod
  `);
  // Gotland har ingen egen region, så raden saknar motpart och ingår inte.
  assert.deepEqual(fel, [], "kommunkod stämmer inte med länets kod");
});

test("Gotland är typad som både kommun och region", () => {
  const g = en("SELECT * FROM org_registry WHERE kod = '0980'");
  assert.equal(g.typ, "kommun_region");
  assert.equal(g.namn, "Region Gotland");
  // Och ingen separat region för Gotlands län.
  assert.equal(
    antal("SELECT COUNT(*) AS v FROM org_registry WHERE lan = 'Gotlands län' AND typ = 'region'"),
    0,
  );
});

test("en region har både länsstyrelse och IVO som tillsynsmyndighet", () => {
  // Cybersäkerhetsförordningen 7 §: IVO för vårdgivare, länsstyrelsen för
  // offentlig förvaltning. 16 § kräver att de samordnar sig.
  for (const r of alla(
    "SELECT namn, tillsyn_cyber FROM org_registry WHERE typ IN ('region', 'kommun_region')")) {
    assert.match(r.tillsyn_cyber, /Länsstyrelsen/, `${r.namn} saknar länsstyrelse`);
    assert.match(r.tillsyn_cyber, /vård och omsorg/, `${r.namn} saknar IVO`);
  }
  // En ren kommun ska bara ha länsstyrelsen.
  for (const k of alla(
    "SELECT namn, tillsyn_cyber FROM org_registry WHERE typ = 'kommun' LIMIT 20")) {
    assert.doesNotMatch(k.tillsyn_cyber, /vård och omsorg/, `${k.namn} har fått IVO`);
  }
});

test("kunder som kommer ur registret ärver typ, län och tillsynsmyndighet", () => {
  const fel = alla(`
    SELECT o.namn FROM organisations o JOIN org_registry r ON r.id = o.registry_id
    WHERE o.typ <> r.typ OR o.lan <> r.lan OR o.tillsyn_cyber <> r.tillsyn_cyber
  `);
  assert.deepEqual(fel, [], "kund avviker från sin registerrad");
});

/* ---------------------------------------------- personuppgifter och gallring */

test("personnummer är maskerade", () => {
  const fel = alla(`SELECT namn FROM people
                    WHERE pnr_maskerat <> '' AND pnr_maskerat NOT LIKE '%-XXXX'`);
  assert.deepEqual(fel, [], "personnummer är inte maskerat");
});

test("anställningsnumret är unikt inom organisationen", () => {
  assert.equal(
    antal(`SELECT COUNT(*) AS v FROM (
             SELECT org_id, extern_id FROM people WHERE extern_id IS NOT NULL
             GROUP BY org_id, extern_id HAVING COUNT(*) > 1)`),
    0,
  );
});

test("gallringsfrister utan beslut saknas, inte gissas", () => {
  // En frist utan beslutsfattare går inte att försvara vid tillsyn.
  const fel = alla(`SELECT kategori FROM gallringsregler
                    WHERE frist_manader IS NOT NULL AND beslutad_av = ''`);
  assert.deepEqual(fel, [], "beslutad frist saknar beslutsfattare");
});

test("ingen organisation har en frist för en okänd kategori", () => {
  const kanda = ["krigsplacering", "sakerhetsprovning", "kontaktuppgifter",
    "ovningsdeltagande", "anvandarkonton"];
  for (const { kategori } of alla("SELECT DISTINCT kategori FROM gallringsregler")) {
    assert.ok(kanda.includes(kategori), `okänd kategori: ${kategori}`);
  }
});

/* ------------------------------------------------------ inloggning */

test("federerad inloggning är konfigurerad per organisation, inte globalt", () => {
  const idp = alla("SELECT org_id, issuer, krav_amr, auto_medlemskap FROM org_idp");
  assert.ok(idp.length >= 1, "ingen organisation har federering i demodatan");
  assert.ok(
    idp.length < antal("SELECT COUNT(*) AS v FROM organisations"),
    "alla organisationer är federerade, vilket inte visar övergången",
  );
  for (const i of idp) {
    assert.match(i.issuer, /^https?:\/\//, "issuer är ingen adress");
    // Behörighet ska ges genom inbjudan, inte av att någon har ett konto i
    // katalogtjänsten.
    assert.equal(i.auto_medlemskap, 0, "automatiskt medlemskap är påslaget i demodatan");
  }
});

test("lösenord lagras som hash med salt, aldrig i klartext", () => {
  for (const u of alla("SELECT epost, losenord_hash, losenord_salt FROM users")) {
    if (u.losenord_hash === "") continue; // federerat konto utan lokalt lösenord
    assert.equal(u.losenord_hash.length, 128, `${u.epost}: oväntad hashlängd`);
    assert.ok(u.losenord_salt.length >= 32, `${u.epost}: för kort salt`);
    assert.match(u.losenord_hash, /^[0-9a-f]+$/, `${u.epost}: hashen är inte hex`);
  }
});

test("bara leverantörens konto har leverantörsflaggan", () => {
  const med = alla("SELECT epost FROM users WHERE leverantor = 1").map((u) => u.epost);
  assert.equal(med.length, 1, "fler eller färre än ett konto har leverantörsbehörighet");
  assert.match(med[0], /@beredskapsnavet\.se$/);
});
