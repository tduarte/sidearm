import { NextResponse } from "next/server";
import { route } from "@/lib/api/route";
import { getWorkshopThumbFile } from "@/lib/db/maps";
import { readThumbnail } from "@/lib/maps/thumbnails";

export const dynamic = "force-dynamic";

/**
 * Serves a workshop thumbnail from the panel's own volume.
 *
 * The image was mirrored at subscribe time rather than hotlinked, so this
 * works with no internet — which is the normal state of a LAN game server.
 */
export const GET = route(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const file = getWorkshopThumbFile(id);
    if (!file) {
      return NextResponse.json({ error: "no thumbnail" }, { status: 404 });
    }

    const image = await readThumbnail(file);
    if (!image) {
      return NextResponse.json({ error: "thumbnail missing" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(image.body), {
      headers: {
        "content-type": image.contentType,
        // Immutable per workshop id: a changed item is re-mirrored under the
        // same name, so a short cache keeps it correct without re-reading.
        "cache-control": "public, max-age=300",
      },
    });
  },
);
