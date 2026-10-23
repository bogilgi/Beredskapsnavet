"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MODULNAMN, MODULVAG, type Modul } from "@/lib/behorighet";

const GRUPPER: { titel: string; moduler: Modul[] }[] = [
  { titel: "Styrning", moduler: ["oversikt", "efterlevnad", "atgarder"] },
  { titel: "Höjd beredskap", moduler: ["krigsorganisation", "krigsplacering"] },
  { titel: "Analys", moduler: ["rsa", "kontinuitet"] },
  { titel: "Förmåga", moduler: ["resurser", "ovningar"] },
  { titel: "Underlag", moduler: ["rapport"] },
  { titel: "Administration", moduler: ["anvandare"] },
];

export function Nav({ synliga }: { synliga: readonly Modul[] }) {
  const sokvag = usePathname();
  const grupper = GRUPPER.map((g) => ({
    ...g,
    moduler: g.moduler.filter((m) => synliga.includes(m)),
  })).filter((g) => g.moduler.length > 0);

  return (
    <nav aria-label="Huvudmeny" className="px-3 py-4 space-y-5">
      {grupper.map((grupp) => (
        <div key={grupp.titel}>
          <h2 className="px-2 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand-200/70">
            {grupp.titel}
          </h2>
          <ul className="space-y-0.5">
            {grupp.moduler.map((modul) => {
              const href = MODULVAG[modul];
              const aktiv = sokvag === href;
              return (
                <li key={modul}>
                  <Link
                    href={href}
                    aria-current={aktiv ? "page" : undefined}
                    className={`block rounded-md px-2 py-1.5 text-sm transition-colors ${
                      aktiv
                        ? "bg-white/15 text-white font-medium"
                        : "text-brand-100 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {MODULNAMN[modul]}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
