#!/usr/bin/env python3
"""Measure the built app in the SHIPPING engine (WebKitGTK), not Chromium.

The dev preview is Chromium; the bundle is WebKitGTK, and the two have already
disagreed once (viewport units inside a zoomed element) in a way that shipped a
broken release. This loads dist/ in a real WebKitGTK view at the same page zoom
Tauri applies, so layout can be checked against the engine that actually ships.

    python3 -m http.server 8099 --directory dist &
    WEBKIT_DISABLE_COMPOSITING_MODE=1 python3 wk-probe.py [zoom]
"""
import sys
import time

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("WebKit2", "4.1")
from gi.repository import GLib, Gtk, WebKit2  # noqa: E402

ZOOM = float(sys.argv[1]) if len(sys.argv) > 1 else 0.8
WIN_W, WIN_H = 1280, 800

JS = """
(() => {
  const r = document.getElementById('root');
  const tb = document.querySelector('[data-slot="titlebar-v2"]');
  const rect = (el) => el ? [Math.round(el.getBoundingClientRect().width),
                             Math.round(el.getBoundingClientRect().height)] : null;
  const ctl = document.querySelector('[data-slot="titlebar-v2"] button[aria-label="Close"]');
  return JSON.stringify({
    viewport: [innerWidth, innerHeight],
    root: rect(r),
    overflows: document.documentElement.scrollWidth > innerWidth,
    titlebar: rect(tb),
    closeButton: rect(ctl),
    dragRegions: document.querySelectorAll('[data-tauri-drag-region]').length,
    bodyFont: getComputedStyle(document.body).fontSize,
  });
})()
"""


def main():
    win = Gtk.Window()
    win.set_default_size(WIN_W, WIN_H)
    ctx = WebKit2.WebContext.new_ephemeral()
    ctx.set_cache_model(WebKit2.CacheModel.DOCUMENT_VIEWER)
    view = WebKit2.WebView.new_with_context(ctx)
    win.add(view)
    win.show_all()
    view.set_zoom_level(ZOOM)

    def done(_v, res):
        try:
            print("RESULT:", view.run_javascript_finish(res).get_js_value().to_string())
        except Exception as exc:  # noqa: BLE001
            print("JS ERROR:", exc)
        Gtk.main_quit()

    def on_load(_v, ev):
        if ev == WebKit2.LoadEvent.FINISHED:
            GLib.timeout_add(2500, lambda: (view.run_javascript(JS, None, done), False)[1])

    view.connect("load-changed", on_load)
    view.load_uri("http://127.0.0.1:8099/?cb=%d" % time.time())
    GLib.timeout_add(20000, lambda: (print("TIMEOUT"), Gtk.main_quit()))
    Gtk.main()


if __name__ == "__main__":
    main()
