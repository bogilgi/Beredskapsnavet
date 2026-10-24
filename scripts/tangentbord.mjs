/**
 * Prövar att de kritiska flödena går att genomföra utan mus.
 *
 * Skriptet klickar inte en enda gång: allt sker med Tab, piltangenter och
 * Enter. Det är skillnaden mot den maskinella regelgranskningen i
 * tillganglighet.mjs, som kontrollerar enskilda element men inte om ett helt
 * arbetsflöde går att genomföra.
 *
 *   npm run demo          # i en terminal
 *   npm run tangentbord   # i en annan
 *
 * Playwright är inte ett beroende i projektet: det behövs bara för
 * granskningen och ska inte följa med in i driften.
 *
 * VAD DEN INTE GÖR. Den prövar inte hur flödena LÅTER i en skärmläsare, bara
 * att de går att nå och utföra. Se docs/tillganglighet.md.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const BAS = process.env.BEREDSKAP_BAS || "http://localhost:4010";
const KONTO = { epost: "marika.ohlund@angsholm.se", losenord: "beredskap2026" };

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error(
    "Saknar playwright. Installera granskningsverktygen:\n\n" +
    "  npm i --no-save playwright && npx playwright install chromium\n",
  );
  process.exit(2);
}

try {
  const svar = await fetch(`${BAS}/logga-in`);
  if (!svar.ok) throw new Error(String(svar.status));
} catch {
  console.error(`Appen svarar inte på ${BAS}. Starta den med npm run demo först.`);
  process.exit(2);
}

const egenWebblasare = process.env.BEREDSKAP_CHROMIUM;
let webb;
try {
  webb = await chromium.launch(egenWebblasare ? { executablePath: egenWebblasare } : {});
} catch (f) {
  console.error("Kunde inte starta webbläsaren: " + (f instanceof Error ? f.message.split("\n")[0] : f));
  console.error("\nInstallera den med\n\n  npx playwright install chromium\n\n" +
    "eller peka ut en befintlig med BEREDSKAP_CHROMIUM=/sökväg/till/chromium.\n");
  process.exit(2);
}

/** Vad som har fokus just nu, och om fokuset syns. */
const fokus = (sida) => sida.evaluate(() => {
  const e = document.activeElement;
  if (!e || e === document.body) return null;
  const r = e.getBoundingClientRect();
  const st = getComputedStyle(e);
  return {
    tag: e.tagName.toLowerCase(),
    txt: (e.innerText || e.value || e.getAttribute("aria-label") || "").trim().slice(0, 48),
    synlig: r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.opacity !== "0",
    markering: st.outlineStyle !== "none" && st.outlineWidth !== "0px",
  };
});

/** Tabbar framåt tills villkoret stämmer. */
async function tabbaTill(sida, villkor, max = 80) {
  for (let i = 1; i <= max; i++) {
    await sida.keyboard.press("Tab");
    const f = await fokus(sida);
    if (f && villkor(f)) return { steg: i, f };
  }
  return { steg: -1, f: null };
}

async function loggaInUtanMus(sida) {
  await sida.goto(`${BAS}/logga-in`);
  await tabbaTill(sida, (f) => f.tag === "input", 6);
  await sida.keyboard.type(KONTO.epost);
  await sida.keyboard.press("Tab");
  await sida.keyboard.type(KONTO.losenord);
  await tabbaTill(sida, (f) => f.tag === "button", 6);
  await sida.keyboard.press("Enter");
  await sida.waitForURL((u) => !u.pathname.includes("logga-in"), { timeout: 20000 }).catch(() => {});
  return !new URL(sida.url()).pathname.includes("logga-in");
}

const resultat = [];
const notera = (namn, ok, detalj = "") => {
  resultat.push({ namn, ok, detalj });
  console.log(`${ok ? "ok  " : "FEL "} ${namn}${detalj ? "  — " + detalj : ""}`);
};

