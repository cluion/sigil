import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createEngine,
  findNode,
  type ComponentNode,
  type ResponsiveDevice,
} from '@cluion/sigil-core'
import { createImageFraming, supportsImageFraming } from '../src/image-framing.js'
import { readImageLink, removeImageLink, setImageLink } from '../src/image-link.js'

const cleanups: (() => void)[] = []
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.()
})

function setup(fields: Partial<ComponentNode> = {}, device: ResponsiveDevice = 'desktop') {
  const node = {
    id: 'photo',
    type: 'image',
    attributes: { src: '/source.webp', alt: '紙雕' },
    ...fields,
  }
  const engine = createEngine({
    doc: { version: 1, root: { id: 'root', type: 'section', children: [node] } },
  })
  engine.select(node.id)
  const control = createImageFraming(engine, node, device)
  document.body.append(control.el)
  cleanups.push(() => {
    control.destroy()
    engine.destroy()
    control.el.remove()
  })
  const input = (name: string) =>
    control.el.querySelector<HTMLInputElement | HTMLSelectElement>('[data-framing="' + name + '"]')!
  const change = (name: string, value: string) => {
    const field = input(name)
    field.value = value
    field.dispatchEvent(new Event('change', { bubbles: true }))
  }
  const button = (label: string) =>
    [...control.el.querySelectorAll('button')].find((b) => b.textContent === label)!
  const surface = control.el.querySelector<HTMLButtonElement>('.sigil-framing-surface')!
  const image = surface.querySelector('img')!
  const marker = surface.querySelector<HTMLElement>('.sigil-framing-marker')!
  function loaded(width = 60, height = 120) {
    Object.defineProperties(image, {
      naturalWidth: { value: width, configurable: true },
      naturalHeight: { value: height, configurable: true },
    })
    image.dispatchEvent(new Event('load'))
  }
  const pointer = (name: string, x: number, y: number) =>
    surface.dispatchEvent(
      new PointerEvent(name, { clientX: x, clientY: y, button: 0, pointerId: 3 }),
    )
  return {
    engine,
    node,
    control,
    input,
    change,
    button,
    surface,
    image,
    marker,
    loaded,
    pointer,
    current: () => findNode(engine.getTree(), 'photo')!,
  }
}

