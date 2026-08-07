import { NextRequest, NextResponse } from "next/server";

type NwsFeature = {
  id: string;
  properties: {
    event?: string;
    headline?: string;
    severity?: string;
    instruction?: string;
  };
};

export async function GET(request: NextRequest) {
  const zip = request.nextUrl.searchParams.get("zip")?.trim();
  if (!zip || !/^\d{5}$/.test(zip)) {
    return NextResponse.json({ error: "Enter a valid five-digit U.S. ZIP code." }, { status: 400 });
  }

  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Air-quality service is not configured." }, { status: 503 });
  }

  try {
    const geoUrl = new URL("https://api.openweathermap.org/geo/1.0/zip");
    geoUrl.searchParams.set("zip", `${zip},US`);
    geoUrl.searchParams.set("appid", key);
    const geoResponse = await fetch(geoUrl, { next: { revalidate: 3600 } });
    let place: { name: string; lat: number; lon: number };
    let useOpenWeather = geoResponse.ok;
    if (geoResponse.ok) {
      place = await geoResponse.json();
    } else {
      const fallbackGeo = await fetch(`https://api.zippopotam.us/us/${zip}`, { next: { revalidate: 86400 } });
      if (!fallbackGeo.ok) return NextResponse.json({ error: "ZIP code not found." }, { status: 404 });
      const data = await fallbackGeo.json();
      const match = data.places?.[0];
      place = { name: match["place name"], lat: Number(match.latitude), lon: Number(match.longitude) };
    }
    const airUrl = new URL("https://api.openweathermap.org/data/2.5/air_pollution");
    airUrl.searchParams.set("lat", String(place.lat));
    airUrl.searchParams.set("lon", String(place.lon));
    airUrl.searchParams.set("appid", key);

    const [airResponse, alertsResponse] = await Promise.all([
      useOpenWeather ? fetch(airUrl, { next: { revalidate: 600 } }) : Promise.resolve(null),
      fetch(`https://api.weather.gov/alerts/active?point=${place.lat},${place.lon}`, {
        headers: { Accept: "application/geo+json", "User-Agent": "SafeSignal/1.0" },
        next: { revalidate: 300 },
      }),
    ]);
    let aqi: number;
    let pollutants: Record<string, number>;
    let updatedAt: string;
    let provider: "OpenWeatherMap" | "Open-Meteo";
    if (airResponse?.ok) {
      const air = await airResponse.json();
      const reading = air.list?.[0];
      if (!reading) throw new Error("No air-quality reading available");
      aqi = reading.main.aqi;
      pollutants = reading.components;
      updatedAt = new Date(reading.dt * 1000).toISOString();
      provider = "OpenWeatherMap";
    } else {
      useOpenWeather = false;
      const fallbackAir = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${place.lat}&longitude=${place.lon}&current=us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone&timezone=auto`, { next: { revalidate: 600 } });
      if (!fallbackAir.ok) throw new Error("Fallback air-quality provider failed");
      const air = await fallbackAir.json();
      const usAqi = Number(air.current.us_aqi);
      aqi = usAqi <= 50 ? 1 : usAqi <= 100 ? 2 : usAqi <= 150 ? 3 : usAqi <= 200 ? 4 : 5;
      pollutants = { pm2_5: air.current.pm2_5, pm10: air.current.pm10, no2: air.current.nitrogen_dioxide, o3: air.current.ozone };
      updatedAt = air.current.time;
      provider = "Open-Meteo";
    }

    let alerts: NwsFeature[] = [];
    if (alertsResponse.ok) {
      const data = await alertsResponse.json();
      alerts = (data.features ?? []).slice(0, 3);
    }

    return NextResponse.json({
      location: { name: place.name, zip, latitude: place.lat, longitude: place.lon },
      aqi,
      pollutants,
      updatedAt,
      provider,
      alerts: alerts.map((alert) => ({
        id: alert.id,
        event: alert.properties.event ?? "Weather alert",
        headline: alert.properties.headline ?? "See official local guidance.",
        severity: alert.properties.severity ?? "Unknown",
        instruction: alert.properties.instruction ?? null,
      })),
    }, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=300" } });
  } catch {
    return NextResponse.json({ error: "Live air-quality data is temporarily unavailable." }, { status: 502 });
  }
}
