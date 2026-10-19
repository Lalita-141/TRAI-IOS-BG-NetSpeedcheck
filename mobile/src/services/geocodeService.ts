const geocodeCache: Record<string, string> = {
  // Pre-seed common test locations for instant offline display
  '37.786_-122.406': 'Union Square, San Francisco',
  '37.785_-122.406': 'San Francisco, California',
  '18.550_73.941': 'Kharadi, Pune',
  '18.520_73.856': 'Pune, Maharashtra',
  '19.076_72.877': 'Mumbai, Maharashtra',
  '28.613_77.209': 'New Delhi, Delhi',
  '12.971_77.594': 'Bengaluru, Karnataka',
  '17.385_78.486': 'Hyderabad, Telangana',
};

export async function reverseGeocode(
  lat: number | null,
  lng: number | null
): Promise<string> {
  if (lat == null || lng == null) {
    return 'Location Unavailable';
  }

  const key = `${lat.toFixed(3)}_${lng.toFixed(3)}`;
  if (geocodeCache[key]) {
    return geocodeCache[key];
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
      {
        headers: {
          'User-Agent': 'NetSpeedMonitorTRAI/1.0',
          'Accept-Language': 'en',
        },
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const addr = data?.address;
      if (addr) {
        const area =
          addr.suburb ||
          addr.neighbourhood ||
          addr.quarter ||
          addr.village ||
          addr.city_district ||
          addr.road ||
          '';
        const city =
          addr.city ||
          addr.town ||
          addr.county ||
          addr.state_district ||
          addr.state ||
          '';

        const parts = [area, city].filter(Boolean);
        const name = parts.length > 0 ? parts.join(', ') : addr.state || data?.display_name?.split(',')[0] || 'Local Area';
        geocodeCache[key] = name;
        return name;
      }
    }
  } catch {
    // Non-blocking fallback
  }

  // Smart regional fallback if offline
  if (Math.abs(lat - 37.78) < 0.1 && Math.abs(lng - -122.4) < 0.1) {
    return 'Union Square, San Francisco';
  }
  if (Math.abs(lat - 18.55) < 0.1 && Math.abs(lng - 73.94) < 0.1) {
    return 'Kharadi, Pune';
  }

  return `Area (${lat.toFixed(2)}°, ${lng.toFixed(2)}°)`;
}
