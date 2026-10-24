/**
 * Inläsning av semikolonseparerad CSV.
 *
 * Ren modul utan server-beroenden, så att den går att testa direkt. Formatet är
 * det svensk Excel och svenska HR-system producerar utan handpåläggning.
 */

export const KOLUMNER = [
  "extern_id", "namn", "pnr_maskerat", "verksamhet", "befattning_fred",
  "epost", "telefon", "anstallningsform", "anstallning_upphorde",
] as const;

export type Kolumn = (typeof KOLUMNER)[number];
export type Rad = Partial<Record<Kolumn, string>> & { radnummer: number };

/**
 * Delar en semikolonseparerad rad, med stöd för citerade fält.
 *
 * Ett fält som innehåller semikolon eller radbrytning citeras med dubbla
 * citattecken, och ett citattecken inuti ett sådant fält dubbleras. Det är vad
 * Excel skriver, och en enkel split på semikolon skulle dela mitt i ett namn
 * som "Lund; Karin".
 */
function delaRad(rad: string): string[] {
  const falt: string[] = [];
  let aktuellt = "";
  let iCitat = false;

  for (let i = 0; i < rad.length; i++) {
    const t = rad[i];
    if (iCitat) {
      if (t === '"') {
        if (rad[i + 1] === '"') {
          aktuellt += '"';
          i++;
        } else {
          iCitat = false;
        }
      } else {
        aktuellt += t;
      }
    } else if (t === '"') {
      iCitat = true;
    } else if (t === ";") {
      falt.push(aktuellt);
      aktuellt = "";
    } else {
      aktuellt += t;
    }
  }
  falt.push(aktuellt);
  return falt.map((f) => f.trim());
}

export type Inlasning = { rader: Rad[]; fel: string[] };

export function lasPersonalfil(innehall: string): Inlasning {

  // Excel skriver en byte order mark först. Utan att ta bort den heter den
  // första kolumnen "﻿extern_id" och matchar ingenting.
  const text = innehall.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const rader = text.split("\n").filter((r) => r.trim() !== "");
  const fel: string[] = [];

  if (rader.length === 0) return { rader: [], fel: ["Filen är tom."] };

  const rubriker = delaRad(rader[0]).map((r) => r.toLowerCase());
  const saknade = (["extern_id", "namn", "verksamhet"] as const).filter(
    (k) => !rubriker.includes(k),
  );
  if (saknade.length > 0) {
    return {
      rader: [],
      fel: [
        `Rubrikraden saknar kolumnerna: ${saknade.join(", ")}. ` +
        `Förväntade kolumner: ${KOLUMNER.join("; ")}.`,
      ],
    };
  }

  const ut: Rad[] = [];
  for (let i = 1; i < rader.length; i++) {
    const falt = delaRad(rader[i]);
    if (falt.length !== rubriker.length) {
      fel.push(
        `Rad ${i + 1}: ${falt.length} fält, men rubrikraden har ${rubriker.length}. Raden hoppas över.`,
      );
      continue;
    }
    const rad: Rad = { radnummer: i + 1 };
    rubriker.forEach((r, j) => {
      if ((KOLUMNER as readonly string[]).includes(r)) {
        rad[r as Kolumn] = falt[j];
      }
    });
    ut.push(rad);
  }
  return { rader: ut, fel };
}
