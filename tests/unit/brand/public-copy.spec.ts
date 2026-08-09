import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const publicEntryFiles = [
  'index.html',
  'src/App.vue',
  'src/views/login/LoginIndex.vue',
  'src/views/layout/components/LayoutHeader.vue',
  'src/views/layout/components/LayoutFixed.vue',
  'src/views/layout/components/LayoutFooter.vue',
  'src/views/layout/components/LayoutNav.vue',
  'src/views/home/HomeIndex.vue',
  'src/directives/index.js',
  'src/views/SubCategory/SubCategoryIndex.vue',
  'src/views/detail/DetailIndex.vue',
]

const forbidden = [
  /小兔鲜/u,
  /Vite App/u,
  /test scss/u,
  /这是(?:新鲜好物|人气推荐)内部/u,
  /password\s*:\s*['"]123456['"]/u,
  /console\.log\s*\(/u,
]

describe('public BerryPilot copy', () => {
  it('contains no course branding, filler, default password or debug logs', () => {
    const violations = publicEntryFiles.flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      return forbidden
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${file}: ${pattern.source}`)
    })

    expect(violations).toEqual([])
  })
})
