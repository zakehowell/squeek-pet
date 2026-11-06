// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title A small testnet SQK faucet for new Squeek Pet World players
/// @notice Anyone can fund it by sending SQK to it. An address that holds less than `maxBalance`
/// SQK can take `dripAmount` once per `cooldown`. Testnet only: it can't tell people apart, so it
/// is meant for small amounts, and the owner can change the amounts or take the rest back.
contract SqkFaucet is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable sqk;
    uint256 public dripAmount;
    uint256 public cooldown;
    uint256 public maxBalance;
    mapping(address => uint256) public lastDripAt;

    event Dripped(address indexed to, uint256 amount);
    event DripChanged(uint256 dripAmount, uint256 cooldown, uint256 maxBalance);
    event Withdrawn(address indexed to, uint256 amount);

    error TooSoon(uint256 nextAt);
    error AlreadyHasSqk();
    error FaucetEmpty();
    error BadSetup();

    constructor(IERC20 sqk_, uint256 dripAmount_, uint256 cooldown_, uint256 maxBalance_, address owner_)
        Ownable(owner_)
    {
        if (address(sqk_) == address(0)) revert BadSetup();
        sqk = sqk_;
        _setDrip(dripAmount_, cooldown_, maxBalance_);
    }

    /// @notice When `who` can take SQK next (0 if never taken).
    function nextDripAt(address who) public view returns (uint256) {
        uint256 last = lastDripAt[who];
        return last == 0 ? 0 : last + cooldown;
    }

    /// @notice What the game shows about the faucet for `who`, in one call.
    function status(address who)
        external
        view
        returns (uint256 amount, uint256 wait, uint256 limit, uint256 left, uint256 nextAt, uint256 held)
    {
        return (dripAmount, cooldown, maxBalance, sqk.balanceOf(address(this)), nextDripAt(who), sqk.balanceOf(who));
    }

    function drip() external nonReentrant {
        uint256 next = nextDripAt(msg.sender);
        if (next != 0 && block.timestamp < next) revert TooSoon(next);
        if (sqk.balanceOf(msg.sender) >= maxBalance) revert AlreadyHasSqk();
        uint256 amount = dripAmount;
        if (sqk.balanceOf(address(this)) < amount) revert FaucetEmpty();
        lastDripAt[msg.sender] = block.timestamp;
        sqk.safeTransfer(msg.sender, amount);
        emit Dripped(msg.sender, amount);
    }

    function setDrip(uint256 dripAmount_, uint256 cooldown_, uint256 maxBalance_) external onlyOwner {
        _setDrip(dripAmount_, cooldown_, maxBalance_);
    }

    function withdraw(address to, uint256 amount) external onlyOwner {
        sqk.safeTransfer(to, amount);
        emit Withdrawn(to, amount);
    }

    function _setDrip(uint256 dripAmount_, uint256 cooldown_, uint256 maxBalance_) private {
        if (dripAmount_ == 0 || cooldown_ == 0 || maxBalance_ == 0) revert BadSetup();
        dripAmount = dripAmount_;
        cooldown = cooldown_;
        maxBalance = maxBalance_;
        emit DripChanged(dripAmount_, cooldown_, maxBalance_);
    }
}
