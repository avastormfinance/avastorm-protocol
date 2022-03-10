pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../AErc20.sol";
import "../AToken.sol";
import "../PriceOracle.sol";
import "../EIP20Interface.sol";
import "../Governance/GovernorAlpha.sol";
import "../Governance/Alt.sol";

interface ComptrollerLensInterface {
    function markets(address) external view returns (bool, uint);
    function oracle() external view returns (PriceOracle);
    function getAccountLiquidity(address) external view returns (uint, uint, uint);
    function getAssetsIn(address) external view returns (AToken[] memory);
    function claimAlt(address) external;
    function altAccrued(address) external view returns (uint);
    function altSpeeds(address) external view returns (uint);
    function altSupplySpeeds(address) external view returns (uint);
    function altBorrowSpeeds(address) external view returns (uint);
    function borrowCaps(address) external view returns (uint);
}

interface GovernorBravoInterface {
    struct Receipt {
        bool hasVoted;
        uint8 support;
        uint96 votes;
    }
    struct Proposal {
        uint id;
        address proposer;
        uint eta;
        uint startBlock;
        uint endBlock;
        uint forVotes;
        uint againstVotes;
        uint abstainVotes;
        bool canceled;
        bool executed;
    }
    function getActions(uint proposalId) external view returns (address[] memory targets, uint[] memory values, string[] memory signatures, bytes[] memory calldatas);
    function proposals(uint proposalId) external view returns (Proposal memory);
    function getReceipt(uint proposalId, address voter) external view returns (Receipt memory);
}

