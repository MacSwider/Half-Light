import React from 'react';
import type { ImageProcessingResult } from '../../../types';

interface ResultModalProps {
  result: ImageProcessingResult;
  onClose: () => void;
  onSaveFile: () => void;
  onOpenInSlicer: () => void;
}

export const ResultModal: React.FC<ResultModalProps> = ({
  result,
  onClose,
  onSaveFile,
  onOpenInSlicer,
}) => {
  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-content" onClick={(e) => e.stopPropagation()}>
        <button className="popup-close" onClick={onClose}>
          ×
        </button>

        <div className={`result ${result.success ? 'success' : 'error'}`}>
          <h3>{result.success ? 'Success!' : ' Error'}</h3>
          <p>{result.message}</p>
          {result.stlPath && <p className="stl-path">STL saved to: {result.stlPath}</p>}
          {result.error && <p className="error-details">Error: {result.error}</p>}
          {result.success && result.stlContent && (
            <div className="success-actions">
              <button className="save-file-btn" onClick={onSaveFile}>
                Save STL File
              </button>
              <button className="open-slicer-btn" onClick={onOpenInSlicer}>
                Open in Slicer
              </button>
              <p className="file-info">
                <small>File: {result.suggestedFilename || 'lithophane.stl'}</small>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

