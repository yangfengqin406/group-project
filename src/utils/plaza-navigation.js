import { PLAZA_ROAD } from './plaza-motion.js'

export const PLAZA_HOUSES = [
  {
    id: 'partner',
    name: '找搭子',
    x: 0.28,
    y: 0.29,
    door: { x: 0.286, y: 0.405 },
    url: '/pages/partner/index'
  },
  {
    id: 'lost',
    name: '失物招领',
    x: 0.747,
    y: 0.245,
    door: { x: 0.739, y: 0.352 },
    url: '/pages/lost/index'
  },
  {
    id: 'market',
    name: '二手集市',
    x: 0.25,
    y: 0.62,
    door: { x: 0.25, y: 0.735 },
    url: '/pages/market/index'
  },
  {
    id: 'home',
    name: '自己的家',
    x: 0.805,
    y: 0.61,
    door: { x: 0.788, y: 0.72 },
    url: '/pages/home/index',
    tab: true
  }
]
export const houses = PLAZA_HOUSES
export const PLAZA_AREAS = [
  {
    id: 'pond',
    kind: 'area',
    name: '池边钓鱼',
    x: 0.215,
    y: 0.805,
    door: { x: 0.215, y: 0.86 }
  },
  {
    id: 'pavilion',
    kind: 'area',
    name: '歇脚亭',
    x: 0.49,
    y: 0.225,
    door: { x: 0.49, y: 0.31 }
  }
]
const destinations = [...PLAZA_HOUSES, ...PLAZA_AREAS]

const aspect = 801 / 1280
const epsilon = 0.000001
const distance = (a, b) => Math.hypot(a.x - b.x, (a.y - b.y) * aspect)
const copy = (point) => ({ x: point.x, y: point.y })
const nodes = PLAZA_ROAD.map(copy)
const edges = PLAZA_ROAD.map((_, index) => [
  index,
  (index + 1) % PLAZA_ROAD.length
])

// 门口只通过建筑外的步道和台阶接入；西南集市从屋前绕行，避免穿过屋顶。
const branches = {
  partner: { anchor: 8, points: [{ x: 0.32, y: 0.43 }] },
  lost: { anchor: 2, points: [{ x: 0.71, y: 0.39 }] },
  market: {
    anchor: 5,
    points: [
      { x: 0.4, y: 0.74 },
      { x: 0.34, y: 0.78 },
      { x: 0.25, y: 0.77 }
    ]
  },
  home: {
    anchor: 3,
    points: [
      { x: 0.67, y: 0.65 },
      { x: 0.7, y: 0.71 },
      { x: 0.74, y: 0.74 }
    ]
  }
}
for (const house of PLAZA_HOUSES) {
  const branch = branches[house.id]
  let previous = branch.anchor
  for (const point of [...branch.points, house.door]) {
    const next = nodes.push(copy(point)) - 1
    edges.push([previous, next])
    previous = next
  }
}
const areaBranches = {
  pond: {
    anchor: nodes.findIndex((point) => point.x === 0.34 && point.y === 0.78),
    points: [
      { x: 0.29, y: 0.815 },
      { x: 0.25, y: 0.837 }
    ]
  },
  pavilion: { anchor: 0, points: [{ x: 0.455, y: 0.325 }] }
}
for (const area of PLAZA_AREAS) {
  const branch = areaBranches[area.id]
  let previous = branch.anchor
  for (const point of [...branch.points, area.door]) {
    const next = nodes.push(copy(point)) - 1
    edges.push([previous, next])
    previous = next
  }
}

function project(point) {
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y))
    throw new TypeError('场景坐标必须是有效数字')
  let nearest = null
  edges.forEach(([from, to], edge) => {
    const start = nodes[from],
      end = nodes[to]
    const dx = end.x - start.x,
      dy = (end.y - start.y) * aspect
    const fraction = Math.max(
      0,
      Math.min(
        1,
        ((point.x - start.x) * dx + (point.y - start.y) * aspect * dy) /
          (dx * dx + dy * dy)
      )
    )
    const position = {
      x: start.x + (end.x - start.x) * fraction,
      y: start.y + (end.y - start.y) * fraction
    }
    const gap = distance(point, position)
    if (!nearest || gap < nearest.gap) nearest = { edge, position, gap }
  })
  return nearest
}

