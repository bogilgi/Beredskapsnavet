import { kravLas } from "@/lib/session";
import { farSkriva } from "@/lib/behorighet";
import Link from "next/link";
import { Panel, Stat, Status, Matare, Sidrubrik, Pill, Tomt } from "@/components/ui";
import { Vaxlare } from "@/components/kontroller";
import { satBeredskapsnivaVia } from "@/lib/actions";
import {
  hamtaOrganisation, hamtaOversikt, hamtaBemanning, hamtaKrav, hamtaAtgarder,
  hamtaRisker, hamtaKritiskaFunktioner, hamtaResurser, hamtaKonflikter, hamtaLogg,
  hamtaOvningar,
} from "@/lib/queries";
import {
  ATGARDSSTATUS, KRAVSTATUS, PLANSTATUS, RESURSSTATUS, riskTon, riskNivaText,
  RISKKATEGORI, type Ton,
} from "@/lib/domain";
import { dagarKvar, datum, datumTid, forfalloText, procent, tal, timmar } from "@/lib/format";

// Innehållet läses ur databasen vid varje begäran. Sidan får inte
// cachas som statisk HTML, då flera användare delar samma data.
export const dynamic = "force-dynamic";

type Punkt = {
  vikt: number;
  ton: Ton;
  rubrik: string;
  detalj: string;
  lank: string;
  lanktext: string;
};

