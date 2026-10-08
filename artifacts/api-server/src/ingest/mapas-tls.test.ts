import assert from "node:assert/strict";
import { once } from "node:events";
import https from "node:https";
import { test } from "node:test";
import { X509Certificate } from "node:crypto";
import { fetch } from "undici";
import { createTlsDispatcher, parsePinnedHosts } from "./mapas-tls";

const ROOT = `-----BEGIN CERTIFICATE-----
MIIDJzCCAg+gAwIBAgIUQd2Ei1s5ZtWjomIlwagDg3vhKUMwDQYJKoZIhvcNAQEL
BQAwGzEZMBcGA1UEAwwQUGFyZGFsIFRlc3QgUm9vdDAeFw0yNjEwMDgxMzU4NDBa
Fw0zNjEwMDUxMzU4NDBaMBsxGTAXBgNVBAMMEFBhcmRhbCBUZXN0IFJvb3QwggEi
MA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQC7bGf+uPvG1DX/glGDYgR9ndd7
7jDA08kQbA4YSGEKIDnkBJKGAeqnsZsPhuYKX7wTApeI7SIT/AENM+C67hSqifTC
/XkglStNfKNWj5p08w67ux3p3XA+vyZJVGuoQzVO7LHPTzD5gJG4PeZKilgRjjwW
qv8PKVjh2hIPx5O9YscrXOgjTozse55UW+sA5NW4fS7ES79Y7RcQtv9vpdOE7LYP
s0A54Z7wuGDVuVsicOXUM83sqWCoBiIpMKlauuc6AjXQTAhRDKPfIFw71BTGdsb0
ZV7c3lGZvO8ynkLmFXjRkUpTFdFd0HeLFj0BeMDgtdSN+Vu3mzTZ32n4BszFAgMB
AAGjYzBhMB0GA1UdDgQWBBRQgUyCt9QE8bOqr97eD3BnjvcejzAfBgNVHSMEGDAW
gBRQgUyCt9QE8bOqr97eD3BnjvcejzAPBgNVHRMBAf8EBTADAQH/MA4GA1UdDwEB
/wQEAwIBBjANBgkqhkiG9w0BAQsFAAOCAQEAaDxJeMYTREwh9Mm5uOxKzHUhWgXh
EFhnEzCI4485+7Rh7M7SQAbyhlNsuShUWmU1ujr0aUFPlZPu+/0B5SvD9zIMY5cl
DMNJv116cxmpf2ubJh1+1XcyNAFWpy6NHXUTquzTAM04m6VQYlQ5cLjlMe3GTOBZ
DX53fByQ35DrAQKD31m+gnz6uos+HnkYCuJiymBAhyvTvBndpskpcSCpDtM7mOJi
0+uBH/Kp4jI9V8tujK+ooUAo+io/PcLxdw6vVnHz7OVhhpfINk/s18FGemXdmJdH
qFwT3aGAO3tuf//X+SkwyFyUUm7fYPBoMdrZk+Z5l/wyWJ31IbH5/yNDig==
-----END CERTIFICATE-----`;

const INTERMEDIATE = `-----BEGIN CERTIFICATE-----
MIIDMjCCAhqgAwIBAgIUOupML2k1ccr4P8BYGaBWHNCEt78wDQYJKoZIhvcNAQEL
BQAwGzEZMBcGA1UEAwwQUGFyZGFsIFRlc3QgUm9vdDAeFw0yNjEwMDgxMzU4NDBa
Fw0zNjEwMDUxMzU4NDBaMCMxITAfBgNVBAMMGFBhcmRhbCBUZXN0IEludGVybWVk
aWF0ZTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAK91xOw5TOh8/wKu
H0ydLVsCzB/vdUBn4UiRDNtnFbQ4Z6d4PEqBwv7kc/avGR100OoeBxBREVASk1mn
MMRpdPsV7OQKiXE+rtZAFxFGDl4PO6r7hWXfCNpL6lGDfhkuSeEo1hdqwLp3BQSG
OhsQhXOO0y5zjyBaYEacK0QH2Lwlw2vj82+EQYg3HDBf8qnnZEDFBNt9UACPxtF4
8jNFgKuTtBS5vzr2Bn84Zv7z8WSIRRoDyX7HQ3mUe8fpTHQuI2xiFx5IJ8mLftA2
x6q2sEnAFWjDVxtRc1wJD2+cOFMBo/yV2vDevOYS9pqw8BgfRPazMY8HPYcp3rOv
ZeX3xxECAwEAAaNmMGQwEgYDVR0TAQH/BAgwBgEB/wIBADAOBgNVHQ8BAf8EBAMC
AQYwHQYDVR0OBBYEFFqsSGMn86jdeCUvjDolDSc3UcmYMB8GA1UdIwQYMBaAFFCB
TIK31ATxs6qv3t4PcGeO9x6PMA0GCSqGSIb3DQEBCwUAA4IBAQBGCURaMsv+pr2y
nBznoCv4Opvnmuk3uo8/r/RJEeA2JJRs75dyI4LfxUL2eeFD3duMPYfEovGwHvME
KLYRrKqjHL0Xf/3ew3BXIAby8ujUr6zrkBSq+ZbXbU76/8P5QE/hoYTxuAoylzi4
DiWKaajTyc5MDBs2l6Zt+OdqE7PqSUw4RjKb8KGsSC2UTqVzKPeKIPfFqYbGm/oF
Dc+wtO4LrsYzaTeuBjba28vqi08/Dkvp7mH8HfpSnupbpIzxhls5F3SEBhSU9aav
Dc7Y3tH1JE9jLqu/+HdMJBOCYYl3u7XfMAfO1rzTuOqkHTtepd5p+mk1ANWVCod3
PCR96h5F
-----END CERTIFICATE-----`;

