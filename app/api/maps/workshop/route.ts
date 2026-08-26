import { NextResponse } from "next/server";
import { serverApi } from "@/lib/api/server";
import { route } from "@/lib/api/route";

export const dynamic = "force-dynamic";

export const POST = route(async (req: Request) => {
  const body = (await req.json()) as {
    workshopId?: string;
    displayName?: string;
  };
  if (!body.workshopId) {
    return NextResponse.json(
      { error: "workshopId required" },
      { status: 400 },
    );
  }
  return NextResponse.json(
    await serverApi.subscribeWorkshop(body.workshopId, body.displayName),
  );
});

export const DELETE = route(async (req: Request) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  await serverApi.unsubscribeWorkshop(id);
  return NextResponse.json({ ok: true });
});
