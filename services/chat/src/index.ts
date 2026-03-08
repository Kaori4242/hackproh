import cors from "cors";
import express, { type Request, type Response, type NextFunction } from "express";
import { adminAuth } from "./firebase.js";
import { config } from "./config.js";
import { generateBusinessAnswer, getBusiness, reindexBusinessKnowledge, retrieveRelevantContext } from "./knowledge.js";
import { getWeatherSnapshot } from "./weather.js";
import type { ChatMessage } from "./types.js";

type AuthedRequest = Request & {
  userId?: string;
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
  const body = request.body as {
    message?: string;
    history?: ChatMessage[];
  };

  if (!body.message?.trim()) {
    response.status(400).send("Message is required.");
    return;
  }

  try {
    const businessId = String(request.params.businessId);
    const business = await getBusiness(businessId);
    if (business.ownerId !== request.userId) {
      response.status(403).send("You do not own this business.");
      return;
    }

    const [retrieval, weather] = await Promise.all([
      retrieveRelevantContext(businessId, body.message),
      getWeatherSnapshot(business.city)
    ]);

    const answer = await generateBusinessAnswer({
      business,
      message: body.message,
      history: Array.isArray(body.history)
        ? body.history.filter(
            (entry, index, array) =>
              !(index === array.length - 1 && entry.role === "user" && entry.text.trim() === body.message?.trim())
          )
        : [],
      weatherSummary: weather.summary,
      weatherAlerts: weather.alerts,
      knowledgeSnippets: retrieval.snippets
    });

    response.json({ answer });
  } catch (error) {
    response.status(500).send(error instanceof Error ? error.message : "Chat failed.");
  }
});

app.listen(config.port, () => {
  console.log(`SME Copilot chat service listening on :${config.port}`);
});
