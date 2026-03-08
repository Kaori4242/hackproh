import { cityProfileMap } from "./cityProfiles.js";
import { config } from "./config.js";
import type { WeatherSnapshot } from "./types.js";

type WeatherConditionResponse = {
  weatherCondition?: {
    description?: {
      text?: string;
    };
  };
  temperature?: {
    degrees?: number;
    unit?: string;
  };
  feelsLikeTemperature?: {
    degrees?: number;
    unit?: string;
  };
  precipitation?: {
    probability?: {
      percent?: number;
    };
  };
  relativeHumidity?: number;
};

type PublicAlertsResponse = {
  weatherAlerts?: Array<{
    alertTitle?: {
      text?: string;
    };
    description?: string;
    severity?: string;
  }>;
};

function buildLocationQuery(city: string): URLSearchParams {
  const location = cityProfileMap.get(city);
  if (!location) {
    throw new Error(`Unsupported city for weather lookup: ${city}`);
  }

  return new URLSearchParams({
    "location.latitude": String(location.lat),
    "location.longitude": String(location.lng),
    unitsSystem: "METRIC",
    languageCode: "en",
    key: config.googleWeatherApiKey
  });
}

export async function getWeatherSnapshot(city: string): Promise<WeatherSnapshot> {
  const cityProfile = cityProfileMap.get(city);

  if (!cityProfile) {
    return {
      summary: "No city-level weather baseline is configured for this business city.",
      alerts: []
    };
  }

  if (!config.googleWeatherApiKey) {
    return {
      summary: `${cityProfile.rainSummary} ${cityProfile.floodSummary} Live Google Weather data is not configured yet.`,
      alerts: []
    };
  }

  const conditionsUrl = `https://weather.googleapis.com/v1/currentConditions:lookup?${buildLocationQuery(city).toString()}`;
  const alertsUrl = `https://weather.googleapis.com/v1/publicAlerts:lookup?${buildLocationQuery(city).toString()}&pageSize=3`;

  const [conditionsResponse, alertsResponse] = await Promise.all([
    fetch(conditionsUrl, { signal: AbortSignal.timeout(12000) }),
    fetch(alertsUrl, { signal: AbortSignal.timeout(12000) })
  ]);

  if (!conditionsResponse.ok) {
    throw new Error(`Weather current conditions request failed with ${conditionsResponse.status}`);
  }

  const currentConditions = (await conditionsResponse.json()) as WeatherConditionResponse;
  const alerts = alertsResponse.ok
    ? ((await alertsResponse.json()) as PublicAlertsResponse)
    : { weatherAlerts: [] };

  const description = currentConditions.weatherCondition?.description?.text ?? "Current conditions unavailable";
  const temperature = currentConditions.temperature?.degrees;
  const feelsLike = currentConditions.feelsLikeTemperature?.degrees;
  const rainProbability = currentConditions.precipitation?.probability?.percent;

  return {
    summary: [
      `${cityProfile.rainSummary} ${cityProfile.floodSummary}`,
      `Live weather: ${description}.`,
      temperature !== undefined ? `Temperature ${temperature}C.` : "",
      feelsLike !== undefined ? `Feels like ${feelsLike}C.` : "",
      rainProbability !== undefined ? `Precipitation probability ${rainProbability}%.` : ""
    ]
      .filter(Boolean)
      .join(" "),
    alerts:
      alerts.weatherAlerts?.map((alert) =>
        [alert.alertTitle?.text, alert.severity, alert.description].filter(Boolean).join(" - ")
      ) ?? []
  };
}

