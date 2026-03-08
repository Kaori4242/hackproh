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
  chatServiceUrl: required("CHAT_SERVICE_URL").replace(/\/$/, ""),
  internalServiceToken: required("INTERNAL_SERVICE_TOKEN"),
  projectId: process.env.GOOGLE_CLOUD_PROJECT ?? "hackproj-a8b50"
};
