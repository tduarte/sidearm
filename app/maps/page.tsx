import { redirect } from "next/navigation";

/**
 * The map library and the rotation are the Maps section of Settings; choosing
 * what to play right now is the dashboard's map sheet and the ⌘K palette. Kept
 * as a redirect rather than deleted so existing bookmarks and links still land
 * somewhere useful.
 */
export default function MapsPage() {
  redirect("/settings");
}
