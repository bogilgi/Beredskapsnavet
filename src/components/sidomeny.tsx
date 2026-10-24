"use client";

import { useState } from "react";
import { Nav } from "@/components/nav";
import type { Modul } from "@/lib/behorighet";

/**
 * Sidomenyn, fällbar på smala skärmar.
 *
 * Fast bredd på menyn gjorde att varje sida tvingades minst 972 pixlar bred.
 * WCAG 1.4.10 kräver att innehållet går att använda vid 320 pixlar utan att man
 * måste rulla i två riktningar, vilket motsvarar 400 procents förstoring — och
 * förstoring är precis vad den som behöver den använder.
 *
 * Knappen ligger i menyn och inte i topbaren, så att tillstånd och kontroll
 * hör samman i en komponent i stället för att delas mellan två.
 */
export function Sidomeny({
  synliga,
  orgNamn,
  orgLan,
  invanare,
  samordnare,
  tibTelefon,
}: {
  synliga: readonly Modul[];
  orgNamn: string;
  orgLan: string;
  invanare: string;
  samordnare: string;
  tibTelefon: string;
}) {
  const [oppen, setOppen] = useState(false);

  return (
    <aside className="ej-utskrift w-full lg:w-60 lg:shrink-0 bg-brand-800 flex flex-col">
      <div className="px-4 py-4 border-b border-white/10 flex items-start justify-between gap-3">
        <div className="min-w-0">
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
            <span className="font-medium">{orgNamn}</span>
            <br />
            <span className="text-brand-200/80">
              {orgLan} · {invanare} invånare
            </span>
          </p>
        </div>

        <button
          type="button"
          onClick={() => setOppen((v) => !v)}
          aria-expanded={oppen}
          aria-controls="huvudmeny"
          className="lg:hidden shrink-0 rounded-md border border-white/25 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10"
        >
          {oppen ? "Stäng" : "Meny"}
        </button>
      </div>

      <div
        id="huvudmeny"
        className={`${oppen ? "block" : "hidden"} lg:block lg:flex-1 lg:overflow-y-auto`}
      >
        <Nav synliga={synliga} />

        <div className="px-4 py-3 border-t border-white/10 text-[11px] text-brand-200/80 leading-relaxed lg:hidden">
          Beredskapssamordnare <span className="text-brand-100">{samordnare}</span> · TiB{" "}
          {tibTelefon}
        </div>
      </div>

      <div className="hidden lg:block px-4 py-3 border-t border-white/10 text-[11px] text-brand-200/80 leading-relaxed">
        Beredskapssamordnare
        <br />
        <span className="text-brand-100">{samordnare}</span>
        <br />
        TiB {tibTelefon}
      </div>
    </aside>
  );
}
