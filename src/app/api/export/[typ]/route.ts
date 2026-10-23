import { NextResponse } from "next/server";
import {
  hamtaAtgarder, hamtaPlaceringar, hamtaResurser, hamtaRisker,
  hamtaKrav, hamtaKritiskaFunktioner,
} from "@/lib/queries";
import { idag } from "@/lib/format";
import { hamtaAnvandare } from "@/lib/session";
import { farLasa, type Modul } from "@/lib/behorighet";
import { logga } from "@/lib/db";

/** CSV med semikolon och BOM, så att Excel i svensk miljö öppnar filen rätt. */
function csv(rubriker: string[], rader: (string | number | null)[][]): string {
  const fly = (v: string | number | null) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return (
    "﻿" +
    [rubriker, ...rader].map((rad) => rad.map(fly).join(";")).join("\r\n") +
    "\r\n"
  );
}

/** Vilken modul varje export hämtar ur, för behörighetskontrollen. */
const MODUL_FOR_EXPORT: Record<string, Modul> = {
  atgarder: "atgarder",
  krigsplacering: "krigsplacering",
  resurser: "resurser",
  risker: "rsa",
  lagkrav: "efterlevnad",
  kontinuitet: "kontinuitet",
};

const EXPORTER: Record<string, (orgId: number) => { namn: string; innehall: string }> = {
  atgarder: (orgId) => ({
    namn: "atgardsregister",
    innehall: csv(
      ["Rubrik", "Beskrivning", "Källa", "Källreferens", "Ansvarig", "Verksamhet",
       "Prioritet", "Status", "Förfallodatum", "Avslutad"],
      hamtaAtgarder(orgId).map((a) => [
        a.titel, a.beskrivning, a.kalla, a.kalla_ref, a.ansvarig, a.kortnamn,
        a.prioritet, a.status, a.forfallodatum, a.klar_datum,
      ]),
    ),
  }),
  krigsplacering: (orgId) => ({
    namn: "krigsplacering",
    innehall: csv(
      ["Befattning", "Verksamhet", "Kritikalitet", "Säkerhetsklass", "Person",
       "Personnummer", "Befattning i fred", "Status", "Beslutsdatum", "Underrättad",
       "Krigsplacerad i Försvarsmakten", "Annan plikt", "Registerkontroll", "Anmärkning"],
      hamtaPlaceringar(orgId).map((p) => [
        p.titel, p.kortnamn, p.kritikalitet, p.sakerhetsklass, p.person,
        p.pnr_maskerat, p.befattning_fred, p.status, p.beslutsdatum,
        p.underrattad ? "ja" : "nej", p.fm_krigsplacerad ? "ja" : "nej",
        p.annan_plikt, p.registerkontroll, p.anmarkning,
      ]),
    ),
  }),
  resurser: (orgId) => ({
    namn: "resursforteckning",
    innehall: csv(
      ["Kategori", "Benämning", "Kapacitet", "Antal", "Enhet", "Placering",
       "Verksamhet", "Status", "Senaste kontroll", "Nästa kontroll", "Ansvarig", "Noteringar"],
      hamtaResurser(orgId).map((r) => [
        r.kategori, r.benamning, r.kapacitet, r.antal, r.enhet, r.placering,
        r.kortnamn, r.status, r.sista_kontroll, r.nasta_kontroll, r.ansvarig, r.noteringar,
      ]),
    ),
  }),
  risker: (orgId) => ({
    namn: "risk-och-sarbarhetsanalys",
    innehall: csv(
      ["Risk", "Kategori", "Beskrivning", "Sannolikhet", "Konsekvens", "Riskvärde",
       "Ägare", "Verksamhet", "Status", "Senast bedömd", "Gäller höjd beredskap", "Antal åtgärder"],
      hamtaRisker(orgId).map((r) => [
        r.namn, r.kategori, r.beskrivning, r.sannolikhet, r.konsekvens,
        r.sannolikhet * r.konsekvens, r.agare, r.kortnamn, r.status,
        r.senast_bedomd, r.hojd_beredskap ? "ja" : "nej", r.atgarder,
      ]),
    ),
  }),
  lagkrav: (orgId) => ({
    namn: "lagefterlevnad",
    innehall: csv(
      ["Kod", "Krav", "Lagrum", "Källa", "Rättslig status", "Anmärkning rättsläge",
       "Intervall", "Status", "Senast genomfört", "Nästa förfallodatum", "Ansvarig", "Underlag"],
      hamtaKrav(orgId).map((k) => [
        k.kod, k.rubrik, k.lagrum, k.kalla_url, k.giltighet, k.giltighet_not,
        k.intervall, k.status, k.senast_genomfort, k.nasta_forfallo, k.ansvarig, k.evidens,
      ]),
    ),
  }),
  kontinuitet: (orgId) => ({
    namn: "kontinuitetshantering",
    innehall: csv(
      ["Funktion", "Verksamhet", "Prioritet", "Tolererad avbrottstid (h)",
       "Bedömd faktisk (h)", "Gap (h)", "Planstatus", "Plandatum", "Berörda", "Antal beroenden"],
      hamtaKritiskaFunktioner(orgId).map((f) => [
        f.namn, f.kortnamn, f.prioritet, f.mtpd_timmar, f.faktisk_timmar,
        f.faktisk_timmar - f.mtpd_timmar, f.plan_status, f.plan_datum,
        f.berorda_brukare, f.beroenden,
      ]),
    ),
  }),
};

export async function GET(
  _begaran: Request,
  { params }: { params: Promise<{ typ: string }> },
) {
  // Exporten går förbi sidornas spärrar och måste därför kontrolleras för sig.
  const anvandare = await hamtaAnvandare();
  if (!anvandare) {
    return NextResponse.json({ fel: "Inte inloggad" }, { status: 401 });
  }

  const { typ } = await params;
  const exportera = EXPORTER[typ];
  if (!exportera) {
    return NextResponse.json(
      { fel: "Okänd export", tillgangliga: Object.keys(EXPORTER) },
      { status: 404 },
    );
  }
  // Varje export kräver läsbehörighet till den modul den hämtar uppgifter ur.
  if (!farLasa(anvandare.roll, "rapport") || !farLasa(anvandare.roll, MODUL_FOR_EXPORT[typ])) {
    logga(anvandare.org_id, anvandare.namn, "Nekad export", typ);
    return NextResponse.json(
      { fel: "Behörighet saknas för denna export" },
      { status: 403 },
    );
  }

  const { namn, innehall } = exportera(anvandare.org_id);
  logga(anvandare.org_id, anvandare.namn, "Exporterade uppgifter", namn);
  return new NextResponse(innehall, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${anvandare.org_kortnamn}-${namn}-${idag()}.csv"`,
    },
  });
}
