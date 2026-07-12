/* @refresh reload */
import { render } from "solid-js/web";
import { MetaProvider } from "@solidjs/meta";

import { App } from "~/app";
import { initTheme } from "~/theme/theme";
import "~/styles/index.css";

// Colors before pixels: opencode's theme is resolved into --v2-* tokens on the
// root element before anything renders, so no frame is ever painted unthemed.
initTheme();

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
