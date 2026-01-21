const MarketplaceContract = artifacts.require("MarketplaceContract");

module.exports = function (deployer) {
  deployer.deploy(MarketplaceContract);
};
