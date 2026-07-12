import { describe, it, expect, vi } from 'vitest'
import { openMediaPicker } from '../src/media-picker.js'
import type { AssetStore } from '@cluion/sigil-core'

describe('openMediaPicker', () => {
  it('點選項目觸發 onPick', async () => {
    const assets: AssetStore = {
      list: () => [{ id: '1', url: 'https://example.com/a.png', name: 'A' }],
    }
    const onPick = vi.fn()
    openMediaPicker({
      assets,
      onPick,
      onClose: () => {},
    })
    await vi.waitFor(() => {
      expect(document.querySelector('.sigil-media-card')).toBeTruthy()
    })
    ;(document.querySelector('.sigil-media-card') as HTMLButtonElement).click()
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com/a.png' }),
    )
    expect(document.querySelector('.sigil-media-backdrop')).toBeNull()
  })
})
