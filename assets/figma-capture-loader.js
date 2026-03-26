(() => {
  const host = window.location.hostname;
  const isLocalCaptureHost =
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "[::1]" ||
    host.endsWith(".local") ||
    /^127(?:\.\d{1,3}){3}$/.test(host);

  if (!isLocalCaptureHost) {
    return;
  }

  function hasFigmaCapture(hash = window.location.hash) {
    const params = new URLSearchParams(String(hash || "").replace(/^#/, ""));
    return params.has("figmacapture");
  }

  function ensureFigmaCaptureScript() {
    if (!hasFigmaCapture()) {
      return;
    }

    if (document.querySelector('script[data-figma-capture-script="true"]')) {
      return;
    }

    const script = document.createElement("script");
    script.src = "https://mcp.figma.com/mcp/html-to-design/capture.js";
    script.async = true;
    script.dataset.figmaCaptureScript = "true";
    document.head.appendChild(script);
  }

  ensureFigmaCaptureScript();
  window.addEventListener("hashchange", ensureFigmaCaptureScript);
})();