const sida = await (await webb.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();

notera("Logga in utan mus", await loggaInUtanMus(sida));

await sida.goto(`${BAS}/efterlevnad`);
await sida.keyboard.press("Tab");
const forsta = await fokus(sida);
notera(
  "Genvägen till innehållet kommer först",
  Boolean(forsta && /Hoppa till inneh/.test(forsta.txt) && forsta.synlig),
  forsta ? `"${forsta.txt}"` : "inget fokus",
);

const lank = await tabbaTill(sida, (f) => f.tag === "a" && /Krigsplacering/.test(f.txt));
if (lank.steg > 0) {
  await sida.keyboard.press("Enter");
  await sida.waitForURL(/krigsplacering/, { timeout: 10000 }).catch(() => {});
}
notera("Navigera i menyn", /krigsplacering/.test(sida.url()), `länken efter ${lank.steg} tabb`);

// Statusväljaren ska gå att ändra med piltangent, och raden får inte hoppa
// undan när den ändras — gjorde den det skulle nästa tryck träffa fel rad.
await sida.goto(`${BAS}/efterlevnad`, { waitUntil: "networkidle" });
const ordningFore = await sida.$$eval("table.tabell tbody tr td:first-child",
  (t) => t.map((e) => e.textContent.trim()));
const valjare = await tabbaTill(sida, (f) => f.tag === "select");
let andrad = false;
if (valjare.steg > 0) {
  const fore = await sida.evaluate(() => document.activeElement.value);
  await sida.keyboard.press("ArrowDown");
  await sida.waitForTimeout(2500);
  const efter = await sida.$eval("table.tabell tbody tr:first-child select", (e) => e.value);
  andrad = fore !== efter;
}
notera("Ändra kravstatus med piltangent", andrad, `väljaren efter ${valjare.steg} tabb`);

const ordningEfter = await sida.$$eval("table.tabell tbody tr td:first-child",
  (t) => t.map((e) => e.textContent.trim()));
notera(
  "Raden står kvar när den ändras",
  JSON.stringify(ordningFore) === JSON.stringify(ordningEfter),
  "annars träffar nästa tryck fel rad",
);

await sida.goto(`${BAS}/efterlevnad`);
let utanMarkering = 0;
let provade = 0;
for (let i = 0; i < 40; i++) {
  await sida.keyboard.press("Tab");
  const f = await fokus(sida);
  if (!f) continue;
  provade++;
  if (f.synlig && !f.markering) utanMarkering++;
}
notera("Synlig fokusmarkering", utanMarkering === 0, `${provade} element prövade`);
await sida.close();

// Den fällbara menyn på smal skärm måste gå att öppna utan mus, annars är
// hela navigationen onåbar vid förstoring.
const smal = await (await webb.newContext({ viewport: { width: 320, height: 800 } })).newPage();
await loggaInUtanMus(smal);
await smal.goto(`${BAS}/efterlevnad`);
const meny = await tabbaTill(smal, (f) => f.tag === "button" && /Meny/.test(f.txt), 14);
let menyOppen = false;
if (meny.steg > 0) {
  await smal.keyboard.press("Enter");
  await smal.waitForTimeout(500);
  menyOppen = await smal.evaluate(() => {
    const m = document.getElementById("huvudmeny");
    return Boolean(m) && m.getBoundingClientRect().height > 50;
  });
}
notera("Öppna menyn på smal skärm", menyOppen, `knappen efter ${meny.steg} tabb`);

await webb.close();

const fel = resultat.filter((r) => !r.ok);
console.log();
if (fel.length === 0) {
  console.log(`Samtliga ${resultat.length} flöden går att genomföra utan mus.`);
  console.log("Det säger inte hur de låter i en skärmläsare. Se docs/tillganglighet.md.");
  process.exit(0);
}
console.log(`${fel.length} av ${resultat.length} flöden misslyckades.`);
process.exit(1);
