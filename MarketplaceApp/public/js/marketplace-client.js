const accountEl = document.getElementById("accountAddress");
const connectBtn = document.getElementById("connectButton");
const statusEl = document.getElementById("statusMessage");
const ordersListEl = document.getElementById("ordersList");
const createOrderForm = document.getElementById("createOrderForm");

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

async function loadBlockchainData() {
  if (!state.account) {
    return;
  }

  await loadContracts();
  await loadOrders();
  clearStatus();
}

async function connectWallet() {
  const hasAccount = await loadWeb3({ requestAccounts: true });
  if (hasAccount) {
    await loadBlockchainData();
  }
}

async function loadOrders() {
  if (!state.escrowContract) {
    return;
  }

  const orderCount = await state.escrowContract.methods.orderCount().call();
  const orders = [];

  for (let i = 1; i <= Number(orderCount); i += 1) {
    const o = await state.escrowContract.methods.getOrder(i).call();
    orders.push({
      id: o[0],
      buyer: o[1],
      seller: o[2],
      amount: state.web3.utils.fromWei(o[3], "ether"),
      shipped: o[4],
      delivered: o[5],
    });
  }

  renderOrders(orders);
}

function renderOrders(orders) {
  if (orders.length === 0) {
    ordersListEl.innerHTML = "<p>No orders created yet.</p>";
    return;
  }

  const html = orders
    .map((order) => {
      const shipBtn = !order.shipped
        ? `<button class="btn btn-warning btn-sm" data-action="ship" data-id="${order.id}">Mark as Shipped</button>`
        : "";
      const deliverBtn =
        order.shipped && !order.delivered
          ? `<button class="btn btn-success btn-sm" data-action="deliver" data-id="${order.id}">Confirm Delivery</button>`
          : "";

      return `
        <div class="order-card">
          <p><strong>Order ID:</strong> ${order.id}</p>
          <p><strong>Buyer:</strong> ${order.buyer}</p>
          <p><strong>Seller:</strong> ${order.seller}</p>
          <p><strong>Amount:</strong> ${order.amount} ETH</p>
          <p><strong>Shipped:</strong> ${order.shipped}</p>
          <p><strong>Delivered:</strong> ${order.delivered}</p>
          <div class="order-actions">
            ${shipBtn}
            ${deliverBtn}
          </div>
        </div>
      `;
    })
    .join("");

  ordersListEl.innerHTML = html;
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

async function getOrder(orderId) {
  const o = await state.escrowContract.methods.getOrder(orderId).call();
  return {
    id: o[0],
    buyer: o[1],
    seller: o[2],
    amount: state.web3.utils.fromWei(o[3], "ether"),
    shipped: o[4],
    delivered: o[5],
  };
}

async function createOrder(event) {
  event.preventDefault();
  if (!state.escrowContract || !state.account) {
    setStatus("Connect your wallet first.", "warning");
    return;
  }

  const formData = new FormData(createOrderForm);
  const seller = formData.get("seller");
  const amount = formData.get("amount");

  setStatus("Creating order...", "info");
  await state.escrowContract.methods.createOrder(seller).send({
    from: state.account,
    value: state.web3.utils.toWei(amount, "ether"),
    gas: 300000,
  });

  createOrderForm.reset();
  await loadOrders();
  clearStatus();
}

async function handleOrderAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button || !state.shippingContract || !state.escrowContract || !state.account) {
    return;
  }

  const action = button.dataset.action;
  const orderId = button.dataset.id;

  const order = await getOrder(orderId);
  if (action === "ship" && state.account.toLowerCase() !== order.seller.toLowerCase()) {
    setStatus("Only the seller can mark an order as shipped.", "warning");
    return;
  }

  if (action === "deliver" && state.account.toLowerCase() !== order.buyer.toLowerCase()) {
    setStatus("Only the buyer can confirm delivery.", "warning");
    return;
  }

  if (action === "deliver" && !order.shipped) {
    setStatus("Order must be shipped before delivery can be confirmed.", "warning");
    return;
  }

  setStatus("Submitting transaction...", "info");

  if (action === "ship") {
    await state.shippingContract.methods.markShipped(orderId).send({
      from: state.account,
      gas: 300000,
    });
  }

  if (action === "deliver") {
    await state.shippingContract.methods.confirmDelivery(orderId).send({
      from: state.account,
      gas: 300000,
    });
  }

  await loadOrders();
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

  createOrderForm.addEventListener("submit", (event) => {
    createOrder(event).catch((error) => {
      setStatus(extractRpcMessage(error), "danger");
    });
  });

  ordersListEl.addEventListener("click", (event) => {
    handleOrderAction(event).catch((error) => {
      setStatus(extractRpcMessage(error), "danger");
    });
  });

  try {
    const hasAccount = await loadWeb3({ requestAccounts: false });
    if (hasAccount) {
      await loadBlockchainData();
    }
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
