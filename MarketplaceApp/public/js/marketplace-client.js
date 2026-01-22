const accountEl = document.getElementById("accountAddress");
const connectBtn = document.getElementById("connectButton");
const statusEl = document.getElementById("statusMessage");
const deliveryForm = document.getElementById("deliveryForm");
const trackForm = document.getElementById("trackForm");
const trackingResultEl = document.getElementById("trackingResult");
const adminLoginForm = document.getElementById("adminLoginForm");
const adminActionsEl = document.getElementById("adminActions");
const adminStatusForm = document.getElementById("adminStatusForm");

const ADMIN_PASSWORD = "12345678";

const state = {
  web3: null,
  escrowContract: null,
  shippingContract: null,
  account: null,
};

function setStatus(message, type = "info") {
  statusEl.textContent = message;
  statusEl.className = `alert alert-${type}`;
  statusEl.classList.remove("d-none");
}

function clearStatus() {
  statusEl.classList.add("d-none");
}

function formatAccount(address) {
  if (!address) {
    return "Not connected";
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
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
    throw new Error("PaymentEscrow not deployed on the connected network.");
  }

  if (!shippingNetwork || !shippingNetwork.address) {
    throw new Error("ShippingTracking not deployed on the connected network.");
  }

  state.escrowContract = new state.web3.eth.Contract(
    escrowArtifact.abi,
    escrowNetwork.address
  );
  state.shippingContract = new state.web3.eth.Contract(
    shippingArtifact.abi,
    shippingNetwork.address
  );
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
  accountEl.textContent = formatAccount(state.account);

  return Boolean(state.account);
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
  trackingResultEl.innerHTML = `
    <div class="order-card">
      <p><strong>Order ID:</strong> ${shipment.orderId}</p>
      <p><strong>Sender:</strong> ${shipment.senderName}</p>
      <p><strong>Sender Phone:</strong> ${shipment.senderPhone}</p>
      <p><strong>Receiver:</strong> ${shipment.receiverName}</p>
      <p><strong>Pickup:</strong> ${shipment.pickupLocation}</p>
      <p><strong>Drop Off:</strong> ${shipment.dropoffLocation}</p>
      <p><strong>Status:</strong> ${shipment.status}</p>
    </div>
  `;
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

async function connectWallet() {
  const hasAccount = await loadWeb3({ requestAccounts: true });
  if (hasAccount) {
    await loadContracts();
  }
}

async function submitDeliveryRequest(event) {
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

  deliveryForm.reset();
  setStatus(`Delivery request submitted. Order ID: ${orderId}`, "success");
}

async function trackParcel(event) {
  event.preventDefault();
  if (!state.shippingContract) {
    setStatus("Connect to the blockchain first.", "warning");
    return;
  }

  const formData = new FormData(trackForm);
  const orderId = formData.get("orderId");

  setStatus("Fetching delivery details...", "info");
  const shipment = await state.shippingContract.methods.getShipment(orderId).call();

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

async function init() {
  if (!window.ethereum) {
    setStatus("MetaMask not detected. Install it to continue.", "danger");
    return;
  }

  connectBtn.addEventListener("click", () => {
    connectWallet().catch((error) => {
      setStatus(error.message, "danger");
    });
  });

  deliveryForm.addEventListener("submit", (event) => {
    submitDeliveryRequest(event).catch((error) => {
      setStatus(extractRpcMessage(error), "danger");
    });
  });

  trackForm.addEventListener("submit", (event) => {
    trackParcel(event).catch((error) => {
      setStatus(extractRpcMessage(error), "danger");
    });
  });

  adminLoginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(adminLoginForm);
    const password = formData.get("adminPassword");
    if (password !== ADMIN_PASSWORD) {
      setStatus("Invalid admin password.", "danger");
      return;
    }

    adminActionsEl.classList.add("show");
    adminLoginForm.reset();
    setStatus("Admin actions unlocked.", "success");
  });

  adminStatusForm.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-admin]");
    if (!button) {
      return;
    }

    const action = button.dataset.admin;
    const formData = new FormData(adminStatusForm);
    const orderId = formData.get("orderId");

    if (!orderId) {
      setStatus("Enter an order ID first.", "warning");
      return;
    }

    if (!state.shippingContract || !state.account) {
      setStatus("Connect your wallet first.", "warning");
      return;
    }

    if (action === "collect") {
      setStatus("Updating status to collected...", "info");
      state.shippingContract.methods
        .markCollected(orderId)
        .send({ from: state.account, gas: 200000 })
        .then(() => setStatus("Marked as collected.", "success"))
        .catch((error) => setStatus(extractRpcMessage(error), "danger"));
    }

    if (action === "deliver") {
      setStatus("Updating status to delivered...", "info");
      state.shippingContract.methods
        .markDelivered(orderId)
        .send({ from: state.account, gas: 200000 })
        .then(() => setStatus("Marked as delivered.", "success"))
        .catch((error) => setStatus(extractRpcMessage(error), "danger"));
    }
  });

  try {
    await loadWeb3({ requestAccounts: false });
    await loadContracts();
  } catch (error) {
    setStatus(error.message, "danger");
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
