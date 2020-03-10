import { useCallback, useEffect, useRef, useState } from 'react'

import { useContract, useContractReadOnly } from '../web3-contracts'
import { useCourtConfig } from '../providers/CourtConfig'
import { CourtModuleType } from '../types/court-module-types'

import tokenAbi from '../abi/ERC20.json'
import votingAbi from '../abi/CRVoting.json'
import aragonCourtAbi from '../abi/AragonCourt.json'
import jurorRegistryAbi from '../abi/JurorRegistry.json'
import courtTreasuryAbi from '../abi/CourtTreasury.json'
import disputeManagerAbi from '../abi/DisputeManager.json'

import {
  hashVote,
  getOutcomeFromCommitment,
  getVoteId,
  hashPassword,
} from '../utils/crvoting-utils'
import { bigNum } from '../lib/math-utils'
import { retryMax } from '../utils/retry-max'
import { getModuleAddress } from '../utils/court-utils'
import { getFunctionSignature } from '../lib/web3-utils'

const GAS_LIMIT = 1200000
const ANJ_ACTIVATE_GAS_LIMIT = 500000
const ANJ_ACTIONS_GAS_LIMIT = 325000
const ACTIVATE_SELECTOR = getFunctionSignature('activate(uint256)')

// ANJ contract
function useANJTokenContract() {
  const { anjToken } = useCourtConfig()

  const anjTokenAddress = anjToken ? anjToken.id : null

  return useContract(anjTokenAddress, tokenAbi)
}

// Fee token contract
function useFeeTokenContract() {
  const { feeToken } = useCourtConfig()

  const feeTokenAddress = feeToken ? feeToken.id : null

  return useContract(feeTokenAddress, tokenAbi)
}

// Court contracts
function useCourtContract(moduleType, abi) {
  const { id, modules } = useCourtConfig()

  let contractAddress
  if (moduleType === CourtModuleType.AragonCourt) {
    contractAddress = id
  } else {
    contractAddress = getModuleAddress(modules, moduleType)
  }

  return useContract(contractAddress, abi)
}

function useCourtContractReadOnly(moduleType, abi) {
  const { modules } = useCourtConfig()

  const contractAddress = getModuleAddress(modules, moduleType)

  return useContractReadOnly(contractAddress, abi)
}

/**
 * All ANJ interactions
 * @returns {Object} all available functions around ANJ balances
 */
export function useANJActions() {
  const jurorRegistryContract = useCourtContract(
    CourtModuleType.JurorsRegistry,
    jurorRegistryAbi
  )
  const anjTokenContract = useANJTokenContract()

  // activate ANJ directly from available balance
  const activateANJ = useCallback(
    amount => {
      return jurorRegistryContract.activate(amount, {
        gasLimit: ANJ_ACTIVATE_GAS_LIMIT,
      })
    },
    [jurorRegistryContract]
  )

  const deactivateANJ = useCallback(
    amount => {
      return jurorRegistryContract.deactivate(amount, {
        gasLimit: ANJ_ACTIONS_GAS_LIMIT,
      })
    },
    [jurorRegistryContract]
  )

  // approve, stake and activate ANJ
  const stakeActivateANJ = useCallback(
    amount => {
      return anjTokenContract.approveAndCall(
        jurorRegistryContract.address,
        amount,
        ACTIVATE_SELECTOR,
        { gasLimit: ANJ_ACTIVATE_GAS_LIMIT }
      )
    },
    [anjTokenContract, jurorRegistryContract]
  )

  const withdrawANJ = useCallback(
    amount => {
      return jurorRegistryContract.unstake(amount, '0x', {
        gasLimit: ANJ_ACTIONS_GAS_LIMIT,
      })
    },
    [jurorRegistryContract]
  )

  return { activateANJ, deactivateANJ, stakeActivateANJ, withdrawANJ }
}

/**
 * All dispute interactions
 * @returns {Object} all available functions around a dispute
 */
