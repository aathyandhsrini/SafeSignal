"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Language = "en" | "es" | "zh" | "hi";
type AlertItem = { id: string; event: string; headline: string; severity: string; instruction?: string; expires?: string };
type Place = { name: string; state: string; latitude: number; longitude: number };
type Result = { place: Place; aqi: number; pm25: number | null; updated: string; alerts: AlertItem[] };

const copy = {
  en: { label: "English", title: "Know what’s happening near you.", intro: "Live air quality and official weather alerts, explained simply.", zip: "U.S. ZIP code", check: "Check my area", low: "Low-data mode", notify: "Alert me", good: "Air is good", moderate: "Take care", unhealthy: "Air is unhealthy", danger: "Dangerous air", noAlerts: "No active weather alerts", official: "Official safety instructions", updated: "Updated", error: "We couldn’t load that area. Check the ZIP code and try again.", tipGood: "It is safe for most people to be outside.", tipModerate: "People with asthma or heart conditions should take breaks outdoors.", tipUnhealthy: "Stay indoors when possible. Close windows and use a well-fitting mask outside.", tipDanger: "Stay indoors. Close windows. Use an air filter if available. Follow local emergency guidance.", permission: "Keep this tab open and we’ll notify you if conditions worsen." },
  es: { label: "Español", title: "Sepa qué pasa cerca de usted.", intro: "Calidad del aire y alertas oficiales, explicadas de forma sencilla.", zip: "Código postal de EE. UU.", check: "Revisar mi zona", low: "Modo de pocos datos", notify: "Avisarme", good: "El aire está bien", moderate: "Tenga cuidado", unhealthy: "El aire no es saludable", danger: "Aire peligroso", noAlerts: "No hay alertas meteorológicas activas", official: "Instrucciones oficiales de seguridad", updated: "Actualizado", error: "No pudimos cargar esa zona. Revise el código postal.", tipGood: "Es seguro estar afuera para la mayoría de las personas.", tipModerate: "Las personas con asma o problemas cardíacos deben descansar al aire libre.", tipUnhealthy: "Quédese adentro si puede. Cierre las ventanas y use una mascarilla bien ajustada afuera.", tipDanger: "Quédese adentro. Cierre las ventanas. Use un filtro de aire y siga las indicaciones locales.", permission: "Mantenga esta pestaña abierta y le avisaremos si empeoran las condiciones." },
  zh: { label: "中文", title: "了解您附近正在发生什么。", intro: "实时空气质量和官方天气警报，简单易懂。", zip: "美国邮政编码", check: "查看我的地区", low: "低流量模式", notify: "提醒我", good: "空气良好", moderate: "请注意", unhealthy: "空气不健康", danger: "空气危险", noAlerts: "目前没有天气警报", official: "官方安全说明", updated: "更新时间", error: "无法加载该地区。请检查邮政编码。", tipGood: "大多数人可以安全地进行户外活动。", tipModerate: "哮喘或心脏病患者在户外应多休息。", tipUnhealthy: "尽量留在室内。关好窗户，外出时佩戴贴合面部的口罩。", tipDanger: "留在室内，关好窗户。如有条件请使用空气净化器，并遵循当地指示。", permission: "请保持此页面打开，情况恶化时我们会通知您。" },
  hi: { label: "हिन्दी", title: "जानें आपके आस-पास क्या हो रहा है।", intro: "लाइव वायु गुणवत्ता और सरकारी मौसम चेतावनी, आसान भाषा में।", zip: "अमेरिकी ज़िप कोड", check: "मेरा क्षेत्र देखें", low: "कम-डेटा मोड", notify: "मुझे चेतावनी दें", good: "हवा अच्छी है", moderate: "सावधानी रखें", unhealthy: "हवा अस्वस्थ है", danger: "हवा खतरनाक है", noAlerts: "मौसम की कोई सक्रिय चेतावनी नहीं", official: "सरकारी सुरक्षा निर्देश", updated: "अपडेट", error: "यह क्षेत्र लोड नहीं हुआ। ज़िप कोड जाँचकर फिर कोशिश करें।", tipGood: "अधिकतर लोगों के लिए बाहर जाना सुरक्षित है।", tipModerate: "अस्थमा या दिल की बीमारी वाले लोग बाहर आराम लेते रहें।", tipUnhealthy: "हो सके तो अंदर रहें। खिड़कियाँ बंद रखें और बाहर सही फिट वाला मास्क पहनें।", tipDanger: "अंदर रहें और खिड़कियाँ बंद रखें। एयर फ़िल्टर हो तो चलाएँ और स्थानीय निर्देश मानें।", permission: "यह टैब खुला रखें; स्थिति बिगड़ने पर हम आपको बताएँगे।" },
} as const;

function level(aqi: number) { return aqi <= 50 ? "good" : aqi <= 100 ? "moderate" : aqi <= 200 ? "unhealthy" : "danger"; }

