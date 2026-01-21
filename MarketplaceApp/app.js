const express = require("express");
const path = require("path");
const { Web3 } = require("web3");
const MarketplaceContract = require(path.join(
  __dirname,
  "..",
  "build",
  "contracts",
  "MarketplaceContract.json"
));

const app = express();
const PORT = 3001;

// ---------------- CONFIG ----------------
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// ---------------- WEB3 ----------------
let web3;
let contract;
let account;

async function loadWeb3() {
  web3 = new Web3("http://127.0.0.1:7545"); // Ganache
}

async function loadBlockchainData() {
  const accounts = await web3.eth.getAccounts();
  account = accounts[0];

  const networkId = await web3.eth.net.getId();
  const deployedNetwork = MarketplaceContract.networks[networkId];

  if (!deployedNetwork || !deployedNetwork.address) {
    throw new Error(
      "MarketplaceContract is not deployed to the detected network."
    );
  }

  contract = new web3.eth.Contract(
    MarketplaceContract.abi,
    deployedNetwork.address
  );
}

// ---------------- HOME PAGE ----------------
app.get("/", async (req, res) => {
  await loadWeb3();
  await loadBlockchainData();

  const orderCount = await contract.methods.orderCount().call();
  let orders = [];

  for (let i = 1; i <= orderCount; i++) {
    const o = await contract.methods.getOrder(i).call();
    orders.push({
      id: o[0],
      buyer: o[1],
      seller: o[2],
      amount: web3.utils.fromWei(o[3], "ether"),
      shipped: o[4],
      delivered: o[5],
    });
  }

  res.render("index", {
    account,
    orders,
  });
});

// ---------------- CREATE ORDER (TOPIC 1) ----------------
app.post("/createOrder", async (req, res) => {
  const { seller, amount } = req.body;

  await contract.methods.createOrder(seller).send({
    from: account,
    value: web3.utils.toWei(amount, "ether"),
    gas: 300000,
  });

  res.redirect("/");
});

// ---------------- MARK SHIPPED (TOPIC 2) ----------------
app.post("/ship/:id", async (req, res) => {
  const orderId = req.params.id;

  await contract.methods.markShipped(orderId).send({
    from: account,
    gas: 300000,
  });

  res.redirect("/");
});

// ---------------- CONFIRM DELIVERY (TOPIC 2) ----------------
app.post("/deliver/:id", async (req, res) => {
  const orderId = req.params.id;

  await contract.methods.confirmDelivery(orderId).send({
    from: account,
    gas: 300000,
  });

  res.redirect("/");
});

// ---------------- SERVER ----------------
app.listen(PORT, () => {
  console.log(`FA Marketplace running at http://localhost:${PORT}`);
});
