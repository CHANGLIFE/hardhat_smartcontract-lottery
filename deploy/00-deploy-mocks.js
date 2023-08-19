// 在本地开发网络上部署模拟合约
const { network, ethers } = require("hardhat")
const { developmentChains } = require("../helper-hardhat-config")

const BASE_FEED = ethers.utils.parseEther("0.25") // 0.25 link token ，每次申请花费
const GAS_PRICE_LINK = 1e9

// Hardhat 提供的两个重要的对象，用于简化部署过程和管理账户信息
// getNamedAccounts 函数： 获取预定义的账户
// deployments 对象 ： 提供了部署相关的方法
module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const args = [BASE_FEED, GAS_PRICE_LINK]

    // 检查当前网络是否在数组中，判断是否是本地开发网络
    if (developmentChains.includes(network.name)) {
        log("Local network detected! Deploying mocks...")
        // deploy a mock vrfcoordinator...
        await deploy("VRFCoordinatorV2Mock", {
            from: deployer, // 合约部署者
            args: args, //
            log: true,
        })

        log("Mocks deployed!")
        log("---------------------------")
    }
}

// const { network } = require("hardhat")

// const BASE_FEE = "250000000000000000" // 0.25 is this the premium in LINK?
// const GAS_PRICE_LINK = 1e9 // link per gas, is this the gas lane? // 0.000000001 LINK per gas

// module.exports = async ({ getNamedAccounts, deployments }) => {
//     const { deploy, log } = deployments
//     const { deployer } = await getNamedAccounts()
//     const chainId = network.config.chainId
//     // If we are on a local development network, we need to deploy mocks!
//     if (chainId == 31337) {
//         log("Local network detected! Deploying mocks...")
//         await deploy("VRFCoordinatorV2Mock", {
//             from: deployer,
//             log: true,
//             args: [BASE_FEE, GAS_PRICE_LINK],
//         })

//         log("Mocks Deployed!")
//         log("----------------------------------------------------------")
//         log("You are deploying to a local network, you'll need a local network running to interact")
//         log(
//             "Please run `yarn hardhat console --network localhost` to interact with the deployed smart contracts!",
//         )
//         log("----------------------------------------------------------")
//     }
// }

// 导出一个标签数组，包含部署脚本的标签
module.exports.tags = ["all", "mocks"]
