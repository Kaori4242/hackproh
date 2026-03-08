type CityProfile = {
  city: string;
  state: string;
  lat: number;
  lng: number;
  rainSummary: string;
  floodSummary: string;
};

export const cityProfiles: CityProfile[] = [
  {
    city: "Kuala Lumpur",
    state: "WP Kuala Lumpur",
    lat: 3.139,
    lng: 101.6869,
    rainSummary: "Frequent afternoon convection with meaningful rain peaks during inter-monsoon periods and late-year monsoon flow.",
    floodSummary: "Urban flash floods can affect central roads, access routes, and service windows."
  },
  {
    city: "Shah Alam",
    state: "Selangor",
    lat: 3.0733,
    lng: 101.5185,
    rainSummary: "Consistent tropical rain with wetter stretches when monsoon systems intensify over the Klang Valley.",
    floodSummary: "Local drainage overflow can delay deliveries, commuting, and storefront access."
  },
  {
    city: "George Town",
    state: "Penang",
    lat: 5.4141,
    lng: 100.3288,
    rainSummary: "High humidity and regular heavy showers, especially in afternoon storm windows.",
    floodSummary: "Short but intense flooding events can disrupt dense urban areas and logistics."
  },
  {
    city: "Johor Bahru",
    state: "Johor",
    lat: 1.4927,
    lng: 103.7414,
    rainSummary: "Wet spells strengthen notably during the northeast monsoon and year-end periods.",
    floodSummary: "Extended rain can create higher flood exposure around river basins and low-lying zones."
  },
  {
    city: "Kuantan",
    state: "Pahang",
    lat: 3.8077,
    lng: 103.326,
    rainSummary: "East coast monsoon conditions make this city materially wetter from November through January.",
    floodSummary: "Flood disruption risk is high in monsoon season and should shape staffing and inventory decisions."
  },
  {
    city: "Kota Bharu",
    state: "Kelantan",
    lat: 6.1254,
    lng: 102.2381,
    rainSummary: "Heavy and persistent monsoon rainfall is common late in the year.",
    floodSummary: "Monsoon flooding is a major continuity risk for SMEs here."
  },
  {
    city: "Ipoh",
    state: "Perak",
    lat: 4.5975,
    lng: 101.0901,
    rainSummary: "Stable tropical rainfall pattern with strong afternoon storm potential.",
    floodSummary: "Localized flood risk exists in lower terrain and drainage bottlenecks."
  },
  {
    city: "Kuching",
    state: "Sarawak",
    lat: 1.5533,
    lng: 110.3592,
    rainSummary: "Wet equatorial climate with frequent rain across much of the year.",
    floodSummary: "Riverine flooding and saturated roads can affect staff mobility and delivery timing."
  }
];

export const cityProfileMap = new Map(cityProfiles.map((entry) => [entry.city, entry]));

