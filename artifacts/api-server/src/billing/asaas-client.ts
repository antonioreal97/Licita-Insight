import { BillingUnavailableError } from "../lib/api-error";
import { logger } from "../lib/logger";
import { timeoutSignal } from "../lib/http-timeout";

const USER_AGENT = "PardalDigital/1.0";

export type AsaasPaymentLink = {
  id: string;
  url: string;
  active?: boolean;
  deleted?: boolean;
};

export type AsaasSubscription = {
  id: string;
  customer?: string;
  nextDueDate?: string;
  status?: string;
};

export type AsaasInvoice = {
  id: string;
  status?: string;
  invoiceUrl?: string;
  dueDate?: string;
};

type AsaasConfig = {
  apiKey: string;
  baseUrl: string;
  monthlyBrl: number;
};

export function monthlyAmountBrl(): number | null {
  const raw = process.env.BILLING_MONTHLY_BRL?.trim();
  if (!raw || !/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  const value = Number(raw);
  return value > 0 ? value : null;
}

export function billingConfigured(): boolean {
  return readConfig() !== null;
}

function readConfig(): AsaasConfig | null {
  const apiKey = process.env.ASAAS_API_KEY?.trim();
  const baseUrl = asaasBaseUrl();
  const monthlyBrl = monthlyAmountBrl();
  const webhookToken = process.env.ASAAS_WEBHOOK_TOKEN?.trim();
  if (!apiKey || !baseUrl || monthlyBrl === null || !webhookToken) return null;
  return { apiKey, baseUrl, monthlyBrl };
}

function asaasBaseUrl(): string | null {
  const raw = process.env.ASAAS_API_BASE_URL?.trim().replace(/\/$/, "");
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
}

export function requireAsaasConfig(): AsaasConfig {
  const config = readConfig();
  if (!config) {
    throw new BillingUnavailableError("A cobrança ainda não está configurada.");
  }
  return config;
}

export async function createRecurringPaymentLink(input: {
  userId: string;
  successUrl: string;
}): Promise<AsaasPaymentLink> {
  const { monthlyBrl } = requireAsaasConfig();
  const link = await asaas<AsaasPaymentLink>("/paymentLinks", {
    method: "POST",
    body: {
      name: "Pardal Digital",
      description: "Assinatura mensal para salvar, monitorar e receber alertas de editais.",
      billingType: "UNDEFINED",
      chargeType: "RECURRENT",
      subscriptionCycle: "MONTHLY",
      value: monthlyBrl,
      dueDateLimitDays: 5,
      externalReference: input.userId,
      notificationEnabled: true,
      callback: { successUrl: input.successUrl, autoRedirect: true },
    },
  });
  if (!link.id || !isHttpsUrl(link.url)) {
    throw new BillingUnavailableError("O Asaas não devolveu um link de pagamento válido.");
  }
  return link;
}

export async function getPaymentLink(id: string): Promise<AsaasPaymentLink | null> {
  return asaas<AsaasPaymentLink>(`/paymentLinks/${encodeURIComponent(id)}`);
}

export async function getSubscription(id: string): Promise<AsaasSubscription> {
  return asaas<AsaasSubscription>(`/subscriptions/${encodeURIComponent(id)}`);
}

export async function listSubscriptionPayments(id: string): Promise<AsaasInvoice[]> {
  const page = await asaas<{ data?: AsaasInvoice[] }>(
    `/subscriptions/${encodeURIComponent(id)}/payments`,
  );
  return Array.isArray(page.data) ? page.data : [];
}

export async function deleteSubscription(id: string): Promise<void> {
  await asaas(`/subscriptions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

async function asaas<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const { apiKey, baseUrl } = requireAsaasConfig();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers: {
        access_token: apiKey,
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: timeoutSignal("ASAAS_HTTP_TIMEOUT_MS", 15_000),
    });
  } catch (error) {
    logger.error({ err: error, path }, "Asaas request failed");
    throw new BillingUnavailableError("Não foi possível falar com o Asaas.");
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    // Provider bodies can echo customer fields. Keep only operational metadata in application logs.
    logger.error({ path, status: response.status }, "Asaas rejected the request");
    throw new BillingUnavailableError(asaasErrorMessage(payload, response.status));
  }
  return payload as T;
}

function asaasErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object" && "errors" in payload) {
    const errors = (payload as { errors?: unknown }).errors;
    const first = Array.isArray(errors) ? errors[0] : undefined;
    if (first && typeof first === "object" && "description" in first) {
      const description = (first as { description?: unknown }).description;
      if (typeof description === "string" && description.trim()) {
        return `O Asaas recusou o pagamento: ${description.trim()}`;
      }
    }
  }
  return `O Asaas recusou o pagamento (HTTP ${status}).`;
}

function isHttpsUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
