import { blockFAQ, blockHero, blockImage, blockSection, blockText } from '@cluion/sigil-blocks'
import type { SigilDoc } from '@cluion/sigil-core'

export function createActivityDocument(): SigilDoc {
  const hero = blockHero({
    eyebrow: '一起動手，讓靈感成形',
    title: '秋日設計工作坊',
    description: '用一個下午，探索設計、分享想法，完成自己的第一件作品。',
    ctaLabel: '查看活動資訊',
  })
  hero.id = 'activity-hero'
  hero.children![1]!.id = 'activity-title'
  hero.children![1]!.name = '活動標題'
  const action = hero.children![3]!
  action.tagName = 'a'
  action.attributes = { href: '#event-info' }

  const image = blockImage(
    new URL(
      '/placeholder.svg',
      typeof location === 'undefined' ? 'http://127.0.0.1:4175' : location.origin,
    ).href,
  )
  image.id = 'activity-image'
  image.name = '活動圖片'
  image.attributes!.alt = '活動示意圖，請換成你的活動照片'
  image.style = { width: '100%', height: 'auto', 'border-radius': '1rem' }

  const info = blockSection()
  info.id = 'activity-info'
  info.name = '活動資訊'
  info.attributes = { id: 'event-info' }
  info.style = { padding: '2rem', background: '#ffffff', 'border-radius': '1rem' }
  info.children = [
    { ...blockText('活動資訊'), tagName: 'h2', name: '資訊標題' },
    blockText('時間｜11 月 14 日 14:00–17:00'),
    blockText('地點｜城市創作空間'),
    blockText('對象｜對設計有興趣的初學者；不需要事先準備作品。'),
  ]

  const faq = blockFAQ({
    title: '參加前的小提醒',
    description: '以下內容都可以直接編輯成你的活動說明。',
    items: [
      { question: '需要自備工具嗎？', answer: '現場會提供材料與工具，帶著好奇心來就好。' },
      { question: '沒有經驗也能參加嗎？', answer: '可以，老師會從基礎步驟開始示範。' },
    ],
  })
  return {
    version: 1,
    meta: { title: '秋日設計工作坊' },
    root: {
      id: 'activity-root',
      type: 'section',
      name: '活動頁',
      style: {
        'box-sizing': 'border-box',
        'max-width': '1200px',
        margin: '0 auto',
        padding: '2rem',
        display: 'flex',
        'flex-direction': 'column',
        gap: '1.5rem',
        background: '#f1f5f9',
        'font-family': 'system-ui, sans-serif',
      },
      responsiveStyles: { mobile: { padding: '0.75rem', gap: '1rem' } },
      children: [hero, image, info, faq],
    },
  }
}
