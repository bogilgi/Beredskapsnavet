import { NextRequest, NextResponse } from "next/server";
import { hamtaIdpPaKortnamn, paborjaInloggning, stadaBegaranden } from "@/lib/oidc";
import { logga } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Startar federerad inloggning för en organisation. */
export async function GET(begaran: NextRequest) {
  const kortnamn = begaran.nextUrl.searchParams.get("org") ?? "";
  const idp = hamtaIdpPaKortnamn(kortnamn);
  if (!idp) {
    return NextResponse.redirect(new URL("/logga-in?fel=okand-organisation", begaran.nextUrl));
  }

  stadaBegaranden();
  const redirectUri = new URL("/api/auth/callback", begaran.nextUrl).toString();

  try {
    const url = await paborjaInloggning(idp, redirectUri);
    return NextResponse.redirect(url);
  } catch (f) {
    // Utfärdaren kan vara nere eller felkonfigurerad. Det får inte se ut som
    // att användarens uppgifter är fel.
    logga(idp.org_id, "system", "Federerad inloggning kunde inte startas",
      f instanceof Error ? f.message : "okänt fel");
    return NextResponse.redirect(new URL("/logga-in?fel=utfardare", begaran.nextUrl));
  }
}