export function useDisputeActions() {
  const disputeManagerContract = useCourtContract(
    CourtModuleType.DisputeManager,
    disputeManagerAbi
  )
  const votingContract = useCourtContract(CourtModuleType.Voting, votingAbi)

  const aragonCourtContract = useCourtContract(
    CourtModuleType.AragonCourt,
    aragonCourtAbi
  )

  const feeTokenContract = useFeeTokenContract()

  // Draft jurors
  const draft = useCallback(
    disputeId => {
      return disputeManagerContract.draft(disputeId, { gasLimit: GAS_LIMIT })
    },
    [disputeManagerContract]
  )

  // Commit
  const commit = useCallback(
    (disputeId, roundId, commitment, password) => {
      const voteId = getVoteId(disputeId, roundId)
      const hashedCommitment = hashVote(commitment, password)

      return votingContract.commit(voteId, hashedCommitment)
    },
    [votingContract]
  )

  // Reveal
  const reveal = useCallback(
    (disputeId, roundId, voter, commitment, salt) => {
      const voteId = getVoteId(disputeId, roundId)
      const outcome = getOutcomeFromCommitment(commitment, salt)

      return votingContract.reveal(voteId, voter, outcome, hashPassword(salt))
    },
    [votingContract]
  )

  // Leak
  const leak = useCallback(
    (voteId, voter, outcome, salt) => {
      return votingContract.leak(voteId, voter, outcome, salt)
    },
    [votingContract]
  )

  const approveFeeDeposit = useCallback(
    value => {
      return feeTokenContract.approve(disputeManagerContract.address, value)
    },
    [disputeManagerContract, feeTokenContract]
  )

  // Appeal round of dispute
  const appeal = useCallback(
    (disputeId, roundId, ruling) => {
      return disputeManagerContract.createAppeal(disputeId, roundId, ruling, {
        gasLimit: GAS_LIMIT,
      })
    },
    [disputeManagerContract]
  )

  // Confirm appeal round of dispute
  const confirmAppeal = useCallback(
    (disputeId, round, ruling) => {
      return disputeManagerContract.confirmAppeal(disputeId, round, ruling, {
        gasLimit: GAS_LIMIT,
      })
    },
    [disputeManagerContract]
  )

  const executeRuling = useCallback(
    disputeId => {
      return aragonCourtContract.executeRuling(disputeId, {
        gasLimit: GAS_LIMIT,
      })
    },
    [aragonCourtContract]
  )
  return {
    approveFeeDeposit,
    draft,
    commit,
    reveal,
    leak,
    appeal,
    confirmAppeal,
    executeRuling,
  }
}

export function useRewardActions() {
  const disputeManagerContract = useCourtContract(
    CourtModuleType.DisputeManager,
    disputeManagerAbi
  )

  const treasuryContract = useCourtContract(
    CourtModuleType.Treasury,
    courtTreasuryAbi
  )

  const settleReward = useCallback(
    (disputeId, roundId, juror) => {
      return disputeManagerContract.settleReward(disputeId, roundId, juror, {
        gasLimit: GAS_LIMIT,
      })
    },
    [disputeManagerContract]
  )

  const settleAppealDeposit = useCallback(
    (disputeId, roundId) => {
      return disputeManagerContract.settleAppealDeposit(disputeId, roundId, {
        gasLimit: GAS_LIMIT,
      })
    },
    [disputeManagerContract]
  )

  const withdraw = useCallback(
    (token, to, amount) => {
      return treasuryContract.withdraw(token, to, amount, {
        gasLimit: ANJ_ACTIONS_GAS_LIMIT,
      })
    },
    [treasuryContract]
  )

  return { settleReward, settleAppealDeposit, withdraw }
}

/**
 *
 * @param {string} disputeId id of the dispute
 * @param {string} roundId id of the round
 * @returns {Object} appeal deposit and confirm appeal deposit amounts
 */
export function useAppealDeposits(disputeId, roundId) {
  const [appealDeposits, setAppealDeposits] = useState([bigNum(0), bigNum(0)])

  const disputeManagerContract = useCourtContract(
    CourtModuleType.DisputeManager,
    disputeManagerAbi
  )

  useEffect(() => {
    const fetchNextRoundDetails = async () => {
      if (!disputeManagerContract) {
        return
      }

      retryMax(() =>
        disputeManagerContract
          .getNextRoundDetails(disputeId, roundId)
          .then(nextRound => {
            const appealDeposit = nextRound[6]
            const confirmAppealDeposit = nextRound[7]
            setAppealDeposits([appealDeposit, confirmAppealDeposit])
          })
          .catch(err => {
            console.error(`Error fetching appeal deposits: ${err}`)
          })
      )
    }

    fetchNextRoundDetails()
  }, [disputeId, disputeManagerContract, roundId])

  return appealDeposits
}

