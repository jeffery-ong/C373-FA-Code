const accountEl = document.getElementById("accountAddress");
const connectBtn = document.getElementById("connectButton");
const statusEl = document.getElementById("statusMessage");
const deliveryForm = document.getElementById("deliveryForm");
const trackForm = document.getElementById("trackForm");
const trackingResultEl = document.getElementById("trackingResult");
const adminPanelEl = document.getElementById("adminPanel");
const adminOrdersEl = document.getElementById("adminOrders");
const adminRefreshBtn = document.getElementById("adminRefresh");
const userPanelEl = document.getElementById("userPanel");
const myDeliveriesEl = document.getElementById("myDeliveries");
const deliveryPricingEl = document.getElementById("deliveryPricing");

const ADMIN_ACCOUNTS = new Set([
  "0xe2d15dd1228d095a7327bbf947fe80c03d87d9e8",
  "0x878cf562c8dc9542c06d23e9a4cf2006b2241b18",
  "0xd73b950c62553cab7c90aae8549dbf6c4a099ed4",
  "0xa8f1ebc83dff1984e5281c74aebe969073ac94e3",
]);

function normalizeTrackingId(trackingId) {
  return String(trackingId || "").trim().toUpperCase();
}

function isValidTrackingFormat(trackingId) {
  return /^ZAC\d{1,}$/.test(normalizeTrackingId(trackingId));
}

function orderIdToTrackingId(orderId) {
  const n = Number(orderId);
  if (!Number.isFinite(n) || n <= 0) return "ZAC???";
  return "ZAC" + String(n).padStart(3, "0");
}

