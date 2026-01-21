const accountEl = document.getElementById("accountAddress");
const connectBtn = document.getElementById("connectButton");
const statusEl = document.getElementById("statusMessage");
const ordersListEl = document.getElementById("ordersList");
const createOrderForm = document.getElementById("createOrderForm");

const state = {
  web3: null,
  contract: null,
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

async function loadContract() {
  const response = await fetch("/abis/MarketplaceContract.json");
  if (!response.ok) {
    throw new Error("Contract artifact not found. Run truffle migrate.");
  }

  const artifact = await response.json();
  const networkId = await state.web3.eth.net.getId();
  const deployedNetwork = artifact.networks[networkId];

  if (!deployedNetwork || !deployedNetwork.address) {
    throw new Error("Contract not deployed on the connected network.");
  }

  state.contract = new state.web3.eth.Contract(
    artifact.abi,
    deployedNetwork.address
  );
}

async function connectWallet() {
  if (!window.ethereum) {
    setStatus("MetaMask not detected. Install it to continue.", "danger");
    return;
  }

  state.web3 = new Web3(window.ethereum);
  const accounts = await window.ethereum.request({
    method: "eth_requestAccounts",
  });

  state.account = accounts[0];
  accountEl.textContent = formatAccount(state.account);

  await loadContract();
  await loadOrders();
  clearStatus();
}

async function loadOrders() {
  if (!state.contract) {
    return;
  }

  const orderCount = await state.contract.methods.orderCount().call();
  const orders = [];

  for (let i = 1; i <= Number(orderCount); i += 1) {
    const o = await state.contract.methods.getOrder(i).call();
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
        <div class="border rounded p-3 mb-3 bg-white">
          <p><strong>Order ID:</strong> ${order.id}</p>
          <p><strong>Buyer:</strong> ${order.buyer}</p>
          <p><strong>Seller:</strong> ${order.seller}</p>
          <p><strong>Amount:</strong> ${order.amount} ETH</p>
          <p><strong>Shipped:</strong> ${order.shipped}</p>
          <p><strong>Delivered:</strong> ${order.delivered}</p>
          <div class="d-flex gap-2">
            ${shipBtn}
            ${deliverBtn}
          </div>
        </div>
      `;
    })
    .join("");

  ordersListEl.innerHTML = html;
}

async function createOrder(event) {
  event.preventDefault();
  if (!state.contract || !state.account) {
    setStatus("Connect your wallet first.", "warning");
    return;
  }

  const formData = new FormData(createOrderForm);
  const seller = formData.get("seller");
  const amount = formData.get("amount");

  setStatus("Creating order...", "info");
  await state.contract.methods.createOrder(seller).send({
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
  if (!button || !state.contract || !state.account) {
    return;
  }

  const action = button.dataset.action;
  const orderId = button.dataset.id;

  setStatus("Submitting transaction...", "info");

  if (action === "ship") {
    await state.contract.methods.markShipped(orderId).send({
      from: state.account,
      gas: 300000,
    });
  }

  if (action === "deliver") {
    await state.contract.methods.confirmDelivery(orderId).send({
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
      setStatus(error.message, "danger");
    });
  });

  ordersListEl.addEventListener("click", (event) => {
    handleOrderAction(event).catch((error) => {
      setStatus(error.message, "danger");
    });
  });

  const existingAccounts = await window.ethereum.request({
    method: "eth_accounts",
  });

  if (existingAccounts.length > 0) {
    try {
      await connectWallet();
    } catch (error) {
      setStatus(error.message, "danger");
    }
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
