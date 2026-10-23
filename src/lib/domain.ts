/** Begreppen i domänen: etiketter och färgsättning på ett ställe. */

export type Ton = "ok" | "varning" | "allvarlig" | "neutral" | "info";

export const TON_KLASS: Record<Ton, string> = {
  ok: "bg-ok-bg text-ok-text ring-ok-ring",
  varning: "bg-varn-bg text-varn-text ring-varn-ring",
  allvarlig: "bg-allv-bg text-allv-text ring-allv-ring",
  neutral: "bg-slate-100 text-slate-600 ring-slate-300",
  info: "bg-blue-50 text-blue-800 ring-blue-200",
};

type Def = { etikett: string; ton: Ton };

export const KRAVSTATUS: Record<string, Def> = {
  uppfylld: { etikett: "Uppfylld", ton: "ok" },
  pagaende: { etikett: "Pågående", ton: "info" },
  brist: { etikett: "Brist", ton: "allvarlig" },
  ej_paborjad: { etikett: "Ej påbörjad", ton: "varning" },
};

export const PLACERINGSSTATUS: Record<string, Def> = {
  underrattad: { etikett: "Underrättad", ton: "ok" },
  beslutad: { etikett: "Beslutad", ton: "info" },
  foreslagen: { etikett: "Föreslagen", ton: "varning" },
  avslutad: { etikett: "Avslutad", ton: "neutral" },
};

export const ATGARDSSTATUS: Record<string, Def> = {
  klar: { etikett: "Klar", ton: "ok" },
  pagaende: { etikett: "Pågående", ton: "info" },
  ej_paborjad: { etikett: "Ej påbörjad", ton: "varning" },
  avbruten: { etikett: "Avbruten", ton: "neutral" },
};

export const RESURSSTATUS: Record<string, Def> = {
  driftklar: { etikett: "Driftklar", ton: "ok" },
  service: { etikett: "Service", ton: "varning" },
  ur_drift: { etikett: "Ur drift", ton: "allvarlig" },
  okand: { etikett: "Okänd", ton: "neutral" },
};

export const PLANSTATUS: Record<string, Def> = {
  faststalld: { etikett: "Fastställd", ton: "ok" },
  utkast: { etikett: "Utkast", ton: "varning" },
  utgangen: { etikett: "Utgången", ton: "allvarlig" },
  saknas: { etikett: "Saknas", ton: "allvarlig" },
};

export const OVNINGSSTATUS: Record<string, Def> = {
  utvarderad: { etikett: "Utvärderad", ton: "ok" },
  genomford: { etikett: "Genomförd", ton: "info" },
  planerad: { etikett: "Planerad", ton: "neutral" },
  installd: { etikett: "Inställd", ton: "allvarlig" },
};

export const REGISTERKONTROLL: Record<string, Def> = {
  klar: { etikett: "Klar", ton: "ok" },
  begard: { etikett: "Begärd", ton: "varning" },
  utgangen: { etikett: "Utgången", ton: "allvarlig" },
  ej_aktuell: { etikett: "Ej aktuell", ton: "neutral" },
};

export const PRIORITET: Record<string, Def> = {
  hog: { etikett: "Hög", ton: "allvarlig" },
  normal: { etikett: "Normal", ton: "info" },
  lag: { etikett: "Låg", ton: "neutral" },
};

export const KRITIKALITET: Record<string, Def> = {
  A: { etikett: "A – oumbärlig", ton: "allvarlig" },
  B: { etikett: "B – viktig", ton: "varning" },
  C: { etikett: "C – stödjande", ton: "neutral" },
};

export const RISKKATEGORI: Record<string, string> = {
  naturhandelse: "Naturhändelse",
  teknisk: "Teknisk störning",
  antagonistisk: "Antagonistiskt hot",
  halsa: "Hälsa",
  forsorjning: "Försörjning",
};

export const RISKSTATUS: Record<string, Def> = {
  identifierad: { etikett: "Identifierad", ton: "neutral" },
  bedomd: { etikett: "Bedömd", ton: "info" },
  atgardas: { etikett: "Åtgärdas", ton: "varning" },
  accepterad: { etikett: "Accepterad", ton: "ok" },
};

export const BEROENDETYP: Record<string, string> = {
  el: "El",
  vatten: "Vatten",
  varme: "Värme",
  it: "IT och kommunikation",
  personal: "Personal",
  transport: "Transport",
  livsmedel: "Livsmedel",
  drivmedel: "Drivmedel",
  leverantor: "Leverantör",
};

export const RESURSKATEGORI: Record<string, string> = {
  reservkraft: "Reservkraft",
  drivmedel: "Drivmedel",
  vatten: "Vatten",
  samband: "Samband",
  varme: "Värme",
  livsmedel: "Livsmedel",
  sjukvard: "Sjukvård",
  fordon: "Fordon",
};

export const OVNINGSTYP: Record<string, string> = {
  seminarium: "Seminarieövning",
  simulering: "Simuleringsövning",
  faltovning: "Fältövning",
  larmovning: "Larmövning",
  utbildning: "Utbildning",
};

export const ATGARDSKALLA: Record<string, string> = {
  rsa: "Risk- och sårbarhetsanalys",
  kontinuitet: "Kontinuitetshantering",
  ovning: "Övning",
  tillsyn: "Tillsyn och lagkrav",
  resurs: "Resursinventering",
  krigsorg: "Krigsorganisation",
  annan: "Annan",
};

export const NIVA: Record<string, string> = {
  ledning: "Ledning",
  stab: "Stab",
  operativ: "Operativ",
};

export const SAKERHETSKLASS: Record<string, string> = {
  ingen: "Ingen",
  "3": "Klass 3",
  "2": "Klass 2",
  "1": "Klass 1",
};

export const INTERVALL: Record<string, string> = {
  mandatperiod: "Per mandatperiod",
  arligen: "Årligen",
  vartannat_ar: "Vartannat år",
  lopande: "Löpande",
  engang: "Engångskrav",
};

/** Rättslig status för ett krav. Regelverket ändras, och det ska synas. */
export const GILTIGHET: Record<string, Def> = {
  gallande: { etikett: "Gällande rätt", ton: "ok" },
  upphor: { etikett: "Upphör 2027", ton: "varning" },
  foreslagen: { etikett: "Förslag", ton: "info" },
};

export const BEREDSKAPSNIVA: Record<string, Def> = {
  fredstida: { etikett: "Fredstida beredskap", ton: "ok" },
  beredskapslarm: { etikett: "Beredskapslarm", ton: "varning" },
  hojd_beredskap: { etikett: "Höjd beredskap", ton: "allvarlig" },
};

/** Riskvärde 1–25 till ton. */
export function riskTon(sannolikhet: number, konsekvens: number): Ton {
  const v = sannolikhet * konsekvens;
  if (v >= 15) return "allvarlig";
  if (v >= 8) return "varning";
  return "ok";
}

export function riskNivaText(sannolikhet: number, konsekvens: number): string {
  const v = sannolikhet * konsekvens;
  if (v >= 15) return "Hög";
  if (v >= 8) return "Betydande";
  return "Låg";
}

export function def(karta: Record<string, Def>, nyckel: string): Def {
  return karta[nyckel] ?? { etikett: nyckel, ton: "neutral" };
}
