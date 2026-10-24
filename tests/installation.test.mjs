import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scryptSync } from "node:crypto";

/**
 * Att en installation går att skapa utan demodata.
 *
 * Så länge seedningen var enda vägen till en databas var en driftsättning
 * gjord enligt dokumentationen en driftsättning med offentligt kända
 * inloggningar: demokontonas lösenord står i scripts/seed.mjs. Testet prövar
 * att den andra vägen finns, att den inte lämnar något demospår efter sig och
 * att kontot den skapar faktiskt går att logga in med.
 */

let katalog;
let dbFil;
let utskrift;

const kor = (argv, env = {}) =>
  spawnSync("node", ["--experimental-sqlite", "scripts/installera.mjs", ...argv], {
    env: { ...process.env, BEREDSKAP_DB: dbFil, ...env },
    encoding: "utf8",
  });

before(() => {
  katalog = mkdtempSync(join(tmpdir(), "beredskap-inst-"));
  dbFil = join(katalog, "drift.db");
  const r = kor([
    "--organisation", "1880", "--namn", "Driftansvarig Provsson",
    "--epost", "drift@leverantoren.example",
  ]);
  assert.equal(r.status, 0, `installationen misslyckades: ${r.stderr}`);
  utskrift = r.stdout;
});

after(() => rmSync(katalog, { recursive: true, force: true }));

const en = (sql, ...p) => {
  const db = new DatabaseSync(dbFil, { readOnly: true });
  try {
    return db.prepare(sql).get(...p);
  } finally {
    db.close();
  }
};

test("installationen skapar ingen demodata", () => {
  // Det är exakt det villkor inloggningssidan läser för att avgöra om rutan
  // med demokonton ska finnas. Noll här betyder att rutan inte visas.
  assert.equal(
    en("SELECT COUNT(*) AS v FROM organisations WHERE registry_id IS NULL").v, 0,
    "installationen lämnade en organisation utan rad i registret",
  );

  // Och inget av demodatans innehåll.
  for (const tabell of ["people", "placements", "risks", "resources", "exercises", "actions"]) {
    assert.equal(
      en(`SELECT COUNT(*) AS v FROM ${tabell}`).v, 0,
      `${tabell} innehåller rader efter en ren installation`,
    );
  }
});

test("registret är laddat, så onboarding är ett val i en lista", () => {
  assert.equal(en("SELECT COUNT(*) AS v FROM org_registry").v, 310);
  // Gotland är EN juridisk person som fullgör både kommunens och regionens
  // uppgifter, och förekommer därför en gång.
  assert.equal(en("SELECT typ FROM org_registry WHERE kod = '0980'").typ, "kommun_region");
});

test("den första organisationen är hämtad ur registret, inte gissad", () => {
  const org = en(`
    SELECT o.namn, o.typ, o.lan, o.tillsyn_cyber, o.invanare, r.kod
    FROM organisations o JOIN org_registry r ON r.id = o.registry_id
  `);
  assert.equal(org.kod, "1880");
  assert.equal(org.namn, "Örebro");
  assert.equal(org.tillsyn_cyber, "Länsstyrelsen i Örebro län");
  // Antalet invånare styr ingen bedömning i systemet, så ett tomt fält är
  // riktigare än en gissning.
  assert.equal(org.invanare, null);
});

test("ett enda konto skapas, och det är leverantörens", () => {
  assert.equal(en("SELECT COUNT(*) AS v FROM users").v, 1);
  const u = en("SELECT id, epost, leverantor FROM users");
  assert.equal(u.epost, "drift@leverantoren.example");
  assert.equal(u.leverantor, 1, "driftkontot saknar behörighet att lägga upp kunder");

  // En session kräver ett medlemskap: utan det går kontot inte att logga in
  // med, och installationen hade varit oanvändbar.
  const m = en("SELECT roll FROM user_orgs WHERE user_id = ?", u.id);
  assert.equal(m.roll, "administrator");
});

test("lösenordet i utskriften är det som ligger i databasen", () => {
  const rad = utskrift.split("\n").map((r) => r.trim());
  const i = rad.indexOf("drift@leverantoren.example");
  assert.ok(i > 0, "utskriften säger inte vilket konto som skapades");
  const losenord = rad[i + 1];
  assert.ok(losenord && losenord.length >= 20, `orimligt lösenord: ${losenord}`);

  const u = en("SELECT losenord_hash, losenord_salt FROM users");
  assert.equal(
    scryptSync(losenord, u.losenord_salt, 64).toString("hex"), u.losenord_hash,
    "lösenordet som skrivs ut går inte att logga in med",
  );

  // Inget av demodatans lösenord, som står i versionshanteringen.
  for (const demo of ["beredskap2026", "drift2026", "leverantor2026"]) {
    assert.notEqual(losenord, demo);
  }
});

test("installationen skriver inte över en befintlig databas", () => {
  const fore = statSync(dbFil).size;
  const r = kor([
    "--organisation", "0180", "--namn", "Någon Annan", "--epost", "nagon@annan.example",
  ]);
  assert.equal(r.status, 3, "installationen körde mot en befintlig databas");
  assert.match(r.stderr, /finns redan/);
  assert.equal(statSync(dbFil).size, fore, "filen ändrades trots vägran");
  assert.equal(en("SELECT COUNT(*) AS v FROM users").v, 1, "ett konto tillkom");
});

test("ofullständiga argument skapar ingen halv installation", () => {
  const ny = join(katalog, "halv.db");
  for (const argv of [
    [],
    ["--organisation", "1880"],
    ["--organisation", "1880", "--namn", "A B"],
    ["--organisation", "1880", "--namn", "A B", "--epost", "intenagonadress"],
    // Koden finns inte i registret: då ska ingen organisation gissas fram.
    ["--organisation", "9999", "--namn", "A B", "--epost", "a@b.example"],
  ]) {
    const r = spawnSync("node", ["--experimental-sqlite", "scripts/installera.mjs", ...argv], {
      env: { ...process.env, BEREDSKAP_DB: ny }, encoding: "utf8",
    });
    assert.equal(r.status, 2, `${argv.join(" ")} gav utgångskod ${r.status}`);
    assert.ok(r.stderr.length > 0, "vägran utan förklaring");
    // Ingen databasfil alls: en halv installation hade mötts av "finns redan"
    // vid nästa försök, och det är ett värre läge än inget försök.
    assert.equal(
      existsSync(ny), false,
      `${argv.join(" ")} lämnade en databasfil efter sig`,
    );
  }
});
