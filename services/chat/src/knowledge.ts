import { GoogleGenAI, type Content, type Part } from "@google/genai";
import { PDFParse } from "pdf-parse";
import { adminDb, adminFieldValue, adminStorage } from "./firebase.js";
import { config } from "./config.js";
import type { BusinessRecord, ChatMessage, KnowledgeChunk } from "./types.js";

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSION = 768;

export function shouldIncludeWeatherContext(message: string) {
  return /(weather|rain|flood|storm|climate|monsoon|temperature|humid|precipitation)/i.test(message);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function arrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function materialValue(value: unknown): BusinessRecord["materials"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => {
    const item = entry as Record<string, unknown>;
    return {
      name: stringValue(item.name),
      path: stringValue(item.path),
      downloadURL: stringValue(item.downloadURL),
      contentType: stringValue(item.contentType),
      size: Number(item.size ?? 0),
      uploadedAt: stringValue(item.uploadedAt)
    };
  });
}

export async function getBusiness(businessId: string): Promise<BusinessRecord> {
  const snapshot = await adminDb.collection("businesses").doc(businessId).get();
  if (!snapshot.exists) {
    throw new Error("Business not found.");
  }

  const value = snapshot.data() as Record<string, unknown>;

  return {
    id: snapshot.id,
    ownerId: stringValue(value.ownerId),
    name: stringValue(value.name),
    logoUrl: stringValue(value.logoUrl),
    logoPath: stringValue(value.logoPath),
    description: stringValue(value.description),
    website: stringValue(value.website),
    socialLinks: arrayValue(value.socialLinks),
    referenceLinks: arrayValue(value.referenceLinks),
    city: stringValue(value.city),
    address: stringValue(value.address),
    materials: materialValue(value.materials)
  };
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function stripHtml(input: string): string {
  return normalizeWhitespace(
    input
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

function chunkText(text: string, chunkSize = 1200, overlap = 200): string[] {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return [];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    const end = Math.min(normalized.length, start + chunkSize);
    chunks.push(normalized.slice(start, end));
    if (end === normalized.length) {
      break;
    }
    start = Math.max(0, end - overlap);
  }

  return chunks;
}

async function parseFileContent(material: BusinessRecord["materials"][number]): Promise<string> {
  const bucket = adminStorage.bucket();
  const [buffer] = await bucket.file(material.path).download();

  if (material.contentType.includes("pdf") || material.name.toLowerCase().endsWith(".pdf")) {
    const parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText();
    await parser.destroy();
    return normalizeWhitespace(parsed.text);
  }

  const text = buffer.toString("utf8");
  if (material.contentType.includes("html") || material.name.toLowerCase().endsWith(".html")) {
    return stripHtml(text);
  }

  return normalizeWhitespace(text);
}

async function fetchUrlContent(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "sme-copilot/1.0"
    },
    signal: AbortSignal.timeout(12000)
  });

  if (!response.ok) {
    throw new Error(`Could not fetch ${url}: ${response.status}`);
  }

  const text = await response.text();
  return stripHtml(text);
}

async function embedDocuments(texts: string[]) {
  if (!texts.length) {
    return [];
  }

  const results: Array<{ values?: number[] } | null> = [];

  for (const text of texts) {
    const result = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: [{ parts: [{ text }] }],
      config: {
        outputDimensionality: EMBEDDING_DIMENSION
      }
    });

    results.push(result.embeddings?.[0] ?? null);
  }

  return results;
}

async function replaceChunks(businessId: string, chunks: Omit<KnowledgeChunk, "id">[]) {
  const collectionRef = adminDb.collection("businesses").doc(businessId).collection("knowledgeChunks");
  const existingDocs = await collectionRef.get();

  let batch = adminDb.batch();
  let operations = 0;

  for (const docSnapshot of existingDocs.docs) {
    batch.delete(docSnapshot.ref);
    operations += 1;
    if (operations === 450) {
      await batch.commit();
      batch = adminDb.batch();
      operations = 0;
    }
  }

  if (operations > 0) {
    await batch.commit();
  }

  if (!chunks.length) {
    return;
  }

  batch = adminDb.batch();
  operations = 0;

  for (const chunk of chunks) {
    const ref = collectionRef.doc();
    batch.set(ref, {
      ...chunk,
      embeddingVector: adminFieldValue.vector(chunk.embedding ?? []),
      createdAt: new Date().toISOString()
    });
    operations += 1;
    if (operations === 450) {
      await batch.commit();
      batch = adminDb.batch();
      operations = 0;
    }
  }

  if (operations > 0) {
    await batch.commit();
  }
}

