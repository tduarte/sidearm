import { NextResponse } from "next/server";
import { serverApi } from "@/lib/api/server";
import { route } from "@/lib/api/route";

export const dynamic = "force-dynamic";

/**
 * Loads a match on the server. This reloads the map and restarts the game for
 * everyone connected, which is why the UI confirms with a live headcount first.
 */
export const POST = route(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    await serverApi.loadMatch(id);
    return NextResponse.json({ ok: true });
  },
);
