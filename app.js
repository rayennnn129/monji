const RATES = { eco: 1.2, comfort: 1.6, van: 2.1 };
const LABELS = { eco: "Éco", comfort: "Confort", van: "Van" };
const STORAGE_KEY = "taxi-reservations";

const DJERBA_CENTER = [33.807, 10.88];
const DJERBA_BOUNDS = L.latLngBounds([33.63, 10.72], [33.94, 11.12]);

const PLACES = [
  { name: "Aéroport Djerba-Zarzis", lat: 33.875011, lng: 10.775461 },
  { name: "Houmt Souk — centre", lat: 33.8756, lng: 10.8572 },
  { name: "Port de Houmt Souk", lat: 33.8843, lng: 10.8598 },
  { name: "Marché central Houmt Souk", lat: 33.8764, lng: 10.8581 },
  { name: "Midoun", lat: 33.8082, lng: 11.0018 },
  { name: "Zone touristique Midoun", lat: 33.8365, lng: 11.0402 },
  { name: "Plage Sidi Mahrez", lat: 33.8784, lng: 11.0351 },
  { name: "Ajim", lat: 33.7224, lng: 10.7503 },
  { name: "Guellala", lat: 33.7338, lng: 10.8669 },
  { name: "Erriadh / Djerbahood", lat: 33.8241, lng: 10.8554 },
  { name: "Aghir", lat: 33.7608, lng: 11.0186 },
  { name: "El Kantara", lat: 33.6894, lng: 10.9327 },
  { name: "Sedouikech", lat: 33.7486, lng: 10.9315 },
  { name: "Mahboubine", lat: 33.7981, lng: 10.9342 },
];

const form = document.getElementById("booking-form");
const estKm = document.getElementById("est-km");
const estPrice = document.getElementById("est-price");
const coordLine = document.getElementById("coord-line");
const ridesEl = document.getElementById("rides");
const toast = document.getElementById("toast");
const modal = document.getElementById("modal");
const modalBody = document.getElementById("modal-body");
const gpsStatus = document.getElementById("gps-status");
const placesList = document.getElementById("places");

let pinMode = "pickup";
let pickupPoint = null;
let dropoffPoint = null;
let pickupMarker = null;
let dropoffMarker = null;
let gpsMarker = null;
let routeLine = null;
let reverseTimer = null;

placesList.innerHTML = PLACES.map((place) => `<option value="${place.name}"></option>`).join("");

const map = L.map("map", {
  maxBounds: DJERBA_BOUNDS.pad(0.15),
  maxBoundsViscosity: 0.8,
  minZoom: 10,
  maxZoom: 18,
}).setView(DJERBA_CENTER, 12);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

L.rectangle(DJERBA_BOUNDS, {
  color: "#f5c518",
  weight: 1,
  dashArray: "6 6",
  fill: false,
}).addTo(map);

function loadRides() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveRides(rides) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rides));
}

function isOnDjerba(lat, lng) {
  return DJERBA_BOUNDS.contains([lat, lng]);
}

