import Link from "next/link";
import { kravLas } from "@/lib/session";
import { farSkriva } from "@/lib/behorighet";
import { Panel, Sidrubrik, Notis } from "@/components/ui";
import { Formular } from "@/components/formular";
import { importeraPersonal } from "@/lib/import-actions";
import { KOLUMNER } from "@/lib/personalimport";
import { hamtaOrganisation, hamtaUnits } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function Importsida() {
  const anvandare = await kravLas("krigsplacering");
  const skriv = farSkriva(anvandare.roll, "krigsplacering");
  const org = hamtaOrganisation(anvandare.org_id);
  const enheter = hamtaUnits(anvandare.org_id);

  return (
    <>
      <Sidrubrik
        rubrik="Importera personal"
        beskrivning={`Läser in personal från ${org.namn}s personalsystem. Importen uppdaterar personuppgifter och anställning — den rör aldrig krigsplaceringar. Vem som är placerad på vilken befattning är ett beslut som fattas här, och ska inte kunna ändras av en fil.`}
        atgard={
          <Link href="/krigsplacering" className="knapp-sekundar">
            Till krigsplaceringen
          </Link>
        }
      />

      {!skriv ? (
        <Notis ton="varning">
          Din roll får läsa krigsplaceringen men inte ändra den, och kan därför inte importera.
        </Notis>
      ) : (
        <>
          <Panel
            className="mb-5"
            rubrik="Filen"
            beskrivning="Semikolonseparerad CSV, samma format som exporten. Rubrikraden måste innehålla extern_id, namn och verksamhet; övriga kolumner är frivilliga."
          >
            <Formular
              action={importeraPersonal}
              knapp="Läs in filen"
              behallInmatning
              className="grid gap-4 max-w-3xl"
            >
              <label className="block text-sm">
                <span className="block mb-1 font-medium text-slate-700">Välj fil</span>
                <input type="file" name="fil" accept=".csv,.txt,text/csv" className="falt w-full" />
              </label>

              <label className="block text-sm">
                <span className="block mb-1 font-medium text-slate-700">
                  … eller klistra in innehållet
                </span>
                <textarea
                  name="innehall"
                  rows={6}
                  className="falt w-full font-mono text-xs"
                  placeholder={KOLUMNER.join(";")}
                />
              </label>

              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="skarpt" value="ja" className="mt-1" />
                <span>
                  <span className="font-medium text-slate-700">Genomför importen</span>
                  <span className="block text-xs text-slate-500 leading-relaxed">
                    Utan kryss görs en torrkörning: filen läses och rapporten visas, men
                    ingenting skrivs. Kör alltid torrt först — en fil från ett personalsystem
                    innehåller fel, och du ska se dem innan de blir till poster.
                  </span>
                </span>
              </label>
            </Formular>
          </Panel>

          <Panel
            rubrik="Format"
            beskrivning="Kolumnerna läses på namn, så ordningen spelar ingen roll. Ett tomt fält lämnar uppgiften orörd i stället för att radera den — en HR-export innehåller inte alltid alla kolumner."
          >
            <table className="tabell">
              <thead>
                <tr>
                  <th className="w-56">Kolumn</th>
                  <th className="w-28">Krävs</th>
                  <th>Innebörd</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["extern_id", true, "Nyckeln i personalsystemet, normalt anställningsnumret. Styr vilken person raden uppdaterar. Maskerat personnummer duger inte som nyckel: fyra siffror är bortmaskerade."],
                  ["namn", true, "För- och efternamn."],
                  ["verksamhet", true, `Kortnamn eller fullständigt namn på förvaltningen. Giltiga i dag: ${enheter.map((e) => e.kortnamn).join(", ")}.`],
                  ["pnr_maskerat", false, "ÅÅÅÅMMDD-XXXX. Fyra sista siffrorna ska redan vara maskerade i filen."],
                  ["befattning_fred", false, "Befattning i fredstid."],
                  ["epost", false, "E-postadress."],
                  ["telefon", false, "Telefonnummer."],
                  ["anstallningsform", false, "tillsvidare, visstid, timavlonad eller uppdrag."],
                  ["anstallning_upphorde", false, "ÅÅÅÅ-MM-DD. Startpunkt för gallringsfristen."],
                ].map(([kol, kravs, text]) => (
                  <tr key={String(kol)}>
                    <td>
                      <span className="font-mono text-xs font-medium text-brand-700">{kol}</span>
                    </td>
                    <td className="text-xs text-slate-600">{kravs ? "Ja" : "Nej"}</td>
                    <td className="text-xs text-slate-600 leading-relaxed">{text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <div className="mt-4 max-w-3xl">
            <Notis ton="info">
              Filvägen finns kvar även när en direktintegration mot personalsystemet byggts, av
              den enkla anledningen att alla kommuner inte har ett system som går att integrera
              mot. Hittas fel i filen avbryts hela importen — en halvt genomförd import av ett
              personalregister är värre än ingen, eftersom den som rättar filen inte längre vet
              vad som redan gått in.
            </Notis>
          </div>
        </>
      )}
    </>
  );
}
