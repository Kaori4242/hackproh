export type MaterialRef = {
  name: string;
  path: string;
  downloadURL: string;
  contentType: string;
  size: number;
  uploadedAt: string;
};

export type BusinessRecord = {
  id: string;
  ownerId: string;
  name: string;
  logoUrl?: string;
  logoPath?: string;
  description: string;
  website: string;
  socialLinks: string[];
  referenceLinks: string[];
  city: string;
  address: string;
  materials: MaterialRef[];
};

export type KnowledgeChunk = {
  id?: string;
  businessId: string;
  ownerId: string;
  text: string;
  embedding?: number[];
  embeddingModel: string;
  embeddingDimension: number;
  sourceLabel: string;
  sourceType: string;
  sourcePath?: string;
  vectorDistance?: number;
};

export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};

export type WeatherSnapshot = {
  summary: string;
  alerts: string[];
};
