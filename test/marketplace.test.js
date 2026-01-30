const PaymentEscrow = artifacts.require("PaymentEscrow");
const ShippingTracking = artifacts.require("ShippingTracking");

contract("Marketplace contracts", (accounts) => {
  const owner = accounts[0];
  const buyer = accounts[1];
  const other = accounts[2];
  const pickup = "Sydney";
  const dropoff = "Melbourne";
  const senderName = "Alice";
  const senderPhone = "0400000000";
  const receiverName = "Bob";

  let escrow;
  let shipping;

  before(async () => {
    escrow = await PaymentEscrow.deployed();
    shipping = await ShippingTracking.deployed();
  });

  async function createOrder({ from = buyer, valueEth = "1" } = {}) {
    const tx = await escrow.createDeliveryOrder(
      pickup,
      dropoff,
      senderName,
      senderPhone,
      receiverName,
      { from, value: web3.utils.toWei(valueEth, "ether") }
    );
    const event = tx.logs.find((log) => log.event === "OrderCreated");
    return event.args.orderId.toNumber();
  }

  async function findNonAdminAccount() {
    for (const acct of accounts) {
      if (acct === owner) continue;
      const isAdmin = await shipping.admins(acct);
      if (!isAdmin) return acct;
    }
    throw new Error("No non-admin account available for test");
  }

  it("creates a delivery order and increments count", async () => {
    const beforeCount = (await escrow.orderCount()).toNumber();
    const orderId = await createOrder();
    const afterCount = (await escrow.orderCount()).toNumber();

    assert.strictEqual(afterCount, beforeCount + 1, "orderCount not incremented");
    const order = await escrow.getOrder(orderId);
    assert.strictEqual(order[0].toNumber(), orderId, "order id mismatch");
    assert.strictEqual(order[1], buyer, "buyer mismatch");
    assert.strictEqual(order[3], true, "paid flag mismatch");
  });

  it("creates a shipment linked to the order", async () => {
    const orderId = await createOrder();
    const shipment = await shipping.getShipment(orderId);

    assert.strictEqual(shipment[0].toNumber(), orderId, "shipment orderId mismatch");
    assert.strictEqual(shipment[1], buyer, "shipment sender mismatch");
    assert.strictEqual(shipment[2], pickup, "pickup mismatch");
    assert.strictEqual(shipment[3], dropoff, "dropoff mismatch");
    assert.strictEqual(shipment[4], senderName, "sender name mismatch");
    assert.strictEqual(shipment[5], senderPhone, "sender phone mismatch");
    assert.strictEqual(shipment[6], receiverName, "receiver mismatch");
    assert.strictEqual(shipment[7].toNumber(), 0, "status should be NotCollected");
  });

  it("reverts when payment is missing", async () => {
    try {
      await escrow.createDeliveryOrder(
        pickup,
        dropoff,
        senderName,
        senderPhone,
        receiverName,
        { from: buyer, value: 0 }
      );
      assert.fail("expected revert");
    } catch (error) {
      assert(
        error.message.includes("Payment required"),
        "unexpected revert reason"
      );
    }
  });

  it("prevents non-admin from marking collected", async () => {
    const orderId = await createOrder();
    const nonAdmin = await findNonAdminAccount();
    try {
      await shipping.markCollected(orderId, { from: nonAdmin });
      assert.fail("expected revert");
    } catch (error) {
      assert(error.message.includes("Only admin"), "unexpected revert reason");
    }
  });

  it("allows admin to update status to collected and delivered", async () => {
    const orderId = await createOrder();

    await shipping.markCollected(orderId, { from: owner });
    let shipment = await shipping.getShipment(orderId);
    assert.strictEqual(shipment[7].toNumber(), 1, "status should be InTransit");

    await shipping.markDelivered(orderId, { from: owner });
    shipment = await shipping.getShipment(orderId);
    assert.strictEqual(shipment[7].toNumber(), 2, "status should be Delivered");
  });

  it("prevents non-owner from setting the shipping contract", async () => {
    try {
      await escrow.setShippingContract(shipping.address, { from: other });
      assert.fail("expected revert");
    } catch (error) {
      assert(error.message.includes("Only owner"), "unexpected revert reason");
    }
  });

  it("allows owner to set admin", async () => {
    const newAdmin = await findNonAdminAccount();
    await shipping.setAdmin(newAdmin, true, { from: owner });
    const isAdmin = await shipping.admins(newAdmin);
    assert.strictEqual(isAdmin, true, "admin not set");
  });

  it("prevents non-escrow from creating shipment directly", async () => {
    try {
      await shipping.createShipment(
        9999,
        buyer,
        pickup,
        dropoff,
        senderName,
        senderPhone,
        receiverName,
        { from: other }
      );
      assert.fail("expected revert");
    } catch (error) {
      assert(
        error.message.includes("Only escrow contract"),
        "unexpected revert reason"
      );
    }
  });

  it("reverts when fetching a missing shipment", async () => {
    try {
      await shipping.getShipment(999999);
      assert.fail("expected revert");
    } catch (error) {
      assert(
        error.message.includes("Shipment not found"),
        "unexpected revert reason"
      );
    }
  });

  it("prevents marking collected twice", async () => {
    const orderId = await createOrder();
    await shipping.markCollected(orderId, { from: owner });
    try {
      await shipping.markCollected(orderId, { from: owner });
      assert.fail("expected revert");
    } catch (error) {
      assert(error.message.includes("Invalid status"), "unexpected revert reason");
    }
  });
});
