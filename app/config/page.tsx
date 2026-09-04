import { redirect } from "next/navigation";

/**
 * Config folded into Settings. Most of what this page held moved to the
 * dashboard, where the live value is the control; the presets, the boot tier
 * and the slot ceiling are the Server section of Settings. Kept as a redirect
 * rather than deleted so existing bookmarks and links still land somewhere
 * useful.
 */
export default function ConfigPage() {
  redirect("/settings");
}
