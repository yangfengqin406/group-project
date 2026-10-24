// 专属衣身来自各物种正背试穿原稿，坐标始终注册在144×176原画帧。
// 衣身替换裸躯干；目录、服务与存档不依赖本显示元数据。
const registrations = {
  rabbit: {
    front: {
      'sailor-shirt': {
        source: '/static/pets/tailored/rabbit-sailor-shirt-front.webp',
        bounds: {
          x: 15.5,
          y: 113.4,
          width: 87,
          height: 47.7
        },
        paws: [
          {
            x: 38.3,
            y: 131.7,
            width: 15.9,
            height: 13.5
          },
          {
            x: 68.6,
            y: 131.7,
            width: 15.9,
            height: 13.5
          }
        ],
        furParts: [
          {
            x: 38.3,
            y: 131.7,
            width: 15.9,
            height: 13.5
          },
          {
            x: 68.6,
            y: 131.7,
            width: 15.9,
            height: 13.5
          }
        ]
      },
      'moss-cape': {
        source: '/static/pets/tailored/rabbit-moss-cape-front.webp',
        bounds: {
          x: 8.25,
          y: 113.52,
          width: 101.5,
          height: 49.01
        },
        paws: [
          {
            x: 36.67,
            y: 129.76,
            width: 17.11,
            height: 12.76
          },
          {
            x: 66.54,
            y: 129.47,
            width: 16.53,
            height: 13.05
          }
        ],
        furParts: [
          {
            x: 36.67,
            y: 129.76,
            width: 17.11,
            height: 12.76
          },
          {
            x: 66.54,
            y: 129.47,
            width: 16.53,
            height: 13.05
          }
        ]
      },
      'coral-dress': {
        source: '/static/pets/tailored/rabbit-coral-dress-front.webp',
        bounds: {
          x: 9.12,
          y: 113.52,
          width: 102.95,
          height: 51.33
        },
        paws: [
          {
            x: 34.93,
            y: 126.86,
            width: 18.27,
            height: 15.37
          },
          {
            x: 66.54,
            y: 127.15,
            width: 17.69,
            height: 15.08
          }
        ],
        furParts: [
          {
            x: 34.93,
            y: 126.86,
            width: 18.27,
            height: 15.37
          },
          {
            x: 66.54,
            y: 127.15,
            width: 17.69,
            height: 15.08
          }
        ]
      }
    },
    back: {
      'sailor-shirt': {
        source: '/static/pets/tailored/rabbit-sailor-shirt-back.webp',
        bounds: {
          x: 18.5,
          y: 113.14,
          width: 81,
          height: 48.87
        },
        paws: [],
        furParts: [
          {
            x: 48.74,
            y: 142.3,
            width: 22.14,
            height: 19.44
          }
        ]
      },
      'moss-cape': {
        source: '/static/pets/tailored/rabbit-moss-cape-back.webp',
        bounds: {
          x: 11.21,
          y: 113.95,
          width: 95.85,
          height: 51.3
        },
        paws: [],
        furParts: [
          {
            x: 49.01,
            y: 146.08,
            width: 18.9,
            height: 18.09
          }
        ]
      },
      'coral-dress': {
        source: '/static/pets/tailored/rabbit-coral-dress-back.webp',
        bounds: {
          x: 13.64,
          y: 113.14,
          width: 95.85,
          height: 51.84
        },
        paws: [],
        furParts: [
          {
            x: 49.82,
            y: 142.57,
            width: 20.25,
            height: 18.09
          }
        ]
      }
    }
  },
  capybara: {
    front: {
      'sailor-shirt': {
        source: '/static/pets/tailored/capybara-sailor-shirt-front.webp',
        bounds: {
          x: 13,
          y: 95.07,
          width: 116,
          height: 65.54
        },
        paws: [
          {
            x: 39.68,
            y: 113.34,
            width: 20.3,
            height: 18.56
          },
          {
            x: 82.89,
            y: 113.34,
            width: 20.3,
            height: 18.56
          }
        ],
        furParts: [
          {
            x: 39.68,
            y: 113.34,
            width: 20.3,
            height: 18.56
          },
          {
            x: 82.89,
            y: 113.34,
            width: 20.3,
            height: 18.56
          }
        ]
      },
      'moss-cape': {
        source: '/static/pets/tailored/capybara-moss-cape-front.webp',
        bounds: {
          x: 9.44,
          y: 94.6,
          width: 123.12,
          height: 62.1
        },
        paws: [
          {
            x: 44.54,
            y: 112.69,
            width: 17.82,
            height: 16.47
          },
          {
            x: 83.42,
            y: 113.23,
            width: 17.28,
            height: 16.47
          }
        ],
        furParts: [
          {
            x: 44.54,
            y: 112.69,
            width: 17.82,
            height: 16.47
          },
          {
            x: 83.42,
            y: 113.23,
            width: 17.28,
            height: 16.47
          }
        ]
      },
      'coral-dress': {
        source: '/static/pets/tailored/capybara-coral-dress-front.webp',
        bounds: {
          x: 8.56,
          y: 94.4,
          width: 125.16,
          height: 64.68
        },
        paws: [
          {
            x: 36.28,
            y: 114,
            width: 19.04,
            height: 15.4
          },
          {
            x: 89.48,
            y: 114.28,
            width: 19.32,
            height: 15.96
          }
        ],
        furParts: [
          {
            x: 36.28,
            y: 114,
            width: 19.04,
            height: 15.4
          },
          {
            x: 89.48,
            y: 114.28,
            width: 19.32,
            height: 15.96
          }
        ]
      }
    },
    back: {
      'sailor-shirt': {
        source: '/static/pets/tailored/capybara-sailor-shirt-back.webp',
        bounds: {
          x: 19.48,
          y: 96.88,
          width: 104,
          height: 65.52
        },
        paws: [],
        furParts: []
      },
      'moss-cape': {
        source: '/static/pets/tailored/capybara-moss-cape-back.webp',
        bounds: {
          x: 13,
          y: 97,
          width: 118.5,
          height: 64.5
        },
        paws: [],
        furParts: []
      },
      'coral-dress': {
        source: '/static/pets/tailored/capybara-coral-dress-back.webp',
        bounds: {
          x: 12.98,
          y: 96.1,
          width: 118.3,
          height: 67.08
        },
        paws: [],
        furParts: []
      }
    }
  },
  mushroom: {
    front: {
      'sailor-shirt': {
        source: '/static/pets/tailored/mushroom-sailor-shirt-front.webp',
        bounds: {
          x: 34.52,
          y: 124.88,
          width: 60.96,
          height: 32.16
        },
        paws: [
          {
            x: 48.44,
            y: 133.04,
            width: 11.52,
            height: 10.32
          },
          {
            x: 70.76,
            y: 133.04,
            width: 12,
            height: 10.32
          }
        ],
        furParts: [
          {
            x: 48.44,
            y: 133.04,
            width: 11.52,
            height: 10.32
          },
          {
            x: 70.76,
            y: 133.04,
            width: 12,
            height: 10.32
          }
        ]
      },
      'moss-cape': {
        source: '/static/pets/tailored/mushroom-moss-cape-front.webp',
        bounds: {
          x: 26.75,
          y: 124.75,
          width: 75.75,
          height: 33.5
        },
        paws: [
          {
            x: 46.75,
            y: 133.25,
            width: 12.25,
            height: 11
          },
          {
            x: 71.5,
            y: 133,
            width: 12.25,
            height: 11
          }
        ],
        furParts: [
          {
            x: 46.75,
            y: 133.25,
            width: 12.25,
            height: 11
          },
          {
            x: 71.5,
            y: 133,
            width: 12.25,
            height: 11
          }
        ]
      },
      'coral-dress': {
        source: '/static/pets/tailored/mushroom-coral-dress-front.webp',
        bounds: {
          x: 28.25,
          y: 125,
          width: 74.5,
          height: 34.75
        },
        paws: [
          {
            x: 45.5,
            y: 131.75,
            width: 15,
            height: 12.25
          },
          {
            x: 69.75,
            y: 131.75,
            width: 14.5,
            height: 12.25
          }
        ],
        furParts: [
          {
            x: 45.5,
            y: 131.75,
            width: 15,
            height: 12.25
          },
          {
            x: 69.75,
            y: 131.75,
            width: 14.5,
            height: 12.25
          }
        ]
      }
    },
    back: {
      'sailor-shirt': {
        source: '/static/pets/tailored/mushroom-sailor-shirt-back.webp',
        bounds: {
          x: 34.28,
          y: 122.36,
          width: 62.4,
          height: 36.72
        },
        paws: [],
        furParts: []
      },
      'moss-cape': {
        source: '/static/pets/tailored/mushroom-moss-cape-back.webp',
        bounds: {
          x: 27.8,
          y: 122.36,
          width: 74.16,
          height: 37.44
        },
        paws: [],
        furParts: []
      },
      'coral-dress': {
        source: '/static/pets/tailored/mushroom-coral-dress-back.webp',
        bounds: {
          x: 27.56,
          y: 122.36,
          width: 76.56,
          height: 39.36
        },
        paws: [],
        furParts: []
      }
    }
  },
  squirrel: {
    front: {
      'sailor-shirt': {
        source: '/static/pets/tailored/squirrel-sailor-shirt-front.webp',
        bounds: {
          x: 57.96,
          y: 111.68,
          width: 79.92,
          height: 45.9
        },
        paws: [
          {
            x: 75.51,
            y: 122.75,
            width: 14.85,
            height: 13.23
          },
          {
            x: 114.12,
            y: 122.75,
            width: 14.04,
            height: 13.23
          }
        ],
        furParts: [
          {
            x: 75.51,
            y: 122.75,
            width: 14.85,
            height: 13.23
          },
          {
            x: 114.12,
            y: 122.75,
            width: 14.04,
            height: 13.23
          }
        ]
      },
      'moss-cape': {
        source: '/static/pets/tailored/squirrel-moss-cape-front.webp',
        bounds: {
          x: 57.66,
          y: 110.54,
          width: 79.82,
          height: 46.54
        },
        paws: [
          {
            x: 76.12,
            y: 122.76,
            width: 15.6,
            height: 13
          },
          {
            x: 107.84,
            y: 122.76,
            width: 15.34,
            height: 13.26
          }
        ],
        furParts: [
          {
            x: 76.12,
            y: 122.76,
            width: 15.6,
            height: 13
          },
          {
            x: 107.84,
            y: 122.76,
            width: 15.34,
            height: 13.26
          }
        ]
      },
      'coral-dress': {
        source: '/static/pets/tailored/squirrel-coral-dress-front.webp',
        bounds: {
          x: 56.61,
          y: 111.68,
          width: 82.35,
          height: 47.79
        },
        paws: [
          {
            x: 74.16,
            y: 122.75,
            width: 15.12,
            height: 13.77
          },
          {
            x: 109.53,
            y: 122.75,
            width: 15.12,
            height: 13.77
          }
        ],
        furParts: [
          {
            x: 74.16,
            y: 122.75,
            width: 15.12,
            height: 13.77
          },
          {
            x: 109.53,
            y: 122.75,
            width: 15.12,
            height: 13.77
          }
        ]
      }
    },
    back: {
      'sailor-shirt': {
        source: '/static/pets/tailored/squirrel-sailor-shirt-back.webp',
        bounds: {
          x: 67.25,
          y: 109.5,
          width: 67,
          height: 48.75
        },
        paws: [],
        furParts: []
      },
      'moss-cape': {
        source: '/static/pets/tailored/squirrel-moss-cape-back.webp',
        bounds: {
          x: 59.75,
          y: 109.5,
          width: 77.5,
          height: 49
        },
        paws: [],
        furParts: []
      },
      'coral-dress': {
        source: '/static/pets/tailored/squirrel-coral-dress-back.webp',
        bounds: {
          x: 59.25,
          y: 109.5,
          width: 78.5,
          height: 49
        },
        paws: [],
        furParts: []
      }
    }
  }
}
const features = {
  rabbit: ['floppy', 'upright', 'short'],
  capybara: ['round', 'perky'],
  mushroom: ['round-cap', 'wide-cap'],
  squirrel: ['pointed', 'round']
}
const feet = {
  rabbit: {
    front: [
      {
        x: 25,
        y: 157,
        width: 24,
        height: 14,
        radius: '50%'
      },
      {
        x: 66,
        y: 157,
        width: 25,
        height: 14,
        radius: '50%'
      }
    ],
    back: [
      {
        x: 24,
        y: 157,
        width: 24,
        height: 14,
        radius: '50%'
      },
      {
        x: 65,
        y: 157,
        width: 25,
        height: 14,
        radius: '50%'
      }
    ]
  },
  capybara: {
    front: [
      {
        x: 28,
        y: 157,
        width: 29,
        height: 14,
        radius: '50%'
      },
      {
        x: 85,
        y: 157,
        width: 29,
        height: 14,
        radius: '50%'
      }
    ],
    back: [
      {
        x: 29,
        y: 158,
        width: 29,
        height: 13,
        radius: '50%'
      },
      {
        x: 87,
        y: 158,
        width: 29,
        height: 13,
        radius: '50%'
      }
    ]
  },
  mushroom: {
    front: [
      {
        x: 39,
        y: 157,
        width: 21,
        height: 14,
        radius: '50%'
      },
      {
        x: 71,
        y: 157,
        width: 20,
        height: 14,
        radius: '50%'
      }
    ],
    back: [
      {
        x: 42,
        y: 158,
        width: 19,
        height: 13,
        radius: '50%'
      },
      {
        x: 72,
        y: 158,
        width: 18,
        height: 13,
        radius: '50%'
      }
    ]
  },
  squirrel: {
    front: [
      {
        x: 60,
        y: 158,
        width: 25,
        height: 13,
        radius: '50%'
      },
      {
        x: 104,
        y: 158,
        width: 26,
        height: 13,
        radius: '50%'
      }
    ],
    back: [
      {
        x: 62,
        y: 158,
        width: 25,
        height: 13,
        radius: '50%'
      },
      {
        x: 105,
        y: 158,
        width: 25,
        height: 13,
        radius: '50%'
      }
    ]
  }
}
const joints = {
  rabbit: [
    [32, 150, 13, 16],
    [74, 150, 13, 16]
  ],
  capybara: [
    [36, 149, 15, 18],
    [93, 149, 15, 18]
  ],
  mushroom: [
    [44, 149, 11, 17],
    [75, 149, 11, 17]
  ],
  squirrel: [
    [67, 151, 14, 16],
    [111, 151, 14, 16],
    [63, 137, 24, 29]
  ]
}
const move = (rect, dx) => ({ ...rect, x: rect.x + dx })

