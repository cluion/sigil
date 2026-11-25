import { afterEach, describe, expect, it, vi } from 'vitest'
import { createImageUrlForm } from '../src/image-url-form.js'

const disposers: Array<() => void> = []

function setup(acceptsImageAttribute?: (name: 'src' | 'alt', value: string) => boolean) {
  const onInsert = vi.fn()
  const form = createImageUrlForm({ acceptsImageAttribute, onInsert })
  document.body.append(form.el)
  form.setActive(true)
  disposers.push(() => {
    form.destroy()
    form.el.remove()
  })
  const url = form.el.querySelector<HTMLInputElement>('[data-image-url]')!
  const status = form.el.querySelector<HTMLElement>('.sigil-image-url-status')!
  function edit(value: string) {
    url.value = value
    url.dispatchEvent(new Event('input'))
  }
  function preview() {
    form.el.querySelector<HTMLButtonElement>('.sigil-image-url-preview')!.click()
    return form.el.querySelector('img')
  }
  function loaded(image: HTMLImageElement, width: number) {
    Object.defineProperty(image, 'naturalWidth', { value: width })
    image.dispatchEvent(new Event('load'))
  }
  return { form, onInsert, url, status, edit, preview, loaded }
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
})

describe('圖片網址表單', () => {
  it('無效、非 HTTP(S) 或宿主不接受的網址不會發出圖片請求', () => {
    const { form, url, status, edit, preview } = setup((_, value) => !value.startsWith('/private/'))
    for (const value of [
      '',
      'photos/1.jpg',
      '//cdn.example/1.jpg',
      'ftp://example.com/1.jpg',
      'https://',
    ]) {
      edit(value)
      expect(preview()).toBeNull()
      expect(url.getAttribute('aria-invalid')).toBe('true')
      expect(document.activeElement).toBe(url)
      expect(status.textContent).toContain('HTTP(S)')
    }
    edit('/private/1.jpg')
    expect(preview()).toBeNull()
    expect(status.textContent).toContain('此網站無法儲存')
    expect(form.el.querySelector<HTMLButtonElement>('[type=submit]')!.disabled).toBe(true)
  })

  it('輸入與組字不會讀圖，修改後只有最新預覽能確認', () => {
    const { form, url, onInsert, edit, preview, loaded } = setup()
    edit('/spring.jpg')
    url.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true }))
    expect(form.el.querySelector('img')).toBeNull()
    const first = preview()!
    edit('  /展覽/海報.webp?size=lg  ')
    const latest = preview()!
    loaded(first, 100)
    form.el.requestSubmit()
    expect(onInsert).not.toHaveBeenCalled()
    loaded(latest, 300)
    form.el.requestSubmit()
    expect(onInsert).toHaveBeenCalledExactlyOnceWith('/展覽/海報.webp?size=lg', '')
  })

  it('宿主變更儲存條件後停止提交並清除不再接受的預覽', () => {
    let accepted = true
    const { form, onInsert, status, edit, preview, loaded } = setup(() => accepted)
    edit('https://assets.example/events/workshop.webp')
    loaded(preview()!, 320)
    accepted = false
    form.el.requestSubmit()
    expect(onInsert).not.toHaveBeenCalled()
    expect(form.el.querySelector('img')).toBeNull()
    expect(status.textContent).toContain('此網站無法儲存')
  })
})
