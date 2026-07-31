/* @refresh reload */
import { render } from "solid-js/web";
import { MetaProvider } from "@solidjs/meta";

import { App } from "~/app";
import { initTheme } from "~/theme/theme";
import { applyUiScale } from "~/lib/window";
import "~/styles/index.css";

// Colors before pixels: opencode's theme is resolved into --v2-* tokens on the
// root element before anything renders, so no frame is ever painted unthemed.
initTheme();

// The 80% UI scale, applied by the webview rather than by CSS — see the note
// on applyUiScale for why CSS zoom could not be made to work in both engines.
applyUiScale();

const root = document.getElementById("root");
if (!root) throw new Error("#root missing from index.html");

render(
  () => (
    <MetaProvider>
      <App />
    </MetaProvider>
  ),
  root,
);
