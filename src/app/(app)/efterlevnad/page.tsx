import { kravLas } from "@/lib/session";
import { farSkriva } from "@/lib/behorighet";
import Link from "next/link";
import { Panel, Sidrubrik, Stat, Status, Pill } from "@/components/ui";
import { Vaxlare } from "@/components/kontroller";
import { satKravStatus } from "@/lib/actions";
import { hamtaKrav, hamtaOrganisation } from "@/lib/queries";
import { KRAVSTATUS, INTERVALL, GILTIGHET } from "@/lib/domain";
import { dagarKvar, datum, forfalloText } from "@/lib/format";

// Innehållet läses ur databasen vid varje begäran. Sidan får inte
// cachas som statisk HTML, då flera användare delar samma data.
export const dynamic = "force-dynamic";

const MODULNAMN: Record<string, { href: string; namn: string }> = {
  rsa: { href: "/rsa", namn: "Risk- och sårbarhetsanalys" },
  kontinuitet: { href: "/kontinuitet", namn: "Kontinuitetshantering" },
  krigsorganisation: { href: "/krigsorganisation", namn: "Krigsorganisation" },
  krigsplacering: { href: "/krigsplacering", namn: "Krigsplacering" },
  resurser: { href: "/resurser", namn: "Resurser" },
  ovningar: { href: "/ovningar", namn: "Övning och utbildning" },
};

export default async function Efterlevnadssida() {
  const anvandare = await kravLas("efterlevnad");
  const skriv = farSkriva(anvandare.roll, "efterlevnad");
  const orgId = anvandare.org_id;
  const krav = hamtaKrav(orgId);
  const org = hamtaOrganisation(orgId);

  const uppfyllda = krav.filter((k) => k.status === "uppfylld").length;
  const brister = krav.filter((k) => ["brist", "ej_paborjad"].includes(k.status)).length;
  const forsenade = krav.filter(
    (k) => k.status !== "uppfylld" && (dagarKvar(k.nasta_forfallo) ?? 999) < 0,
  ).length;
  const inom90 = krav.filter((k) => {
    const n = dagarKvar(k.nasta_forfallo);
    return k.status !== "uppfylld" && n !== null && n >= 0 && n <= 90;
  }).length;

  return (
    <>
      <Sidrubrik
        rubrik="Lagkrav och efterlevnad"
        beskrivning={`Kommunens skyldigheter inom krisberedskap och civilt försvar, med status, ansvarig och vilket underlag som styrker kravet. Listan används vid tillsyn och vid rapportering till länsstyrelsen. Mandatperiod ${org.mandatperiod}.`}
        atgard={
          <Link href="/rapport" className="knapp-sekundar">
            Ta fram tillsynsunderlag
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-5">
        <Stat etikett="Uppfyllda krav" varde={uppfyllda} enhet={`av ${krav.length}`} ton="ok" />
        <Stat
          etikett="Brist eller ej påbörjat"
          varde={brister}
          ton={brister > 0 ? "allvarlig" : "ok"}
          hint="Kräver beslutad åtgärd med ansvarig och datum."
        />
        <Stat
          etikett="Passerat förfallodatum"
          varde={forsenade}
          ton={forsenade > 0 ? "allvarlig" : "ok"}
        />
        <Stat
          etikett="Under omarbetning"
          varde={krav.filter((k) => k.giltighet !== "gallande").length}
          ton="info"
          hint="Krav som upphör vid årsskiftet eller som bygger på ett förslag som ännu inte är beslutat."
        />
      </div>

      <Panel
        rubrik="Kravlista"
        beskrivning="Ändrad status loggas med tidpunkt och användare i spårbarhetsloggen."
        padding={false}
      >
        <table className="tabell">
          <thead>
            <tr>
              <th className="w-28">Kod</th>
              <th>Krav</th>
              <th className="w-36">Intervall</th>
              <th className="w-32">Rättslig status</th>
              <th className="w-40">Senast / nästa</th>
              <th className="w-36">Ansvarig</th>
              <th className="w-32">Status</th>
              {skriv && <th className="w-36 ej-utskrift">Ändra</th>}
            </tr>
          </thead>
          <tbody>
            {krav.map((k) => {
              const n = dagarKvar(k.nasta_forfallo);
              const modul = MODULNAMN[k.modul];
              return (
                <tr key={k.id}>
                  <td>
                    <span className="font-mono text-xs font-medium text-brand-700">{k.kod}</span>
                  </td>
                  <td className="max-w-xl">
                    <div className="font-medium text-slate-900">{k.rubrik}</div>
                    <div className="text-xs text-brand-700 mt-0.5">{k.lagrum}</div>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">{k.beskrivning}</p>
                    {k.giltighet_not && (
                      <p className="text-xs text-varn-text mt-1 leading-relaxed">
                        {k.giltighet_not}
                      </p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-slate-500">
                        Underlag: <span className="text-slate-700">{k.evidens || "saknas"}</span>
                      </span>
                      {k.kalla_url && (
                        <a
                          href={k.kalla_url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-brand-700 hover:underline"
                        >
                          Källa ↗
                        </a>
                      )}
                      {modul && (
                        <Link href={modul.href} className="font-medium text-brand-700 hover:underline">
                          {modul.namn} →
                        </Link>
                      )}
                    </div>
                  </td>
                  <td className="text-xs text-slate-600">{INTERVALL[k.intervall]}</td>
                  <td>
                    <Status karta={GILTIGHET} nyckel={k.giltighet} />
                  </td>
                  <td className="text-xs">
                    <div className="text-slate-600">{datum(k.senast_genomfort)}</div>
                    <div
                      className={
                        n !== null && n < 0 && k.status !== "uppfylld"
                          ? "text-allv-text font-medium"
                          : "text-slate-500"
                      }
                    >
                      {k.nasta_forfallo ? forfalloText(k.nasta_forfallo) : "–"}
                    </div>
                  </td>
                  <td className="text-xs text-slate-700">{k.ansvarig}</td>
                  <td>
                    <Status karta={KRAVSTATUS} nyckel={k.status} />
                  </td>
                  {skriv && (
                  <td className="ej-utskrift">
                    <Vaxlare
                      id={k.id}
                      varde={k.status}
                      etikett={`Status för ${k.kod}`}
                      action={satKravStatus}
                      alternativ={[
                        { varde: "uppfylld", etikett: "Uppfylld" },
                        { varde: "pagaende", etikett: "Pågående" },
                        { varde: "brist", etikett: "Brist" },
                        { varde: "ej_paborjad", etikett: "Ej påbörjad" },
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

      <p className="mt-4 text-xs text-slate-500 max-w-3xl leading-relaxed">
        <Pill ton="info">Observera</Pill> Lagrum, intervall och förfallodatum är kontrollerade mot
        författningstexten i oktober 2026, och varje rad har en källhänvisning. Kravlistan är ändå
        en arbetsförteckning och ersätter inte författningstexten. Regelverket är under omarbetning:
        LEH föreslås ersättas av lagen om kommuners och regioners grundläggande beredskap den
        1 januari 2027, och överenskommelsen med MCF och SKR löper ut vid samma tid. Kontrollera
        rättsläget på nytt innan listan används som tillsynsunderlag.
      </p>
    </>
  );
}
