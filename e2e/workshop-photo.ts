import { expect, type Locator } from '@playwright/test'

export async function readWorkshopPhoto(image: Locator) {
  const result = await image.evaluate((el: HTMLImageElement) => {
    const canvas = el.ownerDocument.createElement('canvas')
    canvas.width = 2
    canvas.height = 1
    const context = canvas.getContext('2d')!
    context.drawImage(el, 0, 0, 2, 1)
    const pixels = Array.from(context.getImageData(0, 0, 2, 1).data)
    return {
      width: el.naturalWidth,
      height: el.naturalHeight,
      left: pixels.slice(0, 4),
      right: pixels.slice(4),
    }
  })
  expect(result).toMatchObject({ width: 1200, height: 800 })
  expect(result.left[3]).toBe(255)
  expect(result.right[3]).toBe(255)
  expect(result.left).not.toEqual(result.right)
  return result
}
