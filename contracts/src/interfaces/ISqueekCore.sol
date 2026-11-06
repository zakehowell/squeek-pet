// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice The read-only parts of the official SqueekCore on Sepolia that Squeek Pet World uses.
/// Field order follows the official ABI (https://docs.squeekchain.com/assets/abi/SqueekCore.json).
/// SqueekCore is an upgradeable proxy; `implementationCodeAddress()` names the code behind it.
interface ISqueekCore {
    struct State {
        uint64 settledThroughRound;
        uint64 cumulativeWork;
        uint96 cumulativeBlockUnits;
        uint64 blockHeight;
        uint96 blockProgress;
        uint32 workPerThousandBlocks;
        uint256 authorizationNonce;
        bool paused;
    }

    struct Configuration {
        bytes32 streamId;
        uint64 genesisTimestamp;
        uint64 roundDuration;
        uint64 maxWorkPerRound;
        uint16 maxRoundsPerBatch;
        address guardian;
        address reporter;
        uint32 initialWorkPerThousandBlocks;
        uint64 targetBlocksPerActiveRound;
        uint64 difficultySmoothingRounds;
        uint96 blockUnitsPerBlock;
    }

    function state() external view returns (State memory);

    function configuration() external view returns (Configuration memory);

    function implementationCodeAddress() external view returns (address);
}
