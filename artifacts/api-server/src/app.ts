import express, { type Express, type Request } from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import pinoHttp from "pino-http";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import type { AuthResolver } from "./routes/agent360";
import { WebhookHandlers } from "./lib/webhookHandlers";

type TestAppOptions = {
  authResolver?: AuthResolver;
};

function createApp(options: TestAppOptions = {}): Express {
  const app: Express = express();

  app.use(
    pinoHttp({
      logger,
      serializers: {
        req(req) {
          return {
            id: req.id,
            method: req.method,
            url: req.url?.split("?")[0],
          };
        },
        res(res) {
          return {
            statusCode: res.statusCode,
          };
        },
      },
    }),
  );
  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    async (req, res): Promise<void> => {
      const signature = req.headers["stripe-signature"];
      if (!signature) {
        res.status(400).json({ error: "Missing Stripe signature." });
        return;
      }
      if (!Buffer.isBuffer(req.body)) {
        req.log.error("Stripe webhook did not receive a raw request body");
        res.status(500).json({ error: "Webhook body could not be verified." });
        return;
      }

      try {
        await WebhookHandlers.processWebhook(
          req.body,
          Array.isArray(signature) ? signature[0] : signature,
        );
        res.status(200).json({ received: true });
      } catch (err) {
        req.log.error({ err }, "Stripe webhook processing failed");
        res.status(400).json({ error: "Webhook verification failed." });
      }
    },
  );
  app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
  app.use(cors({ credentials: true, origin: true }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  if (options.authResolver) {
    app.use((req, _res, next) => {
      (req as Request & { authResolver?: AuthResolver }).authResolver = options.authResolver;
      next();
    });
  } else {
    app.use(
      clerkMiddleware((req) => ({
        publishableKey: publishableKeyFromHost(
          getClerkProxyHost(req) ?? "",
          process.env.CLERK_PUBLISHABLE_KEY,
        ),
      })),
    );
  }

  app.use("/api", router);
  return app;
}

export function createTestApp(options: Required<TestAppOptions>): Express {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("createTestApp can only be used when NODE_ENV=test.");
  }
  return createApp(options);
}

export default createApp();
