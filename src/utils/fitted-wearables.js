import { petIllustration } from './pet-illustrations.js'

// 专属发丝和左右已穿鞋脚；坐标基于原画144×176帧，拥有物与奖励另由服务处理。
const registrations = {
  rabbit: {
    'rain-boots': {
      front: {
        parts: [
          {
            source: '/static/pets/fitted/rabbit-rain-boots-front-left.webp',
            bounds: {
              x: 23.5,
              y: 146.673,
              width: 27,
              height: 24.327
            }
          },
          {
            source: '/static/pets/fitted/rabbit-rain-boots-front-right.webp',
            bounds: {
              x: 64.5,
              y: 145.263,
              width: 28,
              height: 25.737
            }
          }
        ]
      },
      back: {
        parts: [
          {
            source: '/static/pets/fitted/rabbit-rain-boots-back-left.webp',
            bounds: {
              x: 22.5,
              y: 150.353,
              width: 27,
              height: 20.647
            }
          },
          {
            source: '/static/pets/fitted/rabbit-rain-boots-back-right.webp',
            bounds: {
              x: 63.5,
              y: 147.766,
              width: 28,
              height: 23.234
            }
          }
        ]
      }
    },
    'shell-shoes': {
      front: {
        parts: [
          {
            source: '/static/pets/fitted/rabbit-shell-shoes-front-left.webp',
            bounds: {
              x: 23.5,
              y: 149.108,
              width: 27,
              height: 21.892
            }
          },
          {
            source: '/static/pets/fitted/rabbit-shell-shoes-front-right.webp',
            bounds: {
              x: 64.5,
              y: 148.091,
              width: 28,
              height: 22.909
            }
          }
        ]
      },
      back: {
        parts: [
          {
            source: '/static/pets/fitted/rabbit-shell-shoes-back-left.webp',
            bounds: {
              x: 22.5,
              y: 151.855,
              width: 27,
              height: 19.145
            }
          },
          {
            source: '/static/pets/fitted/rabbit-shell-shoes-back-right.webp',
            bounds: {
              x: 63.5,
              y: 150.706,
              width: 28,
              height: 20.294
            }
          }
        ]
      }
    },
    'leaf-slippers': {
      front: {
        parts: [
          {
            source: '/static/pets/fitted/rabbit-leaf-slippers-front-left.webp',
            bounds: {
              x: 23.5,
              y: 148.909,
              width: 27,
              height: 22.091
            }
          },
          {
            source: '/static/pets/fitted/rabbit-leaf-slippers-front-right.webp',
            bounds: {
              x: 64.5,
              y: 147.407,
              width: 28,
              height: 23.593
            }
          }
        ]
      },
      back: {
        parts: [
          {
            source: '/static/pets/fitted/rabbit-leaf-slippers-back-left.webp',
            bounds: {
              x: 22.5,
              y: 152.1,
              width: 27,
              height: 18.9
            }
          },
          {
            source: '/static/pets/fitted/rabbit-leaf-slippers-back-right.webp',
            bounds: {
              x: 63.5,
              y: 149.314,
              width: 28,
              height: 21.686
            }
          }
        ]
      }
    },
    'acorn-bob': {
      front: {
        parts: [
          {
            source: '/static/pets/fitted/rabbit-acorn-bob-front.webp',
            bounds: {
              x: 9.5,
              y: 50.04,
              width: 92.07,
              height: 58.08
            }
          }
        ]
      },
      back: {
        parts: [
          {
            source: '/static/pets/fitted/rabbit-acorn-bob-back.webp',
            bounds: {
              x: 9.17,
              y: 51.03,
              width: 92.73,
              height: 65.34
            }
          }
        ]
      }
    },
    'cloud-bun': {
      front: {
        parts: [
          {
            source: '/static/pets/fitted/rabbit-cloud-bun-front.webp',
            bounds: {
              x: 9.995,
              y: 50.04,
              width: 112.86,
              height: 75.24
            }
          }
        ]
      },
      back: {
        parts: [
          {
            source: '/static/pets/fitted/rabbit-cloud-bun-back.webp',
            bounds: {
              x: 9.5,
              y: 51.03,
              width: 97.35,
              height: 70.29
            }
          }
        ]
      }
    },
    'sea-braid': {
      front: {
        parts: [
          {
            source: '/static/pets/fitted/rabbit-sea-braid-front.webp',
            bounds: {
              x: 10.325,
              y: 50.04,
              width: 95.37,
              height: 78.21
            }
          }
        ]
      },
      back: {
        parts: [
          {
            source: '/static/pets/fitted/rabbit-sea-braid-back.webp',
            bounds: {
              x: 12.14,
              y: 51.03,
              width: 90.09,
              height: 82.5
            }
          }
        ]
      }
    }
  },
  capybara: {
    'rain-boots': {
      front: {
        parts: [
          {
            source: '/static/pets/fitted/capybara-rain-boots-front-left.webp',
            bounds: {
              x: 26.5,
              y: 148.185,
              width: 32,
              height: 22.815
            }
          },
          {
            source: '/static/pets/fitted/capybara-rain-boots-front-right.webp',
            bounds: {
              x: 83.5,
              y: 146.843,
              width: 32,
              height: 24.157
            }
          }
        ]
      },
      back: {
        parts: [
          {
            source: '/static/pets/fitted/capybara-rain-boots-back-left.webp',
            bounds: {
              x: 26.5,
              y: 146.178,
              width: 32,
              height: 24.822
            }
          },
          {
            source: '/static/pets/fitted/capybara-rain-boots-back-right.webp',
            bounds: {
              x: 83.5,
              y: 144.172,
              width: 32,
              height: 26.828
            }
          }
        ]
      }
    },
    'shell-shoes': {
      front: {
        parts: [
          {
            source: '/static/pets/fitted/capybara-shell-shoes-front-left.webp',
            bounds: {
              x: 26.5,
              y: 149.286,
              width: 32,
              height: 21.714
            }
          },
          {
            source: '/static/pets/fitted/capybara-shell-shoes-front-right.webp',
            bounds: {
              x: 83.5,
              y: 149.286,
              width: 32,
              height: 21.714
            }
          }
        ]
      },
      back: {
        parts: [
          {
            source: '/static/pets/fitted/capybara-shell-shoes-back-left.webp',
            bounds: {
              x: 26.5,
              y: 147.857,
              width: 32,
              height: 23.143
            }
          },
          {
            source: '/static/pets/fitted/capybara-shell-shoes-back-right.webp',
            bounds: {
              x: 83.5,
              y: 148.062,
              width: 32,
              height: 22.938
            }
          }
        ]
      }
    },
    'leaf-slippers': {
      front: {
        parts: [
          {
            source: '/static/pets/fitted/capybara-leaf-slippers-front-left.webp',
            bounds: {
              x: 26.5,
              y: 149.852,
              width: 32,
              height: 21.148
            }
          },
          {
            source:
              '/static/pets/fitted/capybara-leaf-slippers-front-right.webp',
            bounds: {
              x: 83.5,
              y: 150.563,
              width: 32,
              height: 20.437
            }
          }
        ]
      },
      back: {
        parts: [
          {
            source: '/static/pets/fitted/capybara-leaf-slippers-back-left.webp',
            bounds: {
              x: 26.5,
              y: 148.299,
              width: 32,
              height: 22.701
            }
          },
          {
            source: '/static/pets/fitted/capybara-leaf-slippers-back-right.webp',
            bounds: {
              x: 83.5,
              y: 148.492,
              width: 32,
              height: 22.508
            }
          }
        ]
      }
    },
    'acorn-bob': {
      front: {
        parts: [
          {
            source: '/static/pets/fitted/capybara-acorn-bob-front.webp',
            bounds: {
              x: 24.695,
              y: 23.02,
              width: 91.665,
              height: 24.5
            }
          }
        ]
      },
      back: {
        parts: [
          {
            source: '/static/pets/fitted/capybara-acorn-bob-back.webp',
            bounds: {
              x: 24.065,
              y: 22.5,
              width: 87.885,
              height: 34.8
            }
          }
        ]
      }
    },
    'cloud-bun': {
      front: {
        parts: [
          {
            source: '/static/pets/fitted/capybara-cloud-bun-front.webp',
            bounds: {
              x: 25.388,
              y: 23.265,
              width: 105.84,
              height: 33.32
            }
          }
        ]
      },
      back: {
        parts: [
          {
            source: '/static/pets/fitted/capybara-cloud-bun-back.webp',
            bounds: {
              x: 23.593,
              y: 22.5,
              width: 102.06,
              height: 40.2
            }
          }
        ]
      }
    },
    'sea-braid': {
      front: {
        parts: [
          {
            source: '/static/pets/fitted/capybara-sea-braid-front.webp',
            bounds: {
              x: 20.443,
              y: 23.02,
              width: 98.91,
              height: 55.125
            }
          }
        ]
      },
      back: {
        parts: [
          {
            source: '/static/pets/fitted/capybara-sea-braid-back.webp',
            bounds: {
              x: 22.805,
              y: 22.5,
              width: 96.075,
              height: 57.3
            }
          }
        ]
      }
    }
  },
  mushroom: {
    'rain-boots': {
      front: {
        parts: [
          {
            source: '/static/pets/fitted/mushroom-rain-boots-front-left.webp',
            bounds: {
              x: 37.5,
              y: 150.75,
              width: 24,
              height: 20.25
            }
          },
          {
            source: '/static/pets/fitted/mushroom-rain-boots-front-right.webp',
            bounds: {
              x: 69.5,
              y: 150.275,
              width: 23,
              height: 20.725
            }
          }
        ]
      },
      back: {
        parts: [
          {
            source: '/static/pets/fitted/mushroom-rain-boots-back-left.webp',
            bounds: {
              x: 37.5,
              y: 150.537,
              width: 24,
              height: 20.463
            }
          },
          {
            source: '/static/pets/fitted/mushroom-rain-boots-back-right.webp',
            bounds: {
              x: 69.5,
              y: 149.586,
              width: 23,
              height: 21.414
            }
          }
        ]
      }
    },
    'shell-shoes': {
      front: {
        parts: [
          {
            source: '/static/pets/fitted/mushroom-shell-shoes-front-left.webp',
            bounds: {
              x: 37.5,
              y: 150.918,
              width: 24,
              height: 20.082
            }
          },
          {
            source: '/static/pets/fitted/mushroom-shell-shoes-front-right.webp',
            bounds: {
              x: 69.5,
              y: 151.147,
              width: 23,
              height: 19.853
            }
          }
        ]
      },
      back: {
        parts: [
          {
            source: '/static/pets/fitted/mushroom-shell-shoes-back-left.webp',
            bounds: {
              x: 37.5,
              y: 150.097,
              width: 24,
              height: 20.903
            }
          },
          {
            source: '/static/pets/fitted/mushroom-shell-shoes-back-right.webp',
            bounds: {
              x: 69.5,
              y: 150.067,
              width: 23,
              height: 20.933
            }
          }
        ]
      }
    },
    'leaf-slippers': {
      front: {
        parts: [
          {
            source: '/static/pets/fitted/mushroom-leaf-slippers-front-left.webp',
            bounds: {
              x: 37.5,
              y: 150.959,
              width: 24,
              height: 20.041
            }
          },
          {
            source:
              '/static/pets/fitted/mushroom-leaf-slippers-front-right.webp',
            bounds: {
              x: 69.5,
              y: 150.3,
              width: 23,
              height: 20.7
            }
          }
        ]
      },
      back: {
        parts: [
          {
            source: '/static/pets/fitted/mushroom-leaf-slippers-back-left.webp',
            bounds: {
              x: 37.5,
              y: 150.097,
              width: 24,
              height: 20.903
            }
          },
          {
            source: '/static/pets/fitted/mushroom-leaf-slippers-back-right.webp',
            bounds: {
              x: 69.5,
              y: 150.75,
              width: 23,
              height: 20.25
            }
          }
        ]
      }
    },
    'acorn-bob': {
      front: {
        parts: [
          {
            source: '/static/pets/fitted/mushroom-acorn-bob-front.webp',
            bounds: {
              x: 38.205,
              y: 99.9,
              width: 54.315,
              height: 22.22
            }
          }
        ]
      },
      back: {
        parts: [
          {
            source: '/static/pets/fitted/mushroom-acorn-bob-back.webp',
            bounds: {
              x: 43.815,
              y: 119,
              width: 45.9,
              height: 10.83
            }
          }
        ]
      }
    },
    'cloud-bun': {
      front: {
        parts: [
          {
            source: '/static/pets/fitted/mushroom-cloud-bun-front.webp',
            bounds: {
              x: 38.23,
              y: 99.9,
              width: 61.455,
              height: 30.8
            }
          }
        ]
      },
      back: {
        parts: [
          {
            source: '/static/pets/fitted/mushroom-cloud-bun-back.webp',
            bounds: {
              x: 43.942,
              y: 119,
              width: 45.645,
              height: 15.2
            }
          }
        ]
      }
    },
    'sea-braid': {
      front: {
        parts: [
          {
            source: '/static/pets/fitted/mushroom-sea-braid-front.webp',
            bounds: {
              x: 36.496,
              y: 99.9,
              width: 59.925,
              height: 34.54
            }
          }
        ]
      },
      back: {
        parts: [
          {
            source: '/static/pets/fitted/mushroom-sea-braid-back.webp',
            bounds: {
              x: 40.627,
              y: 119,
              width: 50.745,
              height: 20.33
            }
          }
        ]
      }
    }
  },
  squirrel: {
    'rain-boots': {
      front: {
        parts: [
          {
            source: '/static/pets/fitted/squirrel-rain-boots-front-left.webp',
            bounds: {
              x: 58.5,
              y: 149.857,
              width: 28,
              height: 21.143
            }
          },
          {
            source: '/static/pets/fitted/squirrel-rain-boots-front-right.webp',
            bounds: {
              x: 102.5,
              y: 149.773,
              width: 29,
              height: 21.227
            }
          }
        ]
      },
      back: {
        parts: [
          {
            source: '/static/pets/fitted/squirrel-rain-boots-back-left.webp',
            bounds: {
              x: 58.5,
              y: 150.84,
              width: 28,
              height: 20.16
            }
          },
          {
            source: '/static/pets/fitted/squirrel-rain-boots-back-right.webp',
            bounds: {
              x: 102.5,
              y: 148.304,
              width: 29,
              height: 22.696
            }
          }
        ]
      }
    },
    'shell-shoes': {
      front: {
        parts: [
          {
            source: '/static/pets/fitted/squirrel-shell-shoes-front-left.webp',
            bounds: {
              x: 58.5,
              y: 151.155,
              width: 28,
              height: 19.845
            }
          },
          {
            source: '/static/pets/fitted/squirrel-shell-shoes-front-right.webp',
            bounds: {
              x: 102.5,
              y: 149.474,
              width: 29,
              height: 21.526
            }
          }
        ]
      },
      back: {
        parts: [
          {
            source: '/static/pets/fitted/squirrel-shell-shoes-back-left.webp',
            bounds: {
              x: 58.5,
              y: 151.699,
              width: 28,
              height: 19.301
            }
          },
          {
            source: '/static/pets/fitted/squirrel-shell-shoes-back-right.webp',
            bounds: {
              x: 102.5,
              y: 148.62,
              width: 29,
              height: 22.38
            }
          }
        ]
      }
    },
    'leaf-slippers': {
      front: {
        parts: [
          {
            source: '/static/pets/fitted/squirrel-leaf-slippers-front-left.webp',
            bounds: {
              x: 58.5,
              y: 152.074,
              width: 28,
              height: 18.926
            }
          },
          {
            source:
              '/static/pets/fitted/squirrel-leaf-slippers-front-right.webp',
            bounds: {
              x: 102.5,
              y: 151.302,
              width: 29,
              height: 19.698
            }
          }
        ]
      },
      back: {
        parts: [
          {
            source: '/static/pets/fitted/squirrel-leaf-slippers-back-left.webp',
            bounds: {
              x: 58.5,
              y: 151.51,
              width: 28,
              height: 19.49
            }
          },
          {
            source: '/static/pets/fitted/squirrel-leaf-slippers-back-right.webp',
            bounds: {
              x: 102.5,
              y: 148.374,
              width: 29,
              height: 22.626
            }
          }
        ]
      }
    },
    'acorn-bob': {
      front: {
        parts: [
          {
            source: '/static/pets/fitted/squirrel-acorn-bob-front.webp',
            bounds: {
              x: 54.15,
              y: 61.075,
              width: 79.625,
              height: 44.525
            }
          }
        ]
      },
      back: {
        parts: [
          {
            source: '/static/pets/fitted/squirrel-acorn-bob-back.webp',
            bounds: {
              x: 69.425,
              y: 63.466,
              width: 64.35,
              height: 49.128
            }
          }
        ]
      }
    },
    'cloud-bun': {
      front: {
        parts: [
          {
            source: '/static/pets/fitted/squirrel-cloud-bun-front.webp',
            bounds: {
              x: 54.898,
              y: 61.075,
              width: 89.7,
              height: 56.55
            }
          }
        ]
      },
      back: {
        parts: [
          {
            source: '/static/pets/fitted/squirrel-cloud-bun-back.webp',
            bounds: {
              x: 69.588,
              y: 63.466,
              width: 73.775,
              height: 50.196
            }
          }
        ]
      }
    },
    'sea-braid': {
      front: {
        parts: [
          {
            source: '/static/pets/fitted/squirrel-sea-braid-front.webp',
            bounds: {
              x: 54.231,
              y: 61.075,
              width: 84.5,
              height: 65.325
            }
          }
        ]
      },
      back: {
        parts: [
          {
            source: '/static/pets/fitted/squirrel-sea-braid-back.webp',
            bounds: {
              x: 67.8,
              y: 63.466,
              width: 68.575,
              height: 57.405
            }
          }
        ]
      }
    }
  }
}

