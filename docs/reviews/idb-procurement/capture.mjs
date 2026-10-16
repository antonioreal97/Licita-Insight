// Captures the international list filtered by BID and one BID detail, through Chrome DevTools Protocol.
// usage: CDP_URL=http://127.0.0.1:24733 node capture.mjs http://localhost:24252 <outputDir>
import fs from "node:fs/promises";

const [baseUrl, outputDir] = process.argv.slice(2);
const cdpUrl = process.env.CDP_URL ?? "http://127.0.0.1:24733";
if (!baseUrl || !outputDir)
  throw new Error("usage: node capture.mjs <baseUrl> <outputDir>");

const target = await fetch(
  `${cdpUrl}/json/new?${encodeURIComponent("about:blank")}`,
  { method: "PUT" },
).then((response) => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let nextId = 1;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  const handler = message.id && pending.get(message.id);
  if (!handler) return;
  pending.delete(message.id);
  if (message.error) handler.reject(new Error(message.error.message));
  else handler.resolve(message.result);
});
const command = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const evaluate = async (expression) => {
  const result = await command("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails)
    throw new Error(
      result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text,
    );
  return result.result.value;
};
const waitFor = async (expression, timeout = 20_000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error(`timed out: ${expression}`);
};

const list = "/oportunidades?scope=international&source=idb";
const detail = "/oportunidades/idb-39272";
const cases = [
  ["lista-bid-desktop-creme", list, 1440, 1000, false, false, "list"],
  ["lista-bid-desktop-petroleo", list, 1440, 1000, false, true, "list"],
  ["lista-bid-celular-creme", list, 390, 844, true, false, "list"],
  ["filtro-fonte-desktop-creme", list, 1440, 1000, false, false, "filters"],
  ["detalhe-bid-desktop-creme", detail, 1440, 1000, false, false, "detail"],
  ["detalhe-bid-celular-petroleo", detail, 390, 844, true, true, "detail"],
];

try {
  await fs.mkdir(outputDir, { recursive: true });
  await command("Page.enable");
  await command("Runtime.enable");
  await command("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await command("Page.addScriptToEvaluateOnNewDocument", {
    source: `localStorage.setItem('licita-last-activity', String(Date.now()));`,
  });
  for (const [name, path, width, height, mobile, dark, kind] of cases) {
    await command("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile,
      screenWidth: width,
      screenHeight: height,
    });
    await command("Page.navigate", { url: `${baseUrl}${path}` });
    await waitFor(`document.readyState === 'complete'`);
    await evaluate(`
      localStorage.setItem('licita-cookie-consent', 'accepted');
      localStorage.setItem('licita-theme', ${JSON.stringify(dark ? "dark" : "light")});
      localStorage.setItem('licita-sidebar-collapsed', 'false');
      location.reload();
    `);
    await sleep(300);
    await waitFor(
      kind === "detail"
        ? `Boolean(document.querySelector('[data-testid="opportunity-detail"]'))`
        : `Boolean(document.querySelector('[data-testid="list-opportunities"]'))`,
    );
    if (kind === "filters") {
      await evaluate(
        `document.querySelector('[data-testid="button-international-more-filters"]').click()`,
      );
      await waitFor(
        `!document.querySelector('[data-testid="international-more-filters"]').hidden`,
      );
    }
    await evaluate(`document.fonts.ready.then(() => true)`);
    await sleep(400);
    const shot = await command("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: kind === "detail",
      ...(kind === "detail"
        ? {
            clip: {
              x: 0,
              y: 0,
              width,
              height: await evaluate(
                `Math.min(document.documentElement.scrollHeight, 2400)`,
              ),
              scale: 1,
            },
          }
        : {}),
    });
    await fs.writeFile(
      `${outputDir}/${name}.png`,
      Buffer.from(shot.data, "base64"),
    );
    console.log(name);
  }
} finally {
  socket.close();
}
