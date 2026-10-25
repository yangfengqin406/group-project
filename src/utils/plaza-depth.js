// Rank actors by their exact foot position. Rounding each coordinate separately
// creates ties that can repeatedly reverse occlusion while actors pass each other.
export function plazaActorDepths(people) {
  return Object.fromEntries(
    [...people]
      .sort((a, b) => a.position.y - b.position.y || a.id.localeCompare(b.id))
      .map((person, index) => [person.id, 100 + index])
  )
}
