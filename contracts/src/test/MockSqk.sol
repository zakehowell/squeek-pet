// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @dev Test double for SQK: ERC-20 with permit and burn(uint256), like the official token, plus a
/// free mint for tests.
contract MockSqk is ERC20, ERC20Burnable, ERC20Permit {
    constructor() ERC20("Squeek", "SQK") ERC20Permit("Squeek") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
