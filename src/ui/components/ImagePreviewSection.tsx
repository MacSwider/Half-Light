import React from 'react';

interface ImagePreviewSectionProps {
  selectedImage: string | null;
  isDragging: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

export const ImagePreviewSection: React.FC<ImagePreviewSectionProps> = ({
  selectedImage,
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
}) => {
  return (
    <section
      className={`image-preview-section ${isDragging ? 'drag-over' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {selectedImage ? (
        <div className="image-preview">
          {isDragging && (
            <div className="drag-overlay">
              <p>Drop image here to replace</p>
            </div>
          )}
          <img src={selectedImage} alt="Selected" />
        </div>
      ) : (
        <div className="no-image-placeholder">
          <p>{isDragging ? 'Drop image here' : 'No image selected'}</p>
          {!isDragging && (
            <p className="drag-hint">Drag and drop an image here or use the button below</p>
          )}
        </div>
      )}
    </section>
  );
};

