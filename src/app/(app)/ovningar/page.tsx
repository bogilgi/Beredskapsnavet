import { kravLas } from "@/lib/session";
import { farSkriva } from "@/lib/behorighet";
import { Panel, Sidrubrik, Stat, Status, Pill, Tomt } from "@/components/ui";
import { sparaErfarenhet } from "@/lib/actions";
import { hamtaOvningar, hamtaAtgarder, hamtaKrav } from "@/lib/queries";
import { OVNINGSSTATUS, OVNINGSTYP, ATGARDSSTATUS } from "@/lib/domain";
import { dagarKvar, datum, idag, tal } from "@/lib/format";

// Innehållet läses ur databasen vid varje begäran. Sidan får inte
// cachas som statisk HTML, då flera användare delar samma data.
export const dynamic = "force-dynamic";

export default async function Ovningssida() {
  const anvandare = await kravLas("ovningar");
  const skriv = farSkriva(anvandare.roll, "ovningar");
  const orgId = anvandare.org_id;
  const ovningar = hamtaOvningar(orgId);
  const atgarder = hamtaAtgarder(orgId);
  const krav = hamtaKrav(orgId);

  const genomforda = ovningar.filter((o) => ["genomford", "utvarderad"].includes(o.status));
  const planerade = ovningar
    .filter((o) => o.status === "planerad")
    .sort((a, b) => a.datum.localeCompare(b.datum));
  const utvarderade = ovningar.filter((o) => o.status === "utvarderad");
  const deltagare = genomforda.reduce((s, o) => s + o.deltagare, 0);

  return (
    <>
      <Sidrubrik
        rubrik="Övning och utbildning"
        lagrum="Lag (2006:544) om kommuners och regioners åtgärder inför och vid extraordinära händelser i fredstid och höjd beredskap, 2 kap. 8 §"
        beskrivning="Genomförda och planerade övningar med scenario, målgrupp och dokumenterade erfarenheter. Erfarenheter som inte blir åtgärder med ansvarig och datum leder sällan till förbättrad förmåga, därför kopplas varje övning till åtgärdsregistret."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-5">
        <Stat
          etikett="Genomförda övningar"
          varde={genomforda.length}
          hint="Under innevarande mandatperiod."
          ton={genomforda.length >= 2 ? "ok" : "varning"}
        />
        <Stat
          etikett="Utvärderade"
          varde={utvarderade.length}
          enhet={`av ${genomforda.length}`}
          ton={utvarderade.length === genomforda.length ? "ok" : "varning"}
          hint="En övning räknas som underlag för lagkravet först när den är utvärderad."
        />
        <Stat etikett="Deltagare totalt" varde={tal(deltagare)} />
        <Stat
          etikett="Planerade övningar"
          varde={planerade.length}
          hint={planerade[0] ? `Nästa: ${planerade[0].namn}, ${datum(planerade[0].datum)}.` : undefined}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-5">
          {ovningar.map((o) => {
            const kopplade = atgarder.filter(
              (a) => a.kalla === "ovning" && a.kalla_ref === o.namn,
            );
            const kravrad = krav.find((k) => k.kod === o.forankrad_lagkrav);
            const n = dagarKvar(o.datum);
            return (
              <Panel
                key={o.id}
                rubrik={o.namn}
                beskrivning={`${OVNINGSTYP[o.typ]} · ${datum(o.datum)} · ${o.malgrupp}`}
                atgard={<Status karta={OVNINGSSTATUS} nyckel={o.status} />}
              >
                <p className="text-sm text-slate-700 leading-relaxed">{o.scenario}</p>

                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {o.deltagare > 0 && <Pill ton="neutral">{o.deltagare} deltagare</Pill>}
                  {kravrad && <Pill ton="info">Styrker {kravrad.kod}</Pill>}
                  {o.status === "planerad" && n !== null && n >= 0 && (
                    <Pill ton="varning">{n} dagar kvar</Pill>
                  )}
                </div>

                {o.erfarenheter ? (
                  <div className="mt-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                      Erfarenheter
                    </h3>
                    <p className="text-sm text-slate-700 leading-relaxed">{o.erfarenheter}</p>
                  </div>
                ) : (
                  skriv && o.status !== "planerad" && (
                    <form action={sparaErfarenhet} className="mt-4 ej-utskrift">
                      <input type="hidden" name="id" value={o.id} />
                      <label className="etikett" htmlFor={`erf-${o.id}`}>
                        Dokumentera erfarenheter
                      </label>
                      <textarea
                        id={`erf-${o.id}`}
                        name="erfarenheter"
                        rows={3}
                        className="falt"
                        placeholder="Vad fungerade, vilka brister framkom och vad ska åtgärdas?"
                      />
                      <button type="submit" className="knapp-sekundar mt-2">
                        Spara och markera som utvärderad
                      </button>
                    </form>
                  )
                )}

                <div className="mt-4 border-t border-slate-100 pt-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                    Åtgärder från övningen ({kopplade.length})
                  </h3>
                  {kopplade.length === 0 ? (
                    <p className="text-sm text-slate-500 italic">
                      Inga åtgärder kopplade till denna övning.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {kopplade.map((a) => (
                        <li key={a.id} className="flex items-start gap-2 text-sm">
                          <Status karta={ATGARDSSTATUS} nyckel={a.status} />
                          <div>
                            <span className="text-slate-800">{a.titel}</span>
                            <span className="text-xs text-slate-500">
                              {" "}
                              — {a.ansvarig}, senast {datum(a.forfallodatum)}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Panel>
            );
          })}
        </div>

        <div className="space-y-5">
          <Panel rubrik="Övningsplan" beskrivning="Kommande övningar i datumordning." padding={false}>
            {planerade.length === 0 ? (
              <Tomt>Inga planerade övningar.</Tomt>
            ) : (
              <ul className="divide-y divide-slate-100">
                {planerade.map((o) => (
                  <li key={o.id} className="px-4 py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-slate-900">{o.namn}</span>
                      <span className="text-xs text-slate-500 tabular-nums">{datum(o.datum)}</span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">{OVNINGSTYP[o.typ]}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{o.malgrupp}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel rubrik="Övningskrav" padding={false}>
            <table className="tabell">
              <thead>
                <tr>
                  <th>Krav</th>
                  <th className="num">Övningar</th>
                </tr>
              </thead>
              <tbody>
                {krav
                  .filter((k) => ovningar.some((o) => o.forankrad_lagkrav === k.kod))
                  .map((k) => (
                    <tr key={k.id}>
                      <td>
                        <div className="text-sm text-slate-800">{k.rubrik}</div>
                        <div className="text-xs text-slate-500 font-mono">{k.kod}</div>
                      </td>
                      <td className="num text-slate-700">
                        {ovningar.filter((o) => o.forankrad_lagkrav === k.kod).length}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Panel>

          <p className="text-xs text-slate-500 leading-relaxed px-1">
            Dagens datum i systemet: {idag()}.
          </p>
        </div>
      </div>
    </>
  );
}
