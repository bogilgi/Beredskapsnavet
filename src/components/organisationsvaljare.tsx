"use client";

import { useTransition } from "react";
import { bytOrganisation } from "@/lib/auth-actions";

/**
 * Byter aktiv organisation. Själva behörighetskontrollen görs på servern;
 * listan här innehåller bara de organisationer användaren är medlem i.
 */
export function OrganisationsValjare({
  aktiv,
  organisationer,
}: {
  aktiv: number;
  organisationer: { org_id: number; namn: string; roll: string }[];
}) {
  const [pagar, start] = useTransition();
  return (
    <label className="flex items-center gap-2">
      <span className="text-slate-500">Organisation</span>
      <select
        aria-label="Byt organisation"
        className={`falt w-56 py-1 text-xs ${pagar ? "opacity-50" : ""}`}
        value={aktiv}
        disabled={pagar}
        onChange={(e) => {
          const id = Number(e.target.value);
          start(async () => {
            await bytOrganisation(id);
          });
        }}
      >
        {organisationer.map((o) => (
          <option key={o.org_id} value={o.org_id}>
            {o.namn} ({o.roll})
          </option>
        ))}
      </select>
    </label>
  );
}
