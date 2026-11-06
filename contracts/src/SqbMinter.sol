// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ISqueekCore} from "./interfaces/ISqueekCore.sol";
import {ISqb} from "./interfaces/ITokens.sol";

/// @title Stake testnet SQK, earn SQB from the hamster's settled work
/// @notice Every 10 units of work that the official SqueekCore settles become 1 SQB. `sync()`
/// (anyone may call it; staking and claiming call it too) reads SqueekCore's cumulative work and
/// puts the new SQB into a 24-hour stream. The stream pays every second to the addresses that have
/// SQK staked here, in proportion to their stake, so a large stake held for a moment earns only that
/// moment's share. SQB is minted when a staker claims it. Work settled while nobody is staked, or
/// while minting is paused, is never minted.
/// @dev Safety rules from the Squeek Pet World whitepaper:
/// - At most `maxWorkPerRound` work (read from SqueekCore, 10,000 today) per settled round, so at most
///   1,000 SQB per round. More work than that, cumulative work or rounds going backwards, or a reply
///   in an unexpected format pauses minting. A change of SqueekCore's implementation pauses it too.
/// - The owner can only pause and resume minting. Resuming re-reads SqueekCore and skips the paused
///   gap, so the owner can never cause extra SQB. Nobody can move staked SQK except its staker, and
///   unstaking never touches SqueekCore or depends on minting.
/// - Reads of SqueekCore use a fixed gas budget and copy at most 64 bytes of the reply, so a broken
///   SqueekCore can't block staking or claiming.
contract SqbMinter is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum PauseReason {
        None,
        Owner,
        ImplementationChanged,
        Regressed,
        TooMuchWork,
        BadFormat
    }

    /// @notice One player's numbers and the stream's, as `account` returns them.
    struct Account {
        uint256 staked;
        uint256 claimable;
        uint256 totalStaked;
        /// SQB (in wei) the whole stream pays per second right now.
        uint256 ratePerSecond;
        uint256 streamEnds;
        /// Settled work the next sync will turn into SQB (0 while paused).
        uint256 pendingWork;
        PauseReason pauseReason;
        uint256 lastRound;
        uint256 lastWork;
        uint256 totalScheduled;
        uint256 totalClaimed;
        uint256 sqkBalance;
        uint256 sqkAllowance;
        uint256 sqbBalance;
    }

    uint256 public constant WORK_PER_SQB = 10;
    uint256 public constant SQB_PER_WORK = 1e18 / WORK_PER_SQB;
    uint256 public constant STREAM_DURATION = 24 hours;
    uint256 public constant READ_GAS = 200_000;
    uint256 private constant PRECISION = 1e18;
    uint256 private constant STATE_SIZE = 8 * 32;

    ISqueekCore public immutable core;
    IERC20 public immutable sqk;
    ISqb public immutable sqb;
    uint256 public immutable maxWorkPerRound;

    // Where minting has counted up to, in SqueekCore's own numbers.
    address public acceptedImplementation;
    uint64 public lastRound;
    uint64 public lastWork;
    PauseReason public pauseReason;

    uint256 public totalStaked;
    mapping(address => uint256) public stakedOf;

    // The reward stream. `rewardRateX` is SQB (in wei) per second, times 1e18.
    uint256 public rewardRateX;
    uint256 public periodFinish;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    /// @notice SQB put into the stream from settled work, all time.
    uint256 public totalScheduled;
    /// @notice SQB minted to stakers, all time.
    uint256 public totalClaimed;
    /// @notice Settled work that arrived while nobody was staked; it is never minted.
    uint256 public workWithoutStakers;

    event Anchored(uint256 round, uint256 cumulativeWork, address implementation);
    event Synced(uint256 round, uint256 cumulativeWork, uint256 newWork, uint256 scheduled);
    event MintingPaused(PauseReason reason, uint256 lastRound, uint256 lastWork);
    event MintingResumed(uint256 round, uint256 cumulativeWork, address implementation);
    event Staked(address indexed account, uint256 amount);
    event Unstaked(address indexed account, uint256 amount);
    event Claimed(address indexed account, uint256 amount);

    error BadCore();
    error CoreUnreadable();
    error ZeroAmount();
    error NotEnoughStaked(uint256 staked);
    error AlreadyPaused();
    error NotPaused();
    error CannotRecoverStake();

    constructor(ISqueekCore core_, IERC20 sqk_, ISqb sqb_, address owner_) Ownable(owner_) {
        if (address(core_) == address(0) || address(sqk_) == address(0) || address(sqb_) == address(0)) {
            revert BadCore();
        }
        core = core_;
        sqk = sqk_;
        sqb = sqb_;
        uint256 maxWork = core_.configuration().maxWorkPerRound;
        address implementation = core_.implementationCodeAddress();
        if (maxWork == 0 || implementation == address(0)) revert BadCore();
        maxWorkPerRound = maxWork;
        acceptedImplementation = implementation;
        // Start from SqueekCore's current numbers: work settled before deployment is not minted.
        ISqueekCore.State memory s = core_.state();
        lastRound = s.settledThroughRound;
        lastWork = s.cumulativeWork;
        emit Anchored(s.settledThroughRound, s.cumulativeWork, implementation);
    }

    // ---------------------------------------------------------------- minting

    /// @notice Turns work that SqueekCore settled since the last sync into SQB for stakers.
    /// @return scheduled SQB (in wei) added to the 24-hour stream.
    function sync() external nonReentrant returns (uint256 scheduled) {
        return _sync();
    }

    /// @notice Settled work not counted yet, as the next sync would see it (0 while paused or if the
    /// reading would pause minting).
    function pendingWork() public view returns (uint256) {
        if (pauseReason != PauseReason.None) return 0;
        (bool ok, uint256 size, uint256 word,) = _read(ISqueekCore.implementationCodeAddress.selector);
        if (!ok || size != 32 || word != uint256(uint160(acceptedImplementation))) return 0;
        uint256 round;
        uint256 work;
        (ok, size, round, work) = _read(ISqueekCore.state.selector);
        if (!ok || size != STATE_SIZE || round < lastRound || work < lastWork) return 0;
        if (round > type(uint64).max || work > type(uint64).max) return 0;
        if (work - lastWork > (round - lastRound) * maxWorkPerRound) return 0;
        return work - lastWork;
    }

    function mintingPaused() external view returns (bool) {
        return pauseReason != PauseReason.None;
    }

    function pauseMinting() external onlyOwner {
        if (pauseReason != PauseReason.None) revert AlreadyPaused();
        _pause(PauseReason.Owner);
    }

    /// @notice Starts minting again from SqueekCore's current numbers. Work settled while minting was
    /// paused is skipped, never minted. Accepts SqueekCore's current implementation, so check it
    /// against the official deployment record first.
    function resumeMinting() external onlyOwner {
        if (pauseReason == PauseReason.None) revert NotPaused();
        (bool ok, uint256 size, uint256 word,) = _read(ISqueekCore.implementationCodeAddress.selector);
        if (!ok || size != 32 || word >> 160 != 0 || word == 0) revert CoreUnreadable();
        address implementation = address(uint160(word));
        uint256 round;
        uint256 work;
        (ok, size, round, work) = _read(ISqueekCore.state.selector);
        if (!ok || size != STATE_SIZE || round > type(uint64).max || work > type(uint64).max) {
            revert CoreUnreadable();
        }
        acceptedImplementation = implementation;
        lastRound = uint64(round);
        lastWork = uint64(work);
        pauseReason = PauseReason.None;
        emit MintingResumed(round, work, implementation);
    }

    // ---------------------------------------------------------------- staking

    function stake(uint256 amount) external nonReentrant {
        _stake(amount);
    }

    /// @notice Stakes with an EIP-2612 permit signature instead of a separate approval.
    /// @dev A permit that fails (for example because someone submitted it first) is ignored; the
    /// transfer then needs the allowance to be there anyway.
    function stakeWithPermit(uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external nonReentrant {
        try IERC20Permit(address(sqk)).permit(msg.sender, address(this), amount, deadline, v, r, s) {} catch {}
        _stake(amount);
    }

    /// @notice Takes staked SQK back. Always open: no fee, no lock, no dependency on SqueekCore.
    function unstake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 staked = stakedOf[msg.sender];
        if (amount > staked) revert NotEnoughStaked(staked);
        _updateReward(msg.sender);
        stakedOf[msg.sender] = staked - amount;
        totalStaked -= amount;
        sqk.safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    /// @notice Mints the caller's earned SQB to them.
    function claim() external nonReentrant returns (uint256 reward) {
        _sync();
        _updateReward(msg.sender);
        reward = rewards[msg.sender];
        if (reward != 0) {
            rewards[msg.sender] = 0;
            totalClaimed += reward;
            sqb.mint(msg.sender, reward);
            emit Claimed(msg.sender, reward);
        }
    }

    // ---------------------------------------------------------------- views

    function lastTimeRewardApplicable() public view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    /// @notice SQB earned per staked SQK so far, times 1e18 (both in wei).
    function rewardPerToken() public view returns (uint256) {
        if (totalStaked == 0) return rewardPerTokenStored;
        return rewardPerTokenStored + ((lastTimeRewardApplicable() - lastUpdateTime) * rewardRateX) / totalStaked;
    }

    /// @notice SQB (in wei) that `who` can claim now.
    function earned(address who) public view returns (uint256) {
        return rewards[who] + (stakedOf[who] * (rewardPerToken() - userRewardPerTokenPaid[who])) / PRECISION;
    }

    /// @notice SQB (in wei) the whole stream pays per second right now.
    function rewardRate() public view returns (uint256) {
        return block.timestamp < periodFinish ? rewardRateX / PRECISION : 0;
    }

    /// @notice Everything the game shows for one player, in one call (`who` may be 0).
    function account(address who) external view returns (Account memory a) {
        a.totalStaked = totalStaked;
        a.ratePerSecond = rewardRate();
        a.streamEnds = periodFinish;
        a.pendingWork = pendingWork();
        a.pauseReason = pauseReason;
        a.lastRound = lastRound;
        a.lastWork = lastWork;
        a.totalScheduled = totalScheduled;
        a.totalClaimed = totalClaimed;
        if (who == address(0)) return a;
        a.staked = stakedOf[who];
        a.claimable = earned(who);
        a.sqkBalance = sqk.balanceOf(who);
        a.sqkAllowance = sqk.allowance(who, address(this));
        a.sqbBalance = sqb.balanceOf(who);
    }

    // ---------------------------------------------------------------- owner

    /// @notice Returns tokens sent here by mistake. Staked SQK can never be taken.
    function recoverToken(IERC20 token, address to, uint256 amount) external onlyOwner {
        if (address(token) == address(sqk)) revert CannotRecoverStake();
        token.safeTransfer(to, amount);
    }

    // ---------------------------------------------------------------- internals

    function _stake(uint256 amount) private {
        if (amount == 0) revert ZeroAmount();
        _sync();
        _updateReward(msg.sender);
        uint256 balanceBefore = sqk.balanceOf(address(this));
        sqk.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = sqk.balanceOf(address(this)) - balanceBefore;
        stakedOf[msg.sender] += received;
        totalStaked += received;
        emit Staked(msg.sender, received);
    }

    function _sync() private returns (uint256 scheduled) {
        if (pauseReason != PauseReason.None) return 0;

        (bool ok, uint256 size, uint256 word,) = _read(ISqueekCore.implementationCodeAddress.selector);
        if (!ok) return 0; // SqueekCore didn't answer; try again on the next call
        if (size != 32 || word >> 160 != 0) return _pause(PauseReason.BadFormat);
        if (address(uint160(word)) != acceptedImplementation) return _pause(PauseReason.ImplementationChanged);

        uint256 round;
        uint256 work;
        (ok, size, round, work) = _read(ISqueekCore.state.selector);
        if (!ok) return 0;
        if (size != STATE_SIZE || round > type(uint64).max || work > type(uint64).max) {
            return _pause(PauseReason.BadFormat);
        }
        uint256 fromRound = lastRound;
        uint256 fromWork = lastWork;
        if (round < fromRound || work < fromWork) return _pause(PauseReason.Regressed);
        uint256 rounds = round - fromRound;
        uint256 newWork = work - fromWork;
        if (newWork > rounds * maxWorkPerRound) return _pause(PauseReason.TooMuchWork);
        if (rounds == 0) return 0;

        lastRound = uint64(round);
        lastWork = uint64(work);
        if (newWork == 0) {
            emit Synced(round, work, 0, 0); // resting rounds
            return 0;
        }
        _updateReward(address(0));
        if (totalStaked == 0) {
            workWithoutStakers += newWork;
            emit Synced(round, work, newWork, 0);
            return 0;
        }
        scheduled = newWork * SQB_PER_WORK;
        _schedule(scheduled);
        totalScheduled += scheduled;
        emit Synced(round, work, newWork, scheduled);
    }

    /// @dev Adds `amount` to whatever the stream still owes and pays it all over the next 24 hours.
    /// The caller has already brought `rewardPerTokenStored` up to date.
    function _schedule(uint256 amount) private {
        uint256 amountX = amount * PRECISION;
        if (block.timestamp < periodFinish) amountX += (periodFinish - block.timestamp) * rewardRateX;
        rewardRateX = amountX / STREAM_DURATION;
        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp + STREAM_DURATION;
    }

    function _updateReward(address who) private {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();
        if (who != address(0)) {
            rewards[who] = earned(who);
            userRewardPerTokenPaid[who] = rewardPerTokenStored;
        }
    }

    function _pause(PauseReason reason) private returns (uint256) {
        pauseReason = reason;
        emit MintingPaused(reason, lastRound, lastWork);
        return 0;
    }

    /// @dev Calls a no-argument view on SqueekCore with a fixed gas budget and copies only the first
    /// two words of the reply, so a reply of any size costs the same.
    function _read(bytes4 selector) private view returns (bool ok, uint256 size, uint256 w0, uint256 w1) {
        address target = address(core);
        uint256 gasLimit = READ_GAS;
        assembly ("memory-safe") {
            let ptr := mload(0x40)
            mstore(ptr, selector)
            mstore(add(ptr, 0x20), 0)
            ok := staticcall(gasLimit, target, ptr, 4, ptr, 0x40)
            size := returndatasize()
            w0 := mload(ptr)
            w1 := mload(add(ptr, 0x20))
        }
    }
}
