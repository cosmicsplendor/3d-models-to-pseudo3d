const ALPHA_THRESHOLD = 8 // ignore near-invisible antialias fringe; set 0 for strict

// Must be called in the same tick as renderer.render() (no preserveDrawingBuffer needed)
export function snapshot(src) {
  const c = document.createElement('canvas')
  c.width = src.width
  c.height = src.height
  c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0)
  return c
}

export function alphaBounds(canvas, threshold = ALPHA_THRESHOLD) {
  const { width: w, height: h } = canvas
  const d = canvas.getContext('2d').getImageData(0, 0, w, h).data
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let y = 0; y < h; y++) {
    const row = y * w * 4
    for (let x = 0; x < w; x++) {
      if (d[row + x * 4 + 3] > threshold) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY }
}

export function unionBounds(list) {
  const valid = list.filter(Boolean)
  if (!valid.length) return null
  return {
    minX: Math.min(...valid.map(b => b.minX)),
    minY: Math.min(...valid.map(b => b.minY)),
    maxX: Math.max(...valid.map(b => b.maxX)),
    maxY: Math.max(...valid.map(b => b.maxY)),
  }
}

function saveCanvas(canvas, filename, gap = 400) {
  return new Promise(resolve => {
    canvas.toBlob(blob => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename.endsWith('.png') ? filename : `${filename}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
      setTimeout(resolve, gap)
    }, 'image/png')
  })
}

/**
 * frames: [{ filename, canvas }]
 * pad: extra pixels around the union box
 * centerX: make the crop symmetric about the canvas center column, so the
 *          model's pivot stays centered (good if left/right swings differ)
 * even: force even width/height (some video/atlas tools want this)
 */
export async function flushFrames(frames, { pad = 2, centerX = false, even = true } = {}) {
console.log('flushFrames called with', frames.length, 'frames')
  if (!frames.length) return
  
  const W = frames[0].canvas.width
  const H = frames[0].canvas.height
  const u = unionBounds(frames.map(f => alphaBounds(f.canvas)))
  if (!u) return console.warn('All frames empty')

  let x0 = u.minX - pad, x1 = u.maxX + pad + 1
  let y0 = u.minY - pad, y1 = u.maxY + pad + 1

  if (centerX) {
    const cx = W / 2
    const half = Math.max(cx - x0, x1 - cx)
    x0 = Math.floor(cx - half)
    x1 = Math.ceil(cx + half)
  }

  // Warn if the model touches the render canvas edge: the render itself clipped it,
  // and no crop logic can recover that. Move the camera back or shrink scale.
  if (u.minX <= 0 || u.minY <= 0 || u.maxX >= W - 1 || u.maxY >= H - 1) {
    console.warn('Union bounds touch canvas edge: model likely clipped by the camera/viewport', u)
  }

  x0 = Math.max(0, x0); y0 = Math.max(0, y0)
  x1 = Math.min(W, x1); y1 = Math.min(H, y1)
  let cw = x1 - x0, ch = y1 - y0
  if (even) { cw -= cw % 2; ch -= ch % 2 }

  console.log(`Unified crop: x=${x0} y=${y0} ${cw}x${ch} over ${frames.length} frames`)

  for (const { filename, canvas } of frames) {
    const out = document.createElement('canvas')
    out.width = cw
    out.height = ch
    out.getContext('2d').drawImage(canvas, x0, y0, cw, ch, 0, 0, cw, ch)
    await saveCanvas(out, filename)
  }
}