import { useEffect, useState } from 'react'
import { useReducedMotion } from 'framer-motion'

type PointerOffset = {
    x: number
    y: number
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export default function SpatialBackdrop() {
    const prefersReducedMotion = useReducedMotion()
    const [offset, setOffset] = useState<PointerOffset>({ x: 0, y: 0 })

    useEffect(() => {
        if (prefersReducedMotion) return

        const handlePointerMove = (event: PointerEvent) => {
            const x = (event.clientX / window.innerWidth - 0.5) * 2
            const y = (event.clientY / window.innerHeight - 0.5) * 2
            setOffset({
                x: clamp(x, -1, 1),
                y: clamp(y, -1, 1),
            })
        }

        window.addEventListener('pointermove', handlePointerMove)
        return () => window.removeEventListener('pointermove', handlePointerMove)
    }, [prefersReducedMotion])

    const depthA = prefersReducedMotion ? undefined : { transform: `translate3d(${offset.x * 14}px, ${offset.y * 14}px, 0)` }
    const depthB = prefersReducedMotion ? undefined : { transform: `translate3d(${offset.x * -18}px, ${offset.y * 10}px, 0)` }
    const depthC = prefersReducedMotion ? undefined : { transform: `translate3d(${offset.x * 10}px, ${offset.y * -14}px, 0)` }
    const gridDepth = prefersReducedMotion ? undefined : { transform: `rotateX(74deg) translate3d(${offset.x * -6}px, ${offset.y * 6}px, -120px)` }

    return (
        <div className="of-spatial-backdrop" aria-hidden="true">
            <div className="of-spatial-grid" style={gridDepth} />
            <div className="of-orb of-orb-a" style={depthA} />
            <div className="of-orb of-orb-b" style={depthB} />
            <div className="of-orb of-orb-c" style={depthC} />
        </div>
    )
}
