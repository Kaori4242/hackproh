import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { config } from "./config.js";
import { adminAuth, adminDb } from "./firebase.js";

type AuthedRequest = Request & {
  userId?: string;
};

type TelegramApiResponse<T> = {
  ok: boolean;
  description?: string;
  result?: T;
};

type TelegramGetMeResult = {
  id: number;
  is_bot: boolean;
  username?: string;
  first_name?: string;
};

type TelegramIntegrationDoc = {
  botToken: string;
  botUsername?: string;
  webhookUrl: string;
  active: boolean;
  updatedAt: string;
  updatedBy: string;
};

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: {
      id?: number;
    };
  };
};

const app = express();
app.set("trust proxy", true);

app.use(
  cors({
    origin: config.webOrigin.split(",").map((origin) => origin.trim()),
    credentials: true
  })
);
app.use(express.json({ limit: "2mb" }));

async function requireAuth(request: AuthedRequest, response: Response, next: NextFunction) {
  const authorization = request.header("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    response.status(401).send("Missing Firebase auth token.");
    return;
  }

  try {
    const decoded = await adminAuth.verifyIdToken(authorization.slice("Bearer ".length));
    request.userId = decoded.uid;
    next();
  } catch {
    response.status(401).send("Invalid Firebase auth token.");
  }
}

function maskToken(token: string) {
  if (!token) {
    return "";
  }
  const suffix = token.slice(-6);
  return `${"*".repeat(Math.max(0, token.length - 6))}${suffix}`;
}

function baseUrlFromRequest(request: Request) {
  const protocol = request.header("x-forwarded-proto") ?? request.protocol;
  const host = request.header("x-forwarded-host") ?? request.get("host");
  if (!host) {
    throw new Error("Could not determine public service host for webhook setup.");
  }
  return `${protocol}://${host}`;
}

function decodeBotToken(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function truncateTelegramMessage(text: string, maxLength = 3900) {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 3)}...`;
}

async function telegramApiRequest<T>(botToken: string, method: string, payload?: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: payload ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(12000)
  });

  if (!response.ok) {
    throw new Error(`Telegram API ${method} failed with status ${response.status}.`);
  }

  const result = (await response.json()) as TelegramApiResponse<T>;
  if (!result.ok) {
    throw new Error(result.description ?? `Telegram API ${method} failed.`);
  }

  return result.result;
}

async function sendTelegramMessage(botToken: string, chatId: number, text: string) {
  await telegramApiRequest(botToken, "sendMessage", {
    chat_id: chatId,
    text: truncateTelegramMessage(text)
  });
}

async function verifyOwnerAccessOrThrow(businessId: string, userId: string) {
  const businessRef = adminDb.collection("businesses").doc(businessId);
  const businessSnapshot = await businessRef.get();
  if (!businessSnapshot.exists) {
    throw new Error("Business not found.");
  }

  const business = businessSnapshot.data() as { ownerId?: string };
  if (business.ownerId !== userId) {
    throw new Error("FORBIDDEN");
  }
}

async function getIntegrationDoc(businessId: string) {
  const integrationRef = adminDb.collection("businesses").doc(businessId).collection("integrations").doc("telegram");
  const integrationSnapshot = await integrationRef.get();
  return {
    integrationRef,
    integrationSnapshot
  };
}

async function buildConsultationAnswer(businessId: string, message: string) {
  const response = await fetch(`${config.chatServiceUrl}/api/internal/businesses/${businessId}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-service-token": config.internalServiceToken
    },
    body: JSON.stringify({
      message,
      history: [],
      model: "gemini-2.5-flash"
    }),
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const payload = (await response.json()) as { answer: string };
  return payload.answer;
}

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/integrations/telegram/:businessId", requireAuth, async (request: AuthedRequest, response: Response) => {
  try {
    const businessId = String(request.params.businessId);
    await verifyOwnerAccessOrThrow(businessId, String(request.userId));

    const { integrationSnapshot } = await getIntegrationDoc(businessId);
    if (!integrationSnapshot.exists) {
      response.json({
        configured: false
      });
      return;
    }

    const integration = integrationSnapshot.data() as TelegramIntegrationDoc;
    response.json({
      configured: true,
      botUsername: integration.botUsername ?? "",
      maskedToken: maskToken(integration.botToken),
      webhookUrl: integration.webhookUrl,
      updatedAt: integration.updatedAt
    });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      response.status(403).send("You do not own this business.");
      return;
    }
    response.status(500).send(error instanceof Error ? error.message : "Could not load Telegram integration.");
  }
});

app.post("/api/integrations/telegram", requireAuth, async (request: AuthedRequest, response: Response) => {
  const body = request.body as {
    businessId?: string;
    botToken?: string;
  };

  const businessId = String(body.businessId ?? "").trim();
  const botToken = String(body.botToken ?? "").trim();

  if (!businessId || !botToken) {
    response.status(400).send("businessId and botToken are required.");
    return;
  }

  try {
    await verifyOwnerAccessOrThrow(businessId, String(request.userId));
    const getMe = await telegramApiRequest<TelegramGetMeResult>(botToken, "getMe");

    const webhookUrl = `${baseUrlFromRequest(request)}/webhooks/telegram/${businessId}/${encodeURIComponent(botToken)}`;
    await telegramApiRequest(botToken, "setWebhook", {
      url: webhookUrl,
      allowed_updates: ["message"]
    });

    const { integrationRef } = await getIntegrationDoc(businessId);
    await integrationRef.set({
      botToken,
      botUsername: getMe?.username ?? "",
      webhookUrl,
      active: true,
      updatedAt: new Date().toISOString(),
      updatedBy: String(request.userId)
    } satisfies TelegramIntegrationDoc);

    response.json({
      ok: true,
      configured: true,
      botUsername: getMe?.username ?? "",
      maskedToken: maskToken(botToken),
      webhookUrl
    });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      response.status(403).send("You do not own this business.");
      return;
    }
    response.status(500).send(error instanceof Error ? error.message : "Telegram setup failed.");
  }
});

app.post("/webhooks/telegram/:businessId/:botToken", async (request: Request, response: Response) => {
  const businessId = String(request.params.businessId);
  const botToken = decodeBotToken(String(request.params.botToken));
  const update = request.body as TelegramUpdate;
  const messageText = update.message?.text?.trim();
  const chatId = update.message?.chat?.id;

  if (!messageText || !chatId) {
    response.json({ ok: true });
    return;
  }

  try {
    const { integrationSnapshot } = await getIntegrationDoc(businessId);
    if (!integrationSnapshot.exists) {
      response.status(404).send("Integration not configured.");
      return;
    }

    const integration = integrationSnapshot.data() as TelegramIntegrationDoc;
    if (!integration.active || integration.botToken !== botToken) {
      response.status(401).send("Telegram token mismatch.");
      return;
    }

    const answer = await buildConsultationAnswer(businessId, messageText);
    await sendTelegramMessage(botToken, chatId, answer);

    response.json({ ok: true });
  } catch (error) {
    try {
      await sendTelegramMessage(
        botToken,
        chatId,
        "I couldn't process this request right now. Please try again in a moment."
      );
    } catch {
      // Ignore reply failures here to keep webhook fast and idempotent.
    }

    response.status(500).send(error instanceof Error ? error.message : "Telegram webhook processing failed.");
  }
});

app.listen(config.port, () => {
  console.log(`SME Copilot Telegram service listening on :${config.port}`);
});
