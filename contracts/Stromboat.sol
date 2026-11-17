// SPDX-License-Identifier: MIT
// Stromboat — The Launch Dock (prepared 2026-11-18, NOT yet deployed)
// Two parallel lanes from launch (user spec 2026-11-18):
//   FREE: max 1 per wallet, Binance Agent ID required, Common ONLY.
//         Free tokens are IDs 1-667 (the Common pool).
//   PAID: 0.00144 BNB, max 7 per wallet, Rare/Epic/Legendary/Mythic ONLY.
//         Paid tokens are IDs 668-1333 (the 666 paid pool).
// The paid lane is never gated behind the free lane.
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

interface IBinanceAgentRegistry {
    function ownerOf(uint256 tokenId) external view returns (address);
}

/// @title Stromboat
/// @notice 1,333-token ERC-721. Free Agent ID lane (Common only, IDs 1-667)
/// and a paid lane (Rare and up only, IDs 668-1333) running in parallel.
contract Stromboat is ERC721, Ownable, ReentrancyGuard {
    using Strings for uint256;

    uint256 public constant MAX_SUPPLY = 1333;
    uint256 public constant FREE_SUPPLY = 667;
    uint256 public constant PAID_SUPPLY = 666;
    uint256 public constant MAX_FREE_PER_WALLET = 1;
    uint256 public constant MAX_PER_AGENT_ID = 1;
    uint256 public constant MAX_PAID_PER_WALLET = 7;
    address public constant AGENT_REGISTRY = 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;

    uint256 public price = 0.00144 ether;
    uint256 public freeMinted;
    uint256 public paidMinted;
    bool public mintOpen;
    string private baseTokenURI;

    mapping(address => uint256) public freeMintedBy;
    mapping(address => uint256) public paidMintedBy;
    mapping(uint256 => bool) public agentIdUsed;

    event FreeMinted(address indexed to, uint256 indexed agentId, uint256 tokenId);
    event PaidMinted(address indexed to, uint256 quantity, uint256 firstTokenId);
    event MintStatusChanged(bool open);
    event PriceChanged(uint256 newPrice);
    event BaseURIChanged(string newBaseURI);

    constructor(string memory initialBaseURI)
        ERC721("Stromboat", "STORM")
        Ownable(msg.sender)
    {
        baseTokenURI = initialBaseURI;
    }

    function totalMinted() public view returns (uint256) {
        return freeMinted + paidMinted;
    }

    function currentPrice() public view returns (uint256) {
        return price;
    }

    /// @notice Free mint: exactly one Common (IDs 1-667) for the owner of a
    /// Binance Agent ID. One per wallet and one per Agent ID.
    function freeMint(uint256 agentId) external nonReentrant {
        require(mintOpen, "Mint is closed");
        require(IBinanceAgentRegistry(AGENT_REGISTRY).ownerOf(agentId) == msg.sender, "Agent ID not owned");
        require(!agentIdUsed[agentId], "Agent ID already used");
        require(freeMintedBy[msg.sender] < MAX_FREE_PER_WALLET, "Free limit reached");
        require(freeMinted < FREE_SUPPLY, "Free pool exhausted");

        agentIdUsed[agentId] = true;
        freeMintedBy[msg.sender] += 1;
        freeMinted += 1;
        uint256 tokenId = freeMinted; // 1..667
        _safeMint(msg.sender, tokenId);
        emit FreeMinted(msg.sender, agentId, tokenId);
    }

    /// @notice Paid mint: Rare and up only (IDs 668-1333). Max 7 per wallet.
    function mint(uint256 quantity) external payable nonReentrant {
        require(mintOpen, "Mint is closed");
        require(quantity > 0, "Quantity is zero");
        require(paidMinted + quantity <= PAID_SUPPLY, "Paid pool exhausted");
        require(paidMintedBy[msg.sender] + quantity <= MAX_PAID_PER_WALLET, "Wallet limit exceeded");
        require(msg.value == price * quantity, "Incorrect payment");

        uint256 firstTokenId = FREE_SUPPLY + paidMinted + 1; // starts at 668
        paidMintedBy[msg.sender] += quantity;
        paidMinted += quantity;
        for (uint256 i = 0; i < quantity; i++) {
            _safeMint(msg.sender, firstTokenId + i);
        }
        emit PaidMinted(msg.sender, quantity, firstTokenId);
    }

    function setMintOpen(bool open) external onlyOwner {
        mintOpen = open;
        emit MintStatusChanged(open);
    }

    function setPrice(uint256 newPrice) external onlyOwner {
        price = newPrice;
        emit PriceChanged(newPrice);
    }

    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        baseTokenURI = newBaseURI;
        emit BaseURIChanged(newBaseURI);
    }

    function withdraw() external onlyOwner nonReentrant {
        (bool success, ) = payable(owner()).call{value: address(this).balance}("");
        require(success, "Withdraw failed");
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string.concat(baseTokenURI, tokenId.toString(), ".json");
    }
}