export default function Home() {
  const [lang, setLang] = useState<Language>("en");
  const [zip, setZip] = useState("90210");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [lowData, setLowData] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const t = copy[lang];

  const safety = useMemo(() => result ? t[`tip${level(result.aqi)[0].toUpperCase()}${level(result.aqi).slice(1)}` as keyof typeof t] : "", [result, t]);

  async function loadArea(chosenZip = zip, quiet = false) {
    if (!/^\d{5}$/.test(chosenZip)) { setError(true); return; }
    if (!quiet) setLoading(true);
    setError(false);
    try {
      const geoResponse = await fetch(`https://api.zippopotam.us/us/${chosenZip}`);
      if (!geoResponse.ok) throw new Error("ZIP not found");
      const geo = await geoResponse.json();
      const first = geo.places[0];
      const place: Place = { name: first["place name"], state: first["state abbreviation"], latitude: Number(first.latitude), longitude: Number(first.longitude) };
      const [airResponse, alertResponse] = await Promise.all([
        fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${place.latitude}&longitude=${place.longitude}&current=us_aqi,pm2_5&timezone=auto`),
        fetch(`https://api.weather.gov/alerts/active?point=${place.latitude},${place.longitude}`, { headers: { Accept: "application/geo+json" } }),
      ]);
      if (!airResponse.ok) throw new Error("Air data unavailable");
      const air = await airResponse.json();
      const weather = alertResponse.ok ? await alertResponse.json() : { features: [] };
      const next: Result = {
        place,
        aqi: Math.round(air.current.us_aqi),
        pm25: air.current.pm2_5 ?? null,
        updated: air.current.time,
        alerts: weather.features.slice(0, 3).map((item: any) => ({ id: item.id, event: item.properties.event, headline: item.properties.headline, severity: item.properties.severity, instruction: item.properties.instruction, expires: item.properties.expires })),
      };
      if (quiet && notifications && result && level(next.aqi) !== level(result.aqi) && "Notification" in window && Notification.permission === "granted") {
        new Notification(`${next.place.name}: AQI ${next.aqi}`, { body: copy[lang][level(next.aqi)] });
      }
      setResult(next);
      localStorage.setItem("safesignal-zip", chosenZip);
    } catch { setError(true); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    const saved = localStorage.getItem("safesignal-zip");
    if (saved) { setZip(saved); loadArea(saved); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!result || lowData) return;
    const timer = window.setInterval(() => loadArea(zip, true), 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.place.name, lowData, zip, notifications, lang]);

  async function enableNotifications() {
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    setNotifications(permission === "granted");
  }

  function submit(event: FormEvent) { event.preventDefault(); loadArea(); }
  const currentLevel = result ? level(result.aqi) : "good";

  return (
    <main>
      <nav aria-label="Site navigation"><a className="brand" href="#top"><span>●</span> SafeSignal</a><select aria-label="Language" value={lang} onChange={e => setLang(e.target.value as Language)}>{Object.entries(copy).map(([key, value]) => <option value={key} key={key}>{value.label}</option>)}</select></nav>
      <section id="top" className="hero">
        <div className="eyebrow">AIR + WEATHER · UNITED STATES</div>
        <h1>{t.title}</h1><p>{t.intro}</p>
        <form onSubmit={submit}><label htmlFor="zip">{t.zip}</label><div className="search"><input id="zip" inputMode="numeric" maxLength={5} pattern="[0-9]{5}" value={zip} onChange={e => setZip(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 90210"/><button disabled={loading}>{loading ? "…" : t.check}</button></div></form>
        <div className="preferences"><label><input type="checkbox" checked={lowData} onChange={e => setLowData(e.target.checked)}/> {t.low}</label><span>•</span><span>No account needed</span></div>
        {error && <p className="error" role="alert">{t.error}</p>}
      </section>

      {result && <section className="results" aria-live="polite">
        <div className={`status ${currentLevel}`}><div><span className="location">{result.place.name}, {result.place.state}</span><div className="aqi"><strong>{result.aqi}</strong><span>US AQI<br/>{result.pm25 !== null && !lowData ? `PM2.5 ${result.pm25} μg/m³` : ""}</span></div></div><div className="verdict"><span>{t[currentLevel]}</span><p>{safety}</p></div></div>
        <div className="actions"><button className="notify" onClick={enableNotifications} disabled={notifications}>{notifications ? "✓ " : "○ "}{t.notify}</button><p>{t.permission}</p></div>
        <div className="alert-list"><div className="section-title"><h2>Weather alerts</h2><span>{result.alerts.length} ACTIVE</span></div>{result.alerts.length === 0 ? <div className="clear"><span>✓</span><div><strong>{t.noAlerts}</strong><p>We’ll keep checking this area.</p></div></div> : result.alerts.map(alert => <article className="weather-alert" key={alert.id}><div className="severity">{alert.severity}</div><h3>{alert.event}</h3><p>{alert.headline}</p>{alert.instruction && !lowData && <details><summary>{t.official}</summary><p>{alert.instruction}</p></details>}</article>)}</div>
        <p className="timestamp">{t.updated}: {new Date(result.updated).toLocaleString(lang)} · Air data: Open-Meteo/CAMS · Alerts: NOAA/NWS</p>
      </section>}

      <section className="how"><div><span>01</span><h2>Enter a ZIP</h2><p>We turn it into a location—no precise GPS needed.</p></div><div><span>02</span><h2>Check trusted sources</h2><p>We ask live air-quality and government alert APIs.</p></div><div><span>03</span><h2>Act with confidence</h2><p>Get one clear instruction in your chosen language.</p></div></section>
      <footer><strong>SafeSignal</strong><p>For awareness only. During an emergency, follow local authorities and call 911 when immediate help is needed.</p></footer>
    </main>
  );
}
