'use client'

import { useEffect, useId, useRef } from 'react'
import { playTempleChimeBrush, unlockTempleChimeAudio } from './templeChimeAudio'
import templeMastSrc from './assets/temple-mast.png'

type NodeKind = 'bead' | 'spacer' | 'bell'

type Node = {
  x: number
  y: number
  px: number
  py: number
  homeX: number
  homeY: number
  kind: NodeKind
  color: string
  radius: number
  visible: boolean
  cell: { sx: number; sy: number; size: number } | null
}

export type TempleChimeProps = {
  className?: string
  /** The temple mast / roof-ridge image the curtain hangs beneath. */
  imageSrc?: string
  imageAlt?: string
  /** Bead ink palette; strands are painted in short runs from these. */
  beadColors?: string[]
  /**
   * Scales the bead size and the grid together (default 1). Values
   * below 1 shrink the beads and pack the strands tighter.
   */
  scale?: number
  /** Multiplier on strand length (default 1). */
  lengthScale?: number
  /** 0-1: how uneven the strand lengths are (default 0.3). */
  raggedness?: number
  /** Pixel radius of the cursor's influence on the beads (default 130). */
  mouseRadius?: number
  /** Soft glow behind each bead/bell, like lit gemstones (default true). */
  luminous?: boolean
  /** Fraction of the container's width the mast image spans (default 0.94). */
  mastWidth?: number
  /** Mute the synthesized chime/bead sound. */
  muted?: boolean
}

const DEFAULT_COLORS = ['#e8c46a', '#2f9e8f', '#c0453f', '#3f7a52', '#3a5fc0', '#e8c46a']
const BELL_COLOR = '#c9973a'
const SPACER_COLOR = '#f0d68a'

const COL_SPACING = 15
const ROW_SPACING = 17
const BEAD_RADIUS = 5.2
const DAMPING = 0.94
const HOME_STIFFNESS = 0.013
const CONSTRAINT_ITERATIONS = 2
const ALPHA_THRESHOLD = 24

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v))
}

