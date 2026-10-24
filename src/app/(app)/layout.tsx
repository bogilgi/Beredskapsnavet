import { Pill } from "@/components/ui";
import { Sidomeny } from "@/components/sidomeny";
import { AnvandarMeny } from "@/components/anvandarmeny";
import { OrganisationsValjare } from "@/components/organisationsvaljare";
import { hamtaMedlemskap, kravInloggad } from "@/lib/session";
import { hamtaOrganisation } from "@/lib/queries";
import { BEREDSKAPSNIVA, def } from "@/lib/domain";
import { MODULER, farLasa, ROLLNAMN, type Roll } from "@/lib/behorighet";
import { tal } from "@/lib/format";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Spärren körs även i varje sida. Den här finns för att en oinloggad
  // användare aldrig ska se ramverket runt innehållet.
  const anvandare = await kravInloggad();
  const org = hamtaOrganisation(anvandare.org_id);
  const medlemskap = hamtaMedlemskap(anvandare.id);
  const niva = def(BEREDSKAPSNIVA, org.beredskapsniva);
  // Modulerna organisationer och katalog räcker det inte att ha rollen till:
  // den ena visar andra kommuner, den andra ändrar text som alla kunder delar.
  // Samma villkor som i kravLeverantor(), så menyn aldrig visar något som
  // sidan sedan nekar.
  const synliga = MODULER.filter(
    (m) =>
      farLasa(anvandare.roll, m) &&
      ((m !== "organisationer" && m !== "katalog") || anvandare.leverantor === 1),
  );

  // Staplat på smal skärm, sida vid sida från lg. Utan det tvingade den fasta
  // sidomenyn varje sida minst 972 pixlar bred, vilket gör förstoring omöjlig
  // (WCAG 1.4.10).
  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <a
        href="#innehall"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        Hoppa till innehållet
      </a>

      <Sidomeny
        synliga={synliga}
        orgNamn={org.namn}
        orgLan={org.lan}
        invanare={tal(org.invanare)}
        samordnare={org.samordnare}
        tibTelefon={org.tib_telefon}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="ej-utskrift bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500">Beredskapsläge</span>
            <Pill ton={niva.ton}>{niva.etikett}</Pill>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
            <span>
              Mandatperiod <span className="text-slate-700 font-medium">{org.mandatperiod}</span>
            </span>
            <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
              Öppen information
            </span>
            {medlemskap.length > 1 && (
              <OrganisationsValjare
                aktiv={anvandare.org_id}
                organisationer={medlemskap.map((m) => ({
                  org_id: m.org_id,
                  namn: m.namn,
                  roll: ROLLNAMN[m.roll as Roll] ?? m.roll,
                }))}
              />
            )}
            <AnvandarMeny
              namn={anvandare.namn}
              roll={ROLLNAMN[anvandare.roll as Roll] ?? anvandare.roll}
            />
          </div>
        </header>

        <main id="innehall" className="flex-1 min-w-0 p-4 sm:p-6 max-w-[1500px]">
          {children}
        </main>
      </div>
    </div>
  );
}
