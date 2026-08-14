import { describe, it, expect, vi } from 'vitest'
import { openMediaPicker } from '../src/media-picker.js'
import { createI18n, type AssetStore } from '@cluion/sigil-core'

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

  it('限制焦點、Escape 關閉並還原觸發按鈕焦點', async () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const onClose = vi.fn()
    openMediaPicker({
      assets: {
        list: () => [{ id: '1', url: 'https://example.com/a.png', name: 'A' }],
      },
      onPick: () => {},
      onClose,
    })

    const dialog = document.querySelector('.sigil-media-backdrop') as HTMLElement
    const close = dialog.querySelector('.sigil-media-head button') as HTMLButtonElement
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-labelledby')).toBe(
      dialog.querySelector('h3')?.getAttribute('id'),
    )
    expect(document.activeElement).toBe(close)

    await vi.waitFor(() => expect(dialog.querySelector('.sigil-media-card')).toBeTruthy())
    const card = dialog.querySelector('.sigil-media-card') as HTMLButtonElement
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    )
    expect(document.activeElement).toBe(card)

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
    expect(document.querySelector('.sigil-media-backdrop')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(onClose).toHaveBeenCalledOnce()
    trigger.remove()
  })

  it('runtime locale 切換更新開啟中的對話框，關閉後停止更新', async () => {
    const i18n = createI18n({
      zh: {},
      en: {
        'media.title': 'Media library',
        'media.close': 'Close',
        'media.upload': 'Upload image',
        'media.empty': 'No media yet',
      },
    })
    const close = openMediaPicker({
      assets: {
        list: () => [],
        upload: (file) => ({ id: file.name, url: `https://example.com/${file.name}` }),
      },
      i18n,
      onPick: () => {},
      onClose: () => {},
    })

    const dialog = document.querySelector('.sigil-media-backdrop') as HTMLElement
    expect(dialog.querySelector('h3')?.textContent).toBe('媒體庫')
    await vi.waitFor(() =>
      expect(dialog.querySelector('.sigil-muted')?.textContent).toBe('尚無媒體'),
    )

    i18n.setLocale('en')

    expect(dialog.querySelector('h3')?.textContent).toBe('Media library')
    expect(dialog.querySelector('.sigil-media-head button')?.textContent).toBe('Close')
    expect(dialog.querySelector('.sigil-media-actions button')?.textContent).toBe('Upload image')
    await vi.waitFor(() =>
      expect(dialog.querySelector('.sigil-muted')?.textContent).toBe('No media yet'),
    )

    close()
    i18n.setLocale('zh')
    expect(dialog.querySelector('h3')?.textContent).toBe('Media library')
  })
})
