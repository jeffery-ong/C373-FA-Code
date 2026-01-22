// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IPaymentEscrow {
    function markShippedFromShipping(uint _orderId, address caller) external;
    function confirmDeliveryFromShipping(uint _orderId, address caller) external;
}

contract ShippingTracking {
    IPaymentEscrow public escrow;

    constructor(address escrowAddress) {
        require(escrowAddress != address(0), "Invalid escrow address");
        escrow = IPaymentEscrow(escrowAddress);
    }

    function markShipped(uint _orderId) public {
        escrow.markShippedFromShipping(_orderId, msg.sender);
    }

    function confirmDelivery(uint _orderId) public {
        escrow.confirmDeliveryFromShipping(_orderId, msg.sender);
    }
}
