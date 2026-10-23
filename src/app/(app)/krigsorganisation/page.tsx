import { kravLas } from "@/lib/session";
import Link from "next/link";
import { Panel, Sidrubrik, Stat, Status, Matare, Pill } from "@/components/ui";
import { hamtaBemanning, hamtaPositioner, hamtaOrganisation } from "@/lib/queries";
import { KRITIKALITET, NIVA, SAKERHETSKLASS } from "@/lib/domain";
import { procent, tal } from "@/lib/format";

// Innehållet läses ur databasen vid varje begäran. Sidan får inte
// cachas som statisk HTML, då flera användare delar samma data.
export const dynamic = "force-dynamic";

export default async function Krigsorganisationssida() {
  const anvandare = await kravLas("krigsorganisation");
  const orgId = anvandare.org_id;
  const org = hamtaOrganisation(orgId);
  const bemanning = hamtaBemanning(orgId);
  const positioner = hamtaPositioner(orgId);

  const platser = positioner.reduce((s, p) => s + p.platser, 0);
  const placerade = positioner.reduce((s, p) => s + Math.min(p.placerade, p.platser), 0);
  const aVakanta = positioner
    .filter((p) => p.kritikalitet === "A")
    .reduce((s, p) => s + Math.max(0, p.platser - p.placerade - p.foreslagna), 0);
  const sakerhetsklassade = positioner.filter((p) => p.sakerhetsklass !== "ingen");

  const perVerksamhet = bemanning
    .filter((b) => b.platser > 0)
    .map((b) => ({ ...b, poster: positioner.filter((p) => p.unit_id === b.id) }));

  return (
    <>
      <Sidrubrik
        rubrik="Krigsorganisation"
        lagrum="Lag (2006:544) om kommuners och regioners åtgärder inför och vid extraordinära händelser i fredstid och höjd beredskap, 3 kap."
        beskrivning={`Befattningar som ska bemannas under höjd beredskap, med uppgift, kritikalitet och krav på säkerhetsklass. ${org.namn} har ${tal(positioner.length)} fastställda befattningar fördelade på ${tal(platser)} platser.`}
        atgard={
          <Link href="/krigsplacering" className="knapp-primar">
            Till krigsplacering
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-5">
        <Stat
          etikett="Bemanningsgrad"
          varde={`${procent(placerade, platser)}%`}
          hint={`${tal(placerade)} av ${tal(platser)} platser har beslutad krigsplacering.`}
          ton={procent(placerade, platser) >= 90 ? "ok" : "varning"}
        />
        <Stat etikett="Befattningar" varde={positioner.length} enhet={`${tal(platser)} platser`} />
        <Stat
          etikett="Vakanser på A-befattning"
          varde={aVakanta}
          ton={aVakanta > 0 ? "allvarlig" : "ok"}
          hint="Oumbärliga befattningar utan person, varken beslutad eller föreslagen."
          href="/krigsplacering"
        />
        <Stat
          etikett="Befattningar i säkerhetsklass"
          varde={sakerhetsklassade.length}
          hint="Kräver säkerhetsprövning med registerkontroll före placering."
        />
      </div>

      <div className="space-y-5">
        {perVerksamhet.map((v) => (
          <Panel
            key={v.id}
            rubrik={`${v.kortnamn} – ${v.namn}`}
            beskrivning={`Chef i fred: ${v.chef}. ${tal(v.anstallda)} anställda.${
              v.samhallsviktig === 1 ? " Bedriver samhällsviktig verksamhet." : ""
            }`}
            padding={false}
            atgard={
              <div className="w-44">
                <Matare del={v.placerade} helhet={v.platser} />
              </div>
            }
          >
            <table className="tabell">
              <thead>
                <tr>
                  <th>Befattning</th>
                  <th className="w-28">Nivå</th>
                  <th className="w-36">Kritikalitet</th>
                  <th className="w-28">Säkerhetsklass</th>
                  <th className="w-20 num">Platser</th>
                  <th className="w-44">Bemannade</th>
                </tr>
              </thead>
              <tbody>
                {v.poster.map((p) => {
                  const vakanta = p.platser - p.placerade - p.foreslagna;
                  return (
                    <tr key={p.id}>
                      <td className="max-w-xl">
                        <div className="font-medium text-slate-900">{p.titel}</div>
                        <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{p.uppgift}</p>
                      </td>
                      <td className="text-xs text-slate-600">{NIVA[p.niva]}</td>
                      <td>
                        <Status karta={KRITIKALITET} nyckel={p.kritikalitet} />
                      </td>
                      <td className="text-xs text-slate-600">
                        {p.sakerhetsklass === "ingen" ? (
                          <span className="text-slate-400">–</span>
                        ) : (
                          <Pill ton="info">{SAKERHETSKLASS[p.sakerhetsklass]}</Pill>
                        )}
                      </td>
                      <td className="num text-slate-700">{p.platser}</td>
                      <td>
                        <Matare del={p.placerade} helhet={p.platser} visaText={false} />
                        <div className="mt-1 text-[11px] text-slate-500">
                          {p.placerade} beslutade
                          {p.foreslagna > 0 && (
                            <span className="text-varn-text"> · {p.foreslagna} föreslagna</span>
                          )}
                          {vakanta > 0 && (
                            <span className={p.kritikalitet === "A" ? "text-allv-text font-medium" : ""}>
                              {" "}
                              · {vakanta} vakanta
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        ))}
      </div>
    </>
  );
}