function trackingIdToOrderId(trackingId) {
  const t = normalizeTrackingId(trackingId);
  if (!isValidTrackingFormat(t)) return null;

  const match = t.match(/^ZAC(\d{1,})$/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}
const state = {
  web3: null,
  escrowContract: null,
  shippingContract: null,
  account: null,
};

const mapState = {
  map: null,
  markers: [],
  line: null,
  geocodeCache: new Map(),
};

function setStatus(message, type = "info") {
  if (!statusEl) {
    return;
  }
  statusEl.textContent = message;
  statusEl.className = `alert alert-${type}`;
  statusEl.classList.remove("d-none");
}

function clearStatus() {
  if (!statusEl) {
    return;
  }
  statusEl.classList.add("d-none");
}

function setDeliveryPricing(message) {
  if (!deliveryPricingEl) return;
  deliveryPricingEl.textContent = message;
}

function formatAccount(address) {
  if (!address) {
    return "Not connected";
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function isAdminAddress(address) {
  if (!address) return false;
  return ADMIN_ACCOUNTS.has(address.toLowerCase());
}

async function checkAdminAccess() {
  if (!state.account) return false;
  if (isAdminAddress(state.account)) return true;
  if (!state.shippingContract) return false;
  try {
    return Boolean(
      await state.shippingContract.methods.admins(state.account).call()
    );
  } catch (error) {
    return false;
  }
}

async function loadArtifact(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Contract artifact not found at ${path}.`);
  }
  return response.json();
}

async function loadContracts() {
  const [escrowArtifact, shippingArtifact] = await Promise.all([
    loadArtifact("/abis/PaymentEscrow.json"),
    loadArtifact("/abis/ShippingTracking.json"),
  ]);

  const networkId = await state.web3.eth.net.getId();
  const escrowNetwork = escrowArtifact.networks[networkId];
  const shippingNetwork = shippingArtifact.networks[networkId];

  if (!escrowNetwork || !escrowNetwork.address) {
    throw new Error(
      `PaymentEscrow not deployed on network ${networkId}.`
    );
  }

  if (!shippingNetwork || !shippingNetwork.address) {
    throw new Error(
      `ShippingTracking not deployed on network ${networkId}.`
    );
  }

  await assertDeployedContract(
    escrowNetwork.address,
    "PaymentEscrow"
  );
  await assertDeployedContract(
    shippingNetwork.address,
    "ShippingTracking"
  );

  state.escrowContract = new state.web3.eth.Contract(
    escrowArtifact.abi,
    escrowNetwork.address
  );

  state.shippingContract = new state.web3.eth.Contract(
    shippingArtifact.abi,
    shippingNetwork.address
  );
}

async function assertDeployedContract(address, name) {
  const code = await state.web3.eth.getCode(address);
  if (!code || code === "0x") {
    throw new Error(
      `${name} not found at ${address}. Re-deploy contracts and refresh.`
    );
  }
}

async function loadWeb3({ requestAccounts = true } = {}) {
  if (!window.ethereum) {
    throw new Error("MetaMask not detected. Install it to continue.");
  }

  state.web3 = new Web3(window.ethereum);
  const accounts = await window.ethereum.request({
    method: requestAccounts ? "eth_requestAccounts" : "eth_accounts",
  });

  state.account = accounts[0] || null;
  if (accountEl) accountEl.textContent = formatAccount(state.account);

  return Boolean(state.account);
}

async function ensureContracts({ requestAccounts = false } = {}) {
  if (!state.web3 || (requestAccounts && !state.account)) {
    await loadWeb3({ requestAccounts });
  }

  if (!state.escrowContract || !state.shippingContract) {
    await loadContracts();
  }
}

function getStatusLabel(statusValue) {
  const statusIndex = Number(statusValue);
  if (statusIndex === 0) {
    return "Not collected";
  }
  if (statusIndex === 1) {
    return "Collected / On delivery";
  }
  if (statusIndex === 2) {
    return "Delivered / Collected";
  }
  return "Unknown";
}

function renderTrackingResult(shipment) {
  if (!trackingResultEl) {
    return;
  }

  const badgeSource =
    shipment.senderName || shipment.receiverName || shipment.pickupLocation || "O";
  const badgeLetter = String(badgeSource).trim().charAt(0).toUpperCase() || "O";
  const statusLabel = shipment.status || "Unknown";
  const routeSummary = `${shipment.pickupLocation} -> ${shipment.dropoffLocation}`;
  const trackingId = orderIdToTrackingId(shipment.orderId);

  const detailTitle = document.getElementById("detailTitle");
  const detailOrderId = document.getElementById("detailOrderId");
  const detailStatus = document.getElementById("detailStatus");
  const detailIcon = document.getElementById("detailIcon");
  const routeSummaryEl = document.getElementById("routeSummary");
  const routeSummaryMapEl = document.getElementById("routeSummaryMap");
  const primaryItemTitle = document.getElementById("primaryItemTitle");
  const primaryItemId = document.getElementById("primaryItemId");
  const primaryItemRoute = document.getElementById("primaryItemRoute");
  const primaryItemStatus = document.getElementById("primaryItemStatus");
  const primaryItemIcon = document.getElementById("primaryItemIcon");

  if (detailTitle) {
    detailTitle.textContent = `Order ${trackingId}`;
  }
  if (detailOrderId) {
    detailOrderId.textContent = `Tracking ID: ${trackingId}`;
  }
  if (detailIcon) {
    detailIcon.textContent = badgeLetter;
  }
  if (detailStatus) {
    detailStatus.textContent = statusLabel;
    detailStatus.className = "btn btn-chip btn-info";
    if (statusLabel.toLowerCase().includes("delivered")) {
      detailStatus.className = "btn btn-chip btn-muted";
    }
  }
  if (routeSummaryEl) {
    routeSummaryEl.textContent = routeSummary;
  }
  if (routeSummaryMapEl) {
    routeSummaryMapEl.textContent = routeSummary;
  }

  if (primaryItemTitle) {
    primaryItemTitle.textContent = `Order ${trackingId}`;
  }
  if (primaryItemId) {
    primaryItemId.textContent = `Tracking ID: ${trackingId}`;
  }
  if (primaryItemRoute) {
    primaryItemRoute.textContent = routeSummary;
  }
  if (primaryItemStatus) {
    primaryItemStatus.textContent = statusLabel;
    primaryItemStatus.className = "btn btn-chip btn-info";
    if (statusLabel.toLowerCase().includes("delivered")) {
      primaryItemStatus.className = "btn btn-chip btn-muted";
    }
  }
  if (primaryItemIcon) {
    primaryItemIcon.textContent = badgeLetter;
  }

  trackingResultEl.innerHTML = `
    <div class="order-card">
      <p><strong>Tracking ID:</strong> ${trackingId}</p>
      <p><strong>Order ID (on-chain):</strong> ${shipment.orderId}</p>
      <p><strong>Sender:</strong> ${shipment.senderName}</p>
      <p><strong>Sender Phone:</strong> ${shipment.senderPhone}</p>
      <p><strong>Receiver:</strong> ${shipment.receiverName}</p>
      <p><strong>Pickup:</strong> ${shipment.pickupLocation}</p>
      <p><strong>Drop Off:</strong> ${shipment.dropoffLocation}</p>
      <p><strong>Status:</strong> ${statusLabel}</p>
    </div>
  `;

  updateMapForShipment({
    pickupLocation: shipment.pickupLocation,
    dropoffLocation: shipment.dropoffLocation,
  });
}

function resetTrackingView(trackingId, statusText = "Not found") {
  if (!trackingResultEl) {
    return;
  }

  const detailTitle = document.getElementById("detailTitle");
  const detailOrderId = document.getElementById("detailOrderId");
  const detailStatus = document.getElementById("detailStatus");
  const detailIcon = document.getElementById("detailIcon");
  const routeSummaryEl = document.getElementById("routeSummary");

  if (detailTitle) {
    detailTitle.textContent = "Tracking Details";
  }
  if (detailOrderId) {
    detailOrderId.textContent = `Tracking ID: ${trackingId}`;
  }
  if (detailStatus) {
    detailStatus.textContent = statusText;
    detailStatus.className = "btn btn-chip btn-muted";
  }
  if (detailIcon) {
    detailIcon.textContent = "—";
  }
  if (routeSummaryEl) {
    routeSummaryEl.textContent = "";
  }

  trackingResultEl.innerHTML = `
    <p><strong>Sender:</strong> -</p>
    <p><strong>Sender Phone:</strong> -</p>
    <p><strong>Receiver:</strong> -</p>
    <p><strong>Pickup:</strong> -</p>
    <p><strong>Drop Off:</strong> -</p>
    <p><strong>Status:</strong> -</p>
  `;
}

function setAdminView(isAdmin) {
  if (adminPanelEl) {
    adminPanelEl.classList.toggle("hidden", !isAdmin);
  }
  if (userPanelEl) {
    userPanelEl.classList.toggle("hidden", isAdmin);
  }

  const adminHiddenLinks = document.querySelectorAll("[data-admin-hidden='true']");
  adminHiddenLinks.forEach((link) => {
    link.style.display = isAdmin ? "none" : "";
  });

  const adminOnlyLinks = document.querySelectorAll("[data-admin-only='true']");
  adminOnlyLinks.forEach((link) => {
    link.style.display = isAdmin ? "" : "none";
  });
}

function renderAdminOrders(orders) {
  if (!adminOrdersEl) {
    return;
  }

  if (!orders.length) {
    adminOrdersEl.innerHTML =
      '<div class="admin-empty">No delivery requests yet.</div>';
    return;
  }

  adminOrdersEl.innerHTML = orders
    .map((order) => {
      const trackingId = orderIdToTrackingId(order.orderId);
      return `
        <article class="admin-card">
          <a class="admin-card-link" href="/trackdelivery/${trackingId}">
            <div class="admin-row">
              <div>
                <div class="admin-title">Order ${trackingId}</div>
                <div class="admin-meta">Order ID: ${order.orderId}</div>
              </div>
              <span class="status-pill">${order.status}</span>
            </div>
            <div class="admin-meta">
              Pickup: ${order.pickupLocation}
            </div>
            <div class="admin-meta">
              Drop Off: ${order.dropoffLocation}
            </div>
            <div class="admin-meta">
              Sender: ${order.senderName} (${order.senderPhone})
            </div>
            <div class="admin-meta">
              Receiver: ${order.receiverName}
            </div>
            <div class="admin-meta">
              Sender Wallet: ${order.sender}
            </div>
          </a>
          <div class="admin-actions">
            <button class="btn btn-ghost btn-chip" data-admin-action="collect" data-order-id="${order.orderId}">
              Mark Collected / On Delivery
            </button>
            <button class="btn btn-primary btn-chip" data-admin-action="deliver" data-order-id="${order.orderId}">
              Mark Delivered
            </button>
          </div>
        </article>
      `;
    })
    .join("");
}

async function loadAdminOrders() {
  if (!adminOrdersEl) {
    return;
  }

  adminOrdersEl.innerHTML = '<div class="admin-empty">Loading...</div>';

  const orderCount = Number(
    await state.escrowContract.methods.orderCount().call()
  );

  if (!Number.isFinite(orderCount) || orderCount <= 0) {
    renderAdminOrders([]);
    return;
  }

  const orders = [];
  for (let i = 1; i <= orderCount; i += 1) {
    try {
      const shipment = await state.shippingContract.methods.getShipment(i).call();
      orders.push({
        orderId: Number(shipment[0]),
        sender: shipment[1],
        pickupLocation: shipment[2],
        dropoffLocation: shipment[3],
        senderName: shipment[4],
        senderPhone: shipment[5],
        receiverName: shipment[6],
        status: getStatusLabel(shipment[7]),
      });
    } catch (error) {
      continue;
    }
  }

  renderAdminOrders(orders);
}

function renderMyDeliveries(orders) {
  if (!myDeliveriesEl) {
    return;
  }

  if (!orders.length) {
    myDeliveriesEl.innerHTML =
      '<div class="empty-state">No deliveries found for this account.</div>';
    return;
  }

  myDeliveriesEl.innerHTML = orders
    .map((order) => {
      const trackingId = orderIdToTrackingId(order.orderId);
      return `
        <article class="delivery-card">
          <div class="delivery-row">
            <div>
              <div class="delivery-title">Order ${trackingId}</div>
              <div class="delivery-meta">Order ID: ${order.orderId}</div>
            </div>
            <span class="status-pill">${order.status}</span>
          </div>
          <div class="delivery-meta">
            ${order.pickupLocation} → ${order.dropoffLocation}
          </div>
          <div class="delivery-meta">
            Receiver: ${order.receiverName}
          </div>
          <div class="delivery-row">
            <a class="btn btn-ghost btn-chip" href="/trackdelivery/${trackingId}">
              View Details
            </a>
          </div>
        </article>
      `;
    })
    .join("");
}

async function loadMyDeliveries() {
  if (!myDeliveriesEl) {
    return;
  }

  if (!state.account) {
    myDeliveriesEl.innerHTML =
      '<div class="empty-state">Connect your wallet to see your deliveries.</div>';
    return;
  }

  myDeliveriesEl.innerHTML = '<div class="empty-state">Loading...</div>';

  const orderCount = Number(
    await state.escrowContract.methods.orderCount().call()
  );

  if (!Number.isFinite(orderCount) || orderCount <= 0) {
    renderMyDeliveries([]);
    return;
  }

  const orders = [];
  for (let i = 1; i <= orderCount; i += 1) {
    try {
      const shipment = await state.shippingContract.methods.getShipment(i).call();
      if (String(shipment[1]).toLowerCase() !== state.account.toLowerCase()) {
        continue;
      }
      orders.push({
        orderId: Number(shipment[0]),
        sender: shipment[1],
        pickupLocation: shipment[2],
        dropoffLocation: shipment[3],
        senderName: shipment[4],
        senderPhone: shipment[5],
        receiverName: shipment[6],
        status: getStatusLabel(shipment[7]),
      });
    } catch (error) {
      continue;
    }
  }

  renderMyDeliveries(orders);
}

async function handleAdminAction(orderId, action) {
  if (!state.shippingContract || !state.account) {
    setStatus("Connect your wallet first.", "warning");
    return;
  }

  if (!orderId) {
    return;
  }

  try {
    if (action === "collect") {
      setStatus("Updating status to collected/on delivery...", "info");
      await state.shippingContract.methods
        .markCollected(orderId)
        .send({ from: state.account, gas: 200000 });
    } else if (action === "deliver") {
      setStatus("Updating status to delivered...", "info");
      await state.shippingContract.methods
        .markDelivered(orderId)
        .send({ from: state.account, gas: 200000 });
    }

    setStatus("Status updated.", "success");
    await loadAdminOrders();
  } catch (error) {
    setStatus(extractRpcMessage(error), "danger");
  }
}

async function updateAdminPanel() {
  const isAdmin = await checkAdminAccess();
  setAdminView(isAdmin);
  if (isAdmin && adminPanelEl) {
    await loadAdminOrders();
  }
}

function extractRpcMessage(error) {
  if (!error) {
    return "Transaction failed.";
  }

  if (error.message && error.message.includes("Internal JSON-RPC error")) {
    return "Transaction reverted. Check account permissions and order state.";
  }

  if (error.data && typeof error.data === "object") {
    const dataEntry = Object.values(error.data)[0];
    if (dataEntry && dataEntry.reason) {
      return dataEntry.reason;
    }
  }

  return error.message || "Transaction failed.";
}

async function loadTrackingFromPage() {
  if (!window.TRACKING_ID) return;
  if (!state.shippingContract) return;

  const trackingId = normalizeTrackingId(window.TRACKING_ID);
  if (!isValidTrackingFormat(trackingId)) {
    setStatus("Invalid tracking ID format. Use ZAC001, ZAC002, etc.", "danger");
    resetTrackingView(trackingId, "Invalid ID");
    return;
  }

  const orderId = trackingIdToOrderId(trackingId);
  if (!orderId) {
    setStatus("No order found for this tracking ID.", "danger");
    resetTrackingView(trackingId, "Not found");
    return;
  }

  setStatus(`Fetching ${trackingId} from blockchain...`, "info");

  let shipment;
  try {
    shipment = await state.shippingContract.methods.getShipment(orderId).call();
  } catch (error) {
    setStatus("No order found for this tracking ID.", "danger");
    resetTrackingView(trackingId, "Not found");
    return;
  }

  renderTrackingResult({
    orderId: shipment[0],
    sender: shipment[1],
    pickupLocation: shipment[2],
    dropoffLocation: shipment[3],
    senderName: shipment[4],
    senderPhone: shipment[5],
    receiverName: shipment[6],
    status: getStatusLabel(shipment[7]),
  });

  clearStatus();
}

async function connectWallet() {
  await ensureContracts({ requestAccounts: true });
  await loadTrackingFromPage();
  await updateAdminPanel();
  await loadMyDeliveries();
}

async function submitDeliveryRequest(event) {
  if (!deliveryForm) {
    return;
  }
  event.preventDefault();
  if (!state.escrowContract || !state.account) {
    setStatus("Connect your wallet first.", "warning");
    return;
  }

  const formData = new FormData(deliveryForm);
  const pickupLocation = formData.get("pickupLocation");
  const dropoffLocation = formData.get("dropoffLocation");
  const senderName = formData.get("senderName");
  const senderPhone = formData.get("senderPhone");
  const receiverName = formData.get("receiverName");
  const amount = formData.get("amount");

  if (!amount || Number(amount) <= 0) {
    setStatus("Enter pickup and drop off to calculate payment.", "warning");
    return;
  }

  setStatus("Submitting delivery request...", "info");
  const receipt = await state.escrowContract.methods
    .createDeliveryOrder(
      pickupLocation,
      dropoffLocation,
      senderName,
      senderPhone,
      receiverName
    )
    .send({
      from: state.account,
      value: state.web3.utils.toWei(amount, "ether"),
      gas: 350000,
    });

  const orderId =
    receipt?.events?.OrderCreated?.returnValues?.orderId ||
    (await state.escrowContract.methods.orderCount().call());

  const trackingId = orderIdToTrackingId(orderId);

  deliveryForm.reset();
  setStatus(
    `Delivery created! Tracking ID: ${trackingId}`,
    "success"
  );
}

async function trackParcel(event) {
  if (!trackForm) {
    return;
  }
  event.preventDefault();

  const formData = new FormData(trackForm);
  const trackingIdInput = formData.get("trackingId") || formData.get("orderId");
  const normalizedTrackingId = normalizeTrackingId(trackingIdInput);

  if (!isValidTrackingFormat(normalizedTrackingId)) {
    setStatus("Invalid tracking ID format. Use ZAC001, ZAC002, etc.", "warning");
    return;
  }

  if (trackForm.dataset.redirect === "true") {
    window.location.href = `/trackdelivery/${encodeURIComponent(normalizedTrackingId)}`;
    return;
  }

  const orderId = trackingIdToOrderId(normalizedTrackingId);
  if (!orderId) {
    setStatus("No order found for this tracking ID.", "warning");
    return;
  }
  await ensureContracts({ requestAccounts: false });
  setStatus("Fetching delivery details...", "info");
  let shipment;
  try {
    shipment = await state.shippingContract.methods.getShipment(orderId).call();
  } catch (error) {
    setStatus("No order found for this tracking ID.", "warning");
    resetTrackingView(normalizedTrackingId, "Not found");
    return;
  }

  renderTrackingResult({
    orderId: shipment[0],
    sender: shipment[1],
    pickupLocation: shipment[2],
    dropoffLocation: shipment[3],
    senderName: shipment[4],
    senderPhone: shipment[5],
    receiverName: shipment[6],
    status: getStatusLabel(shipment[7]),
  });

  clearStatus();
}

function initMap() {
  const mapEl = document.getElementById("trackingMap");
  if (!mapEl || !window.L) {
    return null;
  }

  if (mapState.map) {
    return mapState.map;
  }

  mapState.map = L.map(mapEl, {
    zoomControl: true,
    scrollWheelZoom: false,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 18,
  }).addTo(mapState.map);

  mapState.map.setView([39.5, -98.35], 4);
  return mapState.map;
}

function clearMapLayers() {
  if (mapState.line) {
    mapState.line.remove();
    mapState.line = null;
  }

  mapState.markers.forEach((marker) => marker.remove());
  mapState.markers = [];
}

async function geocodeLocation(location) {
  if (!location) return null;
  const key = String(location).trim().toLowerCase();
  if (!key) return null;

  if (mapState.geocodeCache.has(key)) {
    return mapState.geocodeCache.get(key);
  }

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
    location
  )}`;

  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data || !data[0]) return null;
    const coords = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
    mapState.geocodeCache.set(key, coords);
    return coords;
  } catch (error) {
    return null;
  }
}

function haversineDistanceKm([lat1, lon1], [lat2, lon2]) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const r = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

let pricingTimer = null;
async function updateDeliveryPricing() {
  if (!deliveryForm) return;
  const pickupInput = deliveryForm.querySelector("input[name='pickupLocation']");
  const dropoffInput = deliveryForm.querySelector("input[name='dropoffLocation']");
  const amountInput = deliveryForm.querySelector("input[name='amount']");
  if (!pickupInput || !dropoffInput || !amountInput) return;

  const pickup = pickupInput.value.trim();
  const dropoff = dropoffInput.value.trim();
  if (!pickup || !dropoff) {
    amountInput.value = "";
    setDeliveryPricing("Enter pickup and drop off to calculate.");
    return;
  }

  setDeliveryPricing("Calculating distance...");
  const [pickupCoords, dropoffCoords] = await Promise.all([
    geocodeLocation(pickup),
    geocodeLocation(dropoff),
  ]);

  if (!pickupCoords || !dropoffCoords) {
    amountInput.value = "";
    setDeliveryPricing("Unable to calculate distance. Check locations.");
    return;
  }

  const distanceKm = haversineDistanceKm(pickupCoords, dropoffCoords);
  const price = Math.max(0, distanceKm);
  amountInput.value = price.toFixed(2);
  setDeliveryPricing(
    `Distance: ${distanceKm.toFixed(2)} km | Payment: $${price.toFixed(2)}`
  );
}

async function updateMapForShipment({ pickupLocation, dropoffLocation }) {
  const map = initMap();
  if (!map) return;

  const pickup = pickupLocation || "";
  const dropoff = dropoffLocation || "";
  if (!pickup && !dropoff) return;

  const [pickupCoords, dropoffCoords] = await Promise.all([
    geocodeLocation(pickup),
    geocodeLocation(dropoff),
  ]);

  clearMapLayers();

  const points = [];
  if (pickupCoords) {
    points.push(pickupCoords);
    mapState.markers.push(
      L.marker(pickupCoords).addTo(map).bindPopup("Pickup")
    );
  }

  if (dropoffCoords) {
    points.push(dropoffCoords);
    mapState.markers.push(L.marker(dropoffCoords).addTo(map).bindPopup("Drop off"));
  }

  if (points.length >= 2) {
    mapState.line = L.polyline(points, { color: "#2f6bff", weight: 4 }).addTo(map);
    map.fitBounds(L.latLngBounds(points), { padding: [24, 24], maxZoom: 10 });
    return;
  }

  if (points.length === 1) {
    map.setView(points[0], 10);
  }
}

async function init() {
  if (trackForm) {
    trackForm.addEventListener("submit", (event) => {
      trackParcel(event).catch((error) => {
        setStatus(extractRpcMessage(error), "danger");
      });
    });
  }

  const requiresWeb3 = Boolean(connectBtn || deliveryForm || trackingResultEl);

  if (!window.ethereum) {
    if (requiresWeb3) {
      setStatus("MetaMask not detected. Install it to continue.", "danger");
    }
    return;
  }

  try {
    await loadWeb3({ requestAccounts: false });
  } catch (error) {
    // Ignore missing accounts until user connects.
  }

  if (connectBtn) {
    connectBtn.addEventListener("click", () => {
      connectWallet().catch((error) => {
        setStatus(extractRpcMessage(error), "danger");
      });
    });
  }

  if (deliveryForm) {
    deliveryForm.addEventListener("submit", (event) => {
      submitDeliveryRequest(event).catch((error) => {
        setStatus(extractRpcMessage(error), "danger");
      });
    });

    const pickupInput = deliveryForm.querySelector("input[name='pickupLocation']");
    const dropoffInput = deliveryForm.querySelector("input[name='dropoffLocation']");
    const schedulePricingUpdate = () => {
      if (pricingTimer) {
        clearTimeout(pricingTimer);
      }
      pricingTimer = setTimeout(() => {
        updateDeliveryPricing().catch(() => {
          setDeliveryPricing("Unable to calculate distance.");
        });
      }, 500);
    };

    if (pickupInput) pickupInput.addEventListener("input", schedulePricingUpdate);
    if (dropoffInput) dropoffInput.addEventListener("input", schedulePricingUpdate);
  }

  if (adminOrdersEl) {
    adminOrdersEl.addEventListener("click", (event) => {
      const button = event.target.closest("[data-admin-action]");
      if (!button) {
        return;
      }
      const orderId = button.dataset.orderId;
      const action = button.dataset.adminAction;
      handleAdminAction(orderId, action);
    });
  }

  if (adminRefreshBtn) {
    adminRefreshBtn.addEventListener("click", () => {
      loadAdminOrders().catch((error) => {
        setStatus(extractRpcMessage(error), "danger");
      });
    });
  }

  try {
    await ensureContracts({ requestAccounts: false });
    await updateAdminPanel();
    await loadTrackingFromPage();
    await loadMyDeliveries();
  } catch (error) {
    // Only show errors when admin actually connects.
  }

  if (deliveryForm) {
    setStatus("Connect your wallet to create deliveries.", "info");
  }

  window.ethereum.on("accountsChanged", () => {
    window.location.reload();
  });

  window.ethereum.on("chainChanged", () => {
    window.location.reload();
  });
}

init().catch((error) => {
  setStatus(error.message, "danger");
});