const LEAF = `-----BEGIN CERTIFICATE-----
MIIDUjCCAjqgAwIBAgIUWvhmE9l7SozzYmAnu6GwQ/RXD+AwDQYJKoZIhvcNAQEL
BQAwIzEhMB8GA1UEAwwYUGFyZGFsIFRlc3QgSW50ZXJtZWRpYXRlMB4XDTI2MTAw
ODEzNTg0MFoXDTI3MTAwODEzNTg0MFowFDESMBAGA1UEAwwJbG9jYWxob3N0MIIB
IjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA4QdjgT7OA9JYZK4CpnP5i5f7
z1FRku+8kM77p+Ed8X0QDGzoqLkyIS9bfU2GgI6WoJuwEQllbfBfjv6y7sHdO0xW
1GBDhGosIFKwkrv/iYWg+b8CoJvHyd3x/43tYpFUDMdNj3ET40k6HTNRS9e3IAi/
pckiyfOP4YC+HN/gD48eok6/I4WCtC7p4wnXqY+Q8FfdSf0/b4/5VNDxhrH7IxEB
JMVphHjwI8SaY9c2jSFFIGZI03K1tiyPXc9gmmhgnZPR+ig5JS/J87bbIojZkmaW
tm5rRyh4x0FZV5k0PBWRUtb3G1b1+t04zQpNdzbS2MH+u3DXDBywlmWiyGf/LQID
AQABo4GMMIGJMBQGA1UdEQQNMAuCCWxvY2FsaG9zdDAMBgNVHRMBAf8EAjAAMA4G
A1UdDwEB/wQEAwIFoDATBgNVHSUEDDAKBggrBgEFBQcDATAdBgNVHQ4EFgQUwEah
4K7ReE00ww/ruVQ5FUg3rY0wHwYDVR0jBBgwFoAUWqxIYyfzqN14JS+MOiUNJzdR
yZgwDQYJKoZIhvcNAQELBQADggEBADfK3iXFrlOMJ20jmS2p84XHiWIW5p2Qqckz
3hY8Sls0FojopLecqttA3OXWJ4e4jo1fOiLmsB+kv8AcP3mYhet9yU0CbAadTNOW
BJbg3kukeR4lKBtgOdr/sWdFUq8AX5axidOj3sRIHwZJL0Wcl4RuIiJVkN3tTEnd
teAQRSu/z1jJIYjtUC/O+VGWFBTbV7iZyQlCiHNAOWODdlS+FfKlKg56wj215uWt
Dt/1njZ4mCi+UstLQcCiP8nSHdVKTKW+6fkee74ExOOkEcCWw8uX/G8erUEKHUy/
e3b3Q1e5chk2xiCZi2ui2maAClv1G+EgyeKBZ0KGXM1frrfWalA=
-----END CERTIFICATE-----`;

