import { accounts, bigExp } from '../helper'
import { ANJMovementType } from '../types'

const ACTIVE_BASE_BALANCE = '10000'
const numberOfJurors = 3

function generateJurors() {
  return accounts.slice(0, numberOfJurors).map((account, index) => {
    const activeBalance = bigExp(`${ACTIVE_BASE_BALANCE * (index + 1)}`)

    return {
      id: account,

      // Wallet balance (from the subgraph we actually don't get this amount from the juror entity itself
      // but in this case since we are mocking data doesn't really matter)
      walletBalance: '0',
      activeBalance,
      lockedBalance: '0',
      availableBalance: '0',
      deactivationBalance: '0',
      treasuryTokens: [],

      // Mimicking ANJ activation from wallet
      anjMovements: [
        {
          amount: activeBalance,
          effectiveTermId: 3,
          createdAt: '1',
          type: ANJMovementType.Activation,
        },
        {
          amount: activeBalance,
          effectiveTermId: 3,
          createdAt: '1',
          type: ANJMovementType.Stake,
        },
      ],

      drafts: [],
    }
  })
}

export default generateJurors()
