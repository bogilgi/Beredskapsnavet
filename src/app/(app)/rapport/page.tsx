import { kravLas } from "@/lib/session";
import { Panel, Sidrubrik, Status, Pill, Matare } from "@/components/ui";
import { UtskriftsKnapp } from "@/components/utskrift";
import {
  hamtaOrganisation, hamtaOversikt, hamtaKrav, hamtaBemanning, hamtaRisker,
  hamtaKritiskaFunktioner, hamtaResurser, hamtaOvningar, hamtaAtgarder, hamtaKonflikter,
} from "@/lib/queries";
import {
  KRAVSTATUS, PLANSTATUS, RESURSSTATUS, ATGARDSSTATUS, OVNINGSSTATUS, GILTIGHET,
  riskNivaText, riskTon,
} from "@/lib/domain";
import { dagarKvar, datum, forfalloText, idag, procent, tal, timmar } from "@/lib/format";

// Innehållet läses ur databasen vid varje begäran. Sidan får inte
// cachas som statisk HTML, då flera användare delar samma data.
export const dynamic = "force-dynamic";

const EXPORTER = [
  { typ: "lagkrav", namn: "Lagefterlevnad" },
  { typ: "krigsplacering", namn: "Krigsplacering" },
  { typ: "risker", namn: "Risk- och sårbarhetsanalys" },
  { typ: "kontinuitet", namn: "Kontinuitetshantering" },
  { typ: "resurser", namn: "Resursförteckning" },
  { typ: "atgarder", namn: "Åtgärdsregister" },
];

