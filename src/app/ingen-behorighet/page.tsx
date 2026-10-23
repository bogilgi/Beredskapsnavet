import Link from "next/link";
import { kravInloggad } from "@/lib/session";
import { MODULNAMN, ROLLNAMN, startsida, type Modul, type Roll } from "@/lib/behorighet";

export const dynamic = "force-dynamic";

export default async function IngenBehorighetssida({
  searchParams,
}: {
  searchParams: Promise<{ modul?: string }>;
}) {
  const anvandare = await kravInloggad();
  const { modul } = await searchParams;
  const namn = modul && modul in MODULNAMN ? MODULNAMN[modul as Modul] : "den begärda modulen";

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="kort max-w-lg p-6">
        <h1 className="text-lg font-semibold text-slate-900">Behörighet saknas</h1>
        <p className="mt-2 text-sm text-slate-700 leading-relaxed">
          Du är inloggad som <strong className="font-medium">{anvandare.namn}</strong> med rollen{" "}
          {ROLLNAMN[anvandare.roll as Roll] ?? anvandare.roll}. Rollen ger inte åtkomst till{" "}
          {namn}.
        </p>
        <p className="mt-2 text-xs text-slate-500 leading-relaxed">
          Behöver du åtkomst, kontakta systemadministratören. Försöket har loggats.
        </p>
        <div className="mt-4 flex gap-2">
          <Link href={startsida(anvandare.roll)} className="knapp-primar">
            Till startsidan
          </Link>
        </div>
      </div>
    </div>
  );
}