export async function reindexBusinessKnowledge(businessId: string) {
  const business = await getBusiness(businessId);
  const documents: Array<{ sourceLabel: string; sourceType: string; text: string }> = [];

  documents.push({
    sourceLabel: "Business profile",
    sourceType: "business",
    text: [
      `Business name: ${business.name}`,
      `Description: ${business.description}`,
      `City: ${business.city}`,
      `Address: ${business.address}`,
      business.website ? `Website: ${business.website}` : "",
      business.socialLinks.length ? `Social links: ${business.socialLinks.join(", ")}` : "",
      business.referenceLinks.length ? `Reference links: ${business.referenceLinks.join(", ")}` : ""
    ]
      .filter(Boolean)
      .join("\n")
  });

  for (const material of business.materials) {
    try {
      const text = await parseFileContent(material);
      if (text) {
        documents.push({
          sourceLabel: material.name,
          sourceType: "file",
          text
        });
      }
    } catch (error) {
      documents.push({
        sourceLabel: material.name,
        sourceType: "file-note",
        text: `The file ${material.name} exists in storage but could not be parsed. Error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      });
    }
  }

  const urls = [...new Set([business.website, ...business.socialLinks, ...business.referenceLinks].filter(Boolean))];
  for (const url of urls) {
    try {
      const text = await fetchUrlContent(url);
      if (text) {
        documents.push({
          sourceLabel: url,
          sourceType: "url",
          text
        });
      }
    } catch (error) {
      documents.push({
        sourceLabel: url,
        sourceType: "url-note",
        text: `The system could not fetch ${url}. Store the page manually as a file if this source matters. Error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      });
    }
  }

  const sourceChunks = documents.flatMap((document) =>
    chunkText(document.text).map((text) => ({
      sourceLabel: document.sourceLabel,
      sourceType: document.sourceType,
      text
    }))
  );

  const embeddings = await embedDocuments(sourceChunks.map((chunk) => chunk.text));
  const chunkRecords = sourceChunks
    .map((chunk, index) => ({
      businessId: business.id,
      ownerId: business.ownerId,
      ...chunk,
      embedding: embeddings[index]?.values ?? [],
      embeddingModel: EMBEDDING_MODEL,
      embeddingDimension: EMBEDDING_DIMENSION
    }))
    .filter((chunk) => chunk.embedding.length);

  await replaceChunks(businessId, chunkRecords);

  return {
    business,
    chunkCount: chunkRecords.length
  };
}

export async function retrieveRelevantContext(businessId: string, question: string) {
  const business = await getBusiness(businessId);

  const queryEmbeddingResult = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: [{ parts: [{ text: question }] }],
    config: {
      outputDimensionality: EMBEDDING_DIMENSION
    }
  });

  const queryVector = queryEmbeddingResult.embeddings?.[0]?.values ?? [];
  const chunkSnapshot = await adminDb
    .collection("businesses")
    .doc(businessId)
    .collection("knowledgeChunks")
    .findNearest("embeddingVector", queryVector, {
      limit: 6,
      distanceMeasure: "COSINE"
    })
    .get();
  const rankedChunks = chunkSnapshot.docs.map((entry) => entry.data() as KnowledgeChunk);

  return {
    business,
    snippets: rankedChunks.map(
      (chunk) =>
        `Source: ${chunk.sourceLabel}\nType: ${chunk.sourceType}\n${chunk.text}`
    )
  };
}

function historyToContents(history: ChatMessage[]): Content[] {
  return history
    .filter((entry) => entry.text.trim())
    .map((entry) => ({
      role: entry.role === "assistant" ? "model" : "user",
      parts: [{ text: entry.text }] as Part[]
    }));
}

export async function generateBusinessAnswer(input: {
  business: BusinessRecord;
  message: string;
  history: ChatMessage[];
  weatherSummary: string;
  weatherAlerts: string[];
  knowledgeSnippets: string[];
}) {
  const { business, history, knowledgeSnippets, message, weatherAlerts, weatherSummary } = input;
  const includeWeatherContext = shouldIncludeWeatherContext(message);

  const response = await ai.models.generateContent({
    model: "gemini-2.5-pro",
    contents: [
      ...historyToContents(history.slice(-8)),
      {
        role: "user",
        parts: [
          {
            text: [
              `Business profile`,
              `Name: ${business.name}`,
              `Description: ${business.description}`,
              `City: ${business.city}`,
              `Address: ${business.address}`,
              business.website ? `Website: ${business.website}` : "",
              business.socialLinks.length ? `Social links: ${business.socialLinks.join(", ")}` : "",
              "",
              includeWeatherContext
                ? [
                    `Weather and city context`,
                    weatherSummary || "No live weather summary was returned.",
                    weatherAlerts.length ? `Weather alerts: ${weatherAlerts.join(" | ")}` : "Weather alerts: none returned",
                    ""
                  ].join("\n")
                : "",
              `Retrieved knowledge`,
              knowledgeSnippets.length ? knowledgeSnippets.join("\n\n") : "No indexed knowledge available yet.",
              "",
              `User question`,
              message
            ]
              .filter(Boolean)
              .join("\n")
          }
        ]
      }
    ],
    config: {
      systemInstruction: [
        "You are an operations assistant for a Malaysian SME.",
        "Use retrieved uploaded files, links, and business knowledge before making assumptions.",
        "Use weather and flood context only when the user asks about weather, rain, flood, climate, or weather-driven operational impact.",
        "If the user's question needs details from uploaded materials, rely on the retrieved knowledge snippets and say when the source appears incomplete.",
        "If the indexed material is thin or unavailable, say that directly and answer from the available business and city context."
      ].join(" ")
    }
  });

  return response.text ?? "No response generated.";
}
