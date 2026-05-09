import { useState, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useCatalogue, type CatalogueItem } from '../hooks/useCatalogue'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { ItemEditor } from '../components/catalogue/ItemEditor'
import { cn } from '../lib/utils'

type Filter = 'all' | 'product' | 'service' | 'low_stock'

export function CataloguePage() {
  const { user } = useAuth()
  const { items, loading, upsert, remove, uploadImage } = useCatalogue(user?.id)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<CatalogueItem | null>(null)

  const filtered = useMemo(() => {
    return items.filter(it => {
      if (filter === 'product' && it.kind === 'service') return false
      if (filter === 'service' && it.kind === 'product') return false
      if (filter === 'low_stock') {
        if (it.kind === 'service') return false
        const threshold = it.low_stock_threshold ?? 3
        if (it.stock_qty == null) return false
        if (it.stock_qty > threshold) return false
      }
      if (search && !it.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [items, filter, search])

  const lowStockCount = items.filter(it => {
    if (it.kind === 'service') return false
    const threshold = it.low_stock_threshold ?? 3
    return it.stock_qty != null && it.stock_qty <= threshold
  }).length

  const handleAdd = () => { setEditing(null); setEditorOpen(true) }
  const handleEdit = (it: CatalogueItem) => { setEditing(it); setEditorOpen(true) }
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item?')) return
    await remove(id)
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text">Catalogue</h1>
          <p className="text-sm text-text-muted mt-1">
            Products, services, prices, and stock — your single source of truth.
            {lowStockCount > 0 && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400">
                {lowStockCount} low stock
              </span>
            )}
          </p>
        </div>
        <Button onClick={handleAdd}>+ Add item</Button>
      </div>

      {/* Filter + search */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="inline-flex rounded-lg border border-border bg-surface p-1 overflow-x-auto">
          {([
            ['all', 'All'],
            ['product', 'Products'],
            ['service', 'Services'],
            ['low_stock', 'Low stock'],
          ] as Array<[Filter, string]>).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                filter === k ? 'bg-accent text-white shadow-sm' : 'text-text-muted hover:text-text',
              )}
            >
              {l}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder-text-muted focus:outline-none focus:border-accent"
        />
      </div>

      {/* Grid */}
      {loading ? (
        <Card className="p-8 text-center text-text-muted">Loading…</Card>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-text-muted">
          {items.length === 0 ? 'No items yet. Click "Add item" to get started.' : 'No items match your filter.'}
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(it => (
            <ItemCard
              key={it.id}
              item={it}
              onEdit={() => handleEdit(it)}
              onDelete={() => handleDelete(it.id)}
            />
          ))}
        </div>
      )}

      <ItemEditor
        open={editorOpen}
        initial={editing}
        onClose={() => setEditorOpen(false)}
        onSave={upsert}
        onUploadImage={uploadImage}
      />
    </div>
  )
}

function ItemCard({ item, onEdit, onDelete }: { item: CatalogueItem; onEdit: () => void; onDelete: () => void }) {
  const isService = item.kind === 'service' || item.kind === 'both'
  const isProduct = item.kind === 'product' || item.kind === 'both'
  const threshold = item.low_stock_threshold ?? 3
  const lowStock = isProduct && item.stock_qty != null && item.stock_qty <= threshold
  const outOfStock = isProduct && item.stock_qty != null && item.stock_qty === 0

  return (
    <Card className="p-0 overflow-hidden flex flex-col">
      <div className="aspect-[4/3] w-full bg-surface-2 relative">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-text-muted text-xs">No image</div>
        )}
        <span className={cn(
          'absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
          item.kind === 'product' && 'bg-accent text-white',
          item.kind === 'service' && 'bg-purple-500 text-white',
          item.kind === 'both' && 'bg-emerald-500 text-white',
        )}>
          {item.kind}
        </span>
        {outOfStock && (
          <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-500 text-white">
            Out
          </span>
        )}
        {lowStock && !outOfStock && (
          <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500 text-black">
            Low
          </span>
        )}
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <h3 className="font-semibold text-text truncate">{item.name}</h3>
        {item.description && (
          <p className="text-xs text-text-muted line-clamp-2 mt-1">{item.description}</p>
        )}
        <div className="mt-3 flex items-baseline gap-2">
          {item.price != null ? (
            <span className="text-lg font-bold text-text tabular-nums">GHS {item.price}</span>
          ) : (
            <span className="text-sm italic text-text-muted">price on request</span>
          )}
          {item.min_price != null && (
            <span className="text-xs text-text-muted">min GHS {item.min_price}</span>
          )}
        </div>
        <div className="mt-1 text-xs text-text-muted space-y-0.5">
          {isProduct && item.stock_qty != null && (
            <div>Stock: {item.stock_qty} {item.unit ?? 'units'}</div>
          )}
          {isService && item.duration_minutes != null && (
            <div>Duration: {item.duration_minutes} min</div>
          )}
          {isService && item.unit && !item.duration_minutes && (
            <div>{item.unit}</div>
          )}
        </div>
        <div className="mt-auto pt-3 flex items-center justify-end gap-1">
          <button onClick={onEdit} className="text-xs px-2 py-1 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors">Edit</button>
          <button onClick={onDelete} className="text-xs px-2 py-1 rounded text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors">Delete</button>
        </div>
      </div>
    </Card>
  )
}
