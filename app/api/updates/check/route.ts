import { NextResponse } from "next/server";
import { serverApi } from "@/lib/api/server";
import { route } from "@/lib/api/route";

export const dynamic = "force-dynamic";

/** Forces a check now rather than waiting for the periodic one. */
export const POST = route(async () => {
  return NextResponse.json(await serverApi.checkForUpdate());
});
