import { kravLas } from "@/lib/session";
import { farSkriva } from "@/lib/behorighet";
import { Panel, Sidrubrik, Stat, Status, Pill } from "@/components/ui";
import { RiskBedomning } from "@/components/kontroller";
import { satRiskBedomning } from "@/lib/actions";
import { hamtaRisker, hamtaOrganisation } from "@/lib/queries";
import { RISKKATEGORI, RISKSTATUS, riskNivaText, riskTon } from "@/lib/domain";
import { datum } from "@/lib/format";

// Innehållet läses ur databasen vid varje begäran. Sidan får inte
// cachas som statisk HTML, då flera användare delar samma data.
export const dynamic = "force-dynamic";

const SANNOLIKHET = [
  "1 Mycket låg",
  "2 Låg",
  "3 Medel",
  "4 Hög",
  "5 Mycket hög",
];
const KONSEKVENS = [
  "1 Mycket begränsad",
  "2 Begränsad",
  "3 Allvarlig",
  "4 Mycket allvarlig",
  "5 Katastrofal",
];

function cellFarg(s: number, k: number): string {
  const v = s * k;
  if (v >= 15) return "bg-allv-bg ring-allv-ring";
  if (v >= 8) return "bg-varn-bg ring-varn-ring";
  return "bg-ok-bg ring-ok-ring";
}

