// Session-only guidance: no account data or business draft is persisted here.
let welcomeDismissed = false

export const isPlazaWelcomeDismissed = () => welcomeDismissed
export function dismissPlazaWelcome() {
  welcomeDismissed = true
}
