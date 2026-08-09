import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import BerryTrail from '@/features/agent/components/BerryTrail.vue'
import berryTrailSource from '@/features/agent/components/BerryTrail.vue?raw'

const trail = [
  { stage: 'UNDERSTAND', label: 'Request understood', status: 'completed' },
  { stage: 'EXECUTE_READ', label: '正在检索商品', status: 'running' },
  { stage: 'SYNTHESIZE', label: 'Preparing recommendations', status: 'pending' },
  { stage: 'FAILED', label: 'Source needs attention', status: 'failed' },
] as const

describe('BerryTrail', () => {
  it('renders every event checkpoint as an ordered trail with a visible textual state', () => {
    const wrapper = mount(BerryTrail, { props: { trail } })

    const items = wrapper.findAll('ol[aria-label="Agent progress"] > li')
    expect(items).toHaveLength(4)
    expect(items.map((item) => item.text())).toEqual([
      expect.stringMatching(/Request understood.*Completed/),
      expect.stringMatching(/正在检索商品.*In progress/),
      expect.stringMatching(/Preparing recommendations.*Pending/),
      expect.stringMatching(/Source needs attention.*Needs attention/),
    ])
    expect(wrapper.text()).not.toMatch(/chain.of.thought|private reasoning|internal reasoning/i)
  })

  it('marks only the running checkpoint as the current step', () => {
    const wrapper = mount(BerryTrail, { props: { trail } })

    expect(wrapper.findAll('[aria-current="step"]')).toHaveLength(1)
    expect(wrapper.get('[aria-current="step"]').text()).toContain('正在检索商品')
    expect(wrapper.findAll('[aria-current]')).toHaveLength(1)
  })

  it('keeps status meaning available without color and retains it with reduced motion', () => {
    const wrapper = mount(BerryTrail, { props: { trail } })
    const componentSource = wrapper.html()

    expect(componentSource).toContain('Completed')
    expect(componentSource).toContain('In progress')
    expect(componentSource).toContain('Pending')
    expect(componentSource).toContain('Needs attention')
    expect(berryTrailSource).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.berry-trail__seed \{\s*transition-duration: 0\.01ms;\s*\}\s*\}/,
    )
  })

  it('uses the shared agent motion token for seed status changes', () => {
    expect(berryTrailSource).toContain(
      'transition: transform var(--agent-motion), opacity var(--agent-motion);',
    )
  })
})
