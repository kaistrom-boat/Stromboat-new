// SPDX-License-Identifier: MIT
// TEST ONLY — stateless stand-in for the Binance Agent registry, used by
// test.js on a local Ganache chain. ownerOf(id) returns address(uint160(id)),
// so a test wallet "owns" the Agent ID equal to its own address value.
// Never deployed anywhere real.
pragma solidity ^0.8.24;

contract MockRegistry {
    function ownerOf(uint256 tokenId) external pure returns (address) {
        return address(uint160(tokenId));
    }
}
