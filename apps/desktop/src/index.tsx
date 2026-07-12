/* @refresh reload */
import { render } from "solid-js/web";
import { MetaProvider } from "@solidjs/meta";

import { App } from "~/app";
import "~/styles/index.css";

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
