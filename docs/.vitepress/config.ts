import { defineConfig } from 'vitepress'
import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/** 掃描 TypeDoc 產出的 API markdown */
function apiSidebar() {
  const pkgDir = join(__dirname, '../api/@cluion')
  if (!existsSync(pkgDir)) {
    return [
      {
        text: 'API Reference',
        items: [
          {
            text: '尚未產生，請先跑 pnpm docs:api',
            link: '/guide/getting-started',
          },
        ],
      },
    ]
  }

  const files = readdirSync(pkgDir)
    .filter((f) => f.endsWith('.md'))
    .sort((a, b) => a.localeCompare(b))

  return [
    {
      text: 'Packages',
      items: [
        { text: '總覽', link: '/api/' },
        ...files.map((f) => {
          const name = f.replace(/\.md$/, '')
          return {
            text: `@cluion/${name}`,
            link: `/api/@cluion/${name}`,
          }
        }),
      ],
    },
  ]
}

export default defineConfig({
  title: 'Sigil',
  description: 'CSP-safe, shortcode-oriented, embeddable web editor engine',
  lang: 'zh-Hant',
  cleanUrls: true,
  ignoreDeadLinks: true,
  themeConfig: {
    nav: [
      { text: '指南', link: '/guide/getting-started' },
      { text: 'API', link: '/api/' },
      { text: '範例', link: '/guide/examples' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: '指南',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: '擴充（Commands／Hooks）', link: '/guide/extensibility' },
            { text: '範例', link: '/guide/examples' },
            { text: '套件總覽', link: '/guide/packages' },
            { text: '文件站說明', link: '/guide/docs-site' },
          ],
        },
      ],
      '/api/': apiSidebar(),
    },
    socialLinks: [],
    search: {
      provider: 'local',
    },
    outline: {
      level: [2, 3],
    },
  },
})
