// const { network, getNamedAccounts, ethers } = require("hardhat")
// const { developmentChains, networkConfig } = require("../../helper-hardhat-config")
// const { assert, expect } = require("chai")

// developmentChains.includes(network.name)
//     ? describe.skip
//     : describe("Raffle Unit Tests", function () {
//           let raffle, raffleEntranceFee, deployer
//           beforeEach(async function () {
//               deployer = (await getNamedAccounts()).deployer
//               raffle = await ethers.getContract("Raffle", deployer)
//               raffleEntranceFee = await raffle.getEntranceFee()
//           })

//           describe("fulfillRandoomWords", function () {
//               it("works with live Chainlink Keepers and Chainlink VRF, we get a random winner", async function () {
//                   const startingTimestamp = await raffle.getLatestTimeStamp()
//                   const accounts = await ethers.getSigners()

//                   // 在参与抽奖之前设置监听器
//                   // 防止区块链执行速度太快
//                   await new Promise(async (resolve, reject) => {
//                       raffle.once("WinnerPicked", async () => {
//                           console.log("WinnerPicked event fired!")
//                           try {
//                               // 添加断言
//                               const recentWiner = await raffle.getRecentWinner()
//                               const raffleState = await raffle.getRaffleState()
//                               const winnerEndingBalance = await accounts[0].getBalance()
//                               const endingTimeStamp = await raffle.getLatestTimeStamp()

//                               await expect(raffle.getPlayers(0)).to.be.reverted
//                               assert.equal(recentWiner.toString(), accounts[0].address)
//                               assert.equal(raffleState, 0)
//                               assert.equal(
//                                   winnerEndingBalance.toString(),
//                                   winnerStartingBalance.add(raffleEntranceFee).toString(),
//                               )
//                               assert(endingTimeStamp > startingTimestamp)
//                               resolve()
//                           } catch (error) {
//                               reject(error)
//                           }
//                       })
//                       // 参与抽奖
//                       await raffle.enterRaffle({ value: raffleEntranceFee })
//                       const winnerStartingBalance = await accounts[0].getBalance()
//                   })
//               })
//           })
//       })

const { assert, expect } = require("chai")
const { getNamedAccounts, ethers, network } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")

developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Staging Tests", function () {
          let raffle, raffleEntranceFee, deployer

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              raffle = await ethers.getContract("Raffle", deployer)
              raffleEntranceFee = await raffle.getEntranceFee()
          })

          describe("fulfillRandomWords", function () {
              it("works with live Chainlink Keepers and Chainlink VRF, we get a random winner", async function () {
                  // enter the raffle
                  console.log("Setting up test...")
                  const startingTimeStamp = await raffle.getLatestTimeStamp()
                  const accounts = await ethers.getSigners()

                  console.log("Setting up Listener...")
                  await new Promise(async (resolve, reject) => {
                      // setup listener before we enter the raffle
                      // Just in case the blockchain moves REALLY fast
                      raffle.once("WinnerPicked", async () => {
                          console.log("WinnerPicked event fired!")
                          try {
                              // add our asserts here
                              const recentWinner = await raffle.getRecentWinner()
                              const raffleState = await raffle.getRaffleState()
                              const winnerEndingBalance = await accounts[0].getBalance()
                              const endingTimeStamp = await raffle.getLatestTimeStamp()

                              await expect(raffle.getPlayers(0)).to.be.reverted
                              assert.equal(recentWinner.toString(), accounts[0].address)
                              assert.equal(raffleState, 0)
                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance.add(raffleEntranceFee).toString(),
                              )
                              assert(endingTimeStamp > startingTimeStamp)
                              resolve()
                          } catch (error) {
                              console.log(error)
                              reject(error)
                          }
                      })
                      // Then entering the raffle
                      console.log("Entering Raffle...")
                      const tx = await raffle.enterRaffle({ value: raffleEntranceFee })
                      await tx.wait(1)
                      console.log("Ok, time to wait...")
                      const winnerStartingBalance = await accounts[0].getBalance()

                      // and this code WONT complete until our listener has finished listening!
                  })
              })
          })
      })
