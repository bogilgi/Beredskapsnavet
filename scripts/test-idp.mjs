/**
 * Test-utfärdare för OpenID Connect.
 *
 * Finns för att den federerade inloggningen ska gå att prova och felsöka utan
 * tillgång till en riktig katalogtjänst. Den är avsiktligt enkel men inte
 * fejkad: koden växlas mot en riktigt RS256-signerad id-token, PKCE
 * kontrolleras, och nycklarna publiceras som JWKS. Det som verifieras i
 * src/lib/oidc.ts verifieras alltså mot något som faktiskt är signerat.
 *
 * ANVÄNDS ALDRIG I DRIFT. Den har inga användare, godkänner vem som helst och
 * delar ut tokens till den som frågar.
 *
 *   node scripts/test-idp.mjs
 *   → lyssnar på http://localhost:4011
 *
 * Styrs med frågeparametrar till /authorize, för att kunna provocera fram fel:
 *   ?demo_epost=...      adressen i id-token (standard: tove.bergqvist@nordmark.se)
 *   ?demo_amr=pwd        autentiseringsmetod (standard: pwd,mfa)
 *   ?demo_overifierad=1  sätter email_verified till false
 */
import { createServer } from "node:http";
import { createHash, createSign, generateKeyPairSync, randomBytes } from "node:crypto";

const PORT = 4011;
const ISSUER = `http://localhost:${PORT}`;
const CLIENT_ID = "beredskapsnavet-test";
const CLIENT_SECRET = "test-hemlighet";
const KID = "test-nyckel-1";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
// generateKeyPairSync ger KeyObject direkt när ingen kodning anges, så
// nycklarna används som de är.
const jwk = { ...publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" };

const koder = new Map();

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

function idToken({ nonce, epost, amr, verifierad }) {
  const nu = Math.floor(Date.now() / 1000);
  const huvud = b64({ alg: "RS256", typ: "JWT", kid: KID });
  const krav = b64({
    iss: ISSUER, aud: CLIENT_ID, sub: createHash("sha256").update(epost).digest("hex").slice(0, 24),
    iat: nu, exp: nu + 600, nonce,
    email: epost, email_verified: verifierad, name: epost.split("@")[0].replace(".", " "),
    amr,
  });
  const signatur = createSign("RSA-SHA256")
    .update(`${huvud}.${krav}`)
    .sign(privateKey)
    .toString("base64url");
  return `${huvud}.${krav}.${signatur}`;
}

const json = (svar, kod, kropp) => {
  svar.writeHead(kod, { "content-type": "application/json" });
  svar.end(JSON.stringify(kropp));
};

createServer(async (beg, svar) => {
  const url = new URL(beg.url, ISSUER);

  if (url.pathname === "/.well-known/openid-configuration") {
    return json(svar, 200, {
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/authorize`,
      token_endpoint: `${ISSUER}/token`,
      jwks_uri: `${ISSUER}/jwks`,
      response_types_supported: ["code"],
      id_token_signing_alg_values_supported: ["RS256"],
      code_challenge_methods_supported: ["S256"],
    });
  }

  if (url.pathname === "/jwks") return json(svar, 200, { keys: [jwk] });

  if (url.pathname === "/authorize") {
    const p = url.searchParams;
    if (p.get("client_id") !== CLIENT_ID) return json(svar, 400, { error: "okänd klient" });
    if (p.get("code_challenge_method") !== "S256") {
      return json(svar, 400, { error: "PKCE med S256 krävs" });
    }
    const kod = randomBytes(16).toString("hex");
    koder.set(kod, {
      challenge: p.get("code_challenge"),
      nonce: p.get("nonce"),
      redirect_uri: p.get("redirect_uri"),
      epost: p.get("demo_epost") || "tove.bergqvist@nordmark.se",
      amr: (p.get("demo_amr") || "pwd,mfa").split(","),
      verifierad: p.get("demo_overifierad") !== "1",
    });
    const ut = new URL(p.get("redirect_uri"));
    ut.searchParams.set("code", kod);
    ut.searchParams.set("state", p.get("state") ?? "");
    svar.writeHead(302, { location: ut.toString() });
    return svar.end();
  }

  if (url.pathname === "/token" && beg.method === "POST") {
    const kropp = await new Promise((r) => {
      let d = ""; beg.on("data", (c) => (d += c)); beg.on("end", () => r(d));
    });
    const p = new URLSearchParams(kropp);
    if (p.get("client_id") !== CLIENT_ID || p.get("client_secret") !== CLIENT_SECRET) {
      return json(svar, 401, { error: "invalid_client" });
    }
    const sparad = koder.get(p.get("code"));
    if (!sparad) return json(svar, 400, { error: "invalid_grant" });
    koder.delete(p.get("code"));

    const verifier = p.get("code_verifier") ?? "";
    const berakanad = createHash("sha256").update(verifier).digest("base64url");
    if (berakanad !== sparad.challenge) return json(svar, 400, { error: "invalid_grant (PKCE)" });
    if (p.get("redirect_uri") !== sparad.redirect_uri) {
      return json(svar, 400, { error: "invalid_grant (redirect_uri)" });
    }

    return json(svar, 200, {
      token_type: "Bearer",
      expires_in: 600,
      id_token: idToken(sparad),
    });
  }

  json(svar, 404, { error: "okänd sökväg" });
}).listen(PORT, () => {
  console.log(`Test-utfärdare på ${ISSUER} — client_id ${CLIENT_ID}`);
});
