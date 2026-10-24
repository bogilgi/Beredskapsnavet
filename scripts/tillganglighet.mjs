/**
 * Maskinell tillgänglighetsgranskning mot WCAG 2.1 A och AA.
 *
 * Lagen om tillgänglighet till digital offentlig service kräver WCAG 2.1 AA av
 * offentlig sektor, och i en kommunupphandling är det normalt ett skallkrav.
 *
 * VAD DEN INTE GÖR. Ett maskinellt verktyg hittar en del av kraven, inte alla.
 * Läsordning, begriplig text, meningsfulla etiketter och att tangentbordsvägen
 * genom en sida faktiskt fungerar måste granskas av en människa. Att det här
 * skriptet går igenom är ett golv, inte ett intyg. Se docs/tillganglighet.md.
 *
 *   npm run tillganglighet            # kräver att appen kör på port 4010
 *
 * Playwright och axe-core är inte beroenden i projektet: de behövs bara för den
 * här granskningen och ska inte följa med in i driften. Saknas de säger
 * skriptet hur de installeras.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const BAS = process.env.BEREDSKAP_BAS || "http://localhost:4010";

const SIDOR = [
  "/logga-in", "/", "/efterlevnad", "/atgarder", "/krigsorganisation",
  "/krigsplacering", "/krigsplacering/import", "/rsa", "/kontinuitet",
  "/resurser", "/ovningar", "/rapport", "/anvandare", "/personuppgifter",
  "/organisationer", "/katalog",
];

// Leverantörskontot i demodatan når samtliga moduler.
const KONTO = { epost: "elsa.wikner@beredskapsnavet.se", losenord: "leverantor2026" };

const INSTALLERA =
  "npm i --no-save playwright axe-core && npx playwright install chromium";

function kravs(hamta, vad) {
  try {
    return hamta();
  } catch (f) {
    console.error(`Saknar ${vad}. Installera granskningsverktygen:\n\n  ${INSTALLERA}\n`);
    process.exit(2);
  }
}

const { chromium } = kravs(() => require("playwright"), "playwright");
const axeKalla = kravs(
  () => readFileSync(require.resolve("axe-core/axe.min.js"), "utf8"),
  "axe-core",
);

try {
  const svar = await fetch(`${BAS}/logga-in`);
  if (!svar.ok) throw new Error(String(svar.status));
} catch {
  console.error(`Appen svarar inte på ${BAS}. Starta den med npm run demo först.`);
  process.exit(2);
}

// En Playwright installerad för tillfället hittar inte alltid en webbläsare som
// ligger någon annanstans i miljön. BEREDSKAP_CHROMIUM pekar ut den.
const webb = await kravsStart();

async function kravsStart() {
  const egen = process.env.BEREDSKAP_CHROMIUM;
  try {
    return await chromium.launch(egen ? { executablePath: egen } : {});
  } catch (f) {
    console.error(
      "Kunde inte starta webbläsaren: " + (f instanceof Error ? f.message.split("\n")[0] : f),
    );
    console.error(
      "\nInstallera den med\n\n  npx playwright install chromium\n\n" +
      "eller peka ut en befintlig med BEREDSKAP_CHROMIUM=/sökväg/till/chromium.\n",
    );
    process.exit(2);
  }
}
const sida = await (await webb.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();

await sida.goto(`${BAS}/logga-in`);
await sida.fill('input[type=email]', KONTO.epost);
await sida.fill('input[type=password]', KONTO.losenord);
await sida.click('button[type=submit]');
await sida.waitForURL((u) => !u.pathname.includes("logga-in"), { timeout: 20000 });

const fynd = new Map();
for (const vag of SIDOR) {
  await sida.goto(BAS + vag, { waitUntil: "networkidle" });
  await sida.addScriptTag({ content: axeKalla });
  const resultat = await sida.evaluate(async () =>
    await window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    }));

  for (const f of resultat.violations) {
    if (!fynd.has(f.id)) fynd.set(f.id, { ...f, sidor: new Set(), antal: 0, exempel: [] });
    const post = fynd.get(f.id);
    post.sidor.add(vag);
    post.antal += f.nodes.length;
    for (const n of f.nodes) if (post.exempel.length < 3) post.exempel.push(n.html.slice(0, 120));
  }
}
await webb.close();

console.log(`Granskade ${SIDOR.length} sidor mot WCAG 2.1 A och AA (axe-core).\n`);
if (fynd.size === 0) {
  console.log("Inga maskinellt upptäckbara överträdelser.");
  console.log("Det ersätter inte en granskning av en människa. Se docs/tillganglighet.md.");
  process.exit(0);
}

const vikt = { critical: 0, serious: 1, moderate: 2, minor: 3 };
for (const f of [...fynd.values()].sort((a, b) => vikt[a.impact] - vikt[b.impact])) {
  console.log(`[${f.impact.toUpperCase()}] ${f.id} — ${f.antal} fall på ${f.sidor.size} sidor`);
  console.log(`  ${f.help}`);
  console.log(`  sidor: ${[...f.sidor].join(" ")}`);
  for (const e of f.exempel) console.log(`  ex: ${e}`);
  console.log(`  ${f.helpUrl}\n`);
}
process.exit(1);
