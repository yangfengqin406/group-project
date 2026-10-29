const samePoint = (a, b) => a === b || Boolean(a && b && a.x === b.x && a.y === b.y)

export function sameWalkerState(a, b) {
  return Boolean(a && b && samePoint(a.position, b.position) && samePoint(a.target, b.target) &&
    a.moving === b.moving && a.facing === b.facing && a.view === b.view && a.entering === b.entering)
}

export function cameraFrame(current, target, immediate = false) {
  if (samePoint(current, target)) return current
  if (immediate) return target
  let next = { x: current.x + (target.x - current.x) * 0.2, y: current.y + (target.y - current.y) * 0.2 }
  if (Math.abs(target.x - next.x) < 0.1 && Math.abs(target.y - next.y) < 0.1) next = target
  return samePoint(current, next) ? current : next
}
