// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IShippingTracking {
    function createShipment(
        uint orderId,
        address sender,
        string calldata pickupLocation,
        string calldata dropoffLocation,
        string calldata senderName,
        string calldata senderPhone,
        string calldata receiverName
    ) external;
}

contract PaymentEscrow {
    uint public orderCount = 0;

    struct Order {
        uint orderId;
        address buyer;
        uint amount;
        bool paid;
    }

    mapping(uint => Order) public orders;

    address public owner;
    address public shippingContract;

    // ---------------- EVENTS ----------------
    event OrderCreated(uint orderId, address buyer, uint amount);
    event ShippingContractUpdated(address shippingContract);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    function setShippingContract(address _shippingContract) external onlyOwner {
        require(_shippingContract != address(0), "Invalid shipping contract");
        shippingContract = _shippingContract;
        emit ShippingContractUpdated(_shippingContract);
    }

    // ---------------- DELIVERY REQUEST ----------------
    function createDeliveryOrder(
        string calldata pickupLocation,
        string calldata dropoffLocation,
        string calldata senderName,
        string calldata senderPhone,
        string calldata receiverName
    ) external payable {
        require(msg.value > 0, "Payment required");
        require(shippingContract != address(0), "Shipping contract not set");

        orderCount++;

        orders[orderCount] = Order(
            orderCount,
            msg.sender,
            msg.value,
            true
        );

        IShippingTracking(shippingContract).createShipment(
            orderCount,
            msg.sender,
            pickupLocation,
            dropoffLocation,
            senderName,
            senderPhone,
            receiverName
        );

        payable(owner).transfer(msg.value);

        emit OrderCreated(orderCount, msg.sender, msg.value);
    }

    // ---------------- GETTER ----------------
    function getOrder(uint _orderId)
        external
        view
        returns (
            uint,
            address,
            uint,
            bool
        )
    {
        Order memory o = orders[_orderId];
        return (
            o.orderId,
            o.buyer,
            o.amount,
            o.paid
        );
    }
}
