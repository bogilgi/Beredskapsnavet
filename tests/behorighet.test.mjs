import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BEHORIGHET, MODULER, MODULNAMN, MODULVAG, ROLLER, ROLLBESKRIVNING, ROLLNAMN,
  farLasa, farSkriva, niva, startsida,
} from "../.test-build/behorighet.js";

/**
 * Behörighetsmatrisen är en policy, inte data. Testerna här låser fast de
 * egenskaper som är avsiktliga, så att en framtida ändring av matrisen inte
 * tyst öppnar upp något.
 */

test("varje roll har ett värde för varje modul", () => {
  for (const roll of ROLLER) {
    for (const modul of MODULER) {
      assert.ok(
        ["ingen", "las", "skriv"].includes(BEHORIGHET[roll][modul]),
        `${roll}/${modul} saknar giltig nivå`,
      );
    }
  }
});

test("varje modul har namn och sökväg", () => {
  for (const modul of MODULER) {
    assert.ok(MODULNAMN[modul], `${modul} saknar namn`);
    assert.ok(MODULVAG[modul]?.startsWith("/"), `${modul} saknar sökväg`);
  }
  assert.equal(new Set(Object.values(MODULVAG)).size, MODULER.length, "sökvägar krockar");
});

test("varje roll har namn och beskrivning", () => {
  for (const roll of ROLLER) {
    assert.ok(ROLLNAMN[roll], `${roll} saknar namn`);
    assert.ok(ROLLBESKRIVNING[roll], `${roll} saknar beskrivning`);
  }
});

test("okänd roll ger ingen åtkomst", () => {
  assert.equal(niva("vaktmastare", "oversikt"), "ingen");
  assert.equal(farLasa("", "krigsplacering"), false);
  assert.equal(farSkriva("vaktmastare", "atgarder"), false);
  assert.equal(startsida("vaktmastare"), "/ingen-behorighet");
});

test("krigsplacering är snävare satt än övriga moduler", () => {
  // Modulen innehåller personuppgifter och uppgifter om säkerhetsprövning.
  // Förvaltningschefen ska inte komma åt den alls, trots att rollen får ändra
  // i kontinuitet och resurser.
  assert.equal(niva("forvaltningschef", "krigsplacering"), "ingen");
  assert.equal(niva("forvaltningschef", "kontinuitet"), "skriv");

  // Beredskapssamordnaren driver beredskapsarbetet och ska få ändra, liksom
  // säkerhetsskyddschefen och HR. Förvaltningschefen och kommunledningen ska
  // inte, och det är den gränsen som testet vaktar.
  const somFarSkriva = ROLLER.filter((r) => farSkriva(r, "krigsplacering")).sort();
  assert.deepEqual(
    somFarSkriva,
    ["administrator", "beredskapssamordnare", "hr", "sakerhetsskyddschef"],
    "fler eller färre roller än avsett får ändra krigsplaceringar",
  );
  for (const roll of ["forvaltningschef", "kommunledning"]) {
    assert.equal(farSkriva(roll, "krigsplacering"), false, `${roll} får ändra krigsplaceringar`);
  }
});

test("personuppgiftsmodulen är stängd för förvaltningschefen", () => {
  assert.equal(niva("forvaltningschef", "personuppgifter"), "ingen");
});

test("kommunledningen läser allt men ändrar ingenting", () => {
  for (const modul of MODULER) {
    assert.notEqual(
      niva("kommunledning", modul), "skriv",
      `kommunledningen får ändra i ${modul}`,
    );
  }
});

test("bara administratören får ändra i leverantörsmodulerna", () => {
  // Rollen räcker inte: kravLeverantor() kräver dessutom leverantörsflaggan.
  // Men ingen annan roll ska ens ha skriv i matrisen.
  for (const modul of ["organisationer", "katalog"]) {
    const somFar = ROLLER.filter((r) => farLasa(r, modul));
    assert.deepEqual(somFar, ["administrator"], `${modul} öppen för fler än administratören`);
  }
});

test("HR når krigsplacering men inte risk, kontinuitet eller resurser", () => {
  assert.equal(niva("hr", "krigsplacering"), "skriv");
  for (const modul of ["rsa", "kontinuitet", "resurser", "efterlevnad"]) {
    assert.equal(niva("hr", modul), "ingen", `HR når ${modul}`);
  }
});

test("startsidan är den första modulen rollen når", () => {
  assert.equal(startsida("beredskapssamordnare"), MODULVAG.oversikt);
  // HR når inte översikten med skriv men läser den, och ska hamna där.
  assert.equal(startsida("hr"), MODULVAG.oversikt);
});
