import React from 'react';
import { RehabItem } from '../types';
import { FieldDropdown, DragNumberField } from './UI';

interface RehabEstimatorProps {
  items: RehabItem[];
  onChange: (items: RehabItem[]) => void;
}

export const RehabEstimator: React.FC<RehabEstimatorProps> = ({ items, onChange }) => {
  const updateItem = (index: number, updates: Partial<RehabItem>) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], ...updates };
    onChange(newItems);
  };

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      <div className="flex flex-col gap-2">
        {items.map((item, idx) => (
          <div key={item.category} className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h4 className="text-[12px] font-bold text-white tracking-wide uppercase">{item.category}</h4>
              <div className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                item.priority === 'High' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                item.priority === 'Medium' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                'bg-green-500/20 text-green-400 border-green-500/30'
              }`}>
                {item.priority} PRIORITY
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <FieldDropdown 
                label="Condition" 
                value={item.condition} 
                options={['New', 'Good', 'Fair', 'Poor', 'Missing', 'Needs Repair', 'Full Replacement', 'N/A']} 
                onChange={(val) => updateItem(idx, { condition: val })}
              />
              <DragNumberField 
                label="Est. Cost" 
                value={item.cost} 
                step={500} 
                onChange={(v) => updateItem(idx, { cost: v })}
                suffix="$"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <FieldDropdown 
                label="Priority" 
                value={item.priority} 
                options={['Low', 'Medium', 'High']} 
                onChange={(val) => updateItem(idx, { priority: val as any })}
              />
              <div className="flex flex-col gap-0.5">
                <p className="text-[11px] font-medium text-white/35 tracking-[0.1px] uppercase px-2">Notes</p>
                <input 
                  type="text"
                  placeholder="Note..."
                  value={item.notes}
                  onChange={(e) => updateItem(idx, { notes: e.target.value })}
                  className="bg-transparent border border-[#595959] rounded-xl h-[34px] px-2.5 text-[11px] text-white focus:outline-none focus:border-[#969696] transition-colors"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
