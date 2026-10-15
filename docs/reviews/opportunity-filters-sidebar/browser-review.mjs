import fs from "node:fs/promises";
import assert from "node:assert/strict";

const [baseUrl, outputDir, mode = "after"] = process.argv.slice(2);
const cdpUrl = process.env.CDP_URL ?? "http://127.0.0.1:24733";
if (!baseUrl || !outputDir)
  throw new Error(
    "usage: node capture-opportunity-filters.mjs <baseUrl> <outputDir>",
  );

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
  if (!message.id) return;
  const handler = pending.get(message.id);
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

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
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
  return result;
};
const value = async (expression) => (await evaluate(expression)).result.value;
const click = (selector) =>
  evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const select = (selector, selected) =>
  evaluate(`{
  const control = document.querySelector(${JSON.stringify(selector)});
  control.value = ${JSON.stringify(selected)};
  control.dispatchEvent(new Event('change', { bubbles: true }));
}`);
const is = (id) => `[data-testid="${id}"]`;
const waitFor = async (expression, timeout = 15000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const result = await evaluate(expression);
    if (result.result?.value) return;
    await sleep(100);
  }
  throw new Error(`timed out: ${expression}`);
};

try {
  await fs.mkdir(outputDir, { recursive: true });
  await command("Page.enable");
  await command("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await command("Runtime.enable");
  await command("Page.addScriptToEvaluateOnNewDocument", {
    source: `localStorage.setItem('licita-last-activity', String(Date.now()));`,
  });

  const cases = [
    ["nacional-desktop-creme", "/oportunidades", 1440, 1000, false, false],
    ["nacional-desktop-petroleo", "/oportunidades", 1440, 1000, false, true],
    ["nacional-celular-creme", "/oportunidades", 390, 844, true, false],
    ["nacional-celular-petroleo", "/oportunidades", 390, 844, true, true],
    [
      "internacional-desktop-creme",
      "/oportunidades?scope=international",
      1440,
      1000,
      false,
      false,
    ],
    [
      "internacional-desktop-petroleo",
      "/oportunidades?scope=international",
      1440,
      1000,
      false,
      true,
    ],
    [
      "internacional-celular-creme",
      "/oportunidades?scope=international",
      390,
      844,
      true,
      false,
    ],
    [
      "internacional-celular-petroleo",
      "/oportunidades?scope=international",
      390,
      844,
      true,
      true,
    ],
  ];

  if (mode !== "before") {
    for (const [theme, dark] of [
      ["creme", false],
      ["petroleo", true],
    ]) {
      cases.push([
        `nacional-celular-chips-${theme}`,
        "/oportunidades?state=SP&source=mapas",
        390,
        844,
        true,
        dark,
      ]);
      cases.push([
        `internacional-celular-chips-${theme}`,
        "/oportunidades?scope=international&region=europa&language=fr&eligibility=all",
        390,
        844,
        true,
        dark,
      ]);
    }
  }
  for (const [name, path, width, height, mobile, dark] of cases) {
    await command("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile,
      screenWidth: width,
      screenHeight: height,
    });
    await command("Page.navigate", { url: `${baseUrl}${path}` });
    await waitFor(
      `document.body && document.body.textContent.includes('Hub de oportunidades')`,
    );
    await evaluate(`
    localStorage.setItem('licita-cookie-consent', 'accepted');
    localStorage.setItem('licita-theme', ${JSON.stringify(dark ? "dark" : "light")});
    localStorage.setItem('licita-sidebar-collapsed', 'false');
    location.reload();
  `);
    await waitFor(
      `Boolean(document.querySelector('[data-testid="list-opportunities"]'))`,
    );
    if (
      mobile &&
      !name.includes("-chips-") &&
      (mode !== "before" || !name.startsWith("internacional"))
    ) {
      await evaluate(
        `document.querySelector('[data-testid="button-opportunity-filters"]')?.click()`,
      );
      await waitFor(
        `Boolean(document.querySelector('[data-testid="sheet-opportunity-filters"]'))`,
      );
    }
    await evaluate(`document.fonts.ready.then(() => true)`);
    await sleep(350);
    const screenshot = await command("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    });
    await fs.writeFile(
      `${outputDir}/${name}.png`,
      Buffer.from(screenshot.data, "base64"),
    );
  }

  if (mode !== "before") {
    for (const scope of ["national", "international"]) {
      const path =
        scope === "national"
          ? "/oportunidades"
          : "/oportunidades?scope=international";
      const field = scope === "national" ? "state" : "region";
      const selected = scope === "national" ? "SP" : "europa";
      const more = scope === "national" ? "opportunity" : "international";
      await command("Emulation.setDeviceMetricsOverride", {
        width: 1440,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await command("Page.navigate", { url: `${baseUrl}${path}` });
      await waitFor(
        `Boolean(document.querySelector('[data-testid="list-opportunities"]'))`,
      );
      assert.equal(
        await value(
          `document.querySelector('#desktop-opportunity-filters').closest('aside').getBoundingClientRect().width`,
        ),
        264,
      );
      await click(is("opportunity-button-collapse-filters"));
      await waitFor(
        `document.querySelector('#desktop-opportunity-filters').hidden`,
      );
      await sleep(50);
      assert.equal(
        await value(
          `document.querySelector('#desktop-opportunity-filters').closest('aside').getBoundingClientRect().width`,
        ),
        40,
      );
      await click(is("opportunity-button-collapse-filters"));
      await select(is(`select-opportunity-${field}`), selected);
      await waitFor(
        `new URLSearchParams(location.search).get('${field}') === '${selected}'`,
      );
      await waitFor(
        `document.querySelector('[data-testid="text-opportunity-result-count"]').textContent.includes('1 oportunidade')`,
      );
      await click(is(`button-${more}-more-filters`));
      await select(
        is("select-opportunity-source"),
        scope === "national" ? "mapas" : "eu_ft",
      );
      await waitFor(
        `document.querySelector('[data-testid="badge-${more}-more-filters"]')?.textContent.includes('1')`,
      );
      await click(is(`button-${more}-more-filters`));
      assert.equal(
        await value(
          `document.querySelector('[data-testid="${more}-more-filters"]').hidden`,
        ),
        true,
      );
      await click(is("button-opportunity-clear-all"));
      await waitFor(`!new URLSearchParams(location.search).has('${field}')`);
      assert.equal(
        await value(`document.documentElement.scrollWidth <= innerWidth`),
        true,
      );

      await command("Emulation.setDeviceMetricsOverride", {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
      });
      await click(is("button-opportunity-filters"));
      await waitFor(
        `Boolean(document.querySelector('[data-testid="sheet-opportunity-filters"]'))`,
      );
      const inSheet = `${is("sheet-opportunity-filters")} ${is(`select-opportunity-${field}`)}`;
      await select(inSheet, selected);
      await waitFor(
        `document.querySelector('[data-testid="opportunity-button-sheet-apply"]').textContent === 'Ver 1 oportunidade'`,
      );
      assert.equal(
        await value(`new URLSearchParams(location.search).has('${field}')`),
        false,
        "draft does not change URL",
      );
      assert.equal(
        await value(
          `document.querySelector('[data-testid="opportunity-text-sheet-preview-count"]').getAttribute('aria-live')`,
        ),
        "polite",
      );
      await command("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Escape",
        code: "Escape",
      });
      await command("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Escape",
        code: "Escape",
      });
      await waitFor(
        `!document.querySelector('[data-testid="sheet-opportunity-filters"]')`,
      );
      await waitFor(
        `document.activeElement?.dataset.testid === 'button-opportunity-filters'`,
      );
      await click(is("button-opportunity-filters"));
      await waitFor(
        `Boolean(document.querySelector('[data-testid="sheet-opportunity-filters"]'))`,
      );
      assert.equal(
        await value(`document.querySelector(${JSON.stringify(inSheet)}).value`),
        "",
        "cancel discards the draft",
      );
      await select(inSheet, selected);
      await click(is("opportunity-button-sheet-apply"));
      await waitFor(
        `new URLSearchParams(location.search).get('${field}') === '${selected}'`,
      );
      await waitFor(
        `Boolean(document.querySelector('[data-testid="chip-opportunity-${field}:${selected}"]'))`,
      );
      await click(is("button-opportunity-filters"));
      await click(is("opportunity-button-sheet-clear"));
      assert.equal(
        await value(`new URLSearchParams(location.search).get('${field}')`),
        selected,
        "clear remains a draft until apply",
      );
      await click(is("opportunity-button-sheet-apply"));
      await waitFor(`!new URLSearchParams(location.search).has('${field}')`);
      assert.equal(
        await value(`document.documentElement.scrollWidth <= innerWidth`),
        true,
      );
      console.log(
        `PASS ${scope}: 264/40px, immediate URL, more count, sheet preview/cancel/apply/clear, chips, focus, responsive`,
      );
    }
  }
  if (mode !== "before") {
    await command("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await command("Page.navigate", { url: `${baseUrl}/search` });
    await waitFor(
      `document.querySelector('[data-testid="text-result-count"]')?.textContent.includes('0 resultados')`,
    );
    await click(is("button-collapse-filters"));
    await waitFor(`document.querySelector('#desktop-facets').hidden`);
    await click(is("button-collapse-filters"));
    await click(is("button-deadline-7"));
    await waitFor(`new URLSearchParams(location.search).has('deadlineTo')`);
    await click(is("button-view-table"));
    await waitFor(
      `document.querySelector('[data-testid="button-view-table"]').getAttribute('aria-pressed') === 'true'`,
    );
    await command("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await click(is("button-filter-drawer"));
    await waitFor(
      `Boolean(document.querySelector('[data-testid="sheet-filters"]'))`,
    );
    await waitFor(
      `document.querySelector('[data-testid="button-sheet-apply"]').textContent === 'Ver 0 editais'`,
    );
    await click(is("button-sheet-clear"));
    assert.equal(
      await value(`new URLSearchParams(location.search).has('deadlineTo')`),
      true,
    );
    await click(is("button-sheet-apply"));
    await waitFor(`!new URLSearchParams(location.search).has('deadlineTo')`);
    await waitFor(
      `document.activeElement?.dataset.testid === 'button-filter-drawer'`,
    );
    console.log(
      "PASS search: sidebar collapse, immediate deadline, table toggle, mobile preview/clear/apply/focus",
    );
  }
  console.log(`PASS screenshots: ${cases.length} (${mode})`);
} finally {
  socket.close();
  await fetch(`${cdpUrl}/json/close/${target.id}`);
}