export default async function Oversiktssida() {
  const anvandare = await kravLas("oversikt");
  const skriv = farSkriva(anvandare.roll, "oversikt");
  const orgId = anvandare.org_id;
  const org = hamtaOrganisation(orgId);
  const o = hamtaOversikt(orgId);
  const bemanning = hamtaBemanning(orgId);
  const krav = hamtaKrav(orgId);
  const atgarder = hamtaAtgarder(orgId);
  const risker = hamtaRisker(orgId);
  const funktioner = hamtaKritiskaFunktioner(orgId);
  const resurser = hamtaResurser(orgId);
  const konflikter = hamtaKonflikter(orgId);
  const ovningar = hamtaOvningar(orgId);
  const logg = hamtaLogg(orgId, 6);

  const bemanningsgrad = procent(o.placerade, o.platser);

  /* Prioriteringslistan: det samordnaren behöver göra härnäst, oavsett modul. */
  const punkter: Punkt[] = [];

  for (const k of konflikter.filter((k) => k.allvarlig).slice(0, 4)) {
    punkter.push({
      vikt: 100,
      ton: "allvarlig",
      rubrik: k.typ === "vakans" ? `Vakans: ${k.befattning}` : `${k.person} – ${k.befattning}`,
      detalj: k.detalj,
      lank: "/krigsplacering",
      lanktext: "Krigsplacering",
    });
  }

  for (const k of krav.filter(
    (k) => k.status !== "uppfylld" && (dagarKvar(k.nasta_forfallo) ?? 999) <= 90,
  )) {
    const n = dagarKvar(k.nasta_forfallo) ?? 0;
    punkter.push({
      vikt: n < 0 ? 95 : 80 - Math.min(n, 90) / 10,
      ton: n < 0 || k.status === "brist" ? "allvarlig" : "varning",
      rubrik: `${k.rubrik} (${k.kod})`,
      detalj: `${k.lagrum.replace(/\.$/, "")}. ${forfalloText(k.nasta_forfallo)}. Ansvarig: ${k.ansvarig}.`,
      lank: "/efterlevnad",
      lanktext: "Lagkrav",
    });
  }

  for (const a of atgarder.filter(
    (a) => ["ej_paborjad", "pagaende"].includes(a.status) && (dagarKvar(a.forfallodatum) ?? 999) < 0,
  )) {
    punkter.push({
      vikt: 90,
      ton: "allvarlig",
      rubrik: a.titel,
      detalj: `${forfalloText(a.forfallodatum)}. Ansvarig: ${a.ansvarig || "ej utsedd"}.`,
      lank: "/atgarder",
      lanktext: "Åtgärdsregister",
    });
  }

  for (const r of resurser.filter((r) => r.status === "ur_drift")) {
    punkter.push({
      vikt: 70,
      ton: "allvarlig",
      rubrik: `Ur drift: ${r.benamning}`,
      detalj: r.noteringar || `Placering: ${r.placering}. Ansvarig: ${r.ansvarig}.`,
      lank: "/resurser",
      lanktext: "Resurser",
    });
  }

  for (const f of funktioner.filter((f) => ["saknas", "utgangen"].includes(f.plan_status))) {
    punkter.push({
      vikt: 60,
      ton: "varning",
      rubrik: `Kontinuitetsplan ${f.plan_status === "saknas" ? "saknas" : "utgången"}: ${f.namn}`,
      detalj: `Prioritet ${f.prioritet}. Tolererad avbrottstid ${timmar(f.mtpd_timmar)}, bedömd faktisk ${timmar(f.faktisk_timmar)}.`,
      lank: "/kontinuitet",
      lanktext: "Kontinuitet",
    });
  }

  punkter.sort((a, b) => b.vikt - a.vikt);
  const topp = punkter.slice(0, 9);

  const nastaOvning = ovningar
    .filter((ov) => ov.status === "planerad")
    .sort((a, b) => a.datum.localeCompare(b.datum))[0];

  return (
    <>
      <Sidrubrik
        rubrik="Översikt beredskapsläge"
        beskrivning={`${org.namn}, mandatperiod ${org.mandatperiod}. Samlad bild av krigsorganisation, lagefterlevnad, risker och förmåga. Underlaget uppdateras när någon ändrar i en modul.`}
        atgard={
          <div className="flex flex-wrap items-end gap-2">
            {skriv && (
            <div>
              <span className="etikett">Beredskapsläge</span>
              <Vaxlare
                id={1}
                varde={org.beredskapsniva}
                etikett="Beredskapsläge"
                bredd="w-44"
                action={satBeredskapsnivaVia}
                alternativ={[
                  { varde: "fredstida", etikett: "Fredstida beredskap" },
                  { varde: "beredskapslarm", etikett: "Beredskapslarm" },
                  { varde: "hojd_beredskap", etikett: "Höjd beredskap" },
                ]}
              />
            </div>
            )}
            <Link href="/rapport" className="knapp-primar">
              Beredskapsrapport
            </Link>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-5">
        <Stat
          etikett="Bemanning krigsorganisation"
          varde={`${bemanningsgrad}%`}
          hint={`${tal(o.placerade)} av ${tal(o.platser)} platser beslutade. ${tal(o.foreslagna)} föreslagna väntar på beslut.`}
          ton={bemanningsgrad >= 90 ? "ok" : bemanningsgrad >= 70 ? "varning" : "allvarlig"}
          href="/krigsorganisation"
        />
        <Stat
          etikett="Lagkrav med brist"
          varde={o.kravBrist}
          enhet={`av ${o.kravTotalt}`}
          hint={`${o.kravUppfyllda} uppfyllda. ${o.kravForfaller} krav förfaller inom 90 dagar.`}
          ton={o.kravBrist > 0 ? "allvarlig" : "ok"}
          href="/efterlevnad"
        />
        <Stat
          etikett="Försenade åtgärder"
          varde={o.atgarderForsenade}
          enhet={`av ${o.atgarderOppna} öppna`}
          hint={`${o.atgarderKlara} åtgärder avslutade. ${o.allvarligaKonflikter} allvarliga avvikelser i krigsorganisationen.`}
          ton={o.atgarderForsenade > 0 ? "allvarlig" : "ok"}
          href="/atgarder"
        />
        <Stat
          etikett="Funktioner över tolererad avbrottstid"
          varde={o.funktionerGap}
          enhet={`av ${o.funktionerTotalt}`}
          hint={`${o.planSaknas} saknar eller har utgången kontinuitetsplan.`}
          ton={o.funktionerGap > 0 ? "varning" : "ok"}
          href="/kontinuitet"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2 min-w-0"
          rubrik="Kräver åtgärd nu"
          beskrivning={`${punkter.length} punkter samlade från alla moduler, sorterade efter allvar.`}
          padding={false}
          atgard={
            <span className="text-xs text-slate-500">
              Visar de {topp.length} mest angelägna
            </span>
          }
        >
          <ul>
            {topp.map((p, i) => (
              <li
                key={i}
                className="flex gap-3 px-4 py-3 border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
              >
                <span
                  aria-hidden="true"
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    p.ton === "allvarlig" ? "bg-allv-solid" : "bg-varn-solid"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">{p.rubrik}</p>
                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{p.detalj}</p>
                </div>
                <Link
                  href={p.lank}
                  className="shrink-0 self-center text-xs font-medium text-brand-700 hover:underline"
                >
                  {p.lanktext} →
                </Link>
              </li>
            ))}
            {topp.length === 0 && <Tomt>Inga öppna avvikelser.</Tomt>}
          </ul>
        </Panel>

        <div className="space-y-5 min-w-0">
          <Panel
            rubrik="Bemanning per verksamhet"
            beskrivning="Beslutade krigsplaceringar mot fastställda platser."
            padding={false}
          >
            <table className="tabell">
              <thead>
                <tr>
                  <th>Verksamhet</th>
                  <th className="num">Platser</th>
                  <th className="w-36">Bemanning</th>
                </tr>
              </thead>
              <tbody>
                {bemanning
                  .filter((b) => b.platser > 0)
                  .map((b) => (
                    <tr key={b.id}>
                      <td>
                        <span className="font-medium text-slate-800">{b.kortnamn}</span>
                        {b.samhallsviktig === 1 && (
                          <span className="ml-1.5 text-[10px] uppercase tracking-wide text-brand-700">
                            samhällsviktig
                          </span>
                        )}
                        <div className="text-xs text-slate-500">{b.namn}</div>
                      </td>
                      <td className="num text-slate-600">{b.platser}</td>
                      <td>
                        <Matare
                          del={b.placerade}
                          helhet={b.platser}
                          etikett={`Bemanningsgrad för ${b.namn}`}
                        />
                        {b.foreslagna > 0 && (
                          <div className="text-[11px] text-varn-text mt-0.5">
                            +{b.foreslagna} föreslagna
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Panel>

          <Panel rubrik="Nästa planerade övning">
            {nastaOvning ? (
              <div>
                <p className="text-sm font-medium text-slate-900">{nastaOvning.namn}</p>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {nastaOvning.scenario}
                </p>
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                  <Pill ton="info">{datum(nastaOvning.datum)}</Pill>
                  <span>{nastaOvning.malgrupp}</span>
                </div>
                <Link
                  href="/ovningar"
                  className="mt-3 inline-block text-xs font-medium text-brand-700 hover:underline"
                >
                  Övningsplan →
                </Link>
              </div>
            ) : (
              <Tomt>Ingen övning planerad.</Tomt>
            )}
          </Panel>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2 mt-5">
        <Panel
          rubrik="Högst värderade risker"
          beskrivning="Sannolikhet gånger konsekvens enligt senaste bedömning."
          padding={false}
          atgard={
            <Link href="/rsa" className="text-xs font-medium text-brand-700 hover:underline">
              Hela analysen →
            </Link>
          }
        >
          <table className="tabell">
            <thead>
              <tr>
                <th>Risk</th>
                <th>Kategori</th>
                <th className="num">S×K</th>
                <th>Nivå</th>
                <th className="num">Åtgärder</th>
              </tr>
            </thead>
            <tbody>
              {risker.slice(0, 6).map((r) => (
                <tr key={r.id}>
                  <td className="font-medium text-slate-800">{r.namn}</td>
                  <td className="text-slate-600 text-xs">{RISKKATEGORI[r.kategori]}</td>
                  <td className="num text-slate-700">{r.sannolikhet * r.konsekvens}</td>
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
        </Panel>

        <Panel
          rubrik="Kontinuitetsgap i samhällsviktig verksamhet"
          beskrivning="Funktioner där bedömd återställningstid överstiger den tolererade."
          padding={false}
          atgard={
            <Link href="/kontinuitet" className="text-xs font-medium text-brand-700 hover:underline">
              Alla funktioner →
            </Link>
          }
        >
          <table className="tabell">
            <thead>
              <tr>
                <th>Funktion</th>
                <th className="num">Tolererat</th>
                <th className="num">Faktiskt</th>
                <th>Plan</th>
              </tr>
            </thead>
            <tbody>
              {funktioner
                .filter((f) => f.faktisk_timmar > f.mtpd_timmar)
                .slice(0, 6)
                .map((f) => (
                  <tr key={f.id}>
                    <td>
                      <span className="font-medium text-slate-800">{f.namn}</span>
                      <div className="text-xs text-slate-500">{f.kortnamn}</div>
                    </td>
                    <td className="num text-slate-600">{timmar(f.mtpd_timmar)}</td>
                    <td className="num font-medium text-allv-text">{timmar(f.faktisk_timmar)}</td>
                    <td>
                      <Status karta={PLANSTATUS} nyckel={f.plan_status} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-3 mt-5">
        <Panel
          className="xl:col-span-2 min-w-0"
          rubrik="Åtgärder närmast i tiden"
          padding={false}
          atgard={
            <Link href="/atgarder" className="text-xs font-medium text-brand-700 hover:underline">
              Hela registret →
            </Link>
          }
        >
          <table className="tabell">
            <thead>
              <tr>
                <th>Åtgärd</th>
                <th>Ansvarig</th>
                <th>Förfaller</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {atgarder
                .filter((a) => ["ej_paborjad", "pagaende"].includes(a.status))
                .slice(0, 8)
                .map((a) => {
                  const n = dagarKvar(a.forfallodatum);
                  return (
                    <tr key={a.id}>
                      <td className="font-medium text-slate-800">{a.titel}</td>
                      <td className="text-slate-600 text-xs">{a.ansvarig || "–"}</td>
                      <td
                        className={`text-xs ${n !== null && n < 0 ? "text-allv-text font-medium" : "text-slate-600"}`}
                      >
                        {forfalloText(a.forfallodatum)}
                      </td>
                      <td>
                        <Status karta={ATGARDSSTATUS} nyckel={a.status} />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </Panel>

        <Panel rubrik="Senaste ändringar" beskrivning="Spårbarhetslogg." padding={false}>
          <ul className="divide-y divide-slate-100">
            {logg.map((l) => (
              <li key={l.id} className="px-4 py-2.5">
                <p className="text-xs text-slate-500">{datumTid(l.tidpunkt)}</p>
                <p className="text-sm text-slate-800 mt-0.5">{l.handelse}</p>
                {l.objekt && <p className="text-xs text-slate-600">{l.objekt}</p>}
                <p className="text-[11px] text-slate-600 mt-0.5">{l.anvandare}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Stat
          etikett="Resurser ur drift"
          varde={o.resurserUrDrift}
          hint={`${o.resurserKontrollForsenad} resurser har försenad eller okänd kontroll.`}
          ton={o.resurserUrDrift > 0 ? "allvarlig" : "ok"}
          href="/resurser"
        />
        <Stat
          etikett="Övningar senaste 12 mån"
          varde={o.ovningarGenomforda12mdr}
          hint="Lagkravet gäller per mandatperiod. Tre genomförda och utvärderade övningar räknas som underlag."
          ton={o.ovningarGenomforda12mdr >= 2 ? "ok" : "varning"}
          href="/ovningar"
        />
        <Stat
          etikett="Risker med hög nivå"
          varde={o.riskerHoga}
          enhet={`av ${o.riskerTotalt}`}
          hint="Riskvärde 15 eller högre kräver beslutad åtgärd eller dokumenterat accepterande."
          ton={o.riskerHoga > 0 ? "varning" : "ok"}
          href="/rsa"
        />
      </div>
    </>
  );
}
