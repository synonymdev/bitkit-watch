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

  const script = document.createElement("script");
  script.src = "https://mcp.figma.com/mcp/html-to-design/capture.js";
  script.async = true;
  document.head.appendChild(script);
})();
