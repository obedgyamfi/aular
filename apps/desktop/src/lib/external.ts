/**
 * Open a URL with the machine's own tools — the system browser, the PDF
 * viewer, the image app — never inside our webview (which has no back button
 * and no escape; a media file opened there takes the whole window hostage).
 *
 * In the packaged app this rides Tauri's shell plugin; in the dev browser it
 * falls back to a real new tab.
 */
export async function openExternal(url: string): Promise<void> {
  try {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
