import { kravLas } from "@/lib/session";
import { farSkriva } from "@/lib/behorighet";
import { Panel, Sidrubrik, Stat, Status } from "@/components/ui";
import { Vaxlare } from "@/components/kontroller";
import { satAtgardsStatus, skapaAtgard } from "@/lib/actions";
import { hamtaAtgarder, hamtaUnits } from "@/lib/queries";
import { ATGARDSKALLA, ATGARDSSTATUS, PRIORITET } from "@/lib/domain";
import { dagarKvar, datum, forfalloText, idag } from "@/lib/format";

// Innehållet läses ur databasen vid varje begäran. Sidan får inte
// cachas som statisk HTML, då flera användare delar samma data.
export const dynamic = "force-dynamic";

export default async function Atgardssida() {
  const anvandare = await kravLas("atgarder");
  const skriv = farSkriva(anvandare.roll, "atgarder");
  const orgId = anvandare.org_id;
  const atgarder = hamtaAtgarder(orgId);
  const units = hamtaUnits(orgId);

  const oppna = atgarder.filter((a) => ["ej_paborjad", "pagaende"].includes(a.status));
  const forsenade = oppna.filter((a) => (dagarKvar(a.forfallodatum) ?? 999) < 0);
  const klara = atgarder.filter((a) => a.status === "klar");

  const perKalla = Object.entries(ATGARDSKALLA)
    .map(([nyckel, namn]) => ({
      namn,
      antal: atgarder.filter((a) => a.kalla === nyckel).length,
      oppna: oppna.filter((a) => a.kalla === nyckel).length,
    }))
    .filter((r) => r.antal > 0);

  return (
    <>
      <Sidrubrik
        rubrik="Åtgärdsregister"
        beskrivning="Alla åtgärder som följer av risk- och sårbarhetsanalys, kontinuitetsarbete, övningserfarenheter, tillsyn och resursinventering samlas här med ansvarig och datum. Det gemensamma registret är det som gör att brister följs upp i stället för att stanna kvar i en rapport."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-5">
        <Stat etikett="Öppna åtgärder" varde={oppna.length} ton="info" />
        <Stat
          etikett="Försenade"
          varde={forsenade.length}
          ton={forsenade.length > 0 ? "allvarlig" : "ok"}
          hint={forsenade.length > 0 ? "Passerat förfallodatum utan att vara avslutade." : undefined}
        />
        <Stat
          etikett="Hög prioritet, öppna"
          varde={oppna.filter((a) => a.prioritet === "hog").length}
          ton="varning"
        />
        <Stat etikett="Avslutade" varde={klara.length} ton="ok" />
      </div>

      <div className="grid gap-5 xl:grid-cols-4">
        <div className="xl:col-span-3 min-w-0">
          <Panel
            rubrik="Åtgärder"
            beskrivning="Sorterade efter status, prioritet och förfallodatum."
            padding={false}
          >
            <table className="tabell">
              <thead>
                <tr>
                  <th>Åtgärd</th>
                  <th className="w-40">Källa</th>
                  <th className="w-36">Ansvarig</th>
                  <th className="w-24">Prioritet</th>
                  <th className="w-36">Förfaller</th>
                  <th className="w-32">Status</th>
                  {skriv && <th className="w-36 ej-utskrift">Ändra</th>}
                </tr>
              </thead>
              <tbody>
                {atgarder.map((a) => {
                  const n = dagarKvar(a.forfallodatum);
                  const forsenad =
                    ["ej_paborjad", "pagaende"].includes(a.status) && n !== null && n < 0;
                  return (
                    <tr key={a.id} className={a.status === "klar" ? "opacity-60" : ""}>
                      <td className="max-w-lg">
                        <div className="font-medium text-slate-900">{a.titel}</div>
                        <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                          {a.beskrivning}
                        </p>
                      </td>
                      <td className="text-xs">
                        <div className="text-slate-700">{ATGARDSKALLA[a.kalla] ?? a.kalla}</div>
                        {a.kalla_ref && <div className="text-slate-500 mt-0.5">{a.kalla_ref}</div>}
                      </td>
                      <td className="text-xs">
                        <div className="text-slate-700">{a.ansvarig || "–"}</div>
                        {a.kortnamn && <div className="text-slate-500">{a.kortnamn}</div>}
                      </td>
                      <td>
                        <Status karta={PRIORITET} nyckel={a.prioritet} />
                      </td>
                      <td
                        className={`text-xs ${forsenad ? "text-allv-text font-medium" : "text-slate-600"}`}
                      >
                        {a.status === "klar"
                          ? `Avslutad ${datum(a.klar_datum)}`
                          : forfalloText(a.forfallodatum)}
                      </td>
                      <td>
                        <Status karta={ATGARDSSTATUS} nyckel={a.status} />
                      </td>
                      {skriv && (
                      <td className="ej-utskrift">
                        <Vaxlare
                          id={a.id}
                          varde={a.status}
                          etikett={`Status för ${a.titel}`}
                          action={satAtgardsStatus}
                          alternativ={[
                            { varde: "ej_paborjad", etikett: "Ej påbörjad" },
                            { varde: "pagaende", etikett: "Pågående" },
                            { varde: "klar", etikett: "Klar" },
                            { varde: "avbruten", etikett: "Avbruten" },
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
        </div>

        <div className="space-y-5 min-w-0">
          {skriv && (
          <Panel rubrik="Ny åtgärd" className="ej-utskrift">
            <form action={skapaAtgard} className="space-y-3">
              <div>
                <label className="etikett" htmlFor="titel">Rubrik</label>
                <input id="titel" name="titel" required className="falt" placeholder="Vad ska göras" />
              </div>
              <div>
                <label className="etikett" htmlFor="beskrivning">Beskrivning</label>
                <textarea id="beskrivning" name="beskrivning" rows={3} className="falt" />
              </div>
              <div>
                <label className="etikett" htmlFor="kalla">Källa</label>
                <select id="kalla" name="kalla" className="falt" defaultValue="annan">
                  {Object.entries(ATGARDSKALLA).map(([v, n]) => (
                    <option key={v} value={v}>{n}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="etikett" htmlFor="ansvarig">Ansvarig</label>
                <input id="ansvarig" name="ansvarig" className="falt" />
              </div>
              <div>
                <label className="etikett" htmlFor="unit_id">Verksamhet</label>
                <select id="unit_id" name="unit_id" className="falt" defaultValue="">
                  <option value="">Ingen angiven</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>{u.kortnamn} – {u.namn}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="etikett" htmlFor="prioritet">Prioritet</label>
                  <select id="prioritet" name="prioritet" className="falt" defaultValue="normal">
                    <option value="hog">Hög</option>
                    <option value="normal">Normal</option>
                    <option value="lag">Låg</option>
                  </select>
                </div>
                <div>
                  <label className="etikett" htmlFor="forfallodatum">Förfaller</label>
                  <input id="forfallodatum" name="forfallodatum" type="date" className="falt"
                    defaultValue={idag()} />
                </div>
              </div>
              <button type="submit" className="knapp-primar w-full">Lägg till åtgärd</button>
            </form>
          </Panel>
          )}

          <Panel rubrik="Åtgärder per källa" padding={false}>
            <table className="tabell">
              <thead>
                <tr>
                  <th>Källa</th>
                  <th className="num">Öppna</th>
                  <th className="num">Totalt</th>
                </tr>
              </thead>
              <tbody>
                {perKalla.map((r) => (
                  <tr key={r.namn}>
                    <td className="text-slate-700">{r.namn}</td>
                    <td className="num font-medium text-slate-900">{r.oppna}</td>
                    <td className="num text-slate-500">{r.antal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      </div>
    </>
  );
}
