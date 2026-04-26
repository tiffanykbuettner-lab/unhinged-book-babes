import { useEffect, useRef, useState } from 'react'
import Quagga from '@ericblade/quagga2'
import { T } from '../lib/theme'

export default function BarcodeScanner({ onDetected, onClose, bulkMode = false, onBulkComplete }) {
  const scannerRef = useRef(null)
  const [error, setError] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [lastScanned, setLastScanned] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [scannedBooks, setScannedBooks] = useState([])
  const [searching, setSearching] = useState(false)
  const lastCodeRef = useRef(null)
  const lastTimeRef = useRef(0)

  useEffect(() => {
    let running = true

    Quagga.init({
      inputStream: {
        type: 'LiveStream',
        target: scannerRef.current,
        constraints: { facingMode: 'environment', width: { min: 300 }, height: { min: 200 } },
      },
      decoder: { readers: ['ean_reader', 'ean_8_reader', 'upc_reader'] },
      locate: true,
    }, (err) => {
      if (err) { setError('Could not access camera. Please check permissions.'); return }
      if (running) { Quagga.start(); setScanning(true) }
    })

    Quagga.onDetected(async (result) => {
      const code = result?.codeResult?.code
      if (!code || !running) return
      const clean = code.trim().replace(/[^0-9X]/gi, '')
      const isValid = (clean.length === 13 && (clean.startsWith('978') || clean.startsWith('979'))) || clean.length === 10
      if (!isValid) return

      const now = Date.now()
      if (clean === lastCodeRef.current && now - lastTimeRef.current < 3000) return
      lastCodeRef.current = clean
      lastTimeRef.current = now

      if (!bulkMode) {
        running = false
        Quagga.stop()
        onDetected(clean)
        return
      }

      // Bulk mode — look up and add notification
      setSearching(true)
      try {
        const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${clean}`)
        const data = await res.json()
        let bookInfo = null
        if (data.items?.length > 0) {
          const v = data.items[0].volumeInfo
          bookInfo = {
            isbn: clean,
            title: v.title || 'Unknown Title',
            author: v.authors?.[0] || '',
            publisher: v.publisher || '',
            publication_year: v.publishedDate?.slice(0, 4) || '',
            cover_image_url: v.imageLinks?.thumbnail?.replace('http:', 'https:') || '',
            format: 'hardcover',
            read_status: 'owned',
            series: '',
            volume_number: '',
            edition_name: '',
            special_features: '',
            notes: '',
          }
        } else {
          // Try Open Library
          const res2 = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${clean}&format=json&jscmd=data`)
          const data2 = await res2.json()
          const book2 = data2[`ISBN:${clean}`]
          if (book2) {
            bookInfo = {
              isbn: clean,
              title: book2.title || 'Unknown Title',
              author: book2.authors?.[0]?.name || '',
              publisher: book2.publishers?.[0]?.name || '',
              publication_year: book2.publish_date?.slice(-4) || '',
              cover_image_url: book2.cover?.medium || '',
              format: 'hardcover',
              read_status: 'owned',
              series: '', volume_number: '', edition_name: '', special_features: '', notes: '',
            }
          }
        }

        if (bookInfo) {
          setScannedBooks(prev => [...prev, bookInfo])
          addNotification(bookInfo.title, true)
        } else {
          addNotification(`ISBN ${clean} — not found`, false)
        }
      } catch {
        addNotification(`ISBN ${clean} — error`, false)
      }
      setSearching(false)
    })

    return () => {
      running = false
      try { Quagga.stop() } catch {}
    }
  }, [])

  function addNotification(message, success) {
    const id = Date.now()
    setNotifications(prev => [...prev, { id, message, success }])
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3000)
  }

  function handleDone() {
    try { Quagga.stop() } catch {}
    if (onBulkComplete) onBulkComplete(scannedBooks)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.97)', zIndex: 200, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: T.surface, borderBottom: `1px solid ${T.tealBorder}` }}>
        <div>
          <h2 style={{ color: T.white, margin: 0, fontFamily: 'Georgia, serif', fontSize: '18px' }}>
            {bulkMode ? '📚 Bulk Scan Mode' : '📷 Scan Barcode'}
          </h2>
          {bulkMode && <p style={{ color: T.tealLight, margin: '2px 0 0', fontSize: '13px' }}>{scannedBooks.length} books scanned</p>}
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {bulkMode && scannedBooks.length > 0 && (
            <button onClick={handleDone} style={{ background: T.teal, color: T.white, border: 'none', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '14px', fontWeight: 'bold' }}>
              Done ({scannedBooks.length})
            </button>
          )}
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: T.white, fontSize: '20px', cursor: 'pointer', borderRadius: '8px', width: '36px', height: '36px' }}>×</button>
        </div>
      </div>

      {error ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
            <p style={{ color: '#f87171', fontFamily: 'Georgia, serif', margin: 0 }}>{error}</p>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <div ref={scannerRef} style={{ width: '100%', height: '100%', background: '#000' }} />

          {/* Targeting overlay */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ width: '80%', maxWidth: '300px', height: '120px', border: `3px solid ${searching ? T.goldLight : T.teal}`, borderRadius: '12px', boxShadow: `0 0 0 9999px rgba(0,0,0,0.5), 0 0 20px ${searching ? T.gold : T.teal}`, transition: 'all 0.3s' }} />
          </div>

          {/* Status */}
          <div style={{ position: 'absolute', bottom: '20px', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }}>
            <p style={{ color: T.white, fontFamily: 'Georgia, serif', fontSize: '14px', background: 'rgba(0,0,0,0.7)', display: 'inline-block', padding: '8px 16px', borderRadius: '20px' }}>
              {searching ? '🔍 Looking up book...' : scanning ? 'Point at the barcode on the back of the book' : 'Starting camera...'}
            </p>
          </div>

          {/* Toast notifications */}
          <div style={{ position: 'absolute', top: '16px', left: '16px', right: '16px', display: 'flex', flexDirection: 'column', gap: '8px', pointerEvents: 'none' }}>
            {notifications.map(n => (
              <div key={n.id} style={{
                background: n.success ? 'rgba(13,148,136,0.95)' : 'rgba(239,68,68,0.95)',
                borderRadius: '10px', padding: '12px 16px',
                border: `1px solid ${n.success ? T.tealLight : '#f87171'}`,
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                animation: 'slideIn 0.2s ease'
              }}>
                <p style={{ color: T.white, margin: 0, fontFamily: 'Georgia, serif', fontSize: '14px', fontWeight: 'bold' }}>
                  {n.success ? '✅' : '❌'} {n.message}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scanned list preview */}
      {bulkMode && scannedBooks.length > 0 && (
        <div style={{ background: T.surface, borderTop: `1px solid ${T.tealBorder}`, padding: '12px 16px', maxHeight: '140px', overflowY: 'auto' }}>
          <p style={{ color: T.tealLight, fontSize: '12px', margin: '0 0 8px', fontFamily: 'Georgia, serif' }}>Scanned books:</p>
          {scannedBooks.map((book, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{ color: T.teal, fontSize: '12px' }}>✓</span>
              <p style={{ color: T.white, margin: 0, fontSize: '13px', fontFamily: 'Georgia, serif' }}>{book.title}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}