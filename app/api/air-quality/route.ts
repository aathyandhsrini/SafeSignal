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
    if (!geoResponse.ok) {
      return NextResponse.json({ error: "ZIP code not found." }, { status: geoResponse.status === 404 ? 404 : 502 });
    }

    const place = await geoResponse.json();
    const airUrl = new URL("https://api.openweathermap.org/data/2.5/air_pollution");
    airUrl.searchParams.set("lat", String(place.lat));
    airUrl.searchParams.set("lon", String(place.lon));
    airUrl.searchParams.set("appid", key);

    const [airResponse, alertsResponse] = await Promise.all([
      fetch(airUrl, { next: { revalidate: 600 } }),
      fetch(`https://api.weather.gov/alerts/active?point=${place.lat},${place.lon}`, {
        headers: { Accept: "application/geo+json", "User-Agent": "SafeSignal/1.0" },
        next: { revalidate: 300 },
      }),
    ]);
    if (!airResponse.ok) throw new Error("Air-quality provider failed");

    const air = await airResponse.json();
    const reading = air.list?.[0];
    if (!reading) throw new Error("No air-quality reading available");

    let alerts: NwsFeature[] = [];
    if (alertsResponse.ok) {
      const data = await alertsResponse.json();
      alerts = (data.features ?? []).slice(0, 3);
    }

    return NextResponse.json({
      location: { name: place.name, zip, latitude: place.lat, longitude: place.lon },
      aqi: reading.main.aqi,
      pollutants: reading.components,
      updatedAt: new Date(reading.dt * 1000).toISOString(),
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