export function fittedWearable(species, feature, itemId, view = 'front') {
  if (
    !['front', 'back'].includes(view) ||
    !petIllustration(species, feature, view)
  )
    return null
  const speciesItems = Object.prototype.hasOwnProperty.call(
    registrations,
    species
  )
    ? registrations[species]
    : null
  if (
    !speciesItems ||
    !Object.prototype.hasOwnProperty.call(speciesItems, itemId)
  )
    return null
  const art = speciesItems[itemId][view]
  const dx =
    species === 'rabbit' && ['upright', 'short'].includes(feature)
      ? 12
      : species === 'mushroom' && feature === 'wide-cap'
        ? 4
        : 0
  return {
    parts: art.parts.map((part) => ({
      source: part.source,
      bounds: { ...part.bounds, x: part.bounds.x + dx }
    }))
  }
}

// 原画脚掌从各自小矩形移除，保留其余原图；原生裁窗避免复制整套图集。
export function originalFootWindows(species, feature, view = 'front') {
  const back = view === 'back'
  const entries = {
    rabbit: back ? [22, 50, 63, 92, 155] : [23, 51, 64, 93, 155],
    capybara: back ? [27, 60, 85, 118, 156] : [26, 59, 83, 116, 155],
    mushroom: back ? [40, 63, 70, 92, 156] : [37, 62, 69, 93, 155],
    squirrel: back ? [60, 89, 103, 132, 156] : [58, 87, 102, 132, 156]
  }
  if (!Object.prototype.hasOwnProperty.call(entries, species))
    return [{ x: 0, y: 0, width: 144, height: 176 }]
  const dx =
    species === 'rabbit' && ['upright', 'short'].includes(feature)
      ? 12
      : species === 'mushroom' && feature === 'wide-cap'
        ? 4
        : 0
  const [left, leftEnd, right, rightEnd, top] = entries[species]
  return [
    { x: 0, y: 0, width: 144, height: top },
    { x: 0, y: top, width: left + dx, height: 176 - top },
    { x: leftEnd + dx, y: top, width: right - leftEnd, height: 176 - top },
    { x: rightEnd + dx, y: top, width: 144 - rightEnd - dx, height: 176 - top }
  ].filter((r) => r.width > 0)
}