export function useFeeBalanceOf(account) {
  const [balance, setBalance] = useState(bigNum(0))

  const feeTokenContract = useFeeTokenContract()

  useEffect(() => {
    const getFeeBalance = async () => {
      if (!feeTokenContract) return

      retryMax(() => feeTokenContract.balanceOf(account))
        .then(balance => {
          setBalance(balance)
        })
        .catch(err => {
          console.error(`Error fetching account's fee balance : ${err}`)
        })
    }

    getFeeBalance()
  }, [account, feeTokenContract])

  return balance
}

export function useAppealFeeAllowance(owner) {
  const [allowance, setAllowance] = useState(bigNum(0))

  const courtConfig = useCourtConfig()
  const disputeManagerAddress = getModuleAddress(
    courtConfig.modules,
    CourtModuleType.DisputeManager
  )
  const feeTokenContract = useFeeTokenContract()

  useEffect(() => {
    const getFeeAllowance = async () => {
      if (!feeTokenContract) return

      retryMax(() => feeTokenContract.allowance(owner, disputeManagerAddress))
        .then(allowance => {
          setAllowance(allowance)
        })
        .catch(err => {
          console.error(`Error fetching fee allowance : ${err}`)
        })
    }

    getFeeAllowance()
  }, [disputeManagerAddress, feeTokenContract, owner])

  return allowance
}

export function useTotalActiveBalancePolling(termId) {
  const jurorRegistryContract = useCourtContractReadOnly(
    CourtModuleType.JurorsRegistry,
    jurorRegistryAbi
  )
  console.log('jurorRegistryContract ', jurorRegistryContract)
  const [totalActiveBalance, setTotalActiveBalance] = useState(bigNum(-1))

  const timeoutId = useRef(null)

  const fetchTotalActiveBalance = useCallback(() => {
    if (!jurorRegistryContract) return
    timeoutId.current = setTimeout(() => {
      console.log('jurorRegistryContract ', jurorRegistryContract)
      return jurorRegistryContract
        .totalActiveBalanceAt(termId)
        .then(balance => {
          setTotalActiveBalance(balance)
          clearTimeout(timeoutId.current)
          fetchTotalActiveBalance()
        })
        .catch(err => {
          console.log(`Error fetching balance: ${err} retrying...`)
          fetchTotalActiveBalance()
        })
    }, 1000)
  }, [jurorRegistryContract, termId])

  useEffect(() => {
    fetchTotalActiveBalance()

    return () => clearTimeout(timeoutId.current)
  }, [fetchTotalActiveBalance])

  return totalActiveBalance
}

export function useTotalANTStaked() {
  const [totalANTStaked, setTotalANTStaked] = useState(bigNum(-1))

  const jurorRegistryContract = useCourtContractReadOnly(
    CourtModuleType.JurorsRegistry,
    jurorRegistryAbi
  )
  useEffect(() => {
    if (!jurorRegistryContract) {
      return
    }
    const getTotalANTStaked = async () => {
      retryMax(() => jurorRegistryContract.totalStaked())
        .then(totalStaked => {
          setTotalANTStaked(totalStaked)
        })
        .catch(err => {
          console.error(`Error fetching ANT staked: ${err}`)
        })
    }

    getTotalANTStaked()
  }, [jurorRegistryContract])

  return totalANTStaked
}

export function useTotalActiveBalance() {
  const [totalActiveBalance, setTotalActiveBalance] = useState(bigNum(-1))
  const jurorRegistryContract = useCourtContractReadOnly(
    CourtModuleType.JurorsRegistry,
    jurorRegistryAbi
  )

  useEffect(() => {
    if (!jurorRegistryContract) {
      return
    }
    const getTotalActiveBalance = async () => {
      retryMax(() => jurorRegistryContract.totalActiveBalance())
        .then(totalActive => {
          setTotalActiveBalance(totalActive)
        })
        .catch(err => {
          console.error(`Error fetching ANT staked: ${err}`)
        })
    }

    getTotalActiveBalance()
  }, [jurorRegistryContract])

  return totalActiveBalance
}
