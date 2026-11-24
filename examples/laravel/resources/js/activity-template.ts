import { blockButton, blockImage, blockSection, blockText } from '@cluion/sigil-blocks'
import type { ComponentNode, SigilDoc } from '@cluion/sigil-core'

export const activityTemplateTitle = '秋日設計工作坊'

function sectionTitle(content: string, name: string): ComponentNode {
  return {
    ...blockText(content),
    name,
    tagName: 'h2',
    style: { margin: '0 0 0.75rem', 'font-size': '1.5rem', 'line-height': '1.3' },
  }
}

export function createActivityDocument(
  title = activityTemplateTitle,
  coverUrl = new URL(
    '/workshop-printmaking.webp',
    typeof location === 'undefined' ? 'http://127.0.0.1:4175' : location.origin,
  ).href,
): SigilDoc {
  const image = blockImage(coverUrl)
  image.id = 'activity-image'
  image.name = '活動圖片'
  image.attributes!.alt = '兩位參加者在木桌上排列藍色與橙色的版畫紙樣'
  image.style = {
    display: 'block',
    width: '100%',
    height: '100%',
    'max-height': '26rem',
    'object-fit': 'cover',
    'aspect-ratio': '4 / 3',
  }
  image.responsiveStyles = { mobile: { height: 'auto', 'aspect-ratio': '16 / 9' } }

  const intro = blockSection()
  intro.name = '活動簡介'
  intro.style = {
    display: 'flex',
    'flex-direction': 'column',
    'align-items': 'flex-start',
    'justify-content': 'center',
    gap: '1rem',
    padding: 'clamp(1.25rem, 4vw, 3rem)',
  }
  intro.children = [
    {
      ...blockText('城市創作空間'),
      name: '主辦單位',
      style: { margin: '0', color: '#3c5086', 'font-weight': '700', 'font-size': '0.875rem' },
    },
    {
      ...blockText(title),
      id: 'activity-title',
      tagName: 'h1',
      name: '活動標題',
      style: {
        margin: '0',
        'font-size': 'clamp(2rem, 4.4vw, 3.75rem)',
        'line-height': '1.15',
        'letter-spacing': '-0.04em',
        'overflow-wrap': 'anywhere',
      },
    },
    {
      ...blockText('用紙張、色塊與油墨，親手完成一張屬於你的海報。'),
      name: '活動說明',
      style: { margin: '0', color: '#454c57', 'line-height': '1.65' },
    },
    {
      ...blockButton('查看活動資訊'),
      tagName: 'a',
      name: '主要行動',
      attributes: { href: '#event-info' },
      style: {
        display: 'inline-flex',
        'align-items': 'center',
        'min-height': '44px',
        padding: '0.5rem 1rem',
        'border-radius': '0.375rem',
        background: '#243e83',
        color: '#ffffff',
        'text-decoration': 'none',
        'font-weight': '650',
      },
    },
  ]

  const hero = blockSection()
  hero.id = 'activity-hero'
  hero.name = '主視覺'
  hero.style = {
    display: 'grid',
    'grid-template-columns': 'repeat(auto-fit, minmax(min(100%, 16rem), 1fr))',
    background: '#f8f4eb',
    overflow: 'hidden',
    'border-radius': '0.75rem',
  }
  hero.responsiveStyles = { mobile: { 'grid-template-columns': 'minmax(0, 1fr)' } }
  hero.children = [intro, image]

  const info = blockSection()
  info.id = 'activity-info'
  info.name = '活動資訊'
  info.attributes = { id: 'event-info' }
  info.style = {
    display: 'grid',
    gap: '0.375rem',
    padding: '1.5rem',
    background: '#eef2f8',
    'border-radius': '0.75rem',
  }
  info.children = [
    sectionTitle('活動資訊', '資訊標題'),
    { ...blockText('時間｜11 月 14 日 14:00–17:00'), name: '活動時間' },
    { ...blockText('地點｜城市創作空間'), name: '活動地點' },
    { ...blockText('對象｜對設計有興趣的初學者，無須準備作品。'), name: '參加對象' },
  ]

  const faq = blockSection()
  faq.name = '常見問題'
  faq.style = { padding: '0.5rem 1.5rem 1.5rem' }
  faq.children = [
    sectionTitle('參加前的小提醒', '常見問題標題'),
    { ...blockText('需要自備工具嗎？'), tagName: 'h3', name: '工具問題' },
    { ...blockText('紙張、顏料和工具都由工作室提供。'), name: '工具說明' },
    { ...blockText('沒有經驗也能參加嗎？'), tagName: 'h3', name: '經驗問題' },
    { ...blockText('可以，老師會從構圖開始示範，再陪你完成印製。'), name: '經驗說明' },
  ]

  return {
    version: 1,
    meta: { title },
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
        background: '#ffffff',
        color: '#18294e',
        'line-height': '1.55',
        'font-family': 'system-ui, sans-serif',
      },
      responsiveStyles: { mobile: { padding: '0.75rem', gap: '1rem' } },
      children: [hero, info, faq],
    },
  }
}
