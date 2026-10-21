// Fictional scene neighbors; these are not public users or message contacts.
export const PLAZA_NEIGHBORS = {
  capybara: {
    name: '栗团',
    hello: '新邻居，欢迎来小镇散步。',
    tip: '想找一起吃饭、运动的伙伴？紫色屋顶的小屋里可以发布计划，也能看看时间合适的搭子。',
    destination: 'partner',
    action: '去找搭子小屋'
  },
  squirrel: {
    name: '铃果',
    hello: '嗨！今天也有小小的好事等着你。',
    tip: '闲置的书和小物可以带到二手集市。看到喜欢的物品，从详情里联系，私信里还能回到原来的发布。',
    destination: 'market',
    action: '去二手集市'
  },
  mushroom: {
    name: '森芽',
    hello: '你好呀，走累了就歇一歇。',
    tip: '丢了东西别着急，橙色屋顶是失物招领。公告栏旁的小狗也很乐意介绍这里；池边还有钓鱼和潜水。',
    destination: 'lost',
    action: '去失物招领'
  }
}

export function createNeighborGreetings({ radius = 0.05, cooldown = 60000, interval = 16000 } = {}) {
  const greetedAt = new Map()
  let lastGreeting = -Infinity
  return {
    encounter(position, neighbors, now) {
      if (!position || now - lastGreeting < interval) return null
      const nearby = neighbors
        .filter((neighbor) => PLAZA_NEIGHBORS[neighbor.id])
        .map((neighbor) => ({
          id: neighbor.id,
          distance: Math.hypot(position.x - neighbor.position.x, (position.y - neighbor.position.y) * 801 / 1280)
        }))
        .filter(({ id, distance }) => distance <= radius && now - (greetedAt.get(id) ?? -Infinity) >= cooldown)
        .sort((a, b) => a.distance - b.distance)
      if (!nearby.length) return null
      const id = nearby[0].id
      greetedAt.set(id, now)
      lastGreeting = now
      return id
    },
    acknowledge(id, now) {
      greetedAt.set(id, now)
      lastGreeting = now
    }
  }
}
