import React from 'react';

interface ControlsPanelProps {
  selectedImage: string | null;
  imagePath: string;
  isProcessing: boolean;
  hasValidationErrors: boolean;
  onImageSelect: () => void;
  onGenerateSTL: () => void;
}

export const ControlsPanel: React.FC<ControlsPanelProps> = ({
  selectedImage,
  imagePath,
  isProcessing,
  hasValidationErrors,
  onImageSelect,
  onGenerateSTL,
}) => {
  return (
    <section className="bottom-controls">
      <div className="image-selection">
        <button className="select-image-btn" onClick={onImageSelect}>
          📁 Choose Image File
        </button>
        {selectedImage && (
          <button className="change-image-btn" onClick={onImageSelect}>
            Change Image
          </button>
        )}
      </div>

      <div className="generate-controls">
        <button
          className="generate-btn"
          onClick={onGenerateSTL}
          disabled={!imagePath || isProcessing || hasValidationErrors}
        >
          🖨️ Generate STL
        </button>
      </div>
    </section>
  );
};

