pragma solidity ^0.5.16;

import "../../contracts/ComptrollerG6.sol";

contract ComptrollerScenarioG6 is ComptrollerG6 {
    uint public blockNumber;
    address public altAddress;

    constructor() ComptrollerG6() public {}

    function fastForward(uint blocks) public returns (uint) {
        blockNumber += blocks;
        return blockNumber;
    }

    function setAltAddress(address altAddress_) public {
        altAddress = altAddress_;
    }

    function getAltAddress() public view returns (address) {
        return altAddress;
    }

    function setBlockNumber(uint number) public {
        blockNumber = number;
    }

    function getBlockNumber() public view returns (uint) {
        return blockNumber;
    }

    function membershipLength(AToken aToken) public view returns (uint) {
        return accountAssets[address(aToken)].length;
    }

    function unlist(AToken aToken) public {
        markets[address(aToken)].isListed = false;
    }

    function setAltSpeed(address aToken, uint altSpeed) public {
        altSpeeds[aToken] = altSpeed;
    }
}
