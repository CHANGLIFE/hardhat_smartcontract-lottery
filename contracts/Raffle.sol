// Raffle
// 一个去中心化的随机抽奖系统
// 随机选择赢家  -> 使用Chainlink VRF Random
// 每过X分钟选择一个赢家 -> 使用Chainlink Automated (Chainlink Keeper)

//SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/AutomationCompatible.sol";

error Raffle_NotEnoughEntered();
error Raffle__TransferFailed();
error Raffle_NotOpen();
error Raffle_UpkeepNotNeeded(uint256 currentBalance, uint256 numPlayer, uint256 raffleState);

/**
 * @title  一个简单的去中心化的随机抽奖系统
 * @author web3游民
 * @notice 这个合约为了创建一个不可篡改的、去中心化的智能合约
 * @dev    实现了Chainlink VRF Random 和 Chainlink Automated (Chainlink Keeper)
 */

contract Raffle is VRFConsumerBaseV2, AutomationCompatibleInterface {
    /* 类型变量 */
    enum RaffleState {
        OPEN,
        CALCULATING
    } // uint256 0 = OPEN, 1 = CALCULATING

    /* 状态变量 */
    uint256 private immutable i_entranceFee; // 参与抽奖时，需要支付的金额
    address payable[] private s_players; // 玩家数组
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
    bytes32 private immutable i_gasLane; // 每次请求支付的最大gas price
    uint64 private immutable i_subscriptionId; // 请求订阅id
    uint16 private constant REQUEST_CONFIRMATIONS = 3; // 区块确认数
    uint32 private immutable i_callbackGasLimit; // 回调函数fulfillRandomWords()的gas限制
    uint32 private constant NUMWORDS = 1; // 每次请求的单词数

    /* 抽奖变量 */
    address payable private s_recentWinner; // 最近的赢家
    RaffleState private s_raffleState; // 抽奖系统是否处于开放状态
    uint256 private s_lastTimeStamp; // 最近一次抽奖的时间戳
    uint256 private immutable i_interval; // 2次抽奖的时间间隔

    /* Events */
    event RaffleEnter(address indexed player);
    event RequestRaffleWinner(uint256 indexed requestId);
    event WinnerPicked(address indexed winner);

    /** Functions */
    constructor(
        address vrfCoordinatorV2, // 区块链上节点地址
        uint256 entranceFee,
        bytes32 gasLane,
        uint64 subscriptionId,
        uint32 callbackGasLimit,
        uint256 interval
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        i_entranceFee = entranceFee;
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_gasLane = gasLane;
        i_subscriptionId = subscriptionId;
        i_callbackGasLimit = callbackGasLimit;
        s_raffleState = RaffleState.OPEN;
        s_lastTimeStamp = block.timestamp;
        i_interval = interval;
    }

    // 参与抽奖时，需要支付的金额
    function enterRaffle() public payable {
        //如果玩家没有支付足够的金额，则不参与抽奖
        if (msg.value < i_entranceFee) {
            revert Raffle_NotEnoughEntered();
        }

        if (s_raffleState != RaffleState.OPEN) {
            revert Raffle_NotOpen();
        }
        // 存储玩家地址
        s_players.push(payable(msg.sender));

        emit RaffleEnter(msg.sender);
    }

    /**
     *
     * @dev 当‘upkeepNeeded’为true时，Chainlink节点会调用此函数
     * 满足以下情况时返回true：
     * 1. 满足时间间隔
     * 2. 彩票系统处于‘open’
     * 3. 合约还有ETH
     * 4. 订阅中还有LINK代币
     */

    function checkUpkeep(
        bytes memory /* checkData */
    ) public view override returns (bool upkeepNeeded, bytes memory /* performData */) {
        // 系统是否开放
        bool isOpen = (s_raffleState == RaffleState.OPEN);
        // 时间间隔
        bool timePassed = ((block.timestamp - s_lastTimeStamp) > i_interval);
        //是否还有玩家
        bool hasPlayers = (s_players.length > 0);
        // 合约是否还有ETH
        bool hasBalance = address(this).balance > 0;
        upkeepNeeded = (isOpen && timePassed && hasPlayers && hasBalance);
        
    }

    // 向 chainlink VRF 提出请求
    // 自动执行
    function performUpkeep(bytes calldata /* performData */) external override {
        (bool upkeepNeeded, ) = checkUpkeep("");
        if (!upkeepNeeded) {
            revert Raffle_UpkeepNotNeeded(
                address(this).balance,
                s_players.length,
                uint256(s_raffleState)
            );
        }

        s_raffleState = RaffleState.CALCULATING;
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_gasLane,
            i_subscriptionId,
            REQUEST_CONFIRMATIONS,
            i_callbackGasLimit,
            NUMWORDS
        );

        emit RequestRaffleWinner(requestId);
    }

    // 获取请求的结果

    function fulfillRandomWords(
        uint256 /*requestId*/,
        uint256[] memory _randomWords
    ) internal override {
        // 赢家的索引
        uint256 indexOfWinner = _randomWords[0] % s_players.length;
        // 获取玩家地址
        address payable recentWinner = s_players[indexOfWinner];
        s_recentWinner = recentWinner;
        s_raffleState = RaffleState.OPEN;
        // 将玩家列表重置
        s_players = new address payable[](0);
        //重置时间
        s_lastTimeStamp = block.timestamp;
        (bool success, ) = recentWinner.call{value: address(this).balance}("");
        //require(success, "Failed to send Ether");
        if (!success) {
            revert Raffle__TransferFailed();
        }
        emit WinnerPicked(recentWinner);
    }

    /* View / Pure functions */

    // 参与者可获取参加抽奖需要支付的金额
    function getEntranceFee() public view returns (uint256) {
        return i_entranceFee;
    }

    // 获取玩家
    function getPlayers(uint256 index) public view returns (address) {
        return s_players[index];
    }

    function getRecentWinner() public view returns (address) {
        return s_recentWinner;
    }

    function getRaffleState() public view returns (RaffleState) {
        return s_raffleState;
    }

    /**
     * @dev 因为是常数所以使用 pure
     */
    function getNumWords() public pure returns (uint256) {
        return NUMWORDS;
    }

    function getNumberOfPlayers() public view returns (uint256) {
        return s_players.length;
    }

    function getLatestTimeStamp() public view returns (uint256) {
        return s_lastTimeStamp;
    }

    function getRequsetConfirmations() public pure returns (uint256) {
        return REQUEST_CONFIRMATIONS;
    }

    function getInterval() public view returns (uint256) {
        return i_interval;
    }
}
