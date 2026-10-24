import { kravLas } from "@/lib/session";
import { farSkriva } from "@/lib/behorighet";
import { Panel, Sidrubrik, Stat, Status, Pill, Matare } from "@/components/ui";
import { Vaxlare } from "@/components/kontroller";
import { satPlanStatus } from "@/lib/actions";
import { hamtaKritiskaFunktioner, hamtaBeroenden } from "@/lib/queries";
import { BEROENDETYP, PLANSTATUS } from "@/lib/domain";
import { datum, tal, timmar } from "@/lib/format";

// Innehållet läses ur databasen vid varje begäran. Sidan får inte
// cachas som statisk HTML, då flera användare delar samma data.
export const dynamic = "force-dynamic";

const PRIORITETSTEXT: Record<number, string> = {
  1: "Prioritet 1 – måste upprätthållas",
  2: "Prioritet 2 – kan reduceras",
  3: "Prioritet 3 – kan pausas",
};

export default async function Kontinuitetssida() {
  const anvandare = await kravLas("kontinuitet");
  const skriv = farSkriva(anvandare.roll, "kontinuitet");
  const orgId = anvandare.org_id;
  const funktioner = hamtaKritiskaFunktioner(orgId);
  const beroenden = hamtaBeroenden(orgId);

  const gap = funktioner.filter((f) => f.faktisk_timmar > f.mtpd_timmar);
  const utanPlan = funktioner.filter((f) => ["saknas", "utgangen"].includes(f.plan_status));
  const prio1 = funktioner.filter((f) => f.prioritet === 1);
  const prio1Gap = prio1.filter((f) => f.faktisk_timmar > f.mtpd_timmar);

  // Vilka beroendetyper slår mot flest funktioner? Visar var en enskild
  // störning ger bredast konsekvens.
  const perTyp = Object.entries(BEROENDETYP)
    .map(([nyckel, namn]) => {
      const rader = beroenden.filter((b) => b.typ === nyckel);
      return {
        namn,
        antal: rader.length,
        hogSarbarhet: rader.filter((b) => b.sarbarhet >= 4).length,
        utanReserv: rader.filter((b) => !b.reservlosning).length,
      };
    })
    .filter((r) => r.antal > 0)
    .sort((a, b) => b.hogSarbarhet - a.hogSarbarhet || b.antal - a.antal);

  return (
    <>
      <Sidrubrik
        rubrik="Kontinuitetshantering"
        lagrum="Överenskommelse om kommunal krisberedskap (MSB och SKR) samt lag (2006:544) 2 kap."
        beskrivning="Samhällsviktig verksamhet med tolererad avbrottstid, bedömd faktisk återställningstid och kartlagda beroenden. Skillnaden mellan tolererad och faktisk tid är kommunens kontinuitetsgap, och det är den som ska stängas med åtgärder."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-5">
        <Stat
          etikett="Funktioner med gap"
          varde={gap.length}
          enhet={`av ${funktioner.length}`}
          ton={gap.length > 0 ? "varning" : "ok"}
          hint="Bedömd återställningstid överstiger den tolererade."
        />
        <Stat
          etikett="Saknar giltig plan"
          varde={utanPlan.length}
          ton={utanPlan.length > 0 ? "allvarlig" : "ok"}
          hint="Kontinuitetsplan saknas eller har passerat giltighetstiden."
        />
        <Stat
          etikett="Kartlagda beroenden"
          varde={beroenden.length}
          hint={`${beroenden.filter((b) => b.sarbarhet >= 4).length} bedöms som höga sårbarheter.`}
        />
        <Stat
          etikett="Funktioner som måste upprätthållas"
          varde={prio1.length}
          enhet={`av ${funktioner.length}`}
          ton={prio1Gap.length > 0 ? "varning" : "ok"}
          hint={`Prioritet 1. ${prio1Gap.length} av dem har ett gap mot tolererad avbrottstid.`}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-4 mb-5">
        <Panel
          className="xl:col-span-3 min-w-0"
          rubrik="Samhällsviktig verksamhet"
          beskrivning="Sorterad efter prioritet och storleken på gapet."
          padding={false}
        >
          <table className="tabell">
            <thead>
              <tr>
                <th>Funktion</th>
                <th className="w-20">Enhet</th>
                <th className="w-40">Prioritet</th>
                <th className="w-24 num">Tolererat</th>
                <th className="w-24 num">Faktiskt</th>
                <th className="w-20 num">Gap</th>
                <th className="w-32">Plan</th>
                {skriv && <th className="w-36 ej-utskrift">Ändra</th>}
              </tr>
            </thead>
            <tbody>
              {funktioner.map((f) => {
                const g = f.faktisk_timmar - f.mtpd_timmar;
                return (
                  <tr key={f.id}>
                    <td className="max-w-md">
                      <div className="font-medium text-slate-900">{f.namn}</div>
                      <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                        {f.beskrivning}
                      </p>
                      <div className="mt-1 text-[11px] text-slate-500">
                        {f.beroenden} beroenden
                        {f.max_sarbarhet !== null && f.max_sarbarhet >= 4 && (
                          <span className="text-allv-text">
                            {" "}
                            · högsta sårbarhet {f.max_sarbarhet} av 5
                          </span>
                        )}
                        {f.berorda_brukare > 0 && <> · {tal(f.berorda_brukare)} berörda</>}
                      </div>
                    </td>
                    <td className="text-xs text-slate-600">{f.kortnamn}</td>
                    <td className="text-xs text-slate-600">{PRIORITETSTEXT[f.prioritet]}</td>
                    <td className="num text-slate-600">{timmar(f.mtpd_timmar)}</td>
                    <td
                      className={`num font-medium ${g > 0 ? "text-allv-text" : "text-ok-text"}`}
                    >
                      {timmar(f.faktisk_timmar)}
                    </td>
                    <td className="num">
                      {g > 0 ? (
                        <span className="text-allv-text font-medium">+{timmar(g)}</span>
                      ) : (
                        <span className="text-ok-text">inom</span>
                      )}
                    </td>
                    <td>
                      <Status karta={PLANSTATUS} nyckel={f.plan_status} />
                      {f.plan_datum && (
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {datum(f.plan_datum)}
                        </div>
                      )}
                    </td>
                    {skriv && (
                    <td className="ej-utskrift">
                      <Vaxlare
                        id={f.id}
                        varde={f.plan_status}
                        etikett={`Planstatus för ${f.namn}`}
                        action={satPlanStatus}
                        alternativ={[
                          { varde: "saknas", etikett: "Saknas" },
                          { varde: "utkast", etikett: "Utkast" },
                          { varde: "faststalld", etikett: "Fastställd" },
                          { varde: "utgangen", etikett: "Utgången" },
                        ]}
                      />
                    </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>

        <Panel
          rubrik="Beroenden per typ"
          beskrivning="Var en enskild störning ger bredast konsekvens."
          padding={false}
        >
          <table className="tabell">
            <thead>
              <tr>
                <th>Typ</th>
                <th className="num">Hög</th>
                <th className="num">Antal</th>
              </tr>
            </thead>
            <tbody>
              {perTyp.map((t) => (
                <tr key={t.namn}>
                  <td className="text-slate-700">{t.namn}</td>
                  <td className="num">
                    {t.hogSarbarhet > 0 ? (
                      <span className="text-allv-text font-medium">{t.hogSarbarhet}</span>
                    ) : (
                      <span className="text-slate-600">0</span>
                    )}
                  </td>
                  <td className="num text-slate-500">{t.antal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <div className="space-y-5 min-w-0">
        {funktioner.map((f) => {
          const egna = beroenden.filter((b) => b.function_id === f.id);
          if (egna.length === 0) return null;
          return (
            <Panel
              key={f.id}
              rubrik={`Beroenden: ${f.namn}`}
              beskrivning={`${f.kortnamn} · tolererad avbrottstid ${timmar(f.mtpd_timmar)}, bedömd faktisk ${timmar(f.faktisk_timmar)}.`}
              padding={false}
              atgard={<Status karta={PLANSTATUS} nyckel={f.plan_status} />}
            >
              <table className="tabell">
                <thead>
                  <tr>
                    <th className="w-44">Typ</th>
                    <th>Beroende</th>
                    <th>Reservlösning</th>
                    <th className="w-36">Sårbarhet</th>
                  </tr>
                </thead>
                <tbody>
                  {egna.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <Pill ton={b.sarbarhet >= 4 ? "allvarlig" : "neutral"}>
                          {BEROENDETYP[b.typ]}
                        </Pill>
                      </td>
                      <td className="text-sm text-slate-800">{b.beskrivning}</td>
                      <td className="text-sm text-slate-600">
                        {b.reservlosning || (
                          <span className="text-allv-text">Ingen reservlösning angiven</span>
                        )}
                      </td>
                      <td>
                        <Matare
                          del={b.sarbarhet}
                          helhet={5}
                          visaText={false}
                          etikett={`Sårbarhet för beroendet ${b.beskrivning}`}
                          ton={b.sarbarhet >= 4 ? "allvarlig" : b.sarbarhet >= 3 ? "varning" : "ok"}
                        />
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {b.sarbarhet} av 5
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          );
        })}
      </div>
    </>
  );
}
