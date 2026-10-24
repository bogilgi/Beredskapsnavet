import { test } from "node:test";
import assert from "node:assert/strict";
import { KOLUMNER, lasPersonalfil } from "../.test-build/csv.js";

/**
 * Filer från personalsystem är sällan välformade. Testerna täcker det som
 * faktiskt går fel i verkligheten: byte order mark från Excel, semikolon inuti
 * ett namn, och rader med fel antal fält.
 */

const rubrik = "extern_id;namn;verksamhet;befattning_fred";

test("läser en enkel fil", () => {
  const { rader, fel } = lasPersonalfil(`${rubrik}\nAN-1;Anna Ek;KLK;Handläggare`);
  assert.deepEqual(fel, []);
  assert.equal(rader.length, 1);
  assert.equal(rader[0].extern_id, "AN-1");
  assert.equal(rader[0].namn, "Anna Ek");
  assert.equal(rader[0].radnummer, 2);
});

test("tar bort byte order mark från Excel", () => {
  // Utan detta heter första kolumnen "﻿extern_id" och matchar ingenting.
  const { rader, fel } = lasPersonalfil(`﻿${rubrik}\nAN-1;Anna Ek;KLK;Handläggare`);
  assert.deepEqual(fel, []);
  assert.equal(rader[0].extern_id, "AN-1");
});

test("ett citerat fält får innehålla semikolon", () => {
  const { rader, fel } = lasPersonalfil(`${rubrik}\nAN-1;"Ek; Anna";KLK;Handläggare`);
  assert.deepEqual(fel, []);
  assert.equal(rader[0].namn, "Ek; Anna");
});

test("dubblerat citattecken blir ett citattecken", () => {
  const { rader } = lasPersonalfil(`${rubrik}\nAN-1;"Anna ""Nanna"" Ek";KLK;Handläggare`);
  assert.equal(rader[0].namn, 'Anna "Nanna" Ek');
});

test("hanterar radbrytning med vagnretur", () => {
  const { rader, fel } = lasPersonalfil(`${rubrik}\r\nAN-1;Anna Ek;KLK;Handläggare\r\n`);
  assert.deepEqual(fel, []);
  assert.equal(rader.length, 1);
  assert.equal(rader[0].befattning_fred, "Handläggare");
});

test("kolumnordningen spelar ingen roll", () => {
  const { rader } = lasPersonalfil("namn;verksamhet;extern_id\nAnna Ek;KLK;AN-1");
  assert.equal(rader[0].extern_id, "AN-1");
  assert.equal(rader[0].namn, "Anna Ek");
});

test("okända kolumner ignoreras", () => {
  const { rader, fel } = lasPersonalfil(`${rubrik};lonegrupp\nAN-1;Anna Ek;KLK;Handläggare;G4`);
  assert.deepEqual(fel, []);
  assert.equal(rader[0].extern_id, "AN-1");
  assert.equal(rader[0].lonegrupp, undefined);
});

test("saknade obligatoriska rubriker avbryter inläsningen", () => {
  const { rader, fel } = lasPersonalfil("namn;befattning_fred\nAnna Ek;Handläggare");
  assert.deepEqual(rader, []);
  assert.equal(fel.length, 1);
  assert.match(fel[0], /extern_id/);
  assert.match(fel[0], /verksamhet/);
});

test("rad med fel antal fält hoppas över och rapporteras", () => {
  const { rader, fel } = lasPersonalfil(
    `${rubrik}\nAN-1;Anna Ek;KLK;Handläggare\nAN-2;Bo Ek;KLK`,
  );
  assert.equal(rader.length, 1);
  assert.equal(fel.length, 1);
  assert.match(fel[0], /Rad 3/);
});

test("tom fil ger ett fel i stället för tystnad", () => {
  const { rader, fel } = lasPersonalfil("   \n\n");
  assert.deepEqual(rader, []);
  assert.equal(fel.length, 1);
});

test("alla dokumenterade kolumner känns igen", () => {
  const vardehrad = KOLUMNER.map((k) => `v-${k}`).join(";");
  const { rader, fel } = lasPersonalfil(`${KOLUMNER.join(";")}\n${vardehrad}`);
  assert.deepEqual(fel, []);
  for (const k of KOLUMNER) assert.equal(rader[0][k], `v-${k}`);
});
