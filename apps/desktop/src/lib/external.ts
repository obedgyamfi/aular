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

/**
 * Save a file to disk, rather than hand it to whatever app claims the type.
 *
 * The download control used to call `openExternal`, so it did exactly what the
 * Open control beside it did — launched the system viewer. Two buttons, one
 * behaviour, and no way to actually keep the file.
 *
 * Fetched into a blob first so the anchor's `download` attribute applies: it is
 * ignored cross-origin, and media is served from the backend's origin rather
 * than the app's. The object URL is revoked a frame later, because revoking it
 * synchronously races the browser's own read of it.
 */
export async function downloadFile(url: string, filename?: string): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    const href = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = href;
    a.download = filename || url.split("/").pop() || "download";
    document.body.appendChild(a);
    a.click();
    a.remove();
    requestAnimationFrame(() => URL.revokeObjectURL(href));
  } catch {
    // Blob fetch blocked, or the webview refused the anchor. Handing it to the
    // system is the wrong verb, but it beats a button that does nothing.
    await openExternal(url);
  }
}
