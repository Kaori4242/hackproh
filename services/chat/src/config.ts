function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  geminiApiKey: required("GEMINI_API_KEY"),
  googleWeatherApiKey: process.env.GOOGLE_WEATHER_API_KEY ?? "",
  firebaseStorageBucket: process.env.FIREBASE_STORAGE_BUCKET ?? "",
  projectId: process.env.GOOGLE_CLOUD_PROJECT ?? "hackproj-a8b50"
};