contract AvastormLens {
    struct ATokenMetadata {
        address aToken;
        uint exchangeRateCurrent;
        uint supplyRatePerBlock;
        uint borrowRatePerBlock;
        uint reserveFactorMantissa;
        uint totalBorrows;
        uint totalReserves;
        uint totalSupply;
        uint totalCash;
        bool isListed;
        uint collateralFactorMantissa;
        address underlyingAssetAddress;
        uint aTokenDecimals;
        uint underlyingDecimals;
        uint altSupplySpeed;
        uint altBorrowSpeed;
        uint borrowCap;
    }

    function getAltSpeeds(ComptrollerLensInterface comptroller, AToken aToken) internal returns (uint, uint) {
        // Getting alt speeds is gnarly due to not every network having the
        // split alt speeds from Proposal 62 and other networks don't even
        // have alt speeds.
        uint altSupplySpeed = 0;
        (bool altSupplySpeedSuccess, bytes memory altSupplySpeedReturnData) =
            address(comptroller).call(
                abi.encodePacked(
                    comptroller.altSupplySpeeds.selector,
                    abi.encode(address(aToken))
                )
            );
        if (altSupplySpeedSuccess) {
            altSupplySpeed = abi.decode(altSupplySpeedReturnData, (uint));
        }

        uint altBorrowSpeed = 0;
        (bool altBorrowSpeedSuccess, bytes memory altBorrowSpeedReturnData) =
            address(comptroller).call(
                abi.encodePacked(
                    comptroller.altBorrowSpeeds.selector,
                    abi.encode(address(aToken))
                )
            );
        if (altBorrowSpeedSuccess) {
            altBorrowSpeed = abi.decode(altBorrowSpeedReturnData, (uint));
        }

        // If the split alt speeds call doesn't work, try the  oldest non-spit version.
        if (!altSupplySpeedSuccess || !altBorrowSpeedSuccess) {
            (bool altSpeedSuccess, bytes memory altSpeedReturnData) =
            address(comptroller).call(
                abi.encodePacked(
                    comptroller.altSpeeds.selector,
                    abi.encode(address(aToken))
                )
            );
            if (altSpeedSuccess) {
                altSupplySpeed = altBorrowSpeed = abi.decode(altSpeedReturnData, (uint));
            }
        }
        return (altSupplySpeed, altBorrowSpeed);
    }

    function aTokenMetadata(AToken aToken) public returns (ATokenMetadata memory) {
        uint exchangeRateCurrent = aToken.exchangeRateCurrent();
        ComptrollerLensInterface comptroller = ComptrollerLensInterface(address(aToken.comptroller()));
        (bool isListed, uint collateralFactorMantissa) = comptroller.markets(address(aToken));
        address underlyingAssetAddress;
        uint underlyingDecimals;

        if (compareStrings(aToken.symbol(), "cETH")) {
            underlyingAssetAddress = address(0);
            underlyingDecimals = 18;
        } else {
            AErc20 cErc20 = AErc20(address(aToken));
            underlyingAssetAddress = cErc20.underlying();
            underlyingDecimals = EIP20Interface(cErc20.underlying()).decimals();
        }

        (uint altSupplySpeed, uint altBorrowSpeed) = getAltSpeeds(comptroller, aToken);

        uint borrowCap = 0;
        (bool borrowCapSuccess, bytes memory borrowCapReturnData) =
            address(comptroller).call(
                abi.encodePacked(
                    comptroller.borrowCaps.selector,
                    abi.encode(address(aToken))
                )
            );
        if (borrowCapSuccess) {
            borrowCap = abi.decode(borrowCapReturnData, (uint));
        }

        return ATokenMetadata({
            aToken: address(aToken),
            exchangeRateCurrent: exchangeRateCurrent,
            supplyRatePerBlock: aToken.supplyRatePerBlock(),
            borrowRatePerBlock: aToken.borrowRatePerBlock(),
            reserveFactorMantissa: aToken.reserveFactorMantissa(),
            totalBorrows: aToken.totalBorrows(),
            totalReserves: aToken.totalReserves(),
            totalSupply: aToken.totalSupply(),
            totalCash: aToken.getCash(),
            isListed: isListed,
            collateralFactorMantissa: collateralFactorMantissa,
            underlyingAssetAddress: underlyingAssetAddress,
            aTokenDecimals: aToken.decimals(),
            underlyingDecimals: underlyingDecimals,
            altSupplySpeed: altSupplySpeed,
            altBorrowSpeed: altBorrowSpeed,
            borrowCap: borrowCap
        });
    }

    function aTokenMetadataAll(AToken[] calldata aTokens) external returns (ATokenMetadata[] memory) {
        uint aTokenCount = aTokens.length;
        ATokenMetadata[] memory res = new ATokenMetadata[](aTokenCount);
        for (uint i = 0; i < aTokenCount; i++) {
            res[i] = aTokenMetadata(aTokens[i]);
        }
        return res;
    }

    struct ATokenBalances {
        address aToken;
        uint balanceOf;
        uint borrowBalanceCurrent;
        uint balanceOfUnderlying;
        uint tokenBalance;
        uint tokenAllowance;
    }

    function aTokenBalances(AToken aToken, address payable account) public returns (ATokenBalances memory) {
        uint balanceOf = aToken.balanceOf(account);
        uint borrowBalanceCurrent = aToken.borrowBalanceCurrent(account);
        uint balanceOfUnderlying = aToken.balanceOfUnderlying(account);
        uint tokenBalance;
        uint tokenAllowance;

        if (compareStrings(aToken.symbol(), "cETH")) {
            tokenBalance = account.balance;
            tokenAllowance = account.balance;
        } else {
            AErc20 cErc20 = AErc20(address(aToken));
            EIP20Interface underlying = EIP20Interface(cErc20.underlying());
            tokenBalance = underlying.balanceOf(account);
            tokenAllowance = underlying.allowance(account, address(aToken));
        }

        return ATokenBalances({
            aToken: address(aToken),
            balanceOf: balanceOf,
            borrowBalanceCurrent: borrowBalanceCurrent,
            balanceOfUnderlying: balanceOfUnderlying,
            tokenBalance: tokenBalance,
            tokenAllowance: tokenAllowance
        });
    }

    function aTokenBalancesAll(AToken[] calldata aTokens, address payable account) external returns (ATokenBalances[] memory) {
        uint aTokenCount = aTokens.length;
        ATokenBalances[] memory res = new ATokenBalances[](aTokenCount);
        for (uint i = 0; i < aTokenCount; i++) {
            res[i] = aTokenBalances(aTokens[i], account);
        }
        return res;
    }

    struct ATokenUnderlyingPrice {
        address aToken;
        uint underlyingPrice;
    }

    function aTokenUnderlyingPrice(AToken aToken) public returns (ATokenUnderlyingPrice memory) {
        ComptrollerLensInterface comptroller = ComptrollerLensInterface(address(aToken.comptroller()));
        PriceOracle priceOracle = comptroller.oracle();

        return ATokenUnderlyingPrice({
            aToken: address(aToken),
            underlyingPrice: priceOracle.getUnderlyingPrice(aToken)
        });
    }

    function aTokenUnderlyingPriceAll(AToken[] calldata aTokens) external returns (ATokenUnderlyingPrice[] memory) {
        uint aTokenCount = aTokens.length;
        ATokenUnderlyingPrice[] memory res = new ATokenUnderlyingPrice[](aTokenCount);
        for (uint i = 0; i < aTokenCount; i++) {
            res[i] = aTokenUnderlyingPrice(aTokens[i]);
        }
        return res;
    }

    struct AccountLimits {
        AToken[] markets;
        uint liquidity;
        uint shortfall;
    }

    function getAccountLimits(ComptrollerLensInterface comptroller, address account) public returns (AccountLimits memory) {
        (uint errorCode, uint liquidity, uint shortfall) = comptroller.getAccountLiquidity(account);
        require(errorCode == 0);

        return AccountLimits({
            markets: comptroller.getAssetsIn(account),
            liquidity: liquidity,
            shortfall: shortfall
        });
    }

    struct GovReceipt {
        uint proposalId;
        bool hasVoted;
        bool support;
        uint96 votes;
    }

    function getGovReceipts(GovernorAlpha governor, address voter, uint[] memory proposalIds) public view returns (GovReceipt[] memory) {
        uint proposalCount = proposalIds.length;
        GovReceipt[] memory res = new GovReceipt[](proposalCount);
        for (uint i = 0; i < proposalCount; i++) {
            GovernorAlpha.Receipt memory receipt = governor.getReceipt(proposalIds[i], voter);
            res[i] = GovReceipt({
                proposalId: proposalIds[i],
                hasVoted: receipt.hasVoted,
                support: receipt.support,
                votes: receipt.votes
            });
        }
        return res;
    }

    struct GovBravoReceipt {
        uint proposalId;
        bool hasVoted;
        uint8 support;
        uint96 votes;
    }

    function getGovBravoReceipts(GovernorBravoInterface governor, address voter, uint[] memory proposalIds) public view returns (GovBravoReceipt[] memory) {
        uint proposalCount = proposalIds.length;
        GovBravoReceipt[] memory res = new GovBravoReceipt[](proposalCount);
        for (uint i = 0; i < proposalCount; i++) {
            GovernorBravoInterface.Receipt memory receipt = governor.getReceipt(proposalIds[i], voter);
            res[i] = GovBravoReceipt({
                proposalId: proposalIds[i],
                hasVoted: receipt.hasVoted,
                support: receipt.support,
                votes: receipt.votes
            });
        }
        return res;
    }

    struct GovProposal {
        uint proposalId;
        address proposer;
        uint eta;
        address[] targets;
        uint[] values;
        string[] signatures;
        bytes[] calldatas;
        uint startBlock;
        uint endBlock;
        uint forVotes;
        uint againstVotes;
        bool canceled;
        bool executed;
    }

    function setProposal(GovProposal memory res, GovernorAlpha governor, uint proposalId) internal view {
        (
            ,
            address proposer,
            uint eta,
            uint startBlock,
            uint endBlock,
            uint forVotes,
            uint againstVotes,
            bool canceled,
            bool executed
        ) = governor.proposals(proposalId);
        res.proposalId = proposalId;
        res.proposer = proposer;
        res.eta = eta;
        res.startBlock = startBlock;
        res.endBlock = endBlock;
        res.forVotes = forVotes;
        res.againstVotes = againstVotes;
        res.canceled = canceled;
        res.executed = executed;
    }

    function getGovProposals(GovernorAlpha governor, uint[] calldata proposalIds) external view returns (GovProposal[] memory) {
        GovProposal[] memory res = new GovProposal[](proposalIds.length);
        for (uint i = 0; i < proposalIds.length; i++) {
            (
                address[] memory targets,
                uint[] memory values,
                string[] memory signatures,
                bytes[] memory calldatas
            ) = governor.getActions(proposalIds[i]);
            res[i] = GovProposal({
                proposalId: 0,
                proposer: address(0),
                eta: 0,
                targets: targets,
                values: values,
                signatures: signatures,
                calldatas: calldatas,
                startBlock: 0,
                endBlock: 0,
                forVotes: 0,
                againstVotes: 0,
                canceled: false,
                executed: false
            });
            setProposal(res[i], governor, proposalIds[i]);
        }
        return res;
    }

    struct GovBravoProposal {
        uint proposalId;
        address proposer;
        uint eta;
        address[] targets;
        uint[] values;
        string[] signatures;
        bytes[] calldatas;
        uint startBlock;
        uint endBlock;
        uint forVotes;
        uint againstVotes;
        uint abstainVotes;
        bool canceled;
        bool executed;
    }

    function setBravoProposal(GovBravoProposal memory res, GovernorBravoInterface governor, uint proposalId) internal view {
        GovernorBravoInterface.Proposal memory p = governor.proposals(proposalId);

        res.proposalId = proposalId;
        res.proposer = p.proposer;
        res.eta = p.eta;
        res.startBlock = p.startBlock;
        res.endBlock = p.endBlock;
        res.forVotes = p.forVotes;
        res.againstVotes = p.againstVotes;
        res.abstainVotes = p.abstainVotes;
        res.canceled = p.canceled;
        res.executed = p.executed;
    }

    function getGovBravoProposals(GovernorBravoInterface governor, uint[] calldata proposalIds) external view returns (GovBravoProposal[] memory) {
        GovBravoProposal[] memory res = new GovBravoProposal[](proposalIds.length);
        for (uint i = 0; i < proposalIds.length; i++) {
            (
                address[] memory targets,
                uint[] memory values,
                string[] memory signatures,
                bytes[] memory calldatas
            ) = governor.getActions(proposalIds[i]);
            res[i] = GovBravoProposal({
                proposalId: 0,
                proposer: address(0),
                eta: 0,
                targets: targets,
                values: values,
                signatures: signatures,
                calldatas: calldatas,
                startBlock: 0,
                endBlock: 0,
                forVotes: 0,
                againstVotes: 0,
                abstainVotes: 0,
                canceled: false,
                executed: false
            });
            setBravoProposal(res[i], governor, proposalIds[i]);
        }
        return res;
    }

    struct AltBalanceMetadata {
        uint balance;
        uint votes;
        address delegate;
    }

    function getAltBalanceMetadata(Alt alt, address account) external view returns (AltBalanceMetadata memory) {
        return AltBalanceMetadata({
            balance: alt.balanceOf(account),
            votes: uint256(alt.getCurrentVotes(account)),
            delegate: alt.delegates(account)
        });
    }

    struct AltBalanceMetadataExt {
        uint balance;
        uint votes;
        address delegate;
        uint allocated;
    }

    function getAltBalanceMetadataExt(Alt alt, ComptrollerLensInterface comptroller, address account) external returns (AltBalanceMetadataExt memory) {
        uint balance = alt.balanceOf(account);
        comptroller.claimAlt(account);
        uint newBalance = alt.balanceOf(account);
        uint accrued = comptroller.altAccrued(account);
        uint total = add(accrued, newBalance, "sum alt total");
        uint allocated = sub(total, balance, "sub allocated");

        return AltBalanceMetadataExt({
            balance: balance,
            votes: uint256(alt.getCurrentVotes(account)),
            delegate: alt.delegates(account),
            allocated: allocated
        });
    }

    struct AltVotes {
        uint blockNumber;
        uint votes;
    }

    function getAltVotes(Alt alt, address account, uint32[] calldata blockNumbers) external view returns (AltVotes[] memory) {
        AltVotes[] memory res = new AltVotes[](blockNumbers.length);
        for (uint i = 0; i < blockNumbers.length; i++) {
            res[i] = AltVotes({
                blockNumber: uint256(blockNumbers[i]),
                votes: uint256(alt.getPriorVotes(account, blockNumbers[i]))
            });
        }
        return res;
    }

    function compareStrings(string memory a, string memory b) internal pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }

    function add(uint a, uint b, string memory errorMessage) internal pure returns (uint) {
        uint c = a + b;
        require(c >= a, errorMessage);
        return c;
    }

    function sub(uint a, uint b, string memory errorMessage) internal pure returns (uint) {
        require(b <= a, errorMessage);
        uint c = a - b;
        return c;
    }
}