export function tailoredOutfit(species, feature, outfit, view = 'front') {
  if (!Object.prototype.hasOwnProperty.call(registrations, species)) return null
  const column = features[species].indexOf(feature)
  if (column < 0) return null
  const side = view === 'back' ? 'back' : 'front'
  const record = Object.prototype.hasOwnProperty.call(
    registrations[species][side],
    outfit
  )
    ? registrations[species][side][outfit]
    : null
  if (!record) return null
  const dx =
    species === 'rabbit' && feature !== 'floppy'
      ? 12
      : species === 'mushroom' && feature === 'wide-cap'
        ? 4
        : 0
  const frame = (source) => ({
    source,
    columns: features[species].length,
    rows: 2,
    column,
    row: side === 'back' ? 1 : 0
  })
  return {
    source: record.source,
    furSource:
      species === 'squirrel' && outfit === 'moss-cape' && side === 'front'
        ? '/static/pets/tailored/squirrel-moss-cape-front-fur.webp'
        : null,
    bounds: move(record.bounds, dx),
    headArt: frame(`/static/pets/tailored/${species}-heads.webp`),
    tailArt:
      species === 'squirrel'
        ? frame('/static/pets/tailored/squirrel-tails.webp')
        : null,
    headParts: [],
    tailParts: [],
    feetParts: feet[species][side].map((rect) => move(rect, dx)),
    jointParts: joints[species].map(([x, y, width, height]) =>
      move({ x, y, width, height, radius: '50%' }, dx)
    ),
    paws: record.paws.map((rect) => move(rect, dx)),
    furParts: record.furParts.map((rect) => move(rect, dx))
  }
}
