import { TableOutput, TableOutputBasket } from '../schema/tables'
import { _tu, TestWalletNoSetup, TestWalletProviderNoSetup } from '../../../test/utils/TestUtilsWalletStorage'
import 'fake-indexeddb/auto'
import { managedChangeOutputFields } from '../methods/managedChange'

/**
 * Change candidates are scanned with `noScript: true`, which clears every
 * locking script. `validateOutputScript` reloads only a script offloaded into
 * the raw transaction, so a script stored inline on the row stayed cleared and
 * the signer received a funding input with no locking script.
 */
describe('funding outputs keep their locking script', () => {
  jest.setTimeout(60_000)
  type Ctx = TestWalletNoSetup | TestWalletProviderNoSetup
  const ctxs: Ctx[] = []

  beforeAll(async () => {
    ctxs.push(await _tu.createLegacyWalletSQLiteCopy('allocateChangeInputScript'))
    ctxs.push(await _tu.createIdbLegacyWalletCopy('allocateChangeInputScriptIdb'))
  })
  afterAll(async () => {
    for (const ctx of ctxs) await ctx.storage.destroy()
  })

  const p2pkhScript = [0x76, 0xa9, 0x14, ...Array.from({ length: 20 }, () => 0x22), 0x88, 0xac]

  async function inlineChange(
    ctx: Ctx,
    name: string,
    satoshis: number,
    vout: number
  ): Promise<{ basketId: number; transactionId: number; outputId: number }> {
    const storage = ctx.activeStorage
    const basket: TableOutputBasket = {
      created_at: new Date(),
      updated_at: new Date(),
      basketId: 0,
      userId: ctx.userId,
      name,
      numberOfDesiredUTXOs: 0,
      minimumDesiredUTXOValue: 0,
      isDeleted: false
    }
    const basketId = await storage.insertOutputBasket(basket)
    const tx = (await storage.findTransactions({ partial: { userId: ctx.userId, status: 'completed' } }))[0]
    const outputId = await storage.insertOutput({
      outputId: 0,
      created_at: new Date(),
      updated_at: new Date(),
      userId: ctx.userId,
      transactionId: tx.transactionId,
      basketId,
      spendable: true,
      satoshis,
      outputDescription: 'inline script change',
      vout,
      txid: 'allocateChangeInputScriptTxid',
      derivationPrefix: 'AAAAAAAAAAA=',
      derivationSuffix: 'AAAAAAAAAAA=',
      lockingScript: p2pkhScript,
      scriptLength: p2pkhScript.length,
      // Inline: the script is not offloaded into rawTx storage.
      scriptOffset: 0,
      ...managedChangeOutputFields
    } as TableOutput)
    return { basketId, transactionId: tx.transactionId, outputId }
  }

  test('allocateChangeInput returns the chosen output with its inline script', async () => {
    for (const [backend, ctx] of ctxs.entries()) {
      const value = 616161
      const { basketId, transactionId, outputId } = await inlineChange(ctx, `inline-allocate-${backend}`, value, 950)
      const picked = await ctx.activeStorage.allocateChangeInput(
        ctx.userId,
        basketId,
        value,
        value,
        false,
        transactionId
      )
      expect(picked?.outputId).toBe(outputId)
      expect(Array.from(picked?.lockingScript ?? [])).toEqual(p2pkhScript)
    }
  })

  test('restoreOutputScript rereads an inline script cleared by a noScript scan', async () => {
    for (const [backend, ctx] of ctxs.entries()) {
      const { basketId } = await inlineChange(ctx, `inline-restore-${backend}`, 717171, 951)
      const [scanned] = await ctx.activeStorage.findOutputs({
        partial: { userId: ctx.userId, basketId },
        noScript: true
      })
      expect(scanned.lockingScript).toBeUndefined()
      await ctx.activeStorage.validateOutputScript(scanned)
      expect(scanned.lockingScript).toBeUndefined()
      await ctx.activeStorage.restoreOutputScript(scanned)
      expect(Array.from(scanned.lockingScript ?? [])).toEqual(p2pkhScript)
    }
  })
})