function haversineKm(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function formatMoney(value) {
  return `${value.toFixed(2)} DT`;
}

function formatCoords(point) {
  return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
}

function findPlace(name) {
  const needle = name.trim().toLowerCase();
  return PLACES.find((place) => place.name.toLowerCase() === needle);
}

function markerIcon(color) {
  return L.divIcon({
    className: "taxi-pin",
    html: `<span style="background:${color}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function setStatus(message) {
  gpsStatus.textContent = message;
}

function updateRoute() {
  if (routeLine) {
    map.removeLayer(routeLine);
    routeLine = null;
  }
  if (pickupPoint && dropoffPoint) {
    routeLine = L.polyline(
      [
        [pickupPoint.lat, pickupPoint.lng],
        [dropoffPoint.lat, dropoffPoint.lng],
      ],
      { color: "#f5c518", weight: 4 }
    ).addTo(map);
    map.fitBounds(routeLine.getBounds().pad(0.25), { maxZoom: 14 });
  }
}

function updateEstimate() {
  if (!pickupPoint || !dropoffPoint) {
    estKm.textContent = "—";
    estPrice.textContent = "—";
    coordLine.textContent = "Choisissez deux points GPS sur Djerba.";
    return;
  }
  const km = haversineKm(pickupPoint, dropoffPoint);
  const price = km * RATES[form.vehicle.value];
  estKm.textContent = `${km.toFixed(1)} km`;
  estPrice.textContent = formatMoney(price);
  coordLine.textContent = `Départ ${formatCoords(pickupPoint)} → Arrivée ${formatCoords(dropoffPoint)}`;
}

function setPoint(kind, point, { skipInput } = {}) {
  const color = kind === "pickup" ? "#3ddc97" : "#ff6b6b";
  if (kind === "pickup") pickupPoint = point;
  else dropoffPoint = point;

  if (kind === "pickup" && pickupMarker) map.removeLayer(pickupMarker);
  if (kind === "dropoff" && dropoffMarker) map.removeLayer(dropoffMarker);
  const marker = L.marker([point.lat, point.lng], { icon: markerIcon(color), draggable: true }).addTo(map);
  marker.bindPopup(`${kind === "pickup" ? "Départ" : "Arrivée"}<br>${point.label}<br>${formatCoords(point)}`);
  marker.on("dragend", () => {
    const pos = marker.getLatLng();
    setPoint(kind, {
      lat: pos.lat,
      lng: pos.lng,
      label: `Point GPS ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`,
    });
    reverseGeocode(pos.lat, pos.lng, kind);
  });
  if (kind === "pickup") pickupMarker = marker;
  else dropoffMarker = marker;

  if (!skipInput) {
    form[kind].value = point.label;
  }
  updateRoute();
  updateEstimate();
}

async function reverseGeocode(lat, lng, kind) {
  clearTimeout(reverseTimer);
  reverseTimer = setTimeout(async () => {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`;
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) return;
      const data = await response.json();
      const label = data.display_name || `Point GPS ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      const current = kind === "pickup" ? pickupPoint : dropoffPoint;
      if (!current) return;
      setPoint(kind, { ...current, label });
    } catch {
      /* keep coordinate label */
    }
  }, 400);
}

function applyNamedPlace(kind, name) {
  const place = findPlace(name);
  if (!place) return false;
  setPoint(kind, { lat: place.lat, lng: place.lng, label: place.name });
  map.setView([place.lat, place.lng], 14);
  return true;
}

map.on("click", (event) => {
  const { lat, lng } = event.latlng;
  if (!isOnDjerba(lat, lng)) {
    showToast("Cliquez à l’intérieur de Djerba.");
    return;
  }
  const label = `Point GPS ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  setPoint(pinMode, { lat, lng, label });
  reverseGeocode(lat, lng, pinMode);
  setStatus(`Point d’${pinMode === "pickup" ? "départ" : "arrivée"} posé sur la carte.`);
});

document.getElementById("mode-pickup").addEventListener("click", () => {
  pinMode = "pickup";
  document.getElementById("mode-pickup").classList.add("is-active");
  document.getElementById("mode-dropoff").classList.remove("is-active");
  setStatus("Prochain clic = départ.");
});

document.getElementById("mode-dropoff").addEventListener("click", () => {
  pinMode = "dropoff";
  document.getElementById("mode-dropoff").classList.add("is-active");
  document.getElementById("mode-pickup").classList.remove("is-active");
  setStatus("Prochain clic = arrivée.");
});

document.getElementById("use-gps").addEventListener("click", () => {
  if (!navigator.geolocation) {
    showToast("GPS indisponible sur cet appareil.");
    return;
  }
  setStatus("Lecture du GPS…");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = Math.round(position.coords.accuracy);
      if (gpsMarker) map.removeLayer(gpsMarker);
      gpsMarker = L.circleMarker([lat, lng], {
        radius: 8,
        color: "#4da3ff",
        fillColor: "#4da3ff",
        fillOpacity: 0.9,
      })
        .addTo(map)
        .bindPopup(`Votre GPS (±${accuracy} m)`);

      if (!isOnDjerba(lat, lng)) {
        map.setView(DJERBA_CENTER, 12);
        setStatus(`GPS reçu hors Djerba (${lat.toFixed(4)}, ${lng.toFixed(4)}). Posez le départ sur l’île.`);
        showToast("Votre GPS n’est pas à Djerba. Cliquez la carte pour le départ.");
        return;
      }

      const label = `Ma position GPS (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
      setPoint("pickup", { lat, lng, label });
      reverseGeocode(lat, lng, "pickup");
      map.setView([lat, lng], 15);
      setStatus(`Position GPS réelle utilisée comme départ (±${accuracy} m).`);
    },
    (error) => {
      const messages = {
        1: "Autorisez la localisation pour utiliser le GPS.",
        2: "Position GPS introuvable.",
        3: "Le GPS a mis trop de temps à répondre.",
      };
      setStatus(messages[error.code] || "GPS refusé.");
      showToast(messages[error.code] || "GPS indisponible.");
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
});

form.pickup.addEventListener("change", () => applyNamedPlace("pickup", form.pickup.value));
form.dropoff.addEventListener("change", () => applyNamedPlace("dropoff", form.dropoff.value));
form.addEventListener("input", updateEstimate);

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 2400);
}

function renderRides() {
  const rides = loadRides();
  if (!rides.length) {
    ridesEl.innerHTML = `<p class="empty">Aucune course pour le moment. Réservez votre premier taxi.</p>`;
    return;
  }

  ridesEl.innerHTML = rides
    .map(
      (ride) => `
      <article class="ride">
        <header>
          <strong>${ride.pickup} → ${ride.dropoff}</strong>
          <span class="status">${ride.status}</span>
        </header>
        <p>${ride.date} à ${ride.time} · ${LABELS[ride.vehicle]} · ${ride.passengers} passager(s)</p>
        <p>${ride.km.toFixed(1)} km GPS · <strong>${formatMoney(ride.price)}</strong></p>
        <p class="coords">${ride.pickupCoords || "coords non GPS"} → ${ride.dropoffCoords || "coords non GPS"}</p>
        <p>${ride.name} · ${ride.phone}</p>
        ${
          ride.status === "Confirmée"
            ? `<button class="cancel" data-cancel="${ride.id}">Annuler</button>`
            : ""
        }
      </article>`
    )
    .join("");
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.tab === name);
  });
  document.getElementById("view-book").classList.toggle("hidden", name !== "book");
  document.getElementById("view-list").classList.toggle("hidden", name !== "list");
  if (name === "list") renderRides();
  if (name === "book") setTimeout(() => map.invalidateSize(), 80);
}

const today = new Date();
form.date.min = today.toISOString().slice(0, 10);
form.date.value = form.date.min;
form.time.value = `${String(today.getHours()).padStart(2, "0")}:${String(today.getMinutes()).padStart(2, "0")}`;

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!pickupPoint || !dropoffPoint) {
    showToast("Posez un départ et une arrivée GPS sur Djerba.");
    return;
  }
  if (haversineKm(pickupPoint, dropoffPoint) < 0.15) {
    showToast("Choisissez deux points plus éloignés.");
    return;
  }

  const data = Object.fromEntries(new FormData(form));
  const km = haversineKm(pickupPoint, dropoffPoint);
  const ride = {
    id: crypto.randomUUID(),
    name: data.name.trim(),
    phone: data.phone.trim(),
    pickup: data.pickup.trim(),
    dropoff: data.dropoff.trim(),
    pickupCoords: formatCoords(pickupPoint),
    dropoffCoords: formatCoords(dropoffPoint),
    date: data.date,
    time: data.time,
    passengers: Number(data.passengers),
    vehicle: data.vehicle,
    km,
    price: km * RATES[data.vehicle],
    status: "Confirmée",
  };

  saveRides([ride, ...loadRides()]);
  modalBody.textContent = `Un ${LABELS[ride.vehicle].toLowerCase()} vous attend le ${ride.date} à ${ride.time}. Trajet GPS : ${km.toFixed(1)} km · ${formatMoney(ride.price)}.`;
  modal.classList.remove("hidden");
  form.reset();
  form.date.value = form.date.min;
  pickupPoint = null;
  dropoffPoint = null;
  if (pickupMarker) map.removeLayer(pickupMarker);
  if (dropoffMarker) map.removeLayer(dropoffMarker);
  if (routeLine) map.removeLayer(routeLine);
  pickupMarker = dropoffMarker = routeLine = null;
  map.setView(DJERBA_CENTER, 12);
  updateEstimate();
});

document.getElementById("modal-close").addEventListener("click", () => {
  modal.classList.add("hidden");
  switchTab("list");
});

ridesEl.addEventListener("click", (event) => {
  const id = event.target.dataset.cancel;
  if (!id) return;
  const rides = loadRides().map((ride) =>
    ride.id === id ? { ...ride, status: "Annulée" } : ride
  );
  saveRides(rides);
  renderRides();
  showToast("Course annulée.");
});

updateEstimate();
renderRides();
setTimeout(() => map.invalidateSize(), 200);
