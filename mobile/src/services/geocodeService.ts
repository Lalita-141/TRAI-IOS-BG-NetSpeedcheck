import { getConfig } from '../config';

const geocodeCache: Record<string, string> = {};

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

  // 1. Try backend server proxy /v1/locations/reverse first
  try {
    const config = await getConfig();
    const serverUrl = config.serverUrl.replace(/\/+$/, '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(`${serverUrl}/v1/locations/reverse?lat=${lat}&lng=${lng}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data?.display_name) {
        geocodeCache[key] = data.display_name;
        return data.display_name;
      }
    }
  } catch {
    // Fallback to direct geocoding if server proxy unavailable
  }

  // 2. Direct Nominatim fallback
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
      {
        headers: {
          'User-Agent': 'NetSpeed QoS Monitor (info@handt.ai)',
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
        const name = parts.length > 0 ? parts.join(', ') : addr.state || data?.display_name?.split(',')[0] || `Area (${lat.toFixed(2)}°, ${lng.toFixed(2)}°)`;
        geocodeCache[key] = name;
        return name;
      }
    }
  } catch {
    // Non-blocking fallback
  }

  // Unresolved (e.g. offline): show the real coordinates
  return `Area (${lat.toFixed(2)}°, ${lng.toFixed(2)}°)`;
}
