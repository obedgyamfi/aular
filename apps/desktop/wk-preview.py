#!/usr/bin/env python3
"""Render the app in the SHIPPING engine (WebKitGTK) without building the bundle.

The dev preview is Chromium; the shipped app is WebKitGTK. They have disagreed
twice in ways that only appeared after packaging (viewport units inside a zoomed
element; titlebar hit areas), and a full `tauri build` is ~2 minutes of Rust to
find out. This is the short loop: `npm run build` (~30s) then render here.

    npm run build
    python3 wk-preview.py                 # window + screenshot after 3s
    python3 wk-preview.py --wait 30       # 30s to click around first
    python3 wk-preview.py --zoom 1.0      # compare scales
    python3 wk-preview.py --size 900x600  # check a small window

The snapshot comes from WebKit itself rather than the compositor, so it works
under Wayland where screenshotting a window is blocked.

The session persists in a profile dir beside this script, so you sign in once
and later runs land straight in the app. What this canNOT show is the native
window frame — dragging, resize edges and the OS titlebar belong to Tauri, not
the page. For those, build and run the binary.
"""
import argparse
import os
import sys
import time

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("WebKit2", "4.1")
from gi.repository import GLib, Gtk, WebKit2  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
PROFILE = os.path.join(HERE, ".wk-preview-profile")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:8099/")
    ap.add_argument("--zoom", type=float, default=0.8, help="Tauri ships 0.8")
    ap.add_argument("--size", default="1100x700", help="matches tauri.conf")
    ap.add_argument("--wait", type=float, default=3.0, help="seconds before the shot")
    ap.add_argument("--out", default="/tmp/aular-webkit.png")
    ap.add_argument("--eval", default="", help="JS to run and print instead of shooting")
    args = ap.parse_args()

    w, h = (int(v) for v in args.size.lower().split("x"))

    win = Gtk.Window()
    win.set_default_size(w, h)
    win.connect("destroy", Gtk.main_quit)

    # Persistent so the login survives between runs.
    ctx = WebKit2.WebContext.new_with_website_data_manager(
        WebKit2.WebsiteDataManager(base_data_directory=PROFILE, base_cache_directory=PROFILE)
    )
    view = WebKit2.WebView.new_with_context(ctx)
    view.get_settings().set_enable_developer_extras(True)
    win.add(view)
    win.show_all()
    view.set_zoom_level(args.zoom)

    def shoot():
        def done(_v, res):
            try:
                surface = view.get_snapshot_finish(res)
                surface.write_to_png(args.out)
                print(f"WROTE {args.out}  ({w}x{h} @ zoom {args.zoom})")
            except Exception as exc:  # noqa: BLE001
                print("SNAPSHOT FAILED:", exc)
            Gtk.main_quit()

        view.get_snapshot(
            WebKit2.SnapshotRegion.VISIBLE, WebKit2.SnapshotOptions.NONE, None, done
        )
        return False

    def evaluate():
        def done(_v, res):
            try:
                print("EVAL:", view.run_javascript_finish(res).get_js_value().to_string())
            except Exception as exc:  # noqa: BLE001
                print("EVAL FAILED:", exc)
            Gtk.main_quit()

        view.run_javascript(args.eval, None, done)
        return False

    def on_load(_v, ev):
        if ev == WebKit2.LoadEvent.FINISHED:
            GLib.timeout_add(int(args.wait * 1000), evaluate if args.eval else shoot)

    view.connect("load-changed", on_load)
    view.load_uri(args.url + ("&" if "?" in args.url else "?") + f"cb={int(time.time())}")
    GLib.timeout_add(int((args.wait + 30) * 1000), lambda: (print("TIMEOUT"), Gtk.main_quit()))
    Gtk.main()
    return 0


if __name__ == "__main__":
    sys.exit(main())
