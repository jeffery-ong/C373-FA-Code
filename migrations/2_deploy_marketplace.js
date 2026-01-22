const PaymentEscrow = artifacts.require("PaymentEscrow");
const ShippingTracking = artifacts.require("ShippingTracking");

module.exports = async function (deployer) {
  await deployer.deploy(PaymentEscrow);
  const escrow = await PaymentEscrow.deployed();

  await deployer.deploy(ShippingTracking, escrow.address);
  const shipping = await ShippingTracking.deployed();

  await escrow.setShippingContract(shipping.address);
};
