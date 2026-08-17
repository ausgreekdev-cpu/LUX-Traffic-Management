import { useState } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, useDraggable, useDroppable } from '@dnd-kit/core';

const BLOCK_TYPES = [
  { type: 'company_name', label: 'Company name' },
  { type: 'logo', label: 'Logo' },
  { type: 'plan_title', label: 'Plan title' },
  { type: 'reference', label: 'Reference' },
  { type: 'permit_number', label: 'Permit number' },
  { type: 'accreditation', label: 'Accreditation / ABN' },
  { type: 'generated_at', label: 'Generated at' },
  { type: 'page_number', label: 'Page number' },
  { type: 'company_details', label: 'Company phone · email' },
  { type: 'seal', label: 'Seal / stamp' },
  { type: 'text', label: 'Custom text' }
];

let seq = 0;

function PaletteItem({ t, source }) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: `palette-${source}-${t.type}`, data: { from: 'palette', type: t.type } });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      className={`px-2 py-1.5 rounded border border-dashed border-gray-300 dark:border-gray-600 text-xs cursor-grab hover:bg-gray-50 dark:hover:bg-gray-700 transition-all ${isDragging ? 'opacity-40' : ''}`}>
      {t.label}
    </div>
  );
}

function DropZone({ zone, blocks, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: `zone-${zone}`, data: { from: 'zone', zone } });
  return (
    <div ref={setNodeRef} className={`min-h-16 p-2 rounded-lg border-2 border-dashed transition-colors ${isOver ? 'border-lux-400 bg-lux-50 dark:bg-lux-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
      {children}
      {blocks.length === 0 && <p className="text-xs text-gray-400 text-center py-2">Drop blocks here</p>}
    </div>
  );
}

function BlockRow({ block, selected, onSelect, onMove, onDelete }) {
  return (
    <div className={`flex items-center gap-2 px-2 py-1.5 rounded border ${selected ? 'border-lux-400 bg-lux-50 dark:bg-lux-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
      <button onClick={() => onSelect(block.id)} className="flex-1 text-left text-xs font-medium truncate">
        {BLOCK_TYPES.find(b => b.type === block.type)?.label || block.type}
        {block.type === 'text' && block.content ? ` — ${block.content}` : ''}
      </button>
      <button onClick={() => onMove(block.id, -1)} className="text-gray-400 hover:text-gray-600 px-1" title="Move up">↑</button>
      <button onClick={() => onMove(block.id, 1)} className="text-gray-400 hover:text-gray-600 px-1" title="Move down">↓</button>
      <button onClick={() => onDelete(block.id)} className="text-red-400 hover:text-red-600 px-1" title="Delete">✕</button>
    </div>
  );
}

export default function PdfLayoutBuilder({ pdfLayout, onChange, onSave, saving }) {
  const [draft, setDraft] = useState(() => ({ header: [], footer: [], ...pdfLayout }));
  const [selected, setSelected] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const update = (next) => { setDraft(next); onChange(next); };

  const addBlock = (zone, type) => {
    const block = { id: `b${Date.now()}-${seq++}`, type, content: type === 'text' ? 'Custom text' : '', size: type === 'logo' || type === 'seal' ? undefined : 10, color: '#000000', align: 'left' };
    update({ ...draft, [zone]: [...draft[zone], block] });
    setSelected(block.id);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || !active) return;
    const data = active.data.current || {};
    if (data.from !== 'palette') return;
    const zone = String(over.id).startsWith('zone-') ? String(over.id).replace('zone-', '') : null;
    if (!zone) return;
    addBlock(zone, data.type);
  };

  const move = (zone, id, dir) => {
    const list = [...draft[zone]];
    const idx = list.findIndex(b => b.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= list.length) return;
    const [item] = list.splice(idx, 1);
    list.splice(target, 0, item);
    update({ ...draft, [zone]: list });
  };

  const remove = (zone, id) => {
    update({ ...draft, [zone]: draft[zone].filter(b => b.id !== id) });
    if (selected === id) setSelected(null);
  };

  const editSelected = (key, value) => {
    if (!selected) return;
    update({
      ...draft,
      header: draft.header.map(b => b.id === selected ? { ...b, [key]: value } : b),
      footer: draft.footer.map(b => b.id === selected ? { ...b, [key]: value } : b)
    });
  };

  const selBlock = [...draft.header, ...draft.footer].find(b => b.id === selected);

  return (
    <div className="space-y-4">
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="card p-4">
          <h3 className="font-semibold mb-2">Block palette</h3>
          <p className="text-xs text-gray-500 mb-3">Drag a block into the header or footer below.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {BLOCK_TYPES.map(t => <PaletteItem key={t.type} t={t} source="h" />)}
          </div>
        </div>

        <div className="card p-4">
          <h3 className="font-semibold mb-2">Header</h3>
          <DropZone zone="header" blocks={draft.header}>
            <div className="space-y-1.5">
              {draft.header.map(b => (
                <BlockRow key={b.id} block={b} selected={selected === b.id} onSelect={setSelected}
                  onMove={(id, d) => move('header', id, d)} onDelete={(id) => remove('header', id)} />
              ))}
            </div>
          </DropZone>
        </div>

        <div className="card p-4">
          <h3 className="font-semibold mb-2">Footer (every page)</h3>
          <DropZone zone="footer" blocks={draft.footer}>
            <div className="space-y-1.5">
              {draft.footer.map(b => (
                <BlockRow key={b.id} block={b} selected={selected === b.id} onSelect={setSelected}
                  onMove={(id, d) => move('footer', id, d)} onDelete={(id) => remove('footer', id)} />
              ))}
            </div>
          </DropZone>
        </div>
      </DndContext>

      {selBlock && (
        <div className="card p-4 space-y-3">
          <h3 className="font-semibold">Block settings — {BLOCK_TYPES.find(b => b.type === selBlock.type)?.label || selBlock.type}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {selBlock.type === 'text' && (
              <div className="lg:col-span-2">
                <label className="label">Text</label>
                <input value={selBlock.content || ''} onChange={e => editSelected('content', e.target.value)} className="input w-full" />
              </div>
            )}
            {(selBlock.type !== 'logo' && selBlock.type !== 'seal') && (
              <>
                <div>
                  <label className="label">Font size</label>
                  <input type="number" min="6" max="48" value={selBlock.size || 10} onChange={e => editSelected('size', parseInt(e.target.value, 10) || 10)} className="input w-full" />
                </div>
                <div>
                  <label className="label">Colour</label>
                  <input type="color" value={selBlock.color || '#000000'} onChange={e => editSelected('color', e.target.value)} className="h-9 w-12 rounded border border-gray-300 dark:border-gray-600 bg-transparent cursor-pointer" />
                </div>
                <div>
                  <label className="label">Align</label>
                  <select value={selBlock.align || 'left'} onChange={e => editSelected('align', e.target.value)} className="input w-full">
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </div>
              </>
            )}
            {(selBlock.type === 'logo' || selBlock.type === 'seal') && (
              <>
                <div>
                  <label className="label">Width</label>
                  <input type="number" min="20" max="400" value={selBlock.width || (selBlock.type === 'logo' ? 140 : 64)} onChange={e => editSelected('width', parseInt(e.target.value, 10) || 100)} className="input w-full" />
                </div>
                <div>
                  <label className="label">Height</label>
                  <input type="number" min="10" max="200" value={selBlock.height || (selBlock.type === 'logo' ? 40 : 64)} onChange={e => editSelected('height', parseInt(e.target.value, 10) || 40)} className="input w-full" />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div>
        <button onClick={() => onSave(draft)} disabled={saving} className="btn btn-primary">Save PDF layout</button>
      </div>
    </div>
  );
}
