import { NextResponse } from "next/server";
import { serverApi } from "@/lib/api/server";
import { route } from "@/lib/api/route";
import type { CvarGroup } from "@/lib/api/types";

export const dynamic = "force-dynamic";

const GROUPS: CvarGroup[] = ["practice"];

export const GET = route(async (req: Request) => {
  const group = new URL(req.url).searchParams.get("group") as CvarGroup | null;
  if (!group || !GROUPS.includes(group)) {
    return NextResponse.json({ error: "unknown cvar group" }, { status: 400 });
  }
  return NextResponse.json(await serverApi.getCvars(group));
});

export const POST = route(async (req: Request) => {
  const body = (await req.json()) as { name?: unknown; value?: unknown };
  if (typeof body.name !== "string" || typeof body.value !== "string") {
    return NextResponse.json(
      { error: "name and value (strings) required" },
      { status: 400 },
    );
  }
  // The adapter allowlists the name; this route only checks the shape.
  return NextResponse.json(await serverApi.setCvar(body.name, body.value));
});
