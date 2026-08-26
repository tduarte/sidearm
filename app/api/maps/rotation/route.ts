import { NextResponse } from "next/server";
import { serverApi } from "@/lib/api/server";
import { route } from "@/lib/api/route";

export const dynamic = "force-dynamic";

export const PUT = route(async (req: Request) => {
  const body = (await req.json()) as { rotation?: string[] };
  if (!Array.isArray(body.rotation)) {
    return NextResponse.json(
      { error: "rotation (string[]) required" },
      { status: 400 },
    );
  }
  await serverApi.setRotation(body.rotation);
  return NextResponse.json({ ok: true });
});