function shade(hex: string, percent: number): string {
  // percent > 0 lightens toward white, < 0 darkens toward black
  const n = hex.replace('#', '')
  const r = parseInt(n.substring(0, 2), 16)
  const g = parseInt(n.substring(2, 4), 16)
  const b = parseInt(n.substring(4, 6), 16)
  const t = percent < 0 ? 0 : 255
  const p = Math.abs(percent)
  const mix = (c: number) => Math.round((t - c) * p + c)
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

/**
 * A hanging bead curtain: each column is a verlet chain of round beads
 * pinned to the underside of a temple mast image (its alpha silhouette
 * traced so strands hang from the actual roofline, not a straight
 * line), tipped with a small bell. The cursor parts the strands like a
 * real doorway curtain and they swing back, ringing softly.
 */
export default function TempleChime({
  className,
  imageSrc = templeMastSrc,
  imageAlt = 'Gilded Nepali temple roof ridge with a Dharma wheel and deer, flanked by dragon-head finials',
  beadColors = DEFAULT_COLORS,
  scale = 1,
  lengthScale = 1,
  raggedness = 0.3,
  mouseRadius = 130,
  luminous = true,
  mastWidth = 0.94,
  muted = false,
}: TempleChimeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const reactId = useId()
  const mastId = `temple-chime-mast-${reactId.replace(/[^a-zA-Z0-9]/g, '')}`

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const colSpacing = COL_SPACING * scale
    const rowSpacing = ROW_SPACING * scale
    const beadRadius = BEAD_RADIUS * scale

    let columns: Node[][] = []
    let width = 0
    let height = 0
    let dpr = 1
    let raf = 0
    let running = true
    let time = 0

    const mouse = { x: -9999, y: -9999, vx: 0, vy: 0, active: false }

    let contourPixels: Uint8ClampedArray | null = null
    let contourW = 0
    let contourH = 0

    // --- sprite atlas ---------------------------------------------------
    // every unique color/kind pair is rasterized once into an offscreen
    // atlas and stamped with drawImage each frame, instead of drawing
    // gradients/paths per bead per frame.
    let atlas: HTMLCanvasElement | null = null
    let atlasMap = new Map<string, { sx: number; sy: number; size: number }>()
    let cellCss = 0
    let cellDevice = 0

    function drawBeadSprite(actx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
      if (luminous) {
        const glow = actx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.4)
        glow.addColorStop(0, `${color}55`)
        glow.addColorStop(1, `${color}00`)
        actx.fillStyle = glow
        actx.beginPath()
        actx.arc(cx, cy, r * 2.4, 0, Math.PI * 2)
        actx.fill()
      }
      const g = actx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r)
      g.addColorStop(0, shade(color, 0.55))
      g.addColorStop(0.55, color)
      g.addColorStop(1, shade(color, -0.35))
      actx.fillStyle = g
      actx.beginPath()
      actx.arc(cx, cy, r, 0, Math.PI * 2)
      actx.fill()
      actx.strokeStyle = shade(color, -0.5)
      actx.lineWidth = Math.max(0.5, r * 0.12)
      actx.stroke()
    }

    function drawSpacerSprite(actx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
      drawBeadSprite(actx, cx, cy, r * 0.62, SPACER_COLOR)
      actx.strokeStyle = shade(SPACER_COLOR, -0.6)
      actx.lineWidth = Math.max(0.4, r * 0.08)
      actx.beginPath()
      actx.moveTo(cx - r * 0.4, cy)
      actx.lineTo(cx + r * 0.4, cy)
      actx.stroke()
    }

    function drawBellSprite(actx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
      if (luminous) {
        const glow = actx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2)
        glow.addColorStop(0, `${BELL_COLOR}66`)
        glow.addColorStop(1, `${BELL_COLOR}00`)
        actx.fillStyle = glow
        actx.beginPath()
        actx.arc(cx, cy, r * 2.2, 0, Math.PI * 2)
        actx.fill()
      }
      // loop
      actx.strokeStyle = shade(BELL_COLOR, -0.4)
      actx.lineWidth = Math.max(0.5, r * 0.12)
      actx.beginPath()
      actx.arc(cx, cy - r * 1.05, r * 0.22, 0, Math.PI * 2)
      actx.stroke()
      // dome
      const domeTop = cy - r * 0.85
      const domeBottom = cy + r * 0.25
      const domeW = r * 0.95
      const g = actx.createLinearGradient(cx - domeW, domeTop, cx + domeW, domeBottom)
      g.addColorStop(0, shade(BELL_COLOR, 0.45))
      g.addColorStop(0.5, BELL_COLOR)
      g.addColorStop(1, shade(BELL_COLOR, -0.4))
      actx.fillStyle = g
      actx.beginPath()
      actx.moveTo(cx - domeW, domeBottom)
      actx.quadraticCurveTo(cx - domeW, domeTop, cx, domeTop)
      actx.quadraticCurveTo(cx + domeW, domeTop, cx + domeW, domeBottom)
      actx.closePath()
      actx.fill()
      actx.strokeStyle = shade(BELL_COLOR, -0.5)
      actx.lineWidth = Math.max(0.5, r * 0.1)
      actx.stroke()
      // rim
      actx.beginPath()
      actx.ellipse(cx, domeBottom, domeW, r * 0.16, 0, 0, Math.PI * 2)
      actx.fillStyle = shade(BELL_COLOR, -0.25)
      actx.fill()
      // clapper
      actx.strokeStyle = shade(BELL_COLOR, -0.5)
      actx.lineWidth = Math.max(0.4, r * 0.08)
      actx.beginPath()
      actx.moveTo(cx, domeBottom)
      actx.lineTo(cx, domeBottom + r * 0.55)
      actx.stroke()
      actx.beginPath()
      actx.arc(cx, domeBottom + r * 0.75, r * 0.22, 0, Math.PI * 2)
      actx.fillStyle = shade(BELL_COLOR, -0.15)
      actx.fill()
    }

    function buildAtlas() {
      const inks = Array.from(new Set(beadColors))
      const kinds: { key: string; draw: (actx: CanvasRenderingContext2D, cx: number, cy: number, r: number) => void }[] =
        []
      for (const ink of inks) {
        kinds.push({ key: `bead|${ink}`, draw: (actx, cx, cy, r) => drawBeadSprite(actx, cx, cy, r, ink) })
      }
      kinds.push({ key: 'spacer', draw: drawSpacerSprite })
      kinds.push({ key: 'bell', draw: drawBellSprite })

      const scaleFactor = dpr
      cellCss = beadRadius * 2 * 1.9
      cellDevice = cellCss * scaleFactor

      const cols = Math.ceil(Math.sqrt(kinds.length))
      const rows = Math.ceil(kinds.length / cols)

      atlas = document.createElement('canvas')
      atlas.width = Math.ceil(cols * cellDevice)
      atlas.height = Math.ceil(rows * cellDevice)
      const actx = atlas.getContext('2d')
      if (!actx) {
        atlas = null
        return
      }
      actx.scale(scaleFactor, scaleFactor)

      atlasMap = new Map()
      kinds.forEach((k, i) => {
        const cx = (i % cols) * cellCss + cellCss / 2
        const cy = Math.floor(i / cols) * cellCss + cellCss / 2
        const r = k.key === 'bell' ? beadRadius * 0.85 : beadRadius
        k.draw(actx, cx, cy, r)
        atlasMap.set(k.key, { sx: (i % cols) * cellDevice, sy: Math.floor(i / cols) * cellDevice, size: cellDevice })
      })
    }
    // ---------------------------------------------------------------------

    let reveal = 0
    let revealAt = Infinity

    function rand(seed: number) {
      const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
      return x - Math.floor(x)
    }

    function sampleContourImage(img: HTMLImageElement) {
      const w = img.naturalWidth
      const h = img.naturalHeight
      if (!w || !h) return
      const off = document.createElement('canvas')
      off.width = w
      off.height = h
      const octx = off.getContext('2d', { willReadFrequently: true })
      if (!octx) return
      octx.drawImage(img, 0, 0)
      try {
        contourPixels = octx.getImageData(0, 0, w, h).data
        contourW = w
        contourH = h
      } catch {
        contourPixels = null
      }
    }

    /**
     * For a given canvas-space x, walk the mast image column from the
     * bottom up and return the canvas-space y of the lowest opaque
     * pixel (the roof's under-eave path). null when nothing hangs there.
     */
    function contourYAt(canvasX: number): number | null {
      const img = imgRef.current
      if (!contourPixels || !img) return 0
      const imgRect = img.getBoundingClientRect()
      const canvasRect = canvas!.getBoundingClientRect()
      const pageX = canvasRect.left + canvasX
      if (pageX < imgRect.left || pageX > imgRect.right) return null
      const ix = Math.min(
        contourW - 1,
        Math.max(0, Math.round(((pageX - imgRect.left) / imgRect.width) * contourW)),
      )
      const halfWin = Math.min(6, Math.max(1, Math.round(((colSpacing / 2) * contourW) / imgRect.width)))
      const x0 = Math.max(0, ix - halfWin)
      const x1 = Math.min(contourW - 1, ix + halfWin)
      for (let iy = contourH - 1; iy >= 0; iy--) {
        const rowBase = iy * contourW
        for (let sx = x0; sx <= x1; sx++) {
          if (contourPixels[(rowBase + sx) * 4 + 3] > ALPHA_THRESHOLD) {
            const pageY = imgRect.top + (iy / contourH) * imgRect.height
            return pageY - canvasRect.top
          }
        }
      }
      return null
    }

    function build() {
      const rect = canvas!.getBoundingClientRect()
      width = rect.width
      height = rect.height
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas!.width = Math.round(width * dpr)
      canvas!.height = Math.round(height * dpr)

      buildAtlas()

      const colCount = Math.max(1, Math.floor(width / colSpacing))
      const xOffset = (width - (colCount - 1) * colSpacing) / 2

      columns = []
      for (let c = 0; c < colCount; c++) {
        const colX = xOffset + c * colSpacing
        const topY = contourYAt(colX)
        if (topY === null) continue

        const startY = topY + 4
        const available = height - startY
        if (available < rowSpacing * 3) continue

        const wave = 0.5 + 0.5 * Math.sin(c * 0.5 + rand(c * 2.1) * 1.8)
        const lengthJitter = 1 - raggedness + (rand(c * 7.3) * 0.55 + wave * 0.45) * raggedness
        const colRows = Math.max(
          3,
          Math.floor((available / rowSpacing) * lengthScale * lengthJitter),
        )

        const chain: Node[] = []
        for (let r = 0; r < colRows; r++) {
          const seed = c * 131 + r * 17
          const homeX = colX + (rand(seed + 3) - 0.5) * 1.4
          const homeY = startY + r * rowSpacing
          const isLast = r === colRows - 1
          const isSpacer = !isLast && r > 0 && (r + Math.floor(rand(c * 4.2) * 5)) % 5 === 0

          const kind: NodeKind = isLast ? 'bell' : isSpacer ? 'spacer' : 'bead'
          const ink =
            kind === 'bead'
              ? beadColors[Math.floor(rand(c * 13.7 + Math.floor(r / 5) * 5.1) * beadColors.length)]
              : kind === 'spacer'
                ? SPACER_COLOR
                : BELL_COLOR
          const radius = kind === 'bell' ? beadRadius * 1.35 : kind === 'spacer' ? beadRadius * 0.7 : beadRadius

          chain.push({
            x: homeX,
            y: startY + r * 1.2,
            px: homeX,
            py: startY + r * 1.2,
            homeX,
            homeY,
            kind,
            color: ink,
            radius,
            visible: isLast || rand(seed + 2) > 0.04,
            cell: atlasMap.get(kind === 'bead' ? `bead|${ink}` : kind) ?? null,
          })
        }
        columns.push(chain)
      }
    }

    function step() {
      time += 1 / 60
      const r2 = mouseRadius * mouseRadius

      for (let c = 0; c < columns.length; c++) {
        const chain = columns[c]
        const breeze = Math.sin(time * 0.7 + c * 0.35) * 0.012

        for (let r = 1; r < chain.length; r++) {
          const n = chain[r]
          const depth = r / chain.length

          let vx = (n.x - n.px) * DAMPING
          let vy = (n.y - n.py) * DAMPING
          n.px = n.x
          n.py = n.y

          vx += (n.homeX - n.x) * HOME_STIFFNESS
          vy += (n.homeY - n.y) * HOME_STIFFNESS

          vx += breeze * depth

          if (mouse.active) {
            const dx = n.x - mouse.x
            const dy = n.y - mouse.y
            const d2 = dx * dx + dy * dy
            if (d2 < r2 && d2 > 0.01) {
              const d = Math.sqrt(d2)
              const falloff = (1 - d / mouseRadius) ** 2
              const push = falloff * 1.4
              vx += (dx / d) * push + mouse.vx * falloff * 0.38
              vy += (dy / d) * push * 0.3 + mouse.vy * falloff * 0.2
            }
          }

          n.x += vx
          n.y += vy
        }

        for (let it = 0; it < CONSTRAINT_ITERATIONS; it++) {
          for (let r = 1; r < chain.length; r++) {
            const a = chain[r - 1]
            const b = chain[r]
            let dx = b.x - a.x
            let dy = b.y - a.y
            let d = Math.sqrt(dx * dx + dy * dy)
            if (d < 0.0001) {
              d = 0.0001
              dx = 0
              dy = 0.0001
            }
            const diff = (d - rowSpacing) / d
            if (r === 1) {
              b.x -= dx * diff
              b.y -= dy * diff
            } else {
              const ox = dx * diff * 0.5
              const oy = dy * diff * 0.5
              a.x += ox
              a.y += oy
              b.x -= ox
              b.y -= oy
            }
          }
        }
      }

      mouse.vx *= 0.85
      mouse.vy *= 0.85
    }

    function draw() {
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx!.clearRect(0, 0, width, height)
      if (reveal <= 0 || !atlas) return

      const half = cellCss / 2

      for (let c = 0; c < columns.length; c++) {
        const chain = columns[c]
        for (let r = 0; r < chain.length; r++) {
          const n = chain[r]
          if (!n.visible || !n.cell) continue

          const a = clamp01(reveal)
          if (a < 0.02) continue
          ctx!.globalAlpha = a
          ctx!.drawImage(atlas, n.cell.sx, n.cell.sy, n.cell.size, n.cell.size, n.x - half, n.y - half, cellCss, cellCss)
        }
      }
      ctx!.globalAlpha = 1
    }

    function loop() {
      if (!running) return
      if (performance.now() >= revealAt) {
        if (reveal < 1) reveal = Math.min(1, reveal + 0.025)
        step()
      }
      draw()
      raf = requestAnimationFrame(loop)
    }

    function onPointerMove(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      if (mouse.active) {
        mouse.vx = mouse.vx * 0.5 + (x - mouse.x) * 0.5
        mouse.vy = mouse.vy * 0.5 + (y - mouse.y) * 0.5
      }
      mouse.x = x
      mouse.y = y
      mouse.active = true

      if (!muted && reveal > 0.5 && x >= 0 && x <= width && y >= 0 && y <= height) {
        const speed = Math.sqrt(mouse.vx * mouse.vx + mouse.vy * mouse.vy)
        if (speed > 2.5) {
          const topY = contourYAt(x)
          if (topY !== null && y > topY) {
            playTempleChimeBrush(Math.min(1, speed / 26))
          }
        }
      }
    }

    function onPointerDown() {
      if (!muted) unlockTempleChimeAudio()
    }

    function onPointerLeave() {
      mouse.active = false
      mouse.x = -9999
      mouse.y = -9999
    }

    function initContour() {
      const img = imgRef.current
      if (!img) {
        requestAnimationFrame(initContour)
        return
      }
      if (img.complete && img.naturalWidth > 0) {
        sampleContourImage(img)
        build()
        revealAt = performance.now() + 380
      } else {
        img.addEventListener(
          'load',
          () => {
            sampleContourImage(img)
            build()
            revealAt = performance.now() + 380
          },
          { once: true },
        )
      }
    }

    initContour()
    loop()

    const ro = new ResizeObserver(() => {
      if (!contourPixels) return
      build()
    })
    ro.observe(canvas)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerleave', onPointerLeave)
    window.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('mouseleave', onPointerLeave)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerleave', onPointerLeave)
      window.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('mouseleave', onPointerLeave)
    }
  }, [imageSrc, beadColors, scale, lengthScale, raggedness, mouseRadius, luminous, muted])

  return (
    <div className={`relative ${className ?? ''}`}>
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0" style={{ width: '100%', height: '100%' }} />
      <img
        id={mastId}
        ref={imgRef}
        src={imageSrc}
        alt={imageAlt}
        crossOrigin="anonymous"
        className="absolute left-1/2 top-0 h-auto -translate-x-1/2 drop-shadow-[0_10px_24px_rgba(0,0,0,0.45)]"
        style={{ width: `${mastWidth * 100}%` }}
      />
    </div>
  )
}
