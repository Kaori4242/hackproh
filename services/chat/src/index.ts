import cors from "cors";
import express, { type Request, type Response, type NextFunction } from "express";
import { adminAuth } from "./firebase.js";
import { config } from "./config.js";
import {
  generateBusinessAnswer,
  getBusiness,
  reindexBusinessKnowledge,
  retrieveRelevantContext,
  shouldIncludeWeatherContext
} from "./knowledge.js";
import { getWeatherSnapshot } from "./weather.js";
import type { ChatMessage } from "./types.js";

type AuthedRequest = Request & {
  userId?: string;
};

type ChatRequestBody = {
  message?: string;
  history?: ChatMessage[];
  model?: string;
};

const app = express();

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

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

function normalizeHistory(history: ChatMessage[] | undefined, message: string) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history.filter(
    (entry, index, array) => !(index === array.length - 1 && entry.role === "user" && entry.text.trim() === message.trim())
  );
}

async function buildBusinessAnswer(params: {
  businessId: string;
  message: string;
  history: ChatMessage[];
  ownerId?: string;
  model?: string;
}) {
  const { businessId, history, message, ownerId, model } = params;
  const business = await getBusiness(businessId);

  if (ownerId && business.ownerId !== ownerId) {
    return {
      forbidden: true as const
    };
  }

  const includeWeatherContext = shouldIncludeWeatherContext(message);
  const [retrieval, weather] = await Promise.all([
    retrieveRelevantContext(businessId, message),
    includeWeatherContext ? getWeatherSnapshot(business.city) : Promise.resolve({ summary: "", alerts: [] })
  ]);

  const answer = await generateBusinessAnswer({
    business,
    message,
    history: normalizeHistory(history, message),
    weatherSummary: weather.summary,
    weatherAlerts: weather.alerts,
    knowledgeSnippets: retrieval.snippets,
    model
  });

  return {
    forbidden: false as const,
    answer
  };
}

app.post("/api/businesses/:businessId/reindex", requireAuth, async (request: AuthedRequest, response: Response) => {
  try {
    const businessId = String(request.params.businessId);
    const business = await getBusiness(businessId);
    if (business.ownerId !== request.userId) {
      response.status(403).send("You do not own this business.");
      return;
    }

    const result = await reindexBusinessKnowledge(businessId);
    response.json({
      ok: true,
      chunkCount: result.chunkCount
    });
  } catch (error) {
    response.status(500).send(error instanceof Error ? error.message : "Reindex failed.");
  }
});

app.post("/api/businesses/:businessId/chat", requireAuth, async (request: AuthedRequest, response: Response) => {
  const body = request.body as ChatRequestBody;

  if (!body.message?.trim()) {
    response.status(400).send("Message is required.");
    return;
  }

  try {
    const result = await buildBusinessAnswer({
      businessId: String(request.params.businessId),
      message: body.message,
      history: body.history ?? [],
      ownerId: request.userId,
      model: "gemini-2.5-pro"
    });

    if (result.forbidden) {
      response.status(403).send("You do not own this business.");
      return;
    }

    response.json({ answer: result.answer });
  } catch (error) {
    response.status(500).send(error instanceof Error ? error.message : "Chat failed.");
  }
});

app.post("/api/internal/businesses/:businessId/chat", async (request: Request, response: Response) => {
  if (!config.internalServiceToken) {
    response.status(503).send("Internal service token is not configured.");
    return;
  }

  const token = request.header("x-internal-service-token");
  if (!token || token !== config.internalServiceToken) {
    response.status(401).send("Invalid internal service token.");
    return;
  }

  const body = request.body as ChatRequestBody;
  if (!body.message?.trim()) {
    response.status(400).send("Message is required.");
    return;
  }

  try {
    const result = await buildBusinessAnswer({
      businessId: String(request.params.businessId),
      message: body.message,
      history: body.history ?? [],
      model: body.model?.trim() || "gemini-2.5-flash"
    });
    if (result.forbidden) {
      response.status(403).send("Business access denied.");
      return;
    }
    response.json({ answer: result.answer });
  } catch (error) {
    response.status(500).send(error instanceof Error ? error.message : "Internal chat failed.");
  }
});

app.listen(config.port, () => {
  console.log(`SME Copilot chat service listening on :${config.port}`);
});
