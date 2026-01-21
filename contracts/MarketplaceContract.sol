// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MarketplaceContract {

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

    // ---------------- EVENTS ----------------
    event OrderCreated(uint orderId, address buyer, address seller, uint amount);
    event OrderShipped(uint orderId);
    event OrderDelivered(uint orderId);

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
    function markShipped(uint _orderId) public {
        Order storage order = orders[_orderId];

        require(msg.sender == order.seller, "Only seller can mark shipped");
        require(!order.shipped, "Already shipped");

        order.shipped = true;
        emit OrderShipped(_orderId);
    }

    function confirmDelivery(uint _orderId) public {
        Order storage order = orders[_orderId];

        require(msg.sender == order.buyer, "Only buyer can confirm delivery");
        require(order.shipped, "Order not shipped");
        require(!order.delivered, "Already delivered");

        order.delivered = true;

        // Auto-release escrow payment
        payable(order.seller).transfer(order.amount);

        emit OrderDelivered(_orderId);
    }

    // ---------------- GETTER ----------------
    function getOrder(uint _orderId) public view returns (
        uint,
        address,
        address,
        uint,
        bool,
        bool
    ) {
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
