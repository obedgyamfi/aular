// Runs before the app bundle. Reads the persisted theme choice and stamps the
// root element, so the first painted frame is already correct. Kept dependency
// free and synchronous on purpose — this must not await anything.
(function () {
  try {
    var scheme = localStorage.getItem("aular-color-scheme") || "system";
    var theme = localStorage.getItem("aular-theme-id") || "aular";
    var resolved =
      scheme === "system"
        ? window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark"
        : scheme;
    var root = document.documentElement;
    root.setAttribute("data-color-scheme", resolved);
    root.setAttribute("data-theme", theme);
  } catch (e) {
    // Private mode / storage disabled — the CSS defaults handle it.
  }
})();