describe('圖片構圖', () => {
  it('連結圖片的裁切與裝置重設同步調整點擊範圍，一次復原且移除連結仍保留比例', () => {
    const h = setup(
      {
        style: { display: 'block', width: '210px', height: '120px', 'max-height': '110px' },
        responsiveStyles: {
          mobile: { height: '90px', 'max-height': '80px', 'min-height': '30px' },
        },
      },
      'mobile',
    )
    h.engine.update('root', { style: { display: 'grid' } })
    expect(setImageLink(h.engine, 'photo', '/tickets')).toBe(true)
    const link = () => readImageLink(h.engine.getTree(), 'photo')!.link!
    const before = h.engine.getTree()
    const desktop = link().style
    h.change('ratio', '1 / 1')
    expect(link().responsiveStyles?.mobile).toMatchObject({
      height: 'auto',
      'max-height': 'none',
      'min-height': '0',
    })
    expect(link().style).toEqual(desktop)
    expect(h.input('ratio').value).toBe('1 / 1')
    h.engine.undo()
    expect(h.engine.getTree()).toBe(before)
    h.engine.redo()
    h.button('沿用上層比例、高度、上下限與適應方式').click()
    expect(link().responsiveStyles?.mobile).toBeUndefined()
    expect(h.current().responsiveStyles?.mobile).toBeUndefined()
    expect(h.input('ratio').value).toBe('')
    h.change('ratio', '1 / 1')
    expect(removeImageLink(h.engine, 'photo')).toBe(true)
    expect(h.engine.getTree().children?.[0]?.id).toBe('photo')
    expect(h.current().responsiveStyles?.mobile).toMatchObject({
      height: 'auto',
      'aspect-ratio': '1 / 1',
      'object-fit': 'cover',
    })
    expect(h.input('ratio').value).toBe('1 / 1')
  })

  it('鎖定的產生外框禁止更動，作者設計的連結容器始終保留其高度', () => {
    const h = setup({ style: { display: 'block', width: '210px', height: '120px' } })
    expect(setImageLink(h.engine, 'photo', '/tickets')).toBe(true)
    const linked = readImageLink(h.engine.getTree(), 'photo')!.link!
    h.engine.update(linked.id, { locked: true })
    expect(h.input('ratio').disabled).toBe(true)
    expect(h.button('清除比例、高度、上下限與適應方式').disabled).toBe(true)
    const before = h.engine.getTree()
    h.change('ratio', '1 / 1')
    expect(h.engine.getTree()).toBe(before)
    h.engine.update(linked.id, { locked: false })
    expect(removeImageLink(h.engine, 'photo')).toBe(true)
    h.engine.insert('root', {
      id: 'authored',
      type: 'section',
      tagName: 'a',
      attributes: { href: '/tickets' },
      style: { height: '140px' },
    })
    h.engine.move('photo', 'authored')
    h.change('ratio', '1 / 1')
    expect(findNode(h.engine.getTree(), 'authored')?.style).toEqual({ height: '140px' })
  })

  it('只提供給原生 img', () => {
    const node = { id: 'img', type: 'image' }
    expect(supportsImageFraming(node)).toBe(true)
    expect(supportsImageFraming({ ...node, tagName: 'IMG' })).toBe(true)
    expect(supportsImageFraming({ ...node, tagName: 'picture' })).toBe(false)
    expect(supportsImageFraming({ ...node, shortcode: { name: 'photo', props: {} } })).toBe(false)
    expect(supportsImageFraming({ ...node, type: 'text' })).toBe(false)
  })

  it('裁切比例一次寫入，保留寬度與來源，且可復原、重做', () => {
    const h = setup({ style: { width: '60%', height: '280px', 'border-radius': '8px' } })
    const old = h.engine.getTree()
    const update = vi.spyOn(h.engine, 'update')
    h.change('ratio', '1 / 1')
    expect(update).toHaveBeenCalledTimes(1)
    expect(h.current()).toMatchObject({
      attributes: { src: '/source.webp', alt: '紙雕' },
      style: {
        width: '60%',
        height: 'auto',
        'aspect-ratio': '1 / 1',
        'object-fit': 'cover',
        'border-radius': '8px',
      },
    })
    h.change('ratio', '1 / 1')
    h.change('fit', 'cover')
    h.change('x', '50')
    expect(update).toHaveBeenCalledTimes(1)
    h.engine.undo()
    expect(h.engine.getTree()).toBe(old)
    expect(h.input('ratio').value).toBe('')
    expect(h.input('fit').value).toBe('fill')
    h.engine.redo()
    expect(h.input('ratio').value).toBe('1 / 1')
    h.change('fit', 'contain')
    h.change('ratio', '3 / 4')
    expect(h.current().style?.['object-fit']).toBe('contain')
    h.button('清除比例、高度、上下限與適應方式').click()
    expect(h.current().style).toEqual({ width: '60%', 'border-radius': '8px' })
  })

  it('裝置繼承及清除操作只修改對應屬性和層級', () => {
    const desktop = { 'object-position': 'left bottom', 'object-fit': 'contain', height: '24rem' }
    const tablet = { 'object-position': '20% 30%', width: '80%' }
    const h = setup(
      { style: desktop, responsiveStyles: { tablet, mobile: { padding: '4px' } } },
      'mobile',
    )
    expect(h.input('x').value).toBe('20')
    expect(h.input('y').value).toBe('30')
    expect(h.button('沿用上層焦點').disabled).toBe(true)
    h.change('x', '80')
    h.change('ratio', '16 / 9')
    expect(h.current().responsiveStyles).toEqual({
      tablet,
      mobile: {
        padding: '4px',
        'object-position': '80% 30%',
        'aspect-ratio': '16 / 9',
        height: 'auto',
      },
    })
    h.button('沿用上層焦點').click()
    expect(h.input('x').value).toBe('20')
    expect(h.input('y').value).toBe('30')
    expect(h.current().responsiveStyles?.mobile?.['aspect-ratio']).toBe('16 / 9')
    h.button('沿用上層比例、高度、上下限與適應方式').click()
    expect(h.current().responsiveStyles).toEqual({ tablet, mobile: { padding: '4px' } })
    expect(h.current().style).toEqual(desktop)
    h.engine.undo()
    expect(h.input('ratio').value).toBe('16 / 9')
  })

  it('保留舊 CSS 自訂值，直到編輯者明確選擇新位置或模式', () => {
    const style = {
      'object-position': 'right 12px bottom 2em',
      'object-fit': 'scale-down',
      'aspect-ratio': 'auto 2 / 1',
    }
    const h = setup({ style })
    expect(h.marker.hidden).toBe(true)
    expect(h.input('x').value).toBe('')
    expect(h.input('fit').value).toBe('')
    expect(h.control.el.querySelector('.sigil-framing-custom')?.textContent).toContain(
      style['object-position'],
    )
    expect(h.engine.canUndo()).toBe(false)
    h.change('x', '122')
    expect(h.current().style).toEqual(style)
    h.change('x', '15')
    expect(h.input('y').value).toBe('50')
    expect(h.current().style).toEqual({ ...style, 'object-position': '15% 50%' })
    h.engine.undo()
    expect(h.current().style).toEqual(style)
    expect(h.marker.hidden).toBe(true)
    h.engine.update('photo', { style: { 'object-position': 'bottom left' } })
    expect(h.input('x').value).toBe('0')
    expect(h.input('y').value).toBe('100')
    h.change('x', '0')
    expect(h.current().style?.['object-position']).toBe('bottom left')
  })

  it('在手機選取比例時固定比例所需的自動高度', () => {
    const h = setup({ style: { height: 'auto', 'object-fit': 'contain' } }, 'mobile')
    h.change('ratio', '1 / 1')
    h.engine.update('photo', { style: { height: '240px' } })
    expect(h.current().responsiveStyles?.mobile).toEqual({
      height: 'auto',
      'aspect-ratio': '1 / 1',
    })
    expect(h.input('ratio').value).toBe('1 / 1')
  })

  it('設定比例時在目前裝置解除高度限制，復原與繼承可還原原本的限制', () => {
    const desktop = {
      width: '60%',
      height: 'auto',
      'min-height': '25rem',
      'max-height': '32rem',
      'aspect-ratio': '3 / 4',
      'object-fit': 'contain',
    }
    const mobile = { 'max-height': '26rem', 'max-width': '100%' }
    const h = setup({ style: desktop, responsiveStyles: { mobile } }, 'mobile')
    const update = vi.spyOn(h.engine, 'update')
    expect(h.input('ratio').value).toBe('')
    h.change('ratio', '3 / 4')
    const changed = h.current().responsiveStyles?.mobile
    expect(changed).toEqual({
      ...mobile,
      'aspect-ratio': '3 / 4',
      height: 'auto',
      'min-height': '0',
      'max-height': 'none',
    })
    expect(h.input('ratio').value).toBe('3 / 4')
    h.change('ratio', '3 / 4')
    expect(update).toHaveBeenCalledTimes(1)
    h.engine.undo()
    expect(h.current().responsiveStyles?.mobile).toEqual(mobile)
    h.engine.redo()
    h.button('沿用上層比例、高度、上下限與適應方式').click()
    expect(h.current().responsiveStyles?.mobile).toEqual({ 'max-width': '100%' })
    expect(h.current().style).toEqual(desktop)
    expect(h.input('ratio').value).toBe('')
  })

  it('等待原圖預覽與其他樣式更新期間保留手動輸入，離開欄位才寫入目前裝置', () => {
    const h = setup({ style: { 'object-position': '50% 60%' } }, 'mobile')
    const field = h.input('x')
    field.focus()
    field.value = '25'
    field.dispatchEvent(new Event('input', { bubbles: true }))
    h.loaded()
    expect(field.value).toBe('25')
    h.image.dispatchEvent(new Event('error'))
    h.engine.update('photo', { style: { width: '80%' } })
    expect(field.value).toBe('25')
    expect(h.marker.style.left).toBe('50%')
    expect(h.current().responsiveStyles).toBeUndefined()
    const update = vi.spyOn(h.engine, 'update')
    field.blur()
    field.dispatchEvent(new Event('change', { bubbles: true }))
    expect(update).toHaveBeenCalledTimes(1)
    expect(h.current().responsiveStyles?.mobile?.['object-position']).toBe('25% 60%')
    expect(h.current().style?.['object-position']).toBe('50% 60%')
    expect(h.marker.style.left).toBe('25%')
  })

  it('焦點從外部變更、復原或鎖定時捨棄未送出的數字', () => {
    const h = setup()
    const field = h.input('x')
    const type = () => {
      field.focus()
      field.value = '87'
      field.dispatchEvent(new Event('input', { bubbles: true }))
    }
    type()
    h.engine.update('photo', { style: { 'object-position': '11% 22%' } })
    expect(field.value).toBe('11')
    type()
    h.engine.undo()
    expect(field.value).toBe('50')
    type()
    h.engine.update('photo', { locked: true })
    expect(field.value).toBe('50')
    field.blur()
    expect(h.current().style).toBeUndefined()
  })

  it('在直幅原圖框內點選或拖曳，一次手勢一次寫入；取消或失焦不會寫回', () => {
    const h = setup()
    h.loaded()
    expect(h.surface.style.width).toContain('88px')
    vi.spyOn(h.image, 'getBoundingClientRect').mockReturnValue(new DOMRect(110, 30, 60, 120))
    const update = vi.spyOn(h.engine, 'update')
    h.pointer('pointerdown', 120, 40)
    h.pointer('pointermove', 155, 126)
    expect(h.marker.style.left).toBe('75%')
    expect(h.marker.style.top).toBe('80%')
    expect(update).not.toHaveBeenCalled()
    h.pointer('pointerup', 155, 126)
    expect(update).toHaveBeenCalledTimes(1)
    expect(h.current().style?.['object-position']).toBe('75% 80%')
    h.pointer('pointerdown', 120, 40)
    h.pointer('pointercancel', 120, 40)
    expect(update).toHaveBeenCalledTimes(1)
    expect(h.marker.style.left).toBe('75%')
    h.pointer('pointerdown', 120, 40)
    window.dispatchEvent(new Event('blur'))
    h.pointer('pointerup', 110, 30)
    expect(update).toHaveBeenCalledTimes(1)
    expect(h.marker.style.left).toBe('75%')
    h.pointer('pointerdown', 120, 40)
    h.pointer('pointerup', 75, 225)
    expect(h.current().style?.['object-position']).toBe('0% 100%')
    h.engine.undo()
    expect(h.input('x').value).toBe('75')
    h.surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true }))
    expect(h.current().style?.['object-position']).toBe('65% 80%')
  })

  it('圖片更換或失敗時保留可操作的欄位，鎖定、過期或卸載的控制不寫入', () => {
    const h = setup()
    h.loaded()
    vi.spyOn(h.image, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 100))
    h.pointer('pointerdown', 10, 10)
    h.engine.update('photo', { attributes: { src: '/second.webp' } })
    h.pointer('pointerup', 90, 90)
    expect(h.current().style).toBeUndefined()
    expect(h.image.getAttribute('src')).toBe('/second.webp')
    expect(h.surface.disabled).toBe(true)
    h.image.dispatchEvent(new Event('error'))
    expect(h.control.el.querySelector<HTMLElement>('.sigil-framing-missing')?.hidden).toBe(false)
    h.change('x', '25')
    expect(h.current().style?.['object-position']).toBe('25% 50%')
    h.engine.update('photo', { locked: true })
    h.change('y', '30')
    expect(h.input('y').disabled).toBe(true)
    expect(h.current().style?.['object-position']).toBe('25% 50%')
    h.engine.update('photo', { locked: false })
    h.engine.select('root')
    h.change('ratio', '1 / 1')
    expect(h.current().style).toEqual({ 'object-position': '25% 50%' })
    h.engine.select('photo')
    h.control.destroy()
    h.change('x', '0')
    expect(h.current().style?.['object-position']).toBe('25% 50%')
  })
})
