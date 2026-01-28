const PaymentEscrow = artifacts.require("PaymentEscrow");
const ShippingTracking = artifacts.require("ShippingTracking");

module.exports = async function (deployer) {
  await deployer.deploy(PaymentEscrow);
  const escrow = await PaymentEscrow.deployed();

  await deployer.deploy(ShippingTracking, escrow.address);
  const shipping = await ShippingTracking.deployed();

  await escrow.setShippingContract(shipping.address);

  const adminAccounts = [
    "0xe2d15dd1228D095A7327BBf947fE80c03d87D9e8",
    "0x878CF562C8dc9542c06d23e9a4cf2006b2241b18",
    "0xd73B950c62553caB7C90aAe8549DBF6C4A099Ed4",
    "0xa8F1eBc83Dff1984e5281c74aEbE969073ac94E3",
  ];

  for (const admin of adminAccounts) {
    if (!web3.utils.isAddress(admin)) {
      throw new Error(`Invalid admin address: ${admin}`);
    }
    await shipping.setAdmin(admin, true);
  }
};
