import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import tls from "node:tls";
import { Agent, buildConnector, type Dispatcher } from "undici";

const AP_HOST = "mapacultural.ap.gov.br";
const AP_INTERMEDIATE = readFileSync(
  new URL(
    "./certificates/sectigo-public-server-authentication-ca-dv-r36.pem",
    import.meta.url,
  ),
  "utf8",
);

const EXTRA_CA_BY_HOST = new Map<string, string>([[AP_HOST, AP_INTERMEDIATE]]);
const dispatcherCache = new Map<string, Dispatcher>();

const normalizedFingerprint = (value: string): string =>
  value.replaceAll(":", "").trim().toUpperCase();

const validFingerprint = (value: string): boolean =>
  /^[A-F0-9]{64}$/.test(value);

export const parsePinnedHosts = (value = ""): Map<string, string> => {
  const pins = new Map<string, string>();
  if (value.trim() === "") return pins;

  for (const entry of value.split(",")) {
    const separator = entry.indexOf("=");
    if (separator <= 0) {
      throw new Error(
        "CULTURE_TLS_PINNED_HOSTS must use host=SHA256_FINGERPRINT entries",
      );
    }
    const host = entry.slice(0, separator).trim().toLowerCase();
    const fingerprint = normalizedFingerprint(entry.slice(separator + 1));
    if (
      !/^[a-z0-9.-]+$/.test(host) ||
      host.includes("*") ||
      !validFingerprint(fingerprint)
    ) {
      throw new Error(`Invalid CULTURE_TLS_PINNED_HOSTS entry for "${host}"`);
    }
    if (pins.has(host)) {
      throw new Error(`Duplicate CULTURE_TLS_PINNED_HOSTS entry for "${host}"`);
    }
    pins.set(host, fingerprint);
  }
  return pins;
};

const sameFingerprint = (actual: string, expected: string): boolean => {
  const actualBytes = Buffer.from(normalizedFingerprint(actual), "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
};

const pinnedConnector = (host: string, expectedFingerprint: string) => {
  // This connector is created only for an exact host explicitly pinned by the owner.
  // PKI validation is replaced by a SHA-256 leaf-certificate identity check; hostname
  // redirects are rejected so the relaxed handshake cannot escape the allowlist entry.
  const connectWithoutPki = buildConnector({ rejectUnauthorized: false });
  const connect: typeof connectWithoutPki = (options, callback) => {
    const requestedHost = String(options.hostname).toLowerCase();
    if (requestedHost !== host) {
      const error = new Error(
        `Pinned TLS dispatcher for ${host} refused ${requestedHost}`,
      );
      Object.assign(error, { code: "CULTURE_TLS_PIN_HOST_MISMATCH" });
      callback(error, null);
      return;
    }
    connectWithoutPki(options, (error, socket) => {
      if (error || !socket) {
        callback(error, socket);
        return;
      }
      const certificate = (socket as tls.TLSSocket).getPeerCertificate();
      if (
        !certificate.fingerprint256 ||
        !sameFingerprint(certificate.fingerprint256, expectedFingerprint)
      ) {
        socket.destroy();
        const mismatch = new Error(
          `Pinned TLS fingerprint mismatch for ${host}`,
        );
        Object.assign(mismatch, { code: "CULTURE_TLS_PIN_MISMATCH" });
        callback(mismatch, null);
        return;
      }
      callback(null, socket);
    });
  };
  return connect;
};

export type TlsDispatcherOptions = {
  host: string;
  extraCa?: string;
  pinnedFingerprint?: string;
};

export const createTlsDispatcher = ({
  host,
  extraCa,
  pinnedFingerprint,
}: TlsDispatcherOptions): Dispatcher => {
  const normalizedHost = host.toLowerCase();
  if (pinnedFingerprint) {
    const fingerprint = normalizedFingerprint(pinnedFingerprint);
    if (!validFingerprint(fingerprint))
      throw new Error(`Invalid SHA-256 fingerprint for ${host}`);
    return new Agent({ connect: pinnedConnector(normalizedHost, fingerprint) });
  }
  return new Agent({
    connect: extraCa
      ? { ca: [...tls.rootCertificates, extraCa], servername: normalizedHost }
      : { servername: normalizedHost },
  });
};

export const dispatcherForUrl = (
  rawUrl: string,
  pinnedHostsValue = process.env.CULTURE_TLS_PINNED_HOSTS ?? "",
): Dispatcher | undefined => {
  const host = new URL(rawUrl).hostname.toLowerCase();
  const pinnedFingerprint = parsePinnedHosts(pinnedHostsValue).get(host);
  const extraCa = EXTRA_CA_BY_HOST.get(host);
  if (!pinnedFingerprint && !extraCa) return undefined;

  const cacheKey = `${host}|${pinnedFingerprint ?? "pki"}`;
  const cached = dispatcherCache.get(cacheKey);
  if (cached) return cached;
  const dispatcher = createTlsDispatcher({ host, extraCa, pinnedFingerprint });
  dispatcherCache.set(cacheKey, dispatcher);
  return dispatcher;
};

export const hasBundledIntermediate = (host: string): boolean =>
  EXTRA_CA_BY_HOST.has(host.toLowerCase());
