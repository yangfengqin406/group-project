// App's InnerAudioContext exposes obeyMuteSwitch as a getter-only property.
// H5 and mini-program contexts can expose a writable setting instead.
export function respectMuteSwitch(audio) {
  const property = Object.getOwnPropertyDescriptor(audio, 'obeyMuteSwitch')
  if (!property || property.set || property.writable) audio.obeyMuteSwitch = true
}
