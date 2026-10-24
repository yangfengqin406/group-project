// 精绘装扮按实际透明轮廓裁切；穿戴锚点由 WardrobeLayers 处理。
// 透明 PNG 的自然宽高；grip 是手持柄在图片中的归一化握点。
const items = {
  'sailor-shirt': {
    front: {
      width: 128,
      height: 85
    },
    back: {
      width: 128,
      height: 82
    }
  },
  'moss-cape': {
    front: {
      width: 128,
      height: 82
    },
    back: {
      width: 128,
      height: 81
    }
  },
  'coral-dress': {
    front: {
      width: 128,
      height: 91
    },
    back: {
      width: 128,
      height: 88
    }
  },
  'rain-boots': {
    front: {
      width: 128,
      height: 89
    },
    back: {
      width: 128,
      height: 91
    }
  },
  'shell-shoes': {
    front: {
      width: 128,
      height: 89
    },
    back: {
      width: 128,
      height: 79
    }
  },
  'leaf-slippers': {
    front: {
      width: 128,
      height: 86
    },
    back: {
      width: 128,
      height: 76
    }
  },
  'leaf-backpack': {
    front: {
      width: 128,
      height: 124
    },
    back: {
      width: 128,
      height: 121
    }
  },
  'shell-pouch': {
    front: {
      width: 128,
      height: 104
    },
    back: {
      width: 128,
      height: 105
    }
  },
  'bottle-bag': {
    front: {
      width: 123,
      height: 128
    },
    back: {
      width: 126,
      height: 128
    }
  },
  'tiny-net': {
    front: {
      width: 87,
      height: 144,
      grip: {
        x: 0.26,
        y: 0.833
      }
    },
    back: {
      width: 94,
      height: 144,
      grip: {
        x: 0.741,
        y: 0.833
      }
    }
  },
  'clover-umbrella': {
    front: {
      width: 142,
      height: 144,
      grip: {
        x: 0.481,
        y: 0.833
      }
    },
    back: {
      width: 139,
      height: 144,
      grip: {
        x: 0.497,
        y: 0.833
      }
    }
  },
  'star-wand': {
    front: {
      width: 80,
      height: 144,
      grip: {
        x: 0.478,
        y: 0.833
      }
    },
    back: {
      width: 80,
      height: 144,
      grip: {
        x: 0.5,
        y: 0.833
      }
    }
  },
  'lily-pad': {
    front: {
      width: 128,
      height: 83
    },
    back: {
      width: 128,
      height: 82
    }
  },
  'reed-bow': {
    front: {
      width: 128,
      height: 77
    },
    back: {
      width: 128,
      height: 76
    }
  },
  'straw-hat': {
    front: {
      width: 128,
      height: 66
    },
    back: {
      width: 128,
      height: 68
    }
  },
  'shell-crown': {
    front: {
      width: 128,
      height: 73
    },
    back: {
      width: 128,
      height: 71
    }
  },
  'acorn-bob': {
    front: {
      width: 128,
      height: 95
    },
    back: {
      width: 128,
      height: 95
    }
  },
  'cloud-bun': {
    front: {
      width: 128,
      height: 87
    },
    back: {
      width: 128,
      height: 83
    }
  },
  'sea-braid': {
    front: {
      width: 128,
      height: 112
    },
    back: {
      width: 128,
      height: 113
    }
  },
  'bubble-star': {
    front: {
      width: 101,
      height: 128
    },
    back: {
      width: 103,
      height: 128
    }
  },
  'pearl-badge': {
    front: {
      width: 116,
      height: 128
    },
    back: {
      width: 119,
      height: 128
    }
  },
  'clover-pin': {
    front: {
      width: 122,
      height: 128
    },
    back: {
      width: 119,
      height: 128
    }
  },
  'glow-jelly': {
    front: {
      width: 95,
      height: 128
    },
    back: {
      width: 101,
      height: 128
    }
  },
  'legacy-scarf': {
    front: {
      width: 128,
      height: 95
    },
    back: {
      width: 128,
      height: 74
    }
  },
  'legacy-flower': {
    front: {
      width: 128,
      height: 79
    },
    back: {
      width: 128,
      height: 99
    }
  }
}

export function wearableArt(id, view = 'front') {
  const assetId = id === 'legacy-satchel' ? 'leaf-backpack' : id
  const item = Object.prototype.hasOwnProperty.call(items, assetId)
    ? items[assetId]
    : null
  if (!item) return null
  const side = view === 'back' ? 'back' : 'front'
  return {
    source: `/static/pets/wearables/${assetId}-${side}.webp`,
    ...item[side]
  }
}
