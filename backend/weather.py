"""
Historical weather lookup via Open-Meteo archive API.
Free, no API key required. Data available from 1940 onward.
"""

import httpx

# City → (lat, lon) for BC municipalities in the dataset
CITY_COORDS = {
    "vancouver":        (49.2827, -123.1207),
    "surrey":           (49.1913, -122.8490),
    "new westminster":  (49.2059, -122.9115),
    "burnaby":          (49.2488, -122.9805),
    "richmond":         (49.1666, -123.1336),
    "north vancouver":  (49.3198, -123.0726),
    "west vancouver":   (49.3704, -123.2279),
    "coquitlam":        (49.2838, -122.7932),
    "port coquitlam":   (49.2624, -122.7810),
    "langley":          (49.1044, -122.6588),
    "abbotsford":       (49.0504, -122.3045),
    "chilliwack":       (49.1578, -121.9519),
    "maple ridge":      (49.2193, -122.5985),
    "delta":            (49.0847, -123.0583),
    "white rock":       (49.0251, -122.8027),
}

# WMO weather code → human description
WMO_CODES = {
    0: "Clear sky",
    1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Icy fog",
    51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
    61: "Light rain", 63: "Rain", 65: "Heavy rain",
    71: "Light snow", 73: "Snow", 75: "Heavy snow",
    77: "Snow grains",
    80: "Light rain showers", 81: "Rain showers", 82: "Heavy rain showers",
    85: "Snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with hail", 99: "Thunderstorm with heavy hail",
}


def _city_coords(city: str):
    """Return (lat, lon) for a city string, or None if not found."""
    if not city:
        return None
    low = city.lower().strip()
    # Direct match
    if low in CITY_COORDS:
        return CITY_COORDS[low]
    # Partial match (e.g. "Vancouver/Burnaby" → Vancouver)
    for key, coords in CITY_COORDS.items():
        if key in low:
            return coords
    return None


def fetch_weather(date: str, city: str, hour: int | None = None) -> dict:
    """
    Fetch historical weather for a given date and city.

    Args:
        date: "YYYY-MM-DD"
        city: city name string (matched against CITY_COORDS)
        hour: 0–23 (incident hour in local time). If None, returns daily summary.

    Returns dict with keys:
        temp_c, feels_like_c, precip_mm, wind_kmh, weather_code,
        weather_desc, time_of_day, is_daytime, error (if any)
    """
    coords = _city_coords(city)
    if not coords:
        return {"error": f"No coordinates for city: {city}"}

    lat, lon = coords

    try:
        resp = httpx.get(
            "https://archive-api.open-meteo.com/v1/archive",
            params={
                "latitude": lat,
                "longitude": lon,
                "start_date": date,
                "end_date": date,
                "hourly": "temperature_2m,apparent_temperature,precipitation,weathercode,windspeed_10m,is_day",
                "timezone": "America/Vancouver",
            },
            timeout=12,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        return {"error": str(e)}

    hourly = data.get("hourly", {})
    temps   = hourly.get("temperature_2m", [])
    feels   = hourly.get("apparent_temperature", [])
    precips = hourly.get("precipitation", [])
    codes   = hourly.get("weathercode", [])
    winds   = hourly.get("windspeed_10m", [])
    is_day  = hourly.get("is_day", [])

    if not temps:
        return {"error": "No hourly data returned"}

    if hour is not None and 0 <= hour < len(temps):
        idx = hour
    else:
        # Use midday (12:00) as default representative hour
        idx = 12 if len(temps) > 12 else 0

    code = codes[idx] if idx < len(codes) else 0

    return {
        "date": date,
        "city": city,
        "hour_used": idx,
        "temp_c": round(temps[idx], 1) if idx < len(temps) else None,
        "feels_like_c": round(feels[idx], 1) if idx < len(feels) else None,
        "precip_mm": round(precips[idx], 1) if idx < len(precips) else None,
        "wind_kmh": round(winds[idx], 1) if idx < len(winds) else None,
        "weather_code": code,
        "weather_desc": WMO_CODES.get(code, f"Code {code}"),
        "is_daytime": bool(is_day[idx]) if idx < len(is_day) else None,
        # Daily summary stats
        "daily_max_c": round(max(t for t in temps if t is not None), 1) if temps else None,
        "daily_min_c": round(min(t for t in temps if t is not None), 1) if temps else None,
        "daily_precip_mm": round(sum(p for p in precips if p is not None), 1) if precips else None,
    }
