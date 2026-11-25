import { describe, expect, it } from 'vitest'
import type { ComponentNode } from '@cluion/sigil-core'
import { collectPageImages } from '../src/page-images.js'

function image(id: string, src: string): ComponentNode {
  return { id, type: 'image', attributes: { src } }
}

function page(children: ComponentNode[]): ComponentNode {
  return { id: 'page', type: 'section', children }
}

describe('本頁圖片', () => {
  it('同一來源只列一次，保留各處的圖層名稱、替代文字、大小寫屬性及檔名', () => {
    const url = '/album/%E7%B4%99%E8%97%9D.webp?variant=large#crop'
    const root = page([
      { id: 'hero', type: 'image', name: ' 封面 ', attributes: { SRC: url, ALT: ' 紙張 ' } },
      image('portrait', '/speaker.jpg'),
      {
        ...page([
          {
            id: 'poster',
            type: 'custom',
            tagName: 'IMG',
            name: '海報',
            attributes: { src: url, alt: '工藝' },
          },
        ]),
        id: 'hidden-section',
        hidden: true,
      },
      image('other-variant', '/album/%E7%B4%99%E8%97%9D.webp?variant=small'),
    ])
    expect(collectPageImages(root)).toEqual([
      {
        id: 'hero',
        name: '封面',
        url,
        uses: 2,
        searchTerms: ['紙藝.webp', '封面', '紙張', '海報', '工藝'],
      },
      {
        id: 'portrait',
        name: 'speaker.jpg',
        url: '/speaker.jpg',
        uses: 1,
        searchTerms: ['speaker.jpg'],
      },
      {
        id: 'other-variant',
        name: '紙藝.webp',
        url: '/album/%E7%B4%99%E8%97%9D.webp?variant=small',
        uses: 1,
        searchTerms: ['紙藝.webp'],
      },
    ])
  })

  it('忽略宿主產出的標記、無 src 的圖及不屬於文件的子樹', () => {
    const inner = [image('managed-image', '/outside.jpg')]
    const root = page([
      { id: 'html', type: 'rich-text', content: '<img src="outside">', children: inner },
      { id: 'code', type: 'section', shortcode: { name: 'album', props: {} }, children: inner },
      { id: 'adapter', type: 'text', children: inner },
      { id: 'template', type: 'section', tagName: 'template', children: inner },
      { id: 'image-with-children', type: 'image', children: inner },
      { id: 'srcset', type: 'image', attributes: { srcset: '/1x.png 1x, /2x.png 2x' } },
      { ...image('explicit-other-tag', '/other.png'), tagName: 'div' },
      image('empty', '   '),
      { ...image('real', 'actual.jpg'), name: '拍攝現場' },
    ])
    const images = collectPageImages(root, { supports: (node) => node.id === 'adapter' })
    expect(images.map(({ id }) => id)).toEqual(['real'])
  })

  it('能重用內嵌及物件網址，搜尋文字只包含可辨識的名稱', () => {
    const data = 'data:image/png;base64,iVBORw0KGgo='
    const blob = 'blob:https://example.org/8def172b'
    const root = page([
      { ...image('embedded', data), attributes: { src: data, alt: '活動海報' } },
      image('session-photo', blob),
      image('escaped', 'https://assets.example.org/%EF%BF?view=thumb'),
    ])
    expect(collectPageImages(root)).toEqual([
      { id: 'embedded', url: data, name: '活動海報', uses: 1, searchTerms: ['活動海報'] },
      { id: 'session-photo', url: blob, name: 'session-photo', uses: 1, searchTerms: [] },
      {
        id: 'escaped',
        url: 'https://assets.example.org/%EF%BF?view=thumb',
        name: '%EF%BF',
        uses: 1,
        searchTerms: ['%EF%BF'],
      },
    ])
  })
})
