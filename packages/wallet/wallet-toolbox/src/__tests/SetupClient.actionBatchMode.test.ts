import { PrivateKey } from '@bsv/sdk'
import { SetupClient } from '../SetupClient'

describe('SetupClient.createWallet action batch mode', () => {
  const rootKeyHex = PrivateKey.fromRandom().toHex()

  test('forwards actionBatchMode to the wallet', async () => {
    const { wallet } = await SetupClient.createWallet({ chain: 'test', rootKeyHex, actionBatchMode: 'legacy' })
    expect(wallet.actionBatch.mode).toBe('legacy')
  })

  test('keeps auto as the default', async () => {
    const { wallet } = await SetupClient.createWallet({ chain: 'test', rootKeyHex })
    expect(wallet.actionBatch.mode).toBe('auto')
  })
})
