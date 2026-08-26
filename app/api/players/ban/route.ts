import { NextResponse } from "next/server";
import { serverApi } from "@/lib/api/server";
import { route } from "@/lib/api/route";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  return NextResponse.json(await serverApi.getBans());
});

export const POST = route(async (req: Request) => {
  const body = (await req.json()) as {
    steamId?: unknown;
    minutes?: unknown;
    reason?: unknown;
  };
  if (typeof body.steamId !== "string" || body.steamId === "") {
    return NextResponse.json({ error: "steamId required" }, { status: 400 });
  }
  // `null` is a real choice here — a ban with no expiry — so it is not the
  // same as the field being absent.
  const minutes =
    body.minutes === null
      ? null
      : typeof body.minutes === "number"
        ? body.minutes
        : null;
  const reason = typeof body.reason === "string" ? body.reason : undefined;

  return NextResponse.json(
    await serverApi.banPlayer(body.steamId, minutes, reason),
  );
});

export const DELETE = route(async (req: Request) => {
  const steamId = new URL(req.url).searchParams.get("steamId");
  if (!steamId) {
    return NextResponse.json({ error: "steamId required" }, { status: 400 });
  }
  await serverApi.unbanPlayer(steamId);
  return NextResponse.json({ ok: true });
});
