// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ISqk, ISqb} from "./interfaces/ITokens.sol";

/// @title The Squeek Pet World shop (Sepolia testnet only)
/// @notice What SQK and SQB buy in Squeek Pet World. Every payment is burned: SQK through the SQK
/// contract's own `burn`, SQB through `burnFrom`. There is no treasury and no owner, and every price
/// is fixed at deployment.
/// - Home deeds (ERC-721): a numbered, nameable plot on the public map. Paid in SQK; the first costs
///   `deedBasePrice` and each sale raises the next price by 1%; at most `deedCap` deeds.
/// - Deed renovation: level 2 and level 3, once each per deed, paid in SQB.
/// - Guild banners: found a player guild with a name, a flag and one of the four guild perks. Paid in
///   SQK, at most `bannersPerSeason` per season. Guilds 1-4 are the game's built-in guilds.
/// - Guild membership (free): as in the game, a player picks one guild per season, for the current
///   season or ahead for the next, and can't change it for that season once picked.
/// - Guild-war supplies: any amount of SQB; every SQB deals 10 damage to the week's shared boss and
///   counts for the buyer's guild of the season on the public leaderboard.
/// - Season decorations: four per season, paid in SQB, sold only during their season and recorded
///   under the buyer's address for good.
/// @dev A season is a week starting Monday 12:00 UTC; season 1 starts at `seasonOneStart`
/// (2026-11-02 12:00 UTC in the game). SQB and SQK buy nothing that speeds up the game itself.
contract WorldShop is ERC721, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant SEASON_LENGTH = 7 days;
    uint256 public constant DAMAGE_PER_SQB = 10;
    uint256 public constant BUILT_IN_GUILDS = 4;
    uint256 public constant FLAG_COUNT = 8;
    uint256 public constant GUILD_PERK_COUNT = 4;
    uint256 public constant DECORATIONS_PER_SEASON = 4;
    uint256 public constant MAX_NAME_BYTES = 32;
    uint8 public constant MAX_DEED_LEVEL = 3;

    struct Prices {
        uint256 deedBasePrice; // SQK
        uint256 deedCap;
        uint256 renovateLevel2Price; // SQB
        uint256 renovateLevel3Price; // SQB
        uint256 bannerPrice; // SQK
        uint256 bannersPerSeason;
        uint256 decorationPrice; // SQB
    }

    struct Guild {
        address founder;
        uint32 foundedSeason;
        uint8 flag;
        uint8 perk;
        string name;
    }

    /// @notice One plot on the map, as `deedsInRange` returns it.
    struct DeedInfo {
        address owner;
        uint8 level;
        string name;
    }

    /// @notice One guild and its numbers for a season, as `guildsInRange` returns it.
    struct GuildInfo {
        uint256 id;
        address founder;
        uint32 foundedSeason;
        uint8 flag;
        uint8 perk;
        string name;
        uint256 members;
        uint256 supply;
    }

    /// @notice The shop and one player at a glance, as `overview` returns it.
    struct Overview {
        uint256 season;
        uint256 deedsSold;
        uint256 nextDeedPrice;
        uint256 guildCount;
        uint256 bannersThisSeason;
        uint256 seasonSupply;
        uint256 guildThisSeason;
        uint256 guildNextSeason;
        uint256 suppliedThisSeason;
        uint256 decorationsThisSeason;
        uint256 deedsOwned;
        uint256 sqkBalance;
        uint256 sqbBalance;
        uint256 sqkAllowance;
        uint256 sqbAllowance;
    }

    ISqk public immutable sqk;
    ISqb public immutable sqb;
    uint256 public immutable seasonOneStart;
    uint256 public immutable deedBasePrice;
    uint256 public immutable deedCap;
    uint256 public immutable renovateLevel2Price;
    uint256 public immutable renovateLevel3Price;
    uint256 public immutable bannerPrice;
    uint256 public immutable bannersPerSeason;
    uint256 public immutable decorationPrice;

    // Deeds. Token IDs run from 1 to deedCap and are the plot numbers on the map.
    uint256 public deedsSold;
    uint256 public nextDeedPrice;
    mapping(uint256 => uint8) public deedLevel;
    mapping(uint256 => string) public deedName;

    // Guilds. IDs 1-4 are the built-in guilds (seed, lantern, cog, star); founded guilds follow.
    uint256 public guildCount;
    mapping(uint256 => Guild) private _guilds;
    mapping(uint256 => uint256) public bannersFounded; // season => banners
    /// @notice Names in use, by `nameKey` (ASCII letters compared without case).
    mapping(bytes32 => bool) public guildNameTaken;
    /// @notice season => player => guild ID, 0 for none.
    mapping(uint256 => mapping(address => uint256)) public guildOf;
    /// @notice season => guild ID => players in it that season.
    mapping(uint256 => mapping(uint256 => uint256)) public guildMembers;

    // Guild-war supplies, in SQB wei. Damage = supply * DAMAGE_PER_SQB.
    mapping(uint256 => uint256) public seasonSupply;
    mapping(uint256 => mapping(uint256 => uint256)) public guildSeasonSupply;
    mapping(uint256 => mapping(address => uint256)) public playerSeasonSupply;

    // Season decorations: a bit per decoration, per player and season.
    mapping(address => mapping(uint256 => uint256)) public decorationsOf;

    event DeedBought(uint256 indexed deedId, address indexed buyer, uint256 price);
    event DeedRenovated(uint256 indexed deedId, uint8 level, uint256 price);
    event DeedNamed(uint256 indexed deedId, string name);
    event GuildFounded(
        uint256 indexed guildId, address indexed founder, uint256 indexed season, string name, uint8 flag, uint8 perk
    );
    event GuildJoined(address indexed player, uint256 indexed guildId, uint256 season);
    event Supplied(uint256 indexed season, address indexed player, uint256 indexed guildId, uint256 amount);
    event DecorationBought(address indexed player, uint256 indexed season, uint256 index, uint256 price);

    error BadSetup();
    error ZeroAmount();
    error SoldOut();
    error PriceAbove(uint256 price, uint256 maxPrice);
    error NotDeedOwner();
    error MaxLevel();
    error BadName();
    error NameTaken();
    error BadGuildDesign();
    error BannersSoldOut(uint256 season);
    error NoSuchGuild();
    error BadSeason(uint256 season);
    error AlreadyJoined(uint256 season);
    error NoGuild();
    error NoSuchDecoration();
    error AlreadyOwned();
    error SeasonNotStarted();

    constructor(ISqk sqk_, ISqb sqb_, uint256 seasonOneStart_, Prices memory prices_)
        ERC721("Squeek Pet World Deed", "SPWDEED")
    {
        if (address(sqk_) == address(0) || address(sqb_) == address(0)) revert BadSetup();
        if (prices_.deedBasePrice == 0 || prices_.deedCap == 0 || prices_.bannerPrice == 0) revert BadSetup();
        if (prices_.renovateLevel2Price == 0 || prices_.renovateLevel3Price == 0 || prices_.decorationPrice == 0) {
            revert BadSetup();
        }
        sqk = sqk_;
        sqb = sqb_;
        seasonOneStart = seasonOneStart_;
        deedBasePrice = prices_.deedBasePrice;
        deedCap = prices_.deedCap;
        renovateLevel2Price = prices_.renovateLevel2Price;
        renovateLevel3Price = prices_.renovateLevel3Price;
        bannerPrice = prices_.bannerPrice;
        bannersPerSeason = prices_.bannersPerSeason;
        decorationPrice = prices_.decorationPrice;
        nextDeedPrice = prices_.deedBasePrice;

        // The four built-in guilds. Their names in both languages are reserved so no founded guild
        // can pose as one of them.
        string[4] memory names = ["Seedkeepers", "Lanternbearers", "Cogwrights", "Stardreamers"];
        string[4] memory zhNames = [unicode"种子会", unicode"灯笼会", unicode"齿轮会", unicode"星尘会"];
        for (uint256 i = 0; i < BUILT_IN_GUILDS; i++) {
            _guilds[i + 1] = Guild(address(0), 0, uint8(i), uint8(i), names[i]);
            guildNameTaken[nameKey(names[i])] = true;
            guildNameTaken[nameKey(zhNames[i])] = true;
        }
        guildCount = BUILT_IN_GUILDS;
    }

    // ---------------------------------------------------------------- seasons

    /// @notice The current season: 1 from seasonOneStart, then one more every week (0 before).
    function currentSeason() public view returns (uint256) {
        if (block.timestamp < seasonOneStart) return 0;
        return (block.timestamp - seasonOneStart) / SEASON_LENGTH + 1;
    }

    // ---------------------------------------------------------------- deeds

    /// @notice Buys the next home deed for at most `maxPrice` SQK (the price rises 1% per sale).
    function buyDeed(uint256 maxPrice) external nonReentrant returns (uint256) {
        return _buyDeed(maxPrice);
    }

    /// @notice Same as buyDeed, with an SQK permit for `maxPrice` signed by the buyer.
    function buyDeedWithPermit(uint256 maxPrice, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
        nonReentrant
        returns (uint256)
    {
        _permit(address(sqk), maxPrice, deadline, v, r, s);
        return _buyDeed(maxPrice);
    }

    function renovate(uint256 deedId) external nonReentrant {
        _renovate(deedId);
    }

    function renovateWithPermit(uint256 deedId, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
        nonReentrant
    {
        _permit(address(sqb), value, deadline, v, r, s);
        _renovate(deedId);
    }

    /// @notice Names a deed's plot (free, renameable by its owner; empty clears the name).
    function nameDeed(uint256 deedId, string calldata name) external {
        if (ownerOf(deedId) != msg.sender) revert NotDeedOwner();
        if (bytes(name).length != 0) _checkName(name);
        deedName[deedId] = name;
        emit DeedNamed(deedId, name);
    }

    // ---------------------------------------------------------------- guilds

    function guild(uint256 guildId) external view returns (Guild memory) {
        if (guildId == 0 || guildId > guildCount) revert NoSuchGuild();
        return _guilds[guildId];
    }

    /// @notice Founds a player guild by burning a banner's price in SQK. The founder joins it for
    /// `joinSeason` (the current or the next season), or for no season when it is 0.
    function foundGuild(string calldata name, uint8 flag, uint8 perk, uint256 joinSeason)
        external
        nonReentrant
        returns (uint256)
    {
        return _foundGuild(name, flag, perk, joinSeason);
    }

    function foundGuildWithPermit(
        string calldata name,
        uint8 flag,
        uint8 perk,
        uint256 joinSeason,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant returns (uint256) {
        _permit(address(sqk), bannerPrice, deadline, v, r, s);
        return _foundGuild(name, flag, perk, joinSeason);
    }

    /// @notice Joins a guild for `season` (free): the current season, or the next one ahead of
    /// time. Like the game's own rule, the choice is final for that season.
    function joinGuild(uint256 guildId, uint256 season) external {
        if (guildId == 0 || guildId > guildCount) revert NoSuchGuild();
        _join(guildId, season);
    }

    /// @notice Burns `amount` SQB as supplies for this week's boss, for the caller's guild of the
    /// current season.
    function supply(uint256 amount) external nonReentrant {
        _supply(amount);
    }

    function supplyWithPermit(uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external nonReentrant {
        _permit(address(sqb), amount, deadline, v, r, s);
        _supply(amount);
    }

    // ---------------------------------------------------------------- decorations

    function buyDecoration(uint256 index) external nonReentrant {
        _buyDecoration(index);
    }

    function buyDecorationWithPermit(uint256 index, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
        nonReentrant
    {
        _permit(address(sqb), decorationPrice, deadline, v, r, s);
        _buyDecoration(index);
    }

    // ---------------------------------------------------------------- views

    /// @notice Every price and limit, fixed at deployment.
    function prices() external view returns (Prices memory) {
        return Prices(
            deedBasePrice,
            deedCap,
            renovateLevel2Price,
            renovateLevel3Price,
            bannerPrice,
            bannersPerSeason,
            decorationPrice
        );
    }

    /// @notice Up to `count` sold deeds from `firstId` on, for drawing the map.
    function deedsInRange(uint256 firstId, uint256 count) external view returns (DeedInfo[] memory deeds) {
        uint256 sold = deedsSold;
        if (firstId == 0 || firstId > sold) return deeds;
        if (count > sold - firstId + 1) count = sold - firstId + 1;
        deeds = new DeedInfo[](count);
        for (uint256 i = 0; i < count; i++) {
            uint256 id = firstId + i;
            deeds[i] = DeedInfo(_ownerOf(id), deedLevel[id], deedName[id]);
        }
    }

    /// @notice Up to `count` guilds from `firstId` on, with their members and supplies in `season`.
    function guildsInRange(uint256 firstId, uint256 count, uint256 season)
        external
        view
        returns (GuildInfo[] memory guilds)
    {
        uint256 total = guildCount;
        if (firstId == 0 || firstId > total) return guilds;
        if (count > total - firstId + 1) count = total - firstId + 1;
        guilds = new GuildInfo[](count);
        for (uint256 i = 0; i < count; i++) {
            uint256 id = firstId + i;
            Guild storage g = _guilds[id];
            guilds[i] = GuildInfo(
                id,
                g.founder,
                g.foundedSeason,
                g.flag,
                g.perk,
                g.name,
                guildMembers[season][id],
                guildSeasonSupply[season][id]
            );
        }
    }

    /// @notice The decorations `who` bought in each season from `fromSeason` to `toSeason`, as bits.
    function decorationHistory(address who, uint256 fromSeason, uint256 toSeason)
        external
        view
        returns (uint256[] memory bits)
    {
        if (fromSeason > toSeason) return bits;
        bits = new uint256[](toSeason - fromSeason + 1);
        for (uint256 i = 0; i < bits.length; i++) bits[i] = decorationsOf[who][fromSeason + i];
    }

    /// @notice The shop's state this season and `who`'s part in it, in one call.
    function overview(address who) external view returns (Overview memory o) {
        uint256 season = currentSeason();
        o.season = season;
        o.deedsSold = deedsSold;
        o.nextDeedPrice = nextDeedPrice;
        o.guildCount = guildCount;
        o.bannersThisSeason = bannersFounded[season];
        o.seasonSupply = seasonSupply[season];
        if (who == address(0)) return o;
        o.guildThisSeason = guildOf[season][who];
        o.guildNextSeason = guildOf[season + 1][who];
        o.suppliedThisSeason = playerSeasonSupply[season][who];
        o.decorationsThisSeason = decorationsOf[who][season];
        o.deedsOwned = balanceOf(who);
        o.sqkBalance = sqk.balanceOf(who);
        o.sqbBalance = sqb.balanceOf(who);
        o.sqkAllowance = sqk.allowance(who, address(this));
        o.sqbAllowance = sqb.allowance(who, address(this));
    }

    // ---------------------------------------------------------------- internals

    function _buyDeed(uint256 maxPrice) private returns (uint256 deedId) {
        if (deedsSold >= deedCap) revert SoldOut();
        uint256 price = nextDeedPrice;
        if (price > maxPrice) revert PriceAbove(price, maxPrice);
        deedId = ++deedsSold;
        nextDeedPrice = (price * 101) / 100;
        deedLevel[deedId] = 1;
        _burnSqk(price);
        _safeMint(msg.sender, deedId);
        emit DeedBought(deedId, msg.sender, price);
    }

    function _renovate(uint256 deedId) private {
        if (ownerOf(deedId) != msg.sender) revert NotDeedOwner();
        uint8 level = deedLevel[deedId];
        if (level >= MAX_DEED_LEVEL) revert MaxLevel();
        uint256 price = level == 1 ? renovateLevel2Price : renovateLevel3Price;
        deedLevel[deedId] = level + 1;
        sqb.burnFrom(msg.sender, price);
        emit DeedRenovated(deedId, level + 1, price);
    }

    function _foundGuild(string calldata name, uint8 flag, uint8 perk, uint256 joinSeason)
        private
        returns (uint256 guildId)
    {
        uint256 season = currentSeason();
        if (season == 0) revert SeasonNotStarted();
        if (bannersFounded[season] >= bannersPerSeason) revert BannersSoldOut(season);
        _checkName(name);
        if (flag >= FLAG_COUNT || perk >= GUILD_PERK_COUNT) revert BadGuildDesign();
        bytes32 key = nameKey(name);
        if (guildNameTaken[key]) revert NameTaken();
        guildNameTaken[key] = true;
        bannersFounded[season] += 1;
        guildId = ++guildCount;
        _guilds[guildId] = Guild(msg.sender, uint32(season), flag, perk, name);
        emit GuildFounded(guildId, msg.sender, season, name, flag, perk);
        if (joinSeason != 0) _join(guildId, joinSeason);
        _burnSqk(bannerPrice);
    }

    function _join(uint256 guildId, uint256 season) private {
        uint256 current = currentSeason();
        if (season == 0 || season < current || season > current + 1) revert BadSeason(season);
        if (guildOf[season][msg.sender] != 0) revert AlreadyJoined(season);
        guildOf[season][msg.sender] = guildId;
        guildMembers[season][guildId] += 1;
        emit GuildJoined(msg.sender, guildId, season);
    }

    function _supply(uint256 amount) private {
        if (amount == 0) revert ZeroAmount();
        uint256 season = currentSeason();
        if (season == 0) revert SeasonNotStarted();
        uint256 guildId = guildOf[season][msg.sender];
        if (guildId == 0) revert NoGuild();
        seasonSupply[season] += amount;
        guildSeasonSupply[season][guildId] += amount;
        playerSeasonSupply[season][msg.sender] += amount;
        sqb.burnFrom(msg.sender, amount);
        emit Supplied(season, msg.sender, guildId, amount);
    }

    function _buyDecoration(uint256 index) private {
        if (index >= DECORATIONS_PER_SEASON) revert NoSuchDecoration();
        uint256 season = currentSeason();
        if (season == 0) revert SeasonNotStarted();
        uint256 owned = decorationsOf[msg.sender][season];
        uint256 bit = 1 << index;
        if (owned & bit != 0) revert AlreadyOwned();
        decorationsOf[msg.sender][season] = owned | bit;
        sqb.burnFrom(msg.sender, decorationPrice);
        emit DecorationBought(msg.sender, season, index, decorationPrice);
    }

    /// @dev SQK has no burnFrom: take it, then burn it from this contract's balance.
    function _burnSqk(uint256 amount) private {
        IERC20(address(sqk)).safeTransferFrom(msg.sender, address(this), amount);
        sqk.burn(amount);
    }

    /// @dev A permit that fails (for example because it was already used) is ignored; the payment
    /// then needs the allowance to be there anyway.
    function _permit(address token, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) private {
        try IERC20Permit(token).permit(msg.sender, address(this), value, deadline, v, r, s) {} catch {}
    }

    /// @notice The key a guild name is reserved under: its bytes with ASCII letters lowercased, so
    /// "seedkeepers" can't pose as "Seedkeepers".
    function nameKey(string memory name) public pure returns (bytes32) {
        bytes memory b = bytes(name);
        for (uint256 i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            if (c >= 0x41 && c <= 0x5a) b[i] = bytes1(c + 32);
        }
        return keccak256(b);
    }

    /// @dev 1-32 bytes, no control characters, no space at either end (UTF-8 such as Chinese is
    /// fine). Front ends must still escape names before showing them.
    function _checkName(string calldata name) private pure {
        bytes calldata b = bytes(name);
        if (b.length == 0 || b.length > MAX_NAME_BYTES) revert BadName();
        if (b[0] == 0x20 || b[b.length - 1] == 0x20) revert BadName();
        for (uint256 i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            if (c < 0x20 || c == 0x7f) revert BadName();
        }
    }
}
