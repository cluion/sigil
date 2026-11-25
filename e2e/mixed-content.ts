import type { SigilDoc } from '@cluion/sigil-core'

export function workshopRegistration(): SigilDoc {
  return {
    version: 1,
    meta: { title: '週末版畫工作坊' },
    root: {
      id: 'workshop',
      type: 'section',
      name: '工作坊',
      style: { padding: '1.25rem', color: '#18294e', 'font-family': 'system-ui, sans-serif' },
      children: [
        {
          id: 'headline',
          type: 'text',
          tagName: 'h1',
          name: '活動標題',
          content: '週末版畫工作坊',
        },
        {
          id: 'instructions',
          type: 'text',
          tagName: 'p',
          name: '報名說明',
          content: '報名前請閱讀',
          style: { 'font-size': '18px', 'line-height': '1.75' },
          children: [
            {
              id: 'terms-link',
              type: 'button',
              tagName: 'a',
              name: '參加須知連結',
              content: '參加須知',
              attributes: { href: '#terms' },
            },
            {
              id: 'deadline',
              type: 'text',
              tagName: 'strong',
              name: '日期提醒',
              content: '（週五截止）',
            },
          ],
        },
        {
          id: 'details',
          type: 'text',
          tagName: 'h2',
          name: '活動須知',
          content: '參加須知與報名方式',
          attributes: { id: 'terms' },
          style: { 'margin-top': '45rem' },
        },
      ],
    },
  }
}