export default async function RsaSida() {
  const anvandare = await kravLas("rsa");
  const skriv = farSkriva(anvandare.roll, "rsa");
  const orgId = anvandare.org_id;
  const org = hamtaOrganisation(orgId);
  const risker = hamtaRisker(orgId);
  const nummer = new Map(risker.map((r, i) => [r.id, i + 1]));

  const hoga = risker.filter((r) => r.sannolikhet * r.konsekvens >= 15);
  const utanAtgard = risker.filter(
    (r) => r.sannolikhet * r.konsekvens >= 15 && r.atgarder === 0,
  );
  const hojdBeredskap = risker.filter((r) => r.hojd_beredskap === 1);

  return (
    <>
      <Sidrubrik
        rubrik="Risk- och sårbarhetsanalys"
        lagrum="Lag (2006:544) om kommuners och regioners åtgärder inför och vid extraordinära händelser i fredstid och höjd beredskap, 2 kap. 1 §"
        beskrivning={`Identifierade händelser som kan påverka ${org.namn}, bedömda i sannolikhet och konsekvens. Analysen ska göras varje mandatperiod och ligga till grund för planer, övningar och åtgärder.`}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-5">
        <Stat etikett="Identifierade risker" varde={risker.length} />
        <Stat
          etikett="Hög risknivå"
          varde={hoga.length}
          ton={hoga.length > 0 ? "allvarlig" : "ok"}
          hint="Riskvärde 15 eller högre."
        />
        <Stat
          etikett="Hög risk utan åtgärd"
          varde={utanAtgard.length}
          ton={utanAtgard.length > 0 ? "allvarlig" : "ok"}
          hint="Ska antingen åtgärdas eller accepteras genom dokumenterat beslut."
          href="/atgarder"
        />
        <Stat
          etikett="Bedömda även vid höjd beredskap"
          varde={hojdBeredskap.length}
          enhet={`av ${risker.length}`}
          hint="Scenariot höjd beredskap ska ingå i analysen."
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-5 mb-5">
        <Panel
          className="xl:col-span-2"
          rubrik="Riskmatris"
          beskrivning="Siffrorna motsvarar raderna i risklistan nedan."
        >
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1">
              <tbody>
                {[5, 4, 3, 2, 1].map((k) => (
                  <tr key={k}>
                    <th className="w-24 pr-2 text-right align-middle text-[11px] font-medium text-slate-500">
                      {KONSEKVENS[k - 1]}
                    </th>
                    {[1, 2, 3, 4, 5].map((s) => {
                      const i = risker.filter(
                        (r) => r.sannolikhet === s && r.konsekvens === k,
                      );
                      return (
                        <td
                          key={s}
                          className={`h-14 rounded ring-1 ring-inset p-1 align-top ${cellFarg(s, k)}`}
                        >
                          <div className="flex flex-wrap gap-1">
                            {i.map((r) => (
                              <span
                                key={r.id}
                                title={r.namn}
                                className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/80 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-300"
                              >
                                {nummer.get(r.id)}
                              </span>
                            ))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <th />
                  {SANNOLIKHET.map((s) => (
                    <th
                      key={s}
                      className="pt-1 text-[11px] font-medium text-slate-500 align-top leading-tight"
                    >
                      {s}
                    </th>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500 leading-relaxed">
            Lodrät axel: konsekvens. Vågrät axel: sannolikhet. Riskvärde 15 eller högre markeras
            rött och kräver beslut om åtgärd eller dokumenterat accepterande.
          </p>
        </Panel>

        <Panel
          className="xl:col-span-3"
          rubrik="Risker med hög nivå"
          beskrivning="Sorterade efter riskvärde. Bedömningen kan ändras direkt i listan nedan."
          padding={false}
        >
          <table className="tabell">
            <thead>
              <tr>
                <th className="w-8">Nr</th>
                <th>Risk</th>
                <th className="w-32">Ägare</th>
                <th className="w-20 num">S×K</th>
                <th className="w-24 num">Åtgärder</th>
              </tr>
            </thead>
            <tbody>
              {hoga.map((r) => (
                <tr key={r.id}>
                  <td className="text-slate-500 text-xs">{nummer.get(r.id)}</td>
                  <td>
                    <div className="font-medium text-slate-900">{r.namn}</div>
                    <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{r.beskrivning}</p>
                  </td>
                  <td className="text-xs text-slate-600">{r.agare}</td>
                  <td className="num font-medium text-allv-text">
                    {r.sannolikhet * r.konsekvens}
                  </td>
                  <td className="num">
                    {r.atgarder === 0 ? (
                      <Pill ton="allvarlig">0</Pill>
                    ) : (
                      <span className="text-slate-700">{r.atgarder}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel
        rubrik="Risklista"
        beskrivning="Ändrad bedömning sparas med datum och loggas för spårbarhet."
        padding={false}
      >
        <table className="tabell">
          <thead>
            <tr>
              <th className="w-8">Nr</th>
              <th>Risk</th>
              <th className="w-36">Kategori</th>
              <th className="w-32">Ägare</th>
              <th className="w-24">Nivå</th>
              <th className="w-32">Status</th>
              <th className="w-28">Bedömd</th>
              {skriv && <th className="w-44 ej-utskrift">Bedömning</th>}
            </tr>
          </thead>
          <tbody>
            {risker.map((r) => (
              <tr key={r.id}>
                <td className="text-slate-500 text-xs">{nummer.get(r.id)}</td>
                <td className="max-w-xl">
                  <div className="font-medium text-slate-900">{r.namn}</div>
                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{r.beskrivning}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {r.hojd_beredskap === 1 && <Pill ton="info">Höjd beredskap</Pill>}
                    {r.atgarder > 0 ? (
                      <span className="text-[11px] text-slate-500">
                        {r.atgarder} kopplade åtgärder
                      </span>
                    ) : (
                      <span className="text-[11px] text-allv-text">Ingen kopplad åtgärd</span>
                    )}
                  </div>
                </td>
                <td className="text-xs text-slate-600">{RISKKATEGORI[r.kategori]}</td>
                <td className="text-xs text-slate-600">
                  <div>{r.agare}</div>
                  {r.kortnamn && <div className="text-slate-600">{r.kortnamn}</div>}
                </td>
                <td>
                  <Pill ton={riskTon(r.sannolikhet, r.konsekvens)}>
                    {riskNivaText(r.sannolikhet, r.konsekvens)} ({r.sannolikhet * r.konsekvens})
                  </Pill>
                </td>
                <td>
                  <Status karta={RISKSTATUS} nyckel={r.status} />
                </td>
                <td className="text-xs text-slate-600">{datum(r.senast_bedomd)}</td>
                {skriv && (
                <td className="ej-utskrift">
                  <RiskBedomning
                    id={r.id}
                    sannolikhet={r.sannolikhet}
                    konsekvens={r.konsekvens}
                    action={satRiskBedomning}
                  />
                </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