const LEAF_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDhB2OBPs4D0lhk
rgKmc/mLl/vPUVGS77yQzvun4R3xfRAMbOiouTIhL1t9TYaAjpagm7ARCWVt8F+O
/rLuwd07TFbUYEOEaiwgUrCSu/+JhaD5vwKgm8fJ3fH/je1ikVQMx02PcRPjSTod
M1FL17cgCL+lySLJ84/hgL4c3+APjx6iTr8jhYK0LunjCdepj5DwV91J/T9vj/lU
0PGGsfsjEQEkxWmEePAjxJpj1zaNIUUgZkjTcrW2LI9dz2CaaGCdk9H6KDklL8nz
ttsiiNmSZpa2bmtHKHjHQVlXmTQ8FZFS1vcbVvX63TjNCk13NtLYwf67cNcMHLCW
ZaLIZ/8tAgMBAAECggEAAdOBYaa0r+AcIYh3aeWL5+aJtniTMC+nT6z3fQIBsA9O
ewkMX3WXAvyA+SSjNPFOuQ88rY2S993dqvL8NHlCAabCzjRrgP6YuoHabdi1BJ36
k76SqeK5wjSiL7SaKHAxxtp8Wss5/WCkCs8x8v0wvtXzVxE7zlQMHd/zvU4/z2US
MWtKcptrcG38cF3J9SKhUnDHDlWfoOziuCCk1pypScn5O2RSLQOhyDMCBEDIJ1sw
DAkjktaJG1YET2/ve58gB+9+qS16Q7ckcOSiCkCfDx3h//yNXzPxBnKTwUlMtRHC
H7st6G6GPP/Y9VcYz/7/pyKbxjFO77+tWqd/TViSIQKBgQDwUdQCH7mKN9PO5ysN
zPLqVp2CoyMG5VdpQngtMoflO9izSNKs4jlbDrAh0Vq7U5AhMQte0YrIOH8rQwxt
a96MDvUVF1miTocbqrZALd1jMe4TRFhjN/e6j0AJwwv/XNgEdWoXzOOwQiX7cLGO
t13/+yNpMrFWNMSqHmhqs0+J6QKBgQDvtibGjZcjrAJlsh3ktyEA2cQV56SJI7mG
TRnMLpYW7JhJE4Q9DpJmnKRJEdx7tWFLXY85O2gx5uRdSOt9MYvapdCT/i0hTPCH
wvM6m1+sr+sm4u7wl4gZJAygt1GX2U8hBGedI3jun5OSmoynzpWJkeysHXCj4dgU
MvSB3tW8pQKBgQDvYnNvUi698fJ4zWjjrF3k9DaeJOcFPXqfDWksjIM14zFvFYFW
WVqMy8rDRQm+Q/T0Oyh6YPx/iVeTvowoiyT6GwQi6EmPFe4brycwMv+uidP/OTta
SivomD1P/Ax9aPx9JIB0CNJdhubS2mTkJt/p1z5k0ew4VQP5+aRFdSwr0QKBgCkZ
3VosCt8l7h9LxA5kS/deX122IyMUign6DFNTJY72sEHPY9woNHf9obmZo2letzj5
6MXSZtIvmbZY+2+y4Bz0U2gcq9ZK3+8XQScqXuQ4IaTAQmHkSYSuBrBD3myf6Q5r
N+zcmS6pE9+OOlHHfSJib+cvARJIdgk4l23xLEq1AoGAWzy3VlNqSCT2zZPCOJcA
ZGVxKapwhPxxFHjvQLc0SOX/kcSH/qTL43HnE3Wr2YvfpYJgyguTTmPgh+Erl9y9
pA4Oym0GZhjWX4uOlFSj9T3TIEz9pxOHW3EIozXnN8n+I7ip5QDJ7tFuT4diF/bc
O6qN7yioqTNKxwc/036Nzks=
-----END PRIVATE KEY-----`;

const withServer = async (
  run: (url: string) => Promise<void>,
): Promise<void> => {
  const server = https.createServer(
    { key: LEAF_KEY, cert: LEAF },
    (_request, response) => {
      response.setHeader("Content-Type", "application/json");
      response.end("[]");
    },
  );
  server.listen(0, "localhost");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await run(`https://localhost:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
};

test("TLS agent completes a missing intermediate without weakening validation", async () => {
  await withServer(async (url) => {
    const completed = createTlsDispatcher({
      host: "localhost",
      extraCa: `${ROOT}\n${INTERMEDIATE}`,
    });
    const incomplete = createTlsDispatcher({
      host: "localhost",
      extraCa: ROOT,
    });
    try {
      assert.equal((await fetch(url, { dispatcher: completed })).status, 200);
      await assert.rejects(
        () => fetch(url, { dispatcher: incomplete }),
        /fetch failed/,
      );
    } finally {
      await Promise.all([completed.close(), incomplete.close()]);
    }
  });
});

test("explicit pinning accepts only the configured SHA-256 leaf fingerprint", async () => {
  await withServer(async (url) => {
    const fingerprint = new X509Certificate(LEAF).fingerprint256;
    const pinned = createTlsDispatcher({
      host: "localhost",
      pinnedFingerprint: fingerprint,
    });
    const wrong = createTlsDispatcher({
      host: "localhost",
      pinnedFingerprint: "00".repeat(32),
    });
    try {
      assert.equal((await fetch(url, { dispatcher: pinned })).status, 200);
      await assert.rejects(
        () => fetch(url, { dispatcher: wrong }),
        /fetch failed/,
      );
    } finally {
      await Promise.all([pinned.close(), wrong.close()]);
    }
  });
});

test("pin allowlist is empty by default and rejects wildcards or malformed fingerprints", () => {
  assert.equal(parsePinnedHosts().size, 0);
  assert.equal(
    parsePinnedHosts(`example.gov.br=${"AA:".repeat(31)}AA`).size,
    1,
  );
  assert.throws(
    () => parsePinnedHosts(`*.gov.br=${"AA".repeat(32)}`),
    /Invalid/,
  );
  assert.throws(() => parsePinnedHosts("example.gov.br=1234"), /Invalid/);
});
