import type { CityProfile } from "./types";

export const MALAYSIA_CITIES: CityProfile[] = [
  {
    city: "Kuala Lumpur",
    state: "WP Kuala Lumpur",
    lat: 3.139,
    lng: 101.6869,
    rainSummary: "Frequent convective afternoon rain with two stronger monsoon windows from April-May and October-December.",
    floodSummary: "Urban flash flooding can occur in low-lying roads and river-adjacent areas during intense storms."
  },
  {
    city: "Shah Alam",
    state: "Selangor",
    lat: 3.0733,
    lng: 101.5185,
    rainSummary: "Regular tropical rain, often building in the afternoon with wetter periods during the northeast monsoon.",
    floodSummary: "Drainage overflow and localized flash floods are a recurring business continuity risk."
  },
  {
    city: "George Town",
    state: "Penang",
    lat: 5.4141,
    lng: 100.3288,
    rainSummary: "High annual rainfall with strong inter-monsoon showers and humid coastal conditions.",
    floodSummary: "Short-duration heavy rain can disrupt logistics, especially in older urban drainage zones."
  },
  {
    city: "Johor Bahru",
    state: "Johor",
    lat: 1.4927,
    lng: 103.7414,
    rainSummary: "Rainfall increases sharply in the northeast monsoon, with sustained wet spells late in the year.",
    floodSummary: "Flood exposure is elevated during prolonged monsoon rainfall and river overflow events."
  },
  {
    city: "Kuantan",
    state: "Pahang",
    lat: 3.8077,
    lng: 103.326,
    rainSummary: "One of the wetter east coast cities, especially from November to January.",
    floodSummary: "Seasonal flood risk is materially higher during monsoon months and can affect access and deliveries."
  },
  {
    city: "Kota Bharu",
    state: "Kelantan",
    lat: 6.1254,
    lng: 102.2381,
    rainSummary: "Very wet northeast monsoon season with heavy and persistent rainfall episodes.",
    floodSummary: "Significant monsoon flood exposure. SMEs should expect disruption planning to matter here."
  },
  {
    city: "Ipoh",
    state: "Perak",
    lat: 4.5975,
    lng: 101.0901,
    rainSummary: "Steady tropical rainfall with strong afternoon thunderstorm potential.",
    floodSummary: "Localized flooding is less severe than some east coast cities but still relevant for low-lying districts."
  },
  {
    city: "Kuching",
    state: "Sarawak",
    lat: 1.5533,
    lng: 110.3592,
    rainSummary: "Consistently wet equatorial climate with heavy rainfall distributed through much of the year.",
    floodSummary: "Riverine flooding and saturated ground conditions can impact transport and staffing."
  }
];

export const MALAYSIA_CITY_MAP = new Map(
  MALAYSIA_CITIES.map((entry) => [entry.city, entry])
);

