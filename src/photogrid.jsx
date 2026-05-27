import React from 'react';
import { MediaItem } from 'flow-sdk';

interface PhotoGridProps {
  photos: MediaItem[];
  onRemove: (id: string) => void;
}

export const PhotoGrid: React.FC<PhotoGridProps> = ({ photos, onRemove }) => {
  if (photos.length === 0) return null;

  return (
    <div className="grid grid-cols-5 gap-1.5 w-full">
      {photos.map((photo) => (
        <div key={photo.mediaId} className="relative aspect-square rounded-lg overflow-hidden group">
          <img 
            src={`data:${photo.mimeType};base64,${photo.base64}`} 
            className="w-full h-full object-cover"
            alt="Property"
          />
          <button 
            onClick={() => onRemove(photo.mediaId)}
            className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <span className="material-symbols-outlined text-[12px] text-white">close</span>
          </button>
        </div>
      ))}
    </div>
  );
};
