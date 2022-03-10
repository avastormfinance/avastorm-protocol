pragma solidity ^0.5.16;

import "../../contracts/Comptroller.sol";

contract ComptrollerScenario is Comptroller {
    uint public blockNumber;
    address public altAddress;

    constructor() Comptroller() public {}

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

    function setAltBorrowerIndex(address aToken, address borrower, uint index) public {
        altBorrowerIndex[aToken][borrower] = index;
    }

    function setAltSupplierIndex(address aToken, address supplier, uint index) public {
        altSupplierIndex[aToken][supplier] = index;
    }

    /**
     * @notice Recalculate and update ALT speeds for all ALT markets
     */
    function refreshAltSpeeds() public {
        AToken[] memory allMarkets_ = allMarkets;

        for (uint i = 0; i < allMarkets_.length; i++) {
            AToken aToken = allMarkets_[i];
            Exp memory borrowIndex = Exp({mantissa: aToken.borrowIndex()});
            updateAltSupplyIndex(address(aToken));
            updateAltBorrowIndex(address(aToken), borrowIndex);
        }

        Exp memory totalUtility = Exp({mantissa: 0});
        Exp[] memory utilities = new Exp[](allMarkets_.length);
        for (uint i = 0; i < allMarkets_.length; i++) {
            AToken aToken = allMarkets_[i];
            if (altSupplySpeeds[address(aToken)] > 0 || altBorrowSpeeds[address(aToken)] > 0) {
                Exp memory assetPrice = Exp({mantissa: oracle.getUnderlyingPrice(aToken)});
                Exp memory utility = mul_(assetPrice, aToken.totalBorrows());
                utilities[i] = utility;
                totalUtility = add_(totalUtility, utility);
            }
        }

        for (uint i = 0; i < allMarkets_.length; i++) {
            AToken aToken = allMarkets[i];
            uint newSpeed = totalUtility.mantissa > 0 ? mul_(altRate, div_(utilities[i], totalUtility)) : 0;
            setAltSpeedInternal(aToken, newSpeed, newSpeed);
        }
    }
}
