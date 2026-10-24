import { kravLas } from "@/lib/session";
import { farSkriva } from "@/lib/behorighet";
import { Panel, Sidrubrik, Stat, Status, Pill } from "@/components/ui";
import { Vaxlare, AtgardsKnapp } from "@/components/kontroller";
import { satResursStatus, registreraKontroll } from "@/lib/actions";
import { hamtaResurser } from "@/lib/queries";
import { RESURSKATEGORI, RESURSSTATUS } from "@/lib/domain";
import { dagarKvar, datum, forfalloText, tal } from "@/lib/format";

// Innehållet läses ur databasen vid varje begäran. Sidan får inte
// cachas som statisk HTML, då flera användare delar samma data.
export const dynamic = "force-dynamic";

export default async function Resurssida() {
  const anvandare = await kravLas("resurser");
  const skriv = farSkriva(anvandare.roll, "resurser");
  const orgId = anvandare.org_id;
  const resurser = hamtaResurser(orgId);

  const urDrift = resurser.filter((r) => r.status === "ur_drift");
  const service = resurser.filter((r) => r.status === "service");
  const forsenadKontroll = resurser.filter(
    (r) => r.nasta_kontroll === null || (dagarKvar(r.nasta_kontroll) ?? 0) < 0,
  );
  const inom30 = resurser.filter((r) => {
    const n = dagarKvar(r.nasta_kontroll);
    return n !== null && n >= 0 && n <= 30;
  });

  const kategorier = Object.entries(RESURSKATEGORI)
    .map(([nyckel, namn]) => ({ nyckel, namn, poster: resurser.filter((r) => r.kategori === nyckel) }))
    .filter((k) => k.poster.length > 0);

  return (
    <>
      <Sidrubrik
        rubrik="Resurser och förnödenheter"
        lagrum="Underlag till kontinuitetsplanering, nödvattenplan och överenskommelse om kommunal krisberedskap"
        beskrivning="Reservkraft, drivmedel, nödvatten, samband och övriga förnödenheter med placering, ansvarig och kontrollintervall. Förteckningen svarar på den fråga som alltid kommer vid en störning: vad finns, var finns det, och fungerar det?"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-5">
        <Stat
          etikett="Driftklara resurser"
          varde={resurser.filter((r) => r.status === "driftklar").length}
          enhet={`av ${resurser.length}`}
          ton="ok"
        />
        <Stat
          etikett="Ur drift"
          varde={urDrift.length}
          ton={urDrift.length > 0 ? "allvarlig" : "ok"}
          hint={urDrift.length > 0 ? urDrift.map((r) => r.benamning).join(", ") : undefined}
        />
        <Stat
          etikett="På service"
          varde={service.length}
          ton={service.length > 0 ? "varning" : "ok"}
        />
        <Stat
          etikett="Försenad eller okänd kontroll"
          varde={forsenadKontroll.length}
          ton={forsenadKontroll.length > 0 ? "allvarlig" : "ok"}
          hint={`${inom30.length} kontroller förfaller inom 30 dagar.`}
        />
      </div>

      <div className="space-y-5 min-w-0">
        {kategorier.map((k) => (
          <Panel
            key={k.nyckel}
            rubrik={k.namn}
            beskrivning={`${k.poster.length} poster.`}
            padding={false}
            atgard={
              <div className="flex gap-1.5">
                {k.poster.some((r) => r.status === "ur_drift") && (
                  <Pill ton="allvarlig">
                    {k.poster.filter((r) => r.status === "ur_drift").length} ur drift
                  </Pill>
                )}
                {k.poster.some((r) => (dagarKvar(r.nasta_kontroll) ?? 0) < 0) && (
                  <Pill ton="varning">kontroll försenad</Pill>
                )}
              </div>
            }
          >
            <table className="tabell">
              <thead>
                <tr>
                  <th>Benämning</th>
                  <th className="w-28 num">Antal</th>
                  <th className="w-28">Kapacitet</th>
                  <th>Placering</th>
                  <th className="w-32">Ansvarig</th>
                  <th className="w-40">Kontroll</th>
                  <th className="w-28">Status</th>
                  {skriv && <th className="w-56 ej-utskrift">Ändra</th>}
                </tr>
              </thead>
              <tbody>
                {k.poster.map((r) => {
                  const n = dagarKvar(r.nasta_kontroll);
                  const forsenad = r.nasta_kontroll === null || (n ?? 0) < 0;
                  return (
                    <tr key={r.id}>
                      <td className="max-w-sm">
                        <div className="font-medium text-slate-900">{r.benamning}</div>
                        {r.noteringar && (
                          <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                            {r.noteringar}
                          </p>
                        )}
                      </td>
                      <td className="num text-slate-700">
                        {tal(r.antal)} {r.enhet}
                      </td>
                      <td className="text-xs text-slate-600">{r.kapacitet || "–"}</td>
                      <td className="text-xs text-slate-600">
                        <div>{r.placering}</div>
                        {r.kortnamn && <div className="text-slate-600">{r.kortnamn}</div>}
                      </td>
                      <td className="text-xs text-slate-700">{r.ansvarig}</td>
                      <td className="text-xs">
                        <div className="text-slate-500">
                          Senast: {datum(r.sista_kontroll)}
                        </div>
                        <div className={forsenad ? "text-allv-text font-medium" : "text-slate-600"}>
                          {r.nasta_kontroll ? forfalloText(r.nasta_kontroll) : "Ingen kontroll satt"}
                        </div>
                      </td>
                      <td>
                        <Status karta={RESURSSTATUS} nyckel={r.status} />
                      </td>
                      {skriv && (
                      <td className="ej-utskrift">
                        <div className="flex flex-col gap-1.5">
                          <Vaxlare
                            id={r.id}
                            varde={r.status}
                            etikett={`Status för ${r.benamning}`}
                            action={satResursStatus}
                            alternativ={[
                              { varde: "driftklar", etikett: "Driftklar" },
                              { varde: "service", etikett: "Service" },
                              { varde: "ur_drift", etikett: "Ur drift" },
                              { varde: "okand", etikett: "Okänd" },
                            ]}
                          />
                          <AtgardsKnapp id={r.id} action={registreraKontroll} variant="diskret">
                            Registrera kontroll
                          </AtgardsKnapp>
                        </div>
                      </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        ))}
      </div>

      <p className="mt-4 text-xs text-slate-600 max-w-3xl leading-relaxed">
        Registrerad kontroll sätter dagens datum som senaste kontroll och nästa kontroll om 90
        dagar. Intervallet är i skarp drift inställbart per resurstyp.
      </p>
    </>
  );
}
