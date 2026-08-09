import type { AgentEvent } from '../types'

const messageId = 'mock-coffee-message-1'

export const quietDormitoryCoffeeScenario: readonly AgentEvent[] = [
  { id: 1, type: 'message.started', messageId, role: 'assistant' },
  { id: 2, type: 'trail.updated', stage: 'UNDERSTAND', label: '理解使用需求', status: 'running' },
  {
    id: 3,
    type: 'message.delta',
    messageId,
    delta: '我会按500元预算、宿舍使用、不要胶囊机和安静优先来挑选咖啡器具。',
  },
  { id: 4, type: 'trail.updated', stage: 'UNDERSTAND', label: '理解使用需求', status: 'completed' },
  { id: 5, type: 'trail.updated', stage: 'EXECUTE_READ', label: '检索安静的非胶囊方案', status: 'running' },
  { id: 6, type: 'trail.updated', stage: 'EXECUTE_READ', label: '检索安静的非胶囊方案', status: 'completed' },
  { id: 7, type: 'trail.updated', stage: 'SYNTHESIZE', label: '比较预算内方案', status: 'running' },
  {
    id: 8,
    type: 'recommendations.ready',
    groups: [
      {
        id: 'quiet-dorm-coffee-kit',
        title: '安静宿舍手冲方案',
        recommendations: [
          {
            productId: 'mock-dripper-01',
            skuId: 'mock-dripper-01-clear',
            name: 'V60 手冲滤杯套装',
            price: 129,
            inventory: 12,
            attrsText: '透明 01 号，含分享壶',
            evidence: ['手冲过程不需要电机，适合希望减少宿舍噪音的场景。', '价格远低于500元预算，可预留预算购买咖啡豆。'],
            constraints: ['需要手动注水和控制萃取时间。', '需另购滤纸与咖啡豆。'],
            uncertainty: '未包含热水来源，宿舍热水设备规定可能影响使用。',
          },
          {
            productId: 'mock-scale-01',
            skuId: 'mock-scale-01-black',
            name: '静音计时咖啡秤',
            price: 89,
            inventory: 20,
            attrsText: '黑色，计时版',
            evidence: ['计时和称重有助于稳定手冲比例。', '无研磨电机，使用时基本没有机械噪音。'],
            constraints: ['不能替代磨豆机或热水设备。', '需要定期充电。'],
            uncertainty: '实际续航会随计时频率和充电习惯变化。',
          },
        ],
      },
    ],
  },
  { id: 9, type: 'trail.updated', stage: 'SYNTHESIZE', label: '比较预算内方案', status: 'completed' },
  { id: 10, type: 'trail.updated', stage: 'WAIT_CONFIRMATION', label: '等待确认推荐', status: 'running' },
  {
    id: 11,
    type: 'confirmation.requested',
    confirmation: {
      id: 'mock-confirmation-coffee-kit-1',
      operation: 'add_to_cart',
      productId: 'mock-dripper-01',
      skuId: 'mock-dripper-01-clear',
      productName: 'V60 手冲滤杯套装',
      attrsText: '透明 01 号，含分享壶',
      quantity: 1,
      unitPrice: 129,
      totalPrice: 129,
      payloadHash: 'mock-coffee-payload-1',
      idempotencyKey: 'mock-coffee-operation-1',
    },
  },
  { id: 12, type: 'message.completed', messageId },
  { id: 13, type: 'stream.completed' },
]
