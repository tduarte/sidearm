import { redirect } from "next/navigation";

/**
 * The console is the ⌘K palette's console mode now — see
 * `components/command-palette.tsx` for why a thing you consult belongs in a
 * launcher rather than at a destination. Kept as a redirect rather than deleted
 * so existing bookmarks and links still land somewhere useful.
 */
export default function ConsolePage() {
  redirect("/dashboard");
}
