import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { route } from "@/lib/api/route";
import { openDemo } from "@/lib/cs2/demos";

export const dynamic = "force-dynamic";

/** Streams a demo rather than buffering it: these run to hundreds of MB. */
export const GET = route(
  async (_req: Request, ctx: { params: Promise<{ name: string }> }) => {
    const { name } = await ctx.params;
    const demo = await openDemo(decodeURIComponent(name));
    if (!demo) {
      return NextResponse.json({ error: "no such demo" }, { status: 404 });
    }

    return new NextResponse(
      Readable.toWeb(demo.stream as Readable) as ReadableStream,
      {
        headers: {
          "content-type": "application/octet-stream",
          "content-length": String(demo.sizeBytes),
          "content-disposition": `attachment; filename="${name}"`,
        },
      },
    );
  },
);
