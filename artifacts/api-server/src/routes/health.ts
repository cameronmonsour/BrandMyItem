import { Router, type IRouter } from "express";
import { GetHealthResponse, HealthCheckResponse } from "@workspace/api-zod";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { stripeRequest } from "../stripeClient.ts";

const router: IRouter = Router();
const connectors = new ReplitConnectors();

type HealthDependencies = {
  getStripeBalance: () => Promise<{ livemode?: boolean }>;
  checkResend: () => Promise<boolean>;
};

const defaultDependencies: HealthDependencies = {
  getStripeBalance: () => stripeRequest<{ livemode?: boolean }>("/v1/balance"),
  checkResend: async () => {
    const response = await connectors.proxy("resend", "/domains?limit=1", {
      method: "GET",
    });
    return response.ok;
  },
};

export async function integrationHealth(
  dependencies: HealthDependencies = defaultDependencies,
): Promise<{
  ok: true; stripeMode: "test" | "live"; resend: boolean;
}> {
  const [stripeMode, resend] = await Promise.all([
    dependencies.getStripeBalance()
      .then((balance) => balance.livemode === false ? "test" as const : "live" as const)
      .catch(() => "live" as const),
    dependencies.checkResend().catch(() => false),
  ]);
  return {
    ok: true,
    stripeMode,
    resend,
  };
}

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/health", async (_req, res) => {
  res.json(GetHealthResponse.parse(await integrationHealth()));
});

export default router;
