import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import type { CatalogueItem, ItemKind } from '../../hooks/useCatalogue'
import { cn } from '../../lib/utils'

interface Props {
  open: boolean
  initial?: CatalogueItem | null
  onClose: () => void
  onSave: (item: Partial<CatalogueItem> & { name: string }) => Promise<{ error?: string }>
  onUploadImage: (f: File) => Promise<{ url?: string; error?: string }>
}

export function ItemEditor({ open, initial, onClose, onSave, onUploadImage }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState<ItemKind>('product')
  const [price, setPrice] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [stockQty, setStockQty] = useState('')
  const [unit, setUnit] = useState('')
  const [durationMin, setDurationMin] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement | null>(null)
  const cameraRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '')
      setDescription(initial?.description ?? '')
      setKind(initial?.kind ?? 'product')
      setPrice(initial?.price?.toString() ?? '')
      setMinPrice(initial?.min_price?.toString() ?? '')
      setStockQty(initial?.stock_qty?.toString() ?? '')
      setUnit(initial?.unit ?? '')
      setDurationMin(initial?.duration_minutes?.toString() ?? '')
      setImageUrl(initial?.image_url ?? '')
      setErr('')
    }
  }, [open, initial])

  const handleFile = async (file: File) => {
    setUploading(true)
    setErr('')
    const { url, error } = await onUploadImage(file)
    if (error) setErr(error)
    else if (url) setImageUrl(url)
    setUploading(false)
  }

  const handleSave = async () => {
    if (!name.trim()) { setErr('Name is required.'); return }
    setSaving(true)
    setErr('')
    const payload: Partial<CatalogueItem> & { name: string } = {
      id: initial?.id,
      name: name.trim(),
      description: description.trim() || null,
      kind,
      price: price ? Number(price) : null,
      min_price: minPrice ? Number(minPrice) : null,
      stock_qty: stockQty ? Number(stockQty) : null,
      in_stock: stockQty ? Number(stockQty) > 0 : true,
      unit: unit.trim() || null,
      duration_minutes: durationMin ? Number(durationMin) : null,
      image_url: imageUrl || null,
    }
    const { error } = await onSave(payload)
    setSaving(false)
    if (error) setErr(error)
    else onClose()
  }

  const isService = kind !== 'product'
  const isProduct = kind !== 'service'

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit item' : 'Add new item'}>
      <div className="space-y-4">
        {/* Kind segmented control */}
        <div className="inline-flex rounded-lg border border-border bg-surface p-1 w-full sm:w-auto">
          {(['product', 'service', 'both'] as ItemKind[]).map(k => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                'flex-1 sm:flex-none px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize',
                kind === k ? 'bg-accent text-white shadow-sm' : 'text-text-muted hover:text-text',
              )}
            >
              {k}
            </button>
          ))}
        </div>

        {/* Image upload */}
        <div>
          <label className="block text-xs text-text-muted mb-1.5">Image</label>
          <div className="flex items-center gap-3">
            <div className="h-20 w-20 rounded-lg border border-border bg-surface-2 overflow-hidden flex items-center justify-center flex-shrink-0">
              {imageUrl ? (
                <img src={imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-text-muted text-xs">No image</span>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => fileRef.current?.click()}
                  loading={uploading}
                  type="button"
                >
                  {imageUrl ? 'Change' : 'Upload'}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => cameraRef.current?.click()}
                  loading={uploading}
                  type="button"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <circle cx="12" cy="13" r="3.5" strokeWidth={1.8} />
                    </svg>
                    Take photo
                  </span>
                </Button>
              </div>
              {imageUrl && (
                <button
                  type="button"
                  onClick={() => setImageUrl('')}
                  className="block text-xs text-red-400 hover:text-red-300"
                >
                  Remove image
                </button>
              )}
              <p className="text-[11px] text-text-faint leading-tight">
                On phones, "Take photo" opens your camera. On desktop it falls back to file picker.
              </p>
            </div>
          </div>
        </div>

        <Input label="Name" value={name} onChange={e => setName(e.target.value)} placeholder="Nivea Soft / Manicure / Tutoring" />
        <div>
          <label className="block text-xs text-text-muted mb-1.5">Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            placeholder="What it is, ingredients, what's included…"
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder-text-muted focus:outline-none focus:border-accent transition-colors"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label={isService ? 'Price (optional)' : 'Price (GHS)'}
            value={price}
            onChange={e => setPrice(e.target.value.replace(/[^\d.]/g, ''))}
            placeholder="30"
            inputMode="decimal"
          />
          <Input
            label="Min price (negotiation floor)"
            value={minPrice}
            onChange={e => setMinPrice(e.target.value.replace(/[^\d.]/g, ''))}
            placeholder="Leave blank = no discount allowed"
            inputMode="decimal"
            hint="Agent never goes below this"
          />
        </div>

        {isProduct && (
          <Input
            label="Stock quantity"
            value={stockQty}
            onChange={e => setStockQty(e.target.value.replace(/\D/g, ''))}
            placeholder="0 = sold out"
            inputMode="numeric"
            hint="Leave blank if you don't track inventory"
          />
        )}

        {isService && (
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Unit"
              value={unit}
              onChange={e => setUnit(e.target.value)}
              placeholder="per session, per hour"
            />
            <Input
              label="Duration (min)"
              value={durationMin}
              onChange={e => setDurationMin(e.target.value.replace(/\D/g, ''))}
              placeholder="60"
              inputMode="numeric"
              hint="Used for scheduling"
            />
          </div>
        )}

        {err && <p className="text-sm text-red-400">{err}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>Save</Button>
        </div>
      </div>
    </Modal>
  )
}