export default async function Rapportsida() {
  const anvandare = await kravLas("rapport");
  const orgId = anvandare.org_id;
  const org = hamtaOrganisation(orgId);
  const o = hamtaOversikt(orgId);
  const krav = hamtaKrav(orgId);
  const bemanning = hamtaBemanning(orgId).filter((b) => b.platser > 0);
  const risker = hamtaRisker(orgId);
  const funktioner = hamtaKritiskaFunktioner(orgId);
  const resurser = hamtaResurser(orgId);
  const ovningar = hamtaOvningar(orgId);
  const atgarder = hamtaAtgarder(orgId);
  const konflikter = hamtaKonflikter(orgId);

  const bemanningsgrad = procent(o.placerade, o.platser);
  const hoga = risker.filter((r) => r.sannolikhet * r.konsekvens >= 15);
  const gap = funktioner.filter((f) => f.faktisk_timmar > f.mtpd_timmar);
  const oppna = atgarder.filter((a) => ["ej_paborjad", "pagaende"].includes(a.status));
  const forsenade = oppna.filter((a) => (dagarKvar(a.forfallodatum) ?? 999) < 0);
  const genomforda = ovningar.filter((ov) => ["genomford", "utvarderad"].includes(ov.status));
  const urDrift = resurser.filter((r) => r.status === "ur_drift");

  /* Sammanfattningen skrivs av systemet utifrån aktuell data. */
  const bedomning: string[] = [
    `${org.namn} har en fastställd krigsorganisation om ${tal(o.platser)} platser, varav ${tal(o.placerade)} (${bemanningsgrad} procent) har beslutad krigsplacering och ${tal(o.foreslagna)} är föreslagna men ännu inte beslutade.`,
    konflikter.length > 0
      ? `Systemets kontroller visar ${konflikter.length} avvikelser i krigsplaceringen, varav ${konflikter.filter((k) => k.allvarlig).length} bedöms som allvarliga. Dessa avser samrådsplikt mot Försvarsmakten, dubbelplaceringar, saknad registerkontroll och vakanser på oumbärliga befattningar.`
      : "Inga avvikelser i krigsplaceringen är öppna.",
    `Av ${krav.length} följda krav är ${o.kravUppfyllda} uppfyllda och ${o.kravBrist} redovisar brist eller är ej påbörjade. ${o.kravForfaller} krav förfaller inom 90 dagar.`,
    `Risk- och sårbarhetsanalysen omfattar ${risker.length} händelser, varav ${hoga.length} har riskvärde 15 eller högre. ${risker.filter((r) => r.hojd_beredskap === 1).length} av riskerna är bedömda även för scenariot höjd beredskap.`,
    `Av ${funktioner.length} identifierade samhällsviktiga funktioner har ${gap.length} en bedömd återställningstid som överstiger den tolererade, och ${o.planSaknas} saknar giltig kontinuitetsplan.`,
    `Resursförteckningen omfattar ${resurser.length} poster. ${urDrift.length} är ur drift och ${o.resurserKontrollForsenad} har försenad eller okänd kontroll.`,
    `${genomforda.length} övningar har genomförts under mandatperioden, varav ${ovningar.filter((ov) => ov.status === "utvarderad").length} är utvärderade.`,
    `Åtgärdsregistret innehåller ${oppna.length} öppna åtgärder, varav ${forsenade.length} har passerat sitt förfallodatum.`,
    `${krav.filter((k) => k.giltighet === "upphor").length} av kraven vilar på författningar eller överenskommelser som upphör vid årsskiftet. Regeringen har i proposition 2026/27:5 föreslagit att lagen om kommuners och regioners grundläggande beredskap ska ersätta LEH den 1 januari 2027, och överenskommelsen med Myndigheten för civilt försvar och SKR löper ut 2026. ${org.typ === "region" ? "Regionen" : "Kommunen"} bör planera för omställningen under innevarande år.`,
  ];

  return (
    <>
      <div className="ej-utskrift">
        <Sidrubrik
          rubrik="Beredskapsrapport"
          beskrivning="Samlat underlag för rapportering till länsstyrelsen, redovisning i kommunstyrelsen och som utgångspunkt vid tillsyn. Innehållet genereras ur aktuell data och kan skrivas ut eller sparas som PDF."
          atgard={<UtskriftsKnapp />}
        />

        <Panel
          className="mb-5"
          rubrik="Exportera till kalkylblad"
          beskrivning="Semikolonseparerad CSV med teckenkodning anpassad för Excel."
        >
          <div className="flex flex-wrap gap-2">
            {EXPORTER.map((e) => (
              <a key={e.typ} href={`/api/export/${e.typ}`} className="knapp-sekundar" download>
                {e.namn}
              </a>
            ))}
          </div>
        </Panel>
      </div>

      <article className="kort p-8 max-w-[980px] mx-auto print:border-0 print:p-0">
        <header className="border-b border-slate-200 pb-4 mb-6">
          <p className="text-xs uppercase tracking-wider text-brand-700 font-semibold">
            {org.typ === "kommun" ? "Kommunal krisberedskap och civilt försvar" : "Regional krisberedskap"}
          </p>
          <h1 className="text-2xl font-semibold text-slate-900 mt-1">
            Beredskapsrapport {org.namn}
          </h1>
          <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-y-2 gap-x-4 text-xs">
            <div>
              <dt className="text-slate-500">Rapportdatum</dt>
              <dd className="text-slate-800 font-medium">{idag()}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Mandatperiod</dt>
              <dd className="text-slate-800 font-medium">{org.mandatperiod}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Beredskapssamordnare</dt>
              <dd className="text-slate-800 font-medium">{org.samordnare}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Informationsklass</dt>
              <dd className="text-slate-800 font-medium">Öppen</dd>
            </div>
          </dl>
        </header>

        <section className="mb-7">
          <h2 className="text-base font-semibold text-slate-900 mb-2">1. Samlad bedömning</h2>
          <div className="space-y-2">
            {bedomning.map((rad, i) => (
              <p key={i} className="text-sm text-slate-700 leading-relaxed">
                {rad}
              </p>
            ))}
          </div>
        </section>

        <section className="mb-7">
          <h2 className="text-base font-semibold text-slate-900 mb-2">2. Lagefterlevnad</h2>
          <table className="tabell border border-slate-200">
            <thead>
              <tr>
                <th>Krav</th>
                <th className="w-56">Lagrum</th>
                <th className="w-28">Nästa</th>
                <th className="w-32">Ansvarig</th>
                <th className="w-28">Rättslig status</th>
                <th className="w-28">Status</th>
              </tr>
            </thead>
            <tbody>
              {krav.map((k) => (
                <tr key={k.id}>
                  <td>
                    <span className="font-medium text-slate-900">{k.rubrik}</span>
                    <span className="text-xs text-slate-500 ml-1.5 font-mono">{k.kod}</span>
                  </td>
                  <td className="text-xs text-slate-600">{k.lagrum}</td>
                  <td className="text-xs text-slate-600">{datum(k.nasta_forfallo)}</td>
                  <td className="text-xs text-slate-600">{k.ansvarig}</td>
                  <td>
                    <Status karta={GILTIGHET} nyckel={k.giltighet} />
                  </td>
                  <td>
                    <Status karta={KRAVSTATUS} nyckel={k.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mb-7 sida-brytning">
          <h2 className="text-base font-semibold text-slate-900 mb-2">
            3. Krigsorganisation och krigsplacering
          </h2>
          <table className="tabell border border-slate-200">
            <thead>
              <tr>
                <th>Verksamhet</th>
                <th className="w-20 num">Platser</th>
                <th className="w-24 num">Beslutade</th>
                <th className="w-24 num">Föreslagna</th>
                <th className="w-40">Bemanningsgrad</th>
              </tr>
            </thead>
            <tbody>
              {bemanning.map((b) => (
                <tr key={b.id}>
                  <td>
                    <span className="font-medium text-slate-800">{b.namn}</span>
                    <span className="text-xs text-slate-500 ml-1">({b.kortnamn})</span>
                  </td>
                  <td className="num text-slate-700">{b.platser}</td>
                  <td className="num text-slate-700">{b.placerade}</td>
                  <td className="num text-slate-600">{b.foreslagna}</td>
                  <td>
                    <Matare del={b.placerade} helhet={b.platser} />
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-medium">
                <td>Summa</td>
                <td className="num">{o.platser}</td>
                <td className="num">{o.placerade}</td>
                <td className="num">{o.foreslagna}</td>
                <td>
                  <Matare del={o.placerade} helhet={o.platser} />
                </td>
              </tr>
            </tbody>
          </table>

          {konflikter.length > 0 && (
            <div className="mt-3">
              <h3 className="text-sm font-semibold text-slate-800 mb-1.5">
                Öppna avvikelser ({konflikter.length})
              </h3>
              <ul className="space-y-1">
                {konflikter.map((k, i) => (
                  <li key={i} className="text-xs text-slate-700 flex gap-2">
                    <span className={k.allvarlig ? "text-allv-text font-medium" : "text-varn-text"}>
                      {k.allvarlig ? "Allvarlig" : "Att hantera"}
                    </span>
                    <span>
                      {k.person !== "—" && <strong className="font-medium">{k.person}, </strong>}
                      {k.befattning} — {k.detalj}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="mb-7">
          <h2 className="text-base font-semibold text-slate-900 mb-2">
            4. Risk- och sårbarhetsanalys
          </h2>
          <table className="tabell border border-slate-200">
            <thead>
              <tr>
                <th>Risk</th>
                <th className="w-32">Ägare</th>
                <th className="w-14 num">S</th>
                <th className="w-14 num">K</th>
                <th className="w-28">Nivå</th>
                <th className="w-24 num">Åtgärder</th>
              </tr>
            </thead>
            <tbody>
              {risker.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium text-slate-800">{r.namn}</td>
                  <td className="text-xs text-slate-600">{r.agare}</td>
                  <td className="num text-slate-700">{r.sannolikhet}</td>
                  <td className="num text-slate-700">{r.konsekvens}</td>
                  <td>
                    <Pill ton={riskTon(r.sannolikhet, r.konsekvens)}>
                      {riskNivaText(r.sannolikhet, r.konsekvens)}
                    </Pill>
                  </td>
                  <td className="num text-slate-600">{r.atgarder}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mb-7 sida-brytning">
          <h2 className="text-base font-semibold text-slate-900 mb-2">
            5. Kontinuitet i samhällsviktig verksamhet
          </h2>
          <table className="tabell border border-slate-200">
            <thead>
              <tr>
                <th>Funktion</th>
                <th className="w-16 num">Prio</th>
                <th className="w-24 num">Tolererat</th>
                <th className="w-24 num">Faktiskt</th>
                <th className="w-20 num">Gap</th>
                <th className="w-28">Plan</th>
              </tr>
            </thead>
            <tbody>
              {funktioner.map((f) => {
                const g = f.faktisk_timmar - f.mtpd_timmar;
                return (
                  <tr key={f.id}>
                    <td>
                      <span className="font-medium text-slate-800">{f.namn}</span>
                      <span className="text-xs text-slate-500 ml-1">({f.kortnamn})</span>
                    </td>
                    <td className="num text-slate-700">{f.prioritet}</td>
                    <td className="num text-slate-600">{timmar(f.mtpd_timmar)}</td>
                    <td className="num text-slate-700">{timmar(f.faktisk_timmar)}</td>
                    <td className="num">
                      {g > 0 ? (
                        <span className="text-allv-text font-medium">+{timmar(g)}</span>
                      ) : (
                        <span className="text-ok-text">–</span>
                      )}
                    </td>
                    <td>
                      <Status karta={PLANSTATUS} nyckel={f.plan_status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="mb-7">
          <h2 className="text-base font-semibold text-slate-900 mb-2">6. Resursläge</h2>
          <table className="tabell border border-slate-200">
            <thead>
              <tr>
                <th>Resurs</th>
                <th className="w-24 num">Antal</th>
                <th>Placering</th>
                <th className="w-28">Nästa kontroll</th>
                <th className="w-28">Status</th>
              </tr>
            </thead>
            <tbody>
              {resurser.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium text-slate-800">{r.benamning}</td>
                  <td className="num text-slate-700">
                    {tal(r.antal)} {r.enhet}
                  </td>
                  <td className="text-xs text-slate-600">{r.placering}</td>
                  <td className="text-xs text-slate-600">{datum(r.nasta_kontroll)}</td>
                  <td>
                    <Status karta={RESURSSTATUS} nyckel={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mb-7 sida-brytning">
          <h2 className="text-base font-semibold text-slate-900 mb-2">7. Övning och utbildning</h2>
          <table className="tabell border border-slate-200">
            <thead>
              <tr>
                <th>Övning</th>
                <th className="w-28">Datum</th>
                <th className="w-24 num">Deltagare</th>
                <th className="w-28">Status</th>
              </tr>
            </thead>
            <tbody>
              {ovningar.map((ov) => (
                <tr key={ov.id}>
                  <td>
                    <span className="font-medium text-slate-800">{ov.namn}</span>
                    {ov.erfarenheter && (
                      <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                        {ov.erfarenheter}
                      </p>
                    )}
                  </td>
                  <td className="text-xs text-slate-600">{datum(ov.datum)}</td>
                  <td className="num text-slate-700">{ov.deltagare || "–"}</td>
                  <td>
                    <Status karta={OVNINGSSTATUS} nyckel={ov.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900 mb-2">
            8. Åtgärdsplan ({oppna.length} öppna åtgärder)
          </h2>
          <table className="tabell border border-slate-200">
            <thead>
              <tr>
                <th>Åtgärd</th>
                <th className="w-36">Ansvarig</th>
                <th className="w-28">Förfaller</th>
                <th className="w-28">Status</th>
              </tr>
            </thead>
            <tbody>
              {oppna.map((a) => {
                const n = dagarKvar(a.forfallodatum);
                return (
                  <tr key={a.id}>
                    <td className="font-medium text-slate-800">{a.titel}</td>
                    <td className="text-xs text-slate-600">{a.ansvarig || "–"}</td>
                    <td
                      className={`text-xs ${n !== null && n < 0 ? "text-allv-text font-medium" : "text-slate-600"}`}
                    >
                      {a.forfallodatum ? forfalloText(a.forfallodatum) : "–"}
                    </td>
                    <td>
                      <Status karta={ATGARDSSTATUS} nyckel={a.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <footer className="mt-8 pt-4 border-t border-slate-200 text-xs text-slate-500 leading-relaxed">
          Rapporten är genererad ur Beredskapsnavet {idag()} och återger läget vid detta datum.
          Uppgifter om enskilda medarbetare redovisas maskerade. Lagrum och intervall i avsnitt 2 är
          kontrollerade mot författningstexten i oktober 2026 och varje krav bär en källhänvisning i
          systemet. Underlaget ska granskas och beslutas av ansvarig chef innan det lämnas vidare.
        </footer>
      </article>
    </>
  );
}
