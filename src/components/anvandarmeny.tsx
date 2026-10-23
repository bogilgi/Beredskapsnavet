"use client";

import { useTransition } from "react";
import { loggaUt } from "@/lib/auth-actions";

export function AnvandarMeny({ namn, roll }: { namn: string; roll: string }) {
  const [pagar, start] = useTransition();
  return (
    <div className="flex items-center gap-3 border-l border-slate-200 pl-4">
      <div className="text-right leading-tight">
        <div className="text-slate-800 font-medium">{namn}</div>
        <div className="text-[11px] text-slate-500">{roll}</div>
      </div>
      <button
        type="button"
        className="knapp-sekundar text-xs py-1"
        disabled={pagar}
        onClick={() => start(async () => { await loggaUt(); })}
      >
        {pagar ? "Loggar ut…" : "Logga ut"}
      </button>
    </div>
  );
}
