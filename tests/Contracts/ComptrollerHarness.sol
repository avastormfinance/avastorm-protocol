pragma solidity ^0.5.16;

import "../../contracts/Comptroller.sol";
import "../../contracts/PriceOracle.sol";

contract ComptrollerKovan is Comptroller {
  function getAltAddress() public view returns (address) {
    return 0x61460874a7196d6a22D1eE4922473664b3E95270;
  }
}

contract ComptrollerRopsten is Comptroller {
  function getAltAddress() public view returns (address) {
    return 0xf76D4a441E4ba86A923ce32B89AFF89dBccAA075;
  }
}

contract ComptrollerHarness is Comptroller {
    address altAddress;
    uint public blockNumber;

    constructor() Comptroller() public {}

    function setPauseGuardian(address harnessedPauseGuardian) public {
        pauseGuardian = harnessedPauseGuardian;
    }

    function setAltSupplyState(address aToken, uint224 index, uint32 blockNumber_) public {
        altSupplyState[aToken].index = index;
        altSupplyState[aToken].block = blockNumber_;
    }

    function setAltBorrowState(address aToken, uint224 index, uint32 blockNumber_) public {
        altBorrowState[aToken].index = index;
        altBorrowState[aToken].block = blockNumber_;
    }

    function setAltAccrued(address user, uint userAccrued) public {
        altAccrued[user] = userAccrued;
    }

    function setAltAddress(address altAddress_) public {
        altAddress = altAddress_;
    }

    function getAltAddress() public view returns (address) {
        return altAddress;
    }

    /**
     * @notice Set the amount of ALT distributed per block
     * @param altRate_ The amount of ALT wei per block to distribute
     */
    function harnessSetAltRate(uint altRate_) public {
        altRate = altRate_;
    }

    /**
     * @notice Recalculate and update ALT speeds for all ALT markets
     */
    function harnessRefreshAltSpeeds() public {
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

    function setAltBorrowerIndex(address aToken, address borrower, uint index) public {
        altBorrowerIndex[aToken][borrower] = index;
    }

    function setAltSupplierIndex(address aToken, address supplier, uint index) public {
        altSupplierIndex[aToken][supplier] = index;
    }

    function harnessDistributeAllBorrowerAlt(address aToken, address borrower, uint marketBorrowIndexMantissa) public {
        distributeBorrowerAlt(aToken, borrower, Exp({mantissa: marketBorrowIndexMantissa}));
        altAccrued[borrower] = grantAltInternal(borrower, altAccrued[borrower]);
    }

    function harnessDistributeAllSupplierAlt(address aToken, address supplier) public {
        distributeSupplierAlt(aToken, supplier);
        altAccrued[supplier] = grantAltInternal(supplier, altAccrued[supplier]);
    }

    function harnessUpdateAltBorrowIndex(address aToken, uint marketBorrowIndexMantissa) public {
        updateAltBorrowIndex(aToken, Exp({mantissa: marketBorrowIndexMantissa}));
    }

    function harnessUpdateAltSupplyIndex(address aToken) public {
        updateAltSupplyIndex(aToken);
    }

    function harnessDistributeBorrowerAlt(address aToken, address borrower, uint marketBorrowIndexMantissa) public {
        distributeBorrowerAlt(aToken, borrower, Exp({mantissa: marketBorrowIndexMantissa}));
    }

    function harnessDistributeSupplierAlt(address aToken, address supplier) public {
        distributeSupplierAlt(aToken, supplier);
    }

    function harnessTransferAlt(address user, uint userAccrued, uint threshold) public returns (uint) {
        if (userAccrued > 0 && userAccrued >= threshold) {
            return grantAltInternal(user, userAccrued);
        }
        return userAccrued;
    }

    function harnessAddAltMarkets(address[] memory aTokens) public {
        for (uint i = 0; i < aTokens.length; i++) {
            // temporarily set altSpeed to 1 (will be fixed by `harnessRefreshAltSpeeds`)
            setAltSpeedInternal(AToken(aTokens[i]), 1, 1);
        }
    }

    function harnessFastForward(uint blocks) public returns (uint) {
        blockNumber += blocks;
        return blockNumber;
    }

    function setBlockNumber(uint number) public {
        blockNumber = number;
    }

    function getBlockNumber() public view returns (uint) {
        return blockNumber;
    }

    function getAltMarkets() public view returns (address[] memory) {
        uint m = allMarkets.length;
        uint n = 0;
        for (uint i = 0; i < m; i++) {
            if (altSupplySpeeds[address(allMarkets[i])] > 0 || altBorrowSpeeds[address(allMarkets[i])] > 0) {
                n++;
            }
        }

        address[] memory altMarkets = new address[](n);
        uint k = 0;
        for (uint i = 0; i < m; i++) {
            if (altSupplySpeeds[address(allMarkets[i])] > 0 || altBorrowSpeeds[address(allMarkets[i])] > 0) {
                altMarkets[k++] = address(allMarkets[i]);
            }
        }
        return altMarkets;
    }
}

contract ComptrollerBorked {
    function _become(Unitroller unitroller, PriceOracle _oracle, uint _closeFactorMantissa, uint _maxAssets, bool _reinitializing) public {
        _oracle;
        _closeFactorMantissa;
        _maxAssets;
        _reinitializing;

        require(msg.sender == unitroller.admin(), "only unitroller admin can change brains");
        unitroller._acceptImplementation();
    }
}

contract BoolComptroller is ComptrollerInterface {
    bool allowMint = true;
    bool allowRedeem = true;
    bool allowBorrow = true;
    bool allowRepayBorrow = true;
    bool allowLiquidateBorrow = true;
    bool allowSeize = true;
    bool allowTransfer = true;

    bool verifyMint = true;
    bool verifyRedeem = true;
    bool verifyBorrow = true;
    bool verifyRepayBorrow = true;
    bool verifyLiquidateBorrow = true;
    bool verifySeize = true;
    bool verifyTransfer = true;

    bool failCalculateSeizeTokens;
    uint calculatedSeizeTokens;

    uint noError = 0;
    uint opaqueError = noError + 11; // an arbitrary, opaque error code

    /*** Assets You Are In ***/

    function enterMarkets(address[] calldata _aTokens) external returns (uint[] memory) {
        _aTokens;
        uint[] memory ret;
        return ret;
    }

    function exitMarket(address _aToken) external returns (uint) {
        _aToken;
        return noError;
    }

    /*** Policy Hooks ***/

    function mintAllowed(address _aToken, address _minter, uint _mintAmount) public returns (uint) {
        _aToken;
        _minter;
        _mintAmount;
        return allowMint ? noError : opaqueError;
    }

    function mintVerify(address _aToken, address _minter, uint _mintAmount, uint _mintTokens) external {
        _aToken;
        _minter;
        _mintAmount;
        _mintTokens;
        require(verifyMint, "mintVerify rejected mint");
    }

    function redeemAllowed(address _aToken, address _redeemer, uint _redeemTokens) public returns (uint) {
        _aToken;
        _redeemer;
        _redeemTokens;
        return allowRedeem ? noError : opaqueError;
    }

    function redeemVerify(address _aToken, address _redeemer, uint _redeemAmount, uint _redeemTokens) external {
        _aToken;
        _redeemer;
        _redeemAmount;
        _redeemTokens;
        require(verifyRedeem, "redeemVerify rejected redeem");
    }

    function borrowAllowed(address _aToken, address _borrower, uint _borrowAmount) public returns (uint) {
        _aToken;
        _borrower;
        _borrowAmount;
        return allowBorrow ? noError : opaqueError;
    }

    function borrowVerify(address _aToken, address _borrower, uint _borrowAmount) external {
        _aToken;
        _borrower;
        _borrowAmount;
        require(verifyBorrow, "borrowVerify rejected borrow");
    }

    function repayBorrowAllowed(
        address _aToken,
        address _payer,
        address _borrower,
        uint _repayAmount) public returns (uint) {
        _aToken;
        _payer;
        _borrower;
        _repayAmount;
        return allowRepayBorrow ? noError : opaqueError;
    }

    function repayBorrowVerify(
        address _aToken,
        address _payer,
        address _borrower,
        uint _repayAmount,
        uint _borrowerIndex) external {
        _aToken;
        _payer;
        _borrower;
        _repayAmount;
        _borrowerIndex;
        require(verifyRepayBorrow, "repayBorrowVerify rejected repayBorrow");
    }

    function liquidateBorrowAllowed(
        address _aTokenBorrowed,
        address _aTokenCollateral,
        address _liquidator,
        address _borrower,
        uint _repayAmount) public returns (uint) {
        _aTokenBorrowed;
        _aTokenCollateral;
        _liquidator;
        _borrower;
        _repayAmount;
        return allowLiquidateBorrow ? noError : opaqueError;
    }

    function liquidateBorrowVerify(
        address _aTokenBorrowed,
        address _aTokenCollateral,
        address _liquidator,
        address _borrower,
        uint _repayAmount,
        uint _seizeTokens) external {
        _aTokenBorrowed;
        _aTokenCollateral;
        _liquidator;
        _borrower;
        _repayAmount;
        _seizeTokens;
        require(verifyLiquidateBorrow, "liquidateBorrowVerify rejected liquidateBorrow");
    }

    function seizeAllowed(
        address _aTokenCollateral,
        address _aTokenBorrowed,
        address _borrower,
        address _liquidator,
        uint _seizeTokens) public returns (uint) {
        _aTokenCollateral;
        _aTokenBorrowed;
        _liquidator;
        _borrower;
        _seizeTokens;
        return allowSeize ? noError : opaqueError;
    }

    function seizeVerify(
        address _aTokenCollateral,
        address _aTokenBorrowed,
        address _liquidator,
        address _borrower,
        uint _seizeTokens) external {
        _aTokenCollateral;
        _aTokenBorrowed;
        _liquidator;
        _borrower;
        _seizeTokens;
        require(verifySeize, "seizeVerify rejected seize");
    }

    function transferAllowed(
        address _aToken,
        address _src,
        address _dst,
        uint _transferTokens) public returns (uint) {
        _aToken;
        _src;
        _dst;
        _transferTokens;
        return allowTransfer ? noError : opaqueError;
    }

    function transferVerify(
        address _aToken,
        address _src,
        address _dst,
        uint _transferTokens) external {
        _aToken;
        _src;
        _dst;
        _transferTokens;
        require(verifyTransfer, "transferVerify rejected transfer");
    }

    /*** Special Liquidation Calculation ***/

    function liquidateCalculateSeizeTokens(
        address _aTokenBorrowed,
        address _aTokenCollateral,
        uint _repayAmount) public view returns (uint, uint) {
        _aTokenBorrowed;
        _aTokenCollateral;
        _repayAmount;
        return failCalculateSeizeTokens ? (opaqueError, 0) : (noError, calculatedSeizeTokens);
    }

    /**** Mock Settors ****/

    /*** Policy Hooks ***/

    function setMintAllowed(bool allowMint_) public {
        allowMint = allowMint_;
    }

    function setMintVerify(bool verifyMint_) public {
        verifyMint = verifyMint_;
    }

    function setRedeemAllowed(bool allowRedeem_) public {
        allowRedeem = allowRedeem_;
    }

    function setRedeemVerify(bool verifyRedeem_) public {
        verifyRedeem = verifyRedeem_;
    }

    function setBorrowAllowed(bool allowBorrow_) public {
        allowBorrow = allowBorrow_;
    }

    function setBorrowVerify(bool verifyBorrow_) public {
        verifyBorrow = verifyBorrow_;
    }

    function setRepayBorrowAllowed(bool allowRepayBorrow_) public {
        allowRepayBorrow = allowRepayBorrow_;
    }

    function setRepayBorrowVerify(bool verifyRepayBorrow_) public {
        verifyRepayBorrow = verifyRepayBorrow_;
    }

    function setLiquidateBorrowAllowed(bool allowLiquidateBorrow_) public {
        allowLiquidateBorrow = allowLiquidateBorrow_;
    }

    function setLiquidateBorrowVerify(bool verifyLiquidateBorrow_) public {
        verifyLiquidateBorrow = verifyLiquidateBorrow_;
    }

    function setSeizeAllowed(bool allowSeize_) public {
        allowSeize = allowSeize_;
    }

    function setSeizeVerify(bool verifySeize_) public {
        verifySeize = verifySeize_;
    }

    function setTransferAllowed(bool allowTransfer_) public {
        allowTransfer = allowTransfer_;
    }

    function setTransferVerify(bool verifyTransfer_) public {
        verifyTransfer = verifyTransfer_;
    }

    /*** Liquidity/Liquidation Calculations ***/

    function setCalculatedSeizeTokens(uint seizeTokens_) public {
        calculatedSeizeTokens = seizeTokens_;
    }

    function setFailCalculateSeizeTokens(bool shouldFail) public {
        failCalculateSeizeTokens = shouldFail;
    }
}

contract EchoTypesComptroller is UnitrollerAdminStorage {
    function stringy(string memory s) public pure returns(string memory) {
        return s;
    }

    function addresses(address a) public pure returns(address) {
        return a;
    }

    function booly(bool b) public pure returns(bool) {
        return b;
    }

    function listOInts(uint[] memory u) public pure returns(uint[] memory) {
        return u;
    }

    function reverty() public pure {
        require(false, "gotcha sucka");
    }

    function becomeBrains(address payable unitroller) public {
        Unitroller(unitroller)._acceptImplementation();
    }
}
