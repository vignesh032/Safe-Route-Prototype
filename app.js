let map;
let routeLayers = [];
let hotspotLayers = [];

const HYDERABAD_CENTER = [17.385044, 78.486671];

document.addEventListener("DOMContentLoaded", initMap);

function initMap() {
  map = L.map("map", { zoomControl: true }).setView(HYDERABAD_CENTER, 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  renderHotspots();

  document.getElementById("routeBtn").addEventListener("click", onFindRoutes);
  document.getElementById("from").addEventListener("keydown", onEnterSearch);
  document.getElementById("to").addEventListener("keydown", onEnterSearch);
}

function renderHotspots() {
  HYDERABAD_CRIME_HOTSPOTS.forEach((spot) => {
    const circle = L.circle([spot.lat, spot.lng], {
      radius: 210 + spot.weight * 120,
      color: "#9b111e",
      weight: 1,
      fillColor: "#d62828",
      fillOpacity: 0.2 + Math.min(spot.weight, 1) * 0.2
    }).addTo(map);

    hotspotLayers.push(circle);
  });
}

async function onFindRoutes() {
  const from = document.getElementById("from").value.trim();
  const to = document.getElementById("to").value.trim();

  if (!from || !to) {
    setError("Please enter both From and To locations.");
    return;
  }

  setLoading(true);
  setError("");
  clearRoutes();

  try {
    const [origin, destination] = await Promise.all([
      geocodePlace(from),
      geocodePlace(to)
    ]);

    const routes = await fetchRoutes(origin, destination);
    if (!routes.length) {
      throw new Error("No drivable routes found.");
    }

    const analyzed = routes.map((route, index) => analyzeRoute(route, index));
    analyzed.sort((a, b) => a.distanceMeters - b.distanceMeters);

    const shortest = analyzed[0];
    const safer = analyzed.reduce((best, current) => (
      current.riskScore < best.riskScore ? current : best
    ), analyzed[0]);

    drawRoute(shortest, "shortest");
    if (safer.index !== shortest.index) {
      drawRoute(safer, "safer");
    }

    showCards(shortest, safer, analyzed.length);
    fitToSelectedRoutes(shortest, safer);
  } catch (err) {
    setError(err && err.message ? err.message : "Could not calculate route.");
    console.error(err);
  } finally {
    setLoading(false);
  }
}

async function geocodePlace(query) {
  const direct = parseLatLng(query);
  if (direct) {
    return direct;
  }

  const fullQuery = `${query}, Hyderabad, India`;

  const nominatim = await geocodeNominatim(fullQuery);
  if (nominatim) {
    return nominatim;
  }

  const photon = await geocodePhoton(fullQuery);
  if (photon) {
    return photon;
  }

  throw new Error("Could not find one of the locations. Try area names like Gachibowli or Secunderabad.");
}

async function fetchRoutes(origin, destination) {
  const coords = `${origin[1]},${origin[0]};${destination[1]},${destination[0]}`;
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?alternatives=true&overview=full&geometries=geojson&steps=true`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Routing service failed. Please try again.");
  }

  const data = await response.json();
  if (data.code !== "Ok") {
    throw new Error("Route service error: " + data.code);
  }

  return data.routes || [];
}

function analyzeRoute(route, index) {
  const distanceMeters = route.distance || 0;
  const durationSeconds = route.duration || 0;
  const path = route.geometry && route.geometry.coordinates ? route.geometry.coordinates : [];

  let riskScore = 0;

  for (const coord of path) {
    const lat = coord[1];
    const lng = coord[0];

    for (const spot of HYDERABAD_CRIME_HOTSPOTS) {
      const meters = haversineMeters(lat, lng, spot.lat, spot.lng);
      if (meters < 350) {
        riskScore += ((350 - meters) / 350) * spot.weight;
      }
    }
  }

  return { index, route, distanceMeters, durationSeconds, riskScore };
}

function drawRoute(analyzedRoute, kind) {
  const color = kind === "shortest" ? "#e07a5f" : "#2a9d8f";
  const coords = analyzedRoute.route?.geometry?.coordinates || [];
  if (!coords.length) {
    return;
  }
  const latLngs = coords.map((c) => [c[1], c[0]]);

  const line = L.polyline(latLngs, {
    color,
    weight: kind === "shortest" ? 6 : 5,
    opacity: 0.9
  }).addTo(map);

  routeLayers.push(line);
}

function fitToSelectedRoutes(shortest, safer) {
  const allPoints = [];
  shortest.route.geometry.coordinates.forEach((c) => allPoints.push([c[1], c[0]]));

  if (safer.index !== shortest.index) {
    safer.route.geometry.coordinates.forEach((c) => allPoints.push([c[1], c[0]]));
  }

  if (allPoints.length) {
    map.fitBounds(allPoints, { padding: [50, 50] });
  }
}

function showCards(shortest, safer, totalRoutes) {
  const cardsEl = document.getElementById("routeCards");
  cardsEl.innerHTML = "";

  cardsEl.appendChild(buildCard("Shortest", shortest, "shortest"));

  if (safer.index === shortest.index) {
    const note = document.createElement("p");
    note.className = "muted";
    note.textContent = "The shortest route is also the safest among available alternatives.";
    cardsEl.appendChild(note);
  } else {
    cardsEl.appendChild(buildCard("Safer", safer, "safer"));
    const delta = ((shortest.riskScore - safer.riskScore) / Math.max(shortest.riskScore, 1)) * 100;
    const info = document.createElement("p");
    info.className = "muted";
    info.textContent = `Safer route reduces risk score by about ${Math.max(0, delta).toFixed(1)}% compared to shortest.`;
    cardsEl.appendChild(info);
  }

  const foot = document.createElement("p");
  foot.className = "muted";
  foot.textContent = `Routing service returned ${totalRoutes} route option(s). This score is a prototype estimate.`;
  cardsEl.appendChild(foot);
}

function buildCard(title, data, kind) {
  const card = document.createElement("article");
  card.className = "route-card";

  const km = (data.distanceMeters / 1000).toFixed(1);
  const mins = Math.round(data.durationSeconds / 60);

  card.innerHTML = `
    <strong>${title} Route</strong><span class="badge ${kind}">${kind.toUpperCase()}</span>
    <div>Distance: ${km} km</div>
    <div>ETA: ${mins} min</div>
    <div>Risk score: ${data.riskScore.toFixed(2)}</div>
  `;

  return card;
}

function clearRoutes() {
  routeLayers.forEach((line) => map.removeLayer(line));
  routeLayers = [];
}

function setLoading(isLoading) {
  document.getElementById("loading").classList.toggle("hidden", !isLoading);
}

function setError(message) {
  const errorEl = document.getElementById("error");
  errorEl.textContent = message;
  errorEl.classList.toggle("hidden", !message);
}

function onEnterSearch(event) {
  if (event.key === "Enter") {
    onFindRoutes();
  }
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function parseLatLng(query) {
  const match = query.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) {
    return null;
  }
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return null;
  }
  return [lat, lng];
}

async function geocodeNominatim(fullQuery) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(fullQuery)}`;
    const response = await fetch(url, { headers: { "Accept-Language": "en" } });
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    if (!data.length) {
      return null;
    }
    return [Number(data[0].lat), Number(data[0].lon)];
  } catch (_) {
    return null;
  }
}

async function geocodePhoton(fullQuery) {
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(fullQuery)}&limit=1`;
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    const feature = data?.features?.[0];
    if (!feature?.geometry?.coordinates) {
      return null;
    }
    const [lng, lat] = feature.geometry.coordinates;
    return [Number(lat), Number(lng)];
  } catch (_) {
    return null;
  }
}