function shortestRoute(start, target) {
  const startProjection = project(start),
    targetProjection = project(target)
  const points = [...nodes, copy(start), copy(targetProjection.position)]
  const startId = nodes.length,
    targetId = startId + 1
  const neighbours = points.map(() => [])
  function connect(from, to) {
    const length = distance(points[from], points[to])
    neighbours[from].push({ to, length })
    neighbours[to].push({ to: from, length })
  }
  edges.forEach(([from, to]) => connect(from, to))
  edges[startProjection.edge].forEach((id) => connect(startId, id))
  edges[targetProjection.edge].forEach((id) => connect(targetId, id))
  if (startProjection.edge === targetProjection.edge) connect(startId, targetId)
  const costs = points.map(() => Infinity),
    previous = [],
    visited = new Set()
  costs[startId] = 0
  while (visited.size < points.length) {
    let current = -1
    for (let id = 0; id < points.length; id++)
      if (!visited.has(id) && (current < 0 || costs[id] < costs[current]))
        current = id
    if (current < 0 || !Number.isFinite(costs[current]) || current === targetId)
      break
    visited.add(current)
    for (const neighbour of neighbours[current]) {
      const cost = costs[current] + neighbour.length
      if (cost < costs[neighbour.to]) {
        costs[neighbour.to] = cost
        previous[neighbour.to] = current
      }
    }
  }
  const route = []
  for (let id = targetId; id !== startId; id = previous[id])
    route.unshift(copy(points[id]))
  let last = start
  return route.filter((point) => {
    if (distance(last, point) < epsilon) return false
    last = point
    return true
  })
}

export function createPlazaNavigator({
  position = PLAZA_ROAD[5],
  speed = 0.16
} = {}) {
  if (!Number.isFinite(speed) || speed <= 0)
    throw new TypeError('移动速度必须大于零')
  let current = copy(project(position).position)
  let route = [],
    target = null,
    pendingEntry = null,
    arrivedEntry = null
  let facing = 1,
    view = 'front'
  const getState = () => ({
    position: copy(current),
    target: route.length ? copy(target) : null,
    moving: route.length > 0,
    facing,
    view,
    entering: pendingEntry?.id || null
  })
  const complete = () => {
    if (!route.length && pendingEntry) arrivedEntry = pendingEntry
  }
  function setTarget(point, entry) {
    const nextRoute = shortestRoute(current, point)
    route = nextRoute
    target = copy(point)
    pendingEntry = entry
    arrivedEntry = null
    complete()
    return getState()
  }
  return {
    getState,
    moveTo(point) {
      const goal = project(point).position
      const entry =
        destinations.find((item) => distance(item.door, goal) < epsilon) || null
      return setTarget(goal, entry)
    },
    enterHouse(id) {
      const house = PLAZA_HOUSES.find((item) => item.id === id)
      if (!house) throw new RangeError('找不到这栋房子')
      return setTarget(house.door, house)
    },
    enterArea(id) {
      const area = PLAZA_AREAS.find((item) => item.id === id)
      if (!area) throw new RangeError('找不到这个广场地点')
      return setTarget(area.door, area)
    },
    advance(seconds) {
      if (!Number.isFinite(seconds) || seconds <= 0) return getState()
      let remaining = speed * seconds
      while (route.length && remaining > 0) {
        const next = route[0],
          length = distance(current, next)
        if (length < epsilon) {
          current = route.shift()
          continue
        }
        const step = Math.min(length, remaining)
        const fraction = step / length
        const dx = next.x - current.x,
          dy = next.y - current.y
        if (Math.abs(dx) > epsilon) facing = dx > 0 ? 1 : -1
        view = dy < -epsilon ? 'back' : 'front'
        current = { x: current.x + dx * fraction, y: current.y + dy * fraction }
        remaining -= step
        if (step >= length) current = route.shift()
      }
      complete()
      return getState()
    },
    consumeEntry() {
      const entry = arrivedEntry
      arrivedEntry = null
      if (entry) pendingEntry = null
      return entry
    },
    cancelEntry() {
      route = []
      target = null
      pendingEntry = null
      arrivedEntry = null
      return getState()
    }
  }
}
