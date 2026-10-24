import { test } from "node:test";
import assert from "node:assert/strict";
import { createSign, generateKeyPairSync } from "node:crypto";
import {
  ALGORITM, FelAutentiseringsmetod, delaToken, kontrolleraKrav, verifieraSignatur,
} from "../.test-build/oidc-token.js";

/**
 * Tokenvalideringen är det som står mellan systemet och vem som helst som kan
 * skriva JSON. Testerna framställer tokens med en egen nyckel och kontrollerar
 * att varje avvikelse faktiskt avvisas.
 */

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KID = "testnyckel";
const jwk = { ...publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" };

const ISSUER = "https://idp.example";
const KLIENT = "beredskapsnavet";
const NONCE = "nonce-abc";
const NU = 1_800_000_000;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

function token(krav = {}, huvud = {}, nyckel = privateKey) {
  const h = b64({ alg: "RS256", typ: "JWT", kid: KID, ...huvud });
  const k = b64({
    iss: ISSUER, aud: KLIENT, exp: NU + 600, iat: NU, nonce: NONCE,
    email: "a@example.se", ...krav,
  });
  if (huvud.alg === "none") return `${h}.${k}.`;
  const sig = createSign(ALGORITM[huvud.alg ?? "RS256"] ?? "RSA-SHA256")
    .update(`${h}.${k}`).sign(nyckel).toString("base64url");
  return `${h}.${k}.${sig}`;
}

const forvantat = { issuer: ISSUER, client_id: KLIENT, krav_amr: "" };
const godkann = (t, f = forvantat, nonce = NONCE) => {
  const d = delaToken(t);
  verifieraSignatur(d, [jwk]);
  kontrolleraKrav(d.krav, f, nonce, NU);
  return d.krav;
};

test("en korrekt token godkänns", () => {
  const krav = godkann(token());
  assert.equal(krav.email, "a@example.se");
});

test("token med fel format avvisas", () => {
  assert.throws(() => delaToken("inte.en.token.alls"), /fel format/);
  assert.throws(() => delaToken("bara-en-del"), /fel format/);
});

test('algoritmen "none" avvisas', () => {
  // Den klassiska vägen förbi signaturkontrollen.
  assert.throws(() => godkann(token({}, { alg: "none" })), /inte accepteras/);
});

test("symmetrisk algoritm avvisas", () => {
  // Med HS256 räcker klienthemligheten för att signera en egen token.
  assert.throws(() => godkann(token({}, { alg: "HS256" })), /inte accepteras/);
});

test("token signerad med annan nyckel avvisas", () => {
  const annan = generateKeyPairSync("rsa", { modulusLength: 2048 });
  assert.throws(
    () => godkann(token({}, {}, annan.privateKey)),
    /går inte att verifiera/,
  );
});

test("manipulerade anspråk avvisas", () => {
  const t = token();
  const [h, , s] = t.split(".");
  const falskt = b64({ iss: ISSUER, aud: KLIENT, exp: NU + 600, nonce: NONCE, email: "angripare@example.se" });
  assert.throws(() => godkann(`${h}.${falskt}.${s}`), /går inte att verifiera/);
});

test("okänd nyckel-id ger ingen matchande nyckel", () => {
  assert.throws(
    () => godkann(token({}, { kid: "annan-nyckel" })),
    /Ingen matchande nyckel/,
  );
});

test("fel utfärdare avvisas", () => {
  assert.throws(() => godkann(token({ iss: "https://ond.example" })), /iss stämmer inte/);
});

test("avslutande snedstreck i utfärdaren tolereras", () => {
  assert.doesNotThrow(() => godkann(token({ iss: ISSUER + "/" })));
  assert.doesNotThrow(() =>
    godkann(token(), { ...forvantat, issuer: ISSUER + "/" }));
});

test("token för en annan klient avvisas", () => {
  assert.throws(() => godkann(token({ aud: "nagot-annat" })), /annan klient/);
});

test("aud som lista godkänns när vår klient finns med", () => {
  assert.doesNotThrow(() => godkann(token({ aud: ["annan", KLIENT] })));
  assert.throws(() => godkann(token({ aud: ["annan", "tredje"] })), /annan klient/);
});

test("utgången token avvisas", () => {
  assert.throws(() => godkann(token({ exp: NU - 1 })), /gått ut/);
});

test("token utan exp avvisas", () => {
  assert.throws(() => godkann(token({ exp: undefined })), /gått ut/);
});

test("token utfärdad långt i framtiden avvisas", () => {
  assert.throws(() => godkann(token({ iat: NU + 3600 })), /i framtiden/);
});

test("fel nonce avvisas", () => {
  // Utan nonce-kontroll går ett svar att återanvända i en annan inloggning.
  assert.throws(() => godkann(token(), forvantat, "annat-nonce"), /nonce stämmer inte/);
  assert.throws(() => godkann(token({ nonce: undefined })), /nonce stämmer inte/);
});

test("krav på flerfaktor ger egen feltyp när amr saknas", () => {
  const medMfa = { ...forvantat, krav_amr: "mfa" };
  assert.throws(() => godkann(token({ amr: ["pwd"] }), medMfa), FelAutentiseringsmetod);
  assert.throws(() => godkann(token(), medMfa), FelAutentiseringsmetod);
  // Egen feltyp, så att användaren får veta att andrafaktorn saknas i stället
  // för det intetsägande att svaret inte kunde verifieras.
  assert.doesNotThrow(() => godkann(token({ amr: ["pwd", "mfa"] }), medMfa));
});

test("utan krav på metod spelar amr ingen roll", () => {
  assert.doesNotThrow(() => godkann(token({ amr: ["pwd"] })));
  assert.doesNotThrow(() => godkann(token({ amr: undefined })));
});

test("bara asymmetriska algoritmer finns i tabellen", () => {
  assert.deepEqual(Object.keys(ALGORITM).sort(), ["RS256", "RS384", "RS512"]);
});
