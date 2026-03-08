export type CityProfile = {
  city: string;
  state: string;
  lat: number;
  lng: number;
  rainSummary: string;
  floodSummary: string;
};

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
  logoUrl: string;
  logoPath: string;
  description: string;
  website: string;
  socialLinks: string[];
  referenceLinks: string[];
  city: string;
  address: string;
  materials: MaterialRef[];
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type BusinessInput = Omit<
  BusinessRecord,
  "id" | "ownerId" | "materials" | "createdAt" | "updatedAt"
>;

export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};
