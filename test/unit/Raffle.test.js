const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")
const { assert, expect } = require("chai")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit Tests", function () {
          let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, deployer, timeInterval
          const chainId = network.config.chainId

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              await deployments.fixture(["all"])
              raffle = await ethers.getContract("Raffle", deployer)
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
              raffleEntranceFee = await raffle.getEntranceFee()
              timeInterval = await raffle.getInterval()
          })

          describe("constructor", function () {
              it("Initializes the raffle correctly", async function () {
                  // 如果正确初始化了，则s_raffleState  为 OPEN
                  const raffleState = await raffle.getRaffleState()
                  assert.equal(raffleState.toString(), "0")
                  assert.equal(
                      timeInterval.toString(),
                      networkConfig[chainId]["keepersUpdateInterval"],
                  )
              })
          })

          describe("enterRaffle", function () {
              it("reverts when you don't pay enough", async function () {
                  await expect(raffle.enterRaffle()).to.be.revertedWith("Raffle_NotEnoughEntered")
              })
              it("records players when they enter", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  const palyerFromContract = await raffle.getPlayers(0)
                  assert.equal(palyerFromContract, deployer)
              })
              it("emits event on enter", async function () {
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(
                      raffle,
                      "RaffleEnter",
                  )
              })
              it("doesnt allow entrance when raffle is calculating", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  // 使用 Hardhat 的 EVM 控制函数来增加当前块的时间。
                  await network.provider.send("evm_increaseTime", [timeInterval.toNumber() + 1])
                  // 立即挖掘一个新的块
                  //await network.provider.request({ method: "evm_mine", params: [] })
                  await network.provider.send("evm_mine", [])
                  // 建立Chianlink Keeper
                  await raffle.performUpkeep([])
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.be.revertedWith(
                      "Raffle_NotOpen",
                  )
              })
          })

          describe("checkUpkeep", function () {
              it("returns false if people haven't sent ant ETH", async function () {
                  await network.provider.send("evm_increaseTime", [timeInterval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  // 静态调用
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  assert(!upkeepNeeded)
              })
              it("returns false if raffle isn't open", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [timeInterval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  await raffle.performUpkeep([])
                  const raffleState = await raffle.getRaffleState()
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  assert(raffleState.toString(), "1")
                  assert.equal(upkeepNeeded, false)
              })
              it("returns false if enough time hasn't passed", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [timeInterval.toNumber() - 5]) // use a higher number here if this test fails
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(!upkeepNeeded)
              })
              it("returns true if enough time has passed, has players, eth, and is open", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [timeInterval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]) // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(upkeepNeeded)
              })
          })

          describe("performUpkeep", function () {
              it("it can only run if checkUpkeep is true", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [timeInterval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  const tx = await raffle.performUpkeep([])
                  assert(tx)
              })
              it("reverts when checkupkeep is false", async function () {
                  await expect(raffle.performUpkeep([])).to.be.revertedWith(
                      "Raffle_UpkeepNotNeeded",
                  )
              })
              it("updates the raffle state, emits and calls the crf coordinator", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [timeInterval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  const txResponse = await raffle.performUpkeep([])
                  const txReceipt = await txResponse.wait(1)
                  const requestId = txReceipt.events[1].args.requestId
                  const raffleState = await raffle.getRaffleState()
                  assert(requestId.toNumber() > 0)
                  assert(raffleState == 1)
              })
          })
          describe("fulfillRandoomWords", function () {
              beforeEach(async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [timeInterval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
              })
              it("can only be called after performUpkeep", async function () {
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address),
                  ).to.be.revertedWith("nonexistent request")
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address),
                  ).to.be.revertedWith("nonexistent request")
              })
              it("pick a winner, resets the lottery, and sends money", async function () {
        //           const additionalEntries = 3 // 定义了要增加的额外参与者的数量
        //           const startingAccountIndex = 1 // 定义了参与者的起始帐户索引，从第一个非部署者账户开始参与抽奖
        //           const accounts = await ethers.getSigners() // 获取所有以太坊账户的签名者对象
        //           let startingBalance
        //           for (
        //               let i = startingAccountIndex;
        //               i < startingAccountIndex + additionalEntries;
        //               i++
        //           ) {
        //               // 循环添加额外的参与者
        //               const accountConnectedRaffle = raffle.connect(accounts[i]) //将合约连接到指定账户。
        //               await accountConnectedRaffle.enterRaffle({ value: raffleEntranceFee }) // 参与抽奖
        //           }
        //           const startingTimeStamp = await raffle.getLatestTimeStamp() //获取初始时间戳

        //           //创建一个新的 Promise
        //           await new Promise(async (resolve, reject) => {
        //               raffle.once("WinnerPicked", async () => {
        //                   //监听 "WinnerPicked" 事件

        //                   console.log("Found the event!")
        //                   try {
        //                       // 获取最后的值
        //                       const recentWinner = await raffle.getRecentWinner()
        //                       const raffleState = await raffle.getRaffleState()
        //                       const endingTimeStamp = await raffle.getLatestTimeStamp()
        //                       const numPlayers = await raffle.getNumberOfPlayers()
        //                       const winnerEndingBalance = await accounts[1].getBalance()
        //                       console.log(winnerEndingBalance.toString())

        //                       // 断言测试结果
        //                       assert.equal(numPlayers.toString(), "0") // 参与者数量应为0
        //                       assert.equal(raffleState.toString(), "0") // 抽奖状态应为0（开放状态）
        //                       assert(endingTimeStamp > startingTimeStamp) // 结束时间戳应大于初始时间戳
        //                       console.log(startingBalance)
        //                       // 断言赢家的结束余额是否正确计算
        //                       assert.equal(
        //                           winnerEndingBalance.toString(),
        //                           startingBalance // startingBalance + ( (raffleEntranceFee * additionalEntrances) + raffleEntranceFee )
        //                               .add(
        //                                   raffleEntranceFee
        //                                       .mul(additionalEntries)
        //                                       .add(raffleEntranceFee),
        //                               )
        //                               .toString(),
        //                       )
        //                       resolve() // 完成 Promise
        //                   } catch (e) {
        //                       reject(e) // 发生错误时拒绝 Promise
        //                   }
        //               })

        //               try {
        //                   const tx = await raffle.performUpkeep([]) // 执行维护操作
        //                   const txReceipt = await tx.wait(1) // 等待交易确认
        //                   const startingBalance = await accounts[1].getBalance() // 获取赢家起始余额
        //                   await vrfCoordinatorV2Mock.fulfillRandomWords(
        //                       // 模拟 Chainlink VRF 请求结果的到来
        //                       txReceipt.events[1].args.requestId,
        //                       raffle.address,
        //                   )
        //               } catch (e) {
        //                   reject(e)
        //               }
        //           })
        //       })
        //   })
                    const additionalEntrances = 3 // to test
                    const startingIndex = 2
                    const accounts = await ethers.getSigners() // 获取所有以太坊账户的签名者对象
                    let startingBalance
                    for (let i = startingIndex; i < startingIndex + additionalEntrances; i++) {
                        // i = 2; i < 5; i=i+1
                        raffle = raffle.connect(accounts[i]) // Returns a new instance of the Raffle contract connected to player
                        await raffle.enterRaffle({ value: raffleEntranceFee })
                    }
                    const startingTimeStamp = await raffle.getLatestTimeStamp() // stores starting timestamp (before we fire our event)

                    // This will be more important for our staging tests...
                    await new Promise(async (resolve, reject) => {
                        raffle.once("WinnerPicked", async () => {
                            // event listener for WinnerPicked
                            console.log("WinnerPicked event fired!")
                            // assert throws an error if it fails, so we need to wrap
                            // it in a try/catch so that the promise returns event
                            // if it fails.
                            try {
                                // Now lets get the ending values...
                                const recentWinner = await raffle.getRecentWinner()
                                const raffleState = await raffle.getRaffleState()
                                const winnerBalance = await accounts[2].getBalance()
                                const endingTimeStamp = await raffle.getLatestTimeStamp()
                                await expect(raffle.getPlayers(0)).to.be.reverted
                                // Comparisons to check if our ending values are correct:
                                assert.equal(recentWinner.toString(), accounts[2].address)
                                assert.equal(raffleState, 0)
                                assert.equal(
                                    winnerBalance.toString(),
                                    startingBalance // startingBalance + ( (raffleEntranceFee * additionalEntrances) + raffleEntranceFee )
                                        .add(
                                            raffleEntranceFee
                                                .mul(additionalEntrances)
                                                .add(raffleEntranceFee),
                                        )
                                        .toString(),
                                )
                                assert(endingTimeStamp > startingTimeStamp)
                                resolve() // if try passes, resolves the promise
                            } catch (e) {
                                reject(e) // if try fails, rejects the promise
                            }
                        })

                        // kicking off the event by mocking the chainlink keepers and vrf coordinator
                        try {
                            const tx = await raffle.performUpkeep("0x")
                            const txReceipt = await tx.wait(1)
                            startingBalance = await accounts[2].getBalance()
                            await vrfCoordinatorV2Mock.fulfillRandomWords(
                                txReceipt.events[1].args.requestId,
                                raffle.address,
                            )
                        } catch (e) {
                            reject(e)
                        }
                    })
                })
            })
      })
