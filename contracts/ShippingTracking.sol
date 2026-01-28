// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ShippingTracking {
    enum DeliveryStatus {
        NotCollected,
        InTransit,
        Delivered
    }

    struct Shipment {
        uint orderId;
        address sender;
        string pickupLocation;
        string dropoffLocation;
        string senderName;
        string senderPhone;
        string receiverName;
        DeliveryStatus status;
    }

    mapping(uint => Shipment) public shipments;

    address public owner;
    address public escrow;
    mapping(address => bool) public admins;

    event ShipmentCreated(uint orderId, address sender);
    event StatusUpdated(uint orderId, DeliveryStatus status);
    event AdminUpdated(address admin, bool enabled);

    constructor(address escrowAddress) {
        require(escrowAddress != address(0), "Invalid escrow address");
        owner = msg.sender;
        escrow = escrowAddress;
        admins[msg.sender] = true;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyAdmin() {
        require(msg.sender == owner || admins[msg.sender], "Only admin");
        _;
    }

    modifier onlyEscrow() {
        require(msg.sender == escrow, "Only escrow contract");
        _;
    }

    function setAdmin(address admin, bool enabled) external onlyOwner {
        require(admin != address(0), "Invalid admin");
        admins[admin] = enabled;
        emit AdminUpdated(admin, enabled);
    }

    function createShipment(
        uint orderId,
        address sender,
        string calldata pickupLocation,
        string calldata dropoffLocation,
        string calldata senderName,
        string calldata senderPhone,
        string calldata receiverName
    ) external onlyEscrow {
        require(shipments[orderId].orderId == 0, "Shipment exists");

        shipments[orderId] = Shipment(
            orderId,
            sender,
            pickupLocation,
            dropoffLocation,
            senderName,
            senderPhone,
            receiverName,
            DeliveryStatus.NotCollected
        );

        emit ShipmentCreated(orderId, sender);
    }

    function markCollected(uint orderId) external onlyAdmin {
        Shipment storage shipment = shipments[orderId];
        require(shipment.orderId != 0, "Shipment not found");
        require(shipment.status == DeliveryStatus.NotCollected, "Invalid status");

        shipment.status = DeliveryStatus.InTransit;
        emit StatusUpdated(orderId, shipment.status);
    }

    function markDelivered(uint orderId) external onlyAdmin {
        Shipment storage shipment = shipments[orderId];
        require(shipment.orderId != 0, "Shipment not found");
        require(shipment.status != DeliveryStatus.Delivered, "Already delivered");

        shipment.status = DeliveryStatus.Delivered;
        emit StatusUpdated(orderId, shipment.status);
    }

    function getShipment(uint orderId)
        external
        view
        returns (
            uint,
            address,
            string memory,
            string memory,
            string memory,
            string memory,
            string memory,
            DeliveryStatus
        )
    {
        Shipment memory shipment = shipments[orderId];
        require(shipment.orderId != 0, "Shipment not found");
        return (
            shipment.orderId,
            shipment.sender,
            shipment.pickupLocation,
            shipment.dropoffLocation,
            shipment.senderName,
            shipment.senderPhone,
            shipment.receiverName,
            shipment.status
        );
    }
}
