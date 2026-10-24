const sheets = {
  mushroom: {
    source: '/static/pets/mushroom-atlas.webp',
    features: ['round-cap', 'wide-cap']
  },
  capybara: {
    source: '/static/pets/capybara-atlas.webp',
    features: ['round', 'perky']
  },
  rabbit: {
    source: '/static/pets/rabbit-atlas.webp',
    features: ['floppy', 'upright', 'short']
  },
  squirrel: {
    source: '/static/pets/squirrel-atlas.webp',
    features: ['pointed', 'round']
  }
}

export const ILLUSTRATION_FRAME = Object.freeze({ width: 144, height: 176 })

// 图集第一行正面、第二行背面；列顺序与 featuresFor 一致。
export function petIllustration(species, feature, view = 'front') {
  const sheet = Object.prototype.hasOwnProperty.call(sheets, species)
    ? sheets[species]
    : null
  if (!sheet) return null
  const column = sheet.features.indexOf(feature)
  if (column < 0) return null
  return {
    source: sheet.source,
    columns: sheet.features.length,
    rows: 2,
    column,
    row: view === 'back' ? 1 : 0
  }
}

// 仅作用于精灵图层，衣柜和装饰层保留自己的原色。
export function petIllustrationFilter(palette) {
  const filters = {
    cream: 'none',
    sage: 'sepia(0.55) hue-rotate(38deg) saturate(0.7)',
    apricot: 'sepia(0.25) saturate(1.4) hue-rotate(-12deg)',
    lilac: 'grayscale(0.45) sepia(0.3) hue-rotate(235deg) saturate(0.7)'
  }
  return Object.prototype.hasOwnProperty.call(filters, palette)
    ? filters[palette]
    : 'none'
}
