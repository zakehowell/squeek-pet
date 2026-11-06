// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ISqueekCore} from "../interfaces/ISqueekCore.sol";

/// @dev Test double for SqueekCore. Tests set its numbers and can make it misbehave.
contract MockSqueekCore {
    enum Mode {
        Normal,
        Revert,
        ShortReply,
        HugeReply,
        BurnGas,
        DirtyWord
    }

    ISqueekCore.State internal _state;
    address public implementationCodeAddress;
    uint64 public maxWorkPerRound = 10_000;
    Mode public mode;

    constructor(address implementation) {
        implementationCodeAddress = implementation;
    }

    function setState(uint64 round, uint64 work) external {
        _state.settledThroughRound = round;
        _state.cumulativeWork = work;
    }

    /// @dev Adds `rounds` settled rounds carrying `work` in total, like one settlement batch.
    function settle(uint64 rounds, uint64 work) external {
        _state.settledThroughRound += rounds;
        _state.cumulativeWork += work;
    }

    function setImplementation(address implementation) external {
        implementationCodeAddress = implementation;
    }

    function setMode(Mode m) external {
        mode = m;
    }

    function setMaxWorkPerRound(uint64 value) external {
        maxWorkPerRound = value;
    }

    function state() external view returns (ISqueekCore.State memory) {
        _misbehave();
        return _state;
    }

    function configuration() external view returns (ISqueekCore.Configuration memory c) {
        c.roundDuration = 600;
        c.maxWorkPerRound = maxWorkPerRound;
        c.maxRoundsPerBatch = 16;
    }

    function _misbehave() internal view {
        Mode m = mode;
        if (m == Mode.Revert) revert("core unavailable");
        if (m == Mode.ShortReply) {
            assembly {
                mstore(0, 7)
                return(0, 32)
            }
        }
        if (m == Mode.HugeReply) {
            assembly {
                return(0, 100000)
            }
        }
        if (m == Mode.BurnGas) {
            uint256 x;
            while (gasleft() > 1000) x++;
        }
        if (m == Mode.DirtyWord) {
            assembly {
                mstore(0, not(0))
                mstore(32, 5)
                return(0, 256)
            }
        }
    }
}
