// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title SQB, the Squeek Pet World game token (Sepolia testnet only)
/// @notice Zero premine: the supply starts at 0 and grows only when the minter (SqbMinter) pays
/// stakers for the hamster's settled work. Holders burn SQB when they spend it in the shop.
/// @dev The owner cannot mint. It sets the first minter once, and any later change of minter waits
/// 48 hours in public (MinterProposed) before it can take effect, so holders can see it coming.
contract SqbToken is ERC20, ERC20Burnable, ERC20Permit, Ownable2Step {
    uint256 public constant MINTER_DELAY = 48 hours;

    address public minter;
    address public pendingMinter;
    uint256 public pendingMinterReadyAt;

    event MinterSet(address indexed minter);
    event MinterProposed(address indexed minter, uint256 readyAt);
    event MinterProposalCancelled(address indexed minter);

    error NotMinter();
    error MinterAlreadySet();
    error MinterNotSet();
    error ZeroAddress();
    error NoMinterProposal();
    error MinterProposalNotReady(uint256 readyAt);

    constructor(string memory name_, string memory symbol_, address owner_)
        ERC20(name_, symbol_)
        ERC20Permit(name_)
        Ownable(owner_)
    {}

    /// @notice One-time setup right after deployment: names the first minter.
    function setInitialMinter(address newMinter) external onlyOwner {
        if (minter != address(0)) revert MinterAlreadySet();
        if (newMinter == address(0)) revert ZeroAddress();
        minter = newMinter;
        emit MinterSet(newMinter);
    }

    /// @notice Starts the 48-hour wait to hand minting to another contract, for example a new
    /// SqbMinter after SqueekCore moves to a new deployment.
    function proposeMinter(address newMinter) external onlyOwner {
        if (minter == address(0)) revert MinterNotSet();
        if (newMinter == address(0)) revert ZeroAddress();
        pendingMinter = newMinter;
        pendingMinterReadyAt = block.timestamp + MINTER_DELAY;
        emit MinterProposed(newMinter, pendingMinterReadyAt);
    }

    function cancelMinterProposal() external onlyOwner {
        address proposed = pendingMinter;
        if (proposed == address(0)) revert NoMinterProposal();
        pendingMinter = address(0);
        pendingMinterReadyAt = 0;
        emit MinterProposalCancelled(proposed);
    }

    /// @notice Completes a minter change once its 48 hours have passed.
    function acceptMinter() external onlyOwner {
        address proposed = pendingMinter;
        if (proposed == address(0)) revert NoMinterProposal();
        if (block.timestamp < pendingMinterReadyAt) revert MinterProposalNotReady(pendingMinterReadyAt);
        minter = proposed;
        pendingMinter = address(0);
        pendingMinterReadyAt = 0;
        emit MinterSet(proposed);
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != minter) revert NotMinter();
        _mint(to, amount);
    }
}
