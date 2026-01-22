// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract PaymentEscrow {
    uint public orderCount = 0;

    struct Order {
        uint orderId;
        address buyer;
        address seller;
        uint amount;        // Escrowed payment
        bool shipped;       // Topic 2
        bool delivered;     // Topic 2
    }

    mapping(uint => Order) public orders;

    address public owner;
    address public shippingContract;

    // ---------------- EVENTS ----------------
    event OrderCreated(uint orderId, address buyer, address seller, uint amount);
    event OrderShipped(uint orderId);
    event OrderDelivered(uint orderId);
    event ShippingContractUpdated(address shippingContract);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyShipping() {
        require(msg.sender == shippingContract, "Only shipping contract");
        _;
    }

    function setShippingContract(address _shippingContract) external onlyOwner {
        require(_shippingContract != address(0), "Invalid shipping contract");
        shippingContract = _shippingContract;
        emit ShippingContractUpdated(_shippingContract);
    }

    // ---------------- TOPIC 1: PAYMENT AUTOMATION ----------------
    function createOrder(address _seller) public payable {
        require(msg.value > 0, "Payment required");

        orderCount++;

        orders[orderCount] = Order(
            orderCount,
            msg.sender,
            _seller,
            msg.value,
            false,
            false
        );

        emit OrderCreated(orderCount, msg.sender, _seller, msg.value);
    }

    // ---------------- TOPIC 2: SHIPPING TRACKING ----------------
    function markShippedFromShipping(uint _orderId, address caller)
        external
        onlyShipping
    {
        Order storage order = orders[_orderId];

        require(caller == order.seller, "Only seller can mark shipped");
        require(!order.shipped, "Already shipped");

        order.shipped = true;
        emit OrderShipped(_orderId);
    }

    function confirmDeliveryFromShipping(uint _orderId, address caller)
        external
        onlyShipping
    {
        Order storage order = orders[_orderId];

        require(caller == order.buyer, "Only buyer can confirm delivery");
        require(order.shipped, "Order not shipped");
        require(!order.delivered, "Already delivered");

        order.delivered = true;

        // Auto-release escrow payment
        payable(order.seller).transfer(order.amount);

        emit OrderDelivered(_orderId);
    }

    // ---------------- GETTER ----------------
    function getOrder(uint _orderId)
        public
        view
        returns (
            uint,
            address,
            address,
            uint,
            bool,
            bool
        )
    {
        Order memory o = orders[_orderId];
        return (
            o.orderId,
            o.buyer,
            o.seller,
            o.amount,
            o.shipped,
            o.delivered
        );
    }
}
