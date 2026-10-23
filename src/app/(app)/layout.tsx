import { Pill } from "@/components/ui";
import { Nav } from "@/components/nav";
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
  const synliga = MODULER.filter((m) => farLasa(anvandare.roll, m));

  return (
    <div className="flex min-h-screen">
      <a
        href="#innehall"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        Hoppa till innehållet
      </a>

      <aside className="ej-utskrift w-60 shrink-0 bg-brand-800 flex flex-col">
        <div className="px-4 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              <path
                d="M10 1.5 3 4.3v5.2c0 4 2.9 7.6 7 9 4.1-1.4 7-5 7-9V4.3L10 1.5Z"
                fill="none"
                stroke="#9fc0e6"
                strokeWidth="1.6"
              />
              <path d="M10 6.2v7.6M6.4 10h7.2" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span className="text-white font-semibold tracking-tight">Beredskapsnavet</span>
          </div>
          <p className="mt-2 text-xs text-brand-100 leading-snug">
            <span className="font-medium">{org.namn}</span>
            <br />
            <span className="text-brand-200/80">
              {org.lan} · {tal(org.invanare)} invånare
            </span>
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          <Nav synliga={synliga} />
        </div>

        <div className="px-4 py-3 border-t border-white/10 text-[11px] text-brand-200/80 leading-relaxed">
          Beredskapssamordnare
          <br />
          <span className="text-brand-100">{org.samordnare}</span>
          <br />
          TiB {org.tib_telefon}
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="ej-utskrift bg-white border-b border-slate-200 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500">Beredskapsläge</span>
            <Pill ton={niva.ton}>{niva.etikett}</Pill>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500">
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

        <main id="innehall" className="flex-1 p-6 max-w-[1500px]">
          {children}
        </main>
      </div>
    </div>
  );
}
