// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice The official SQK token on Sepolia: a standard ERC-20 with EIP-2612 permit that holders
/// can burn from their own balance. There is no burnFrom, so a contract burns SQK by taking it
/// first and then burning its own balance.
interface ISqk is IERC20 {
    function burn(uint256 amount) external;
}

/// @notice SQB, Squeek Pet World's own token: minted only by its minter, burned when spent.
interface ISqb is IERC20 {
    function mint(address to, uint256 amount) external;

    function burnFrom(address account, uint256 amount) external;
}
