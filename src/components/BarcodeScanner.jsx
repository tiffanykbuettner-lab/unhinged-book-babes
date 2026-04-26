import { useEffect, useRef, useState } from 'react'
import Quagga from '@ericblade/quagga2'
import { T } from '../lib/theme'

export default function BarcodeScanner({ onDetected, onClose }) {
  const scannerRef = useRef(null)
  const [error, setError] = useState(null)
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    let running = true

    Quagga.init({
      inputStream: {
        type: 'LiveStream',
        target: scannerRef.current,
        constraints: {
          facingMode: 'environment',
          width: { min: 300 },
          height: { min: 200 },
        },
      },
      decoder: {
        readers: ['ean_reader', 'ean_8_reader', 'upc_reader'],
      },
      locate: true,
    }, (err) => {
      if (err) {
        setError('Could not access camera. Please check permissions.')
        return
      }
      if (running) {
        Quagga.start()
        setScanning(true)
      }
    })

    Quagga.onDetected((result) => {
      const code = result?.codeResult?.code
      if (code && running) {
        const clean = code.trim().replace(/[^0-9X]/gi, '')
        const isValidISBN = (clean.length === 13 && (clean.startsWith('978') || clean.startsWith('979'))) || clean.length === 10
        if (isValidISBN) {
          running = false
          Quagga.stop()
          onDetected(clean)
        }
      }
    })

    return () => {
      running = false
      try { Quagga.stop() } catch {}
    }
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ color: T.white, margin: 0, fontFamily: 'Georgia, serif', fontSize: '18px' }}>📷 Scan Barcode</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.white, fontSize: '24px', cursor: 'pointer' }}>×</button>
        </div>

        {error ? (
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
            <p style={{ color: '#f87171', fontFamily: 'Georgia, serif', margin: 0 }}>{error}</p>
            <button onClick={onClose} style={{ marginTop: '16px', background: T.teal, color: T.white, border: 'none', borderRadius: '8px', padding: '10px 20px', cursor: 'pointer', fontFamily: 'Georgia, serif' }}>
              Close
            </button>
          </div>
        ) : (
          <>
            <div style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', border: `2px solid ${T.tealBorder}` }}>
              <div ref={scannerRef} style={{ width: '100%', height: '280px', background: '#000' }} />
              {/* Targeting overlay */}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ width: '80%', height: '100px', border: `2px solid ${T.gold}`, borderRadius: '8px', boxShadow: `0 0 0 9999px rgba(0,0,0,0.4)` }} />
              </div>
            </div>
            <p style={{ color: T.muted, textAlign: 'center', marginTop: '16px', fontFamily: 'Georgia, serif', fontSize: '14px' }}>
              {scanning ? 'Point at the barcode on the back of the book 📚' : 'Starting camera...'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}