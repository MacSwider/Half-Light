import React from 'react';

interface ProgressModalProps {
  progress: { progress: number; message: string } | null;
  thickness: string;
  resolutionMultiplier: string;
  onClose: () => void;
}

export const ProgressModal: React.FC<ProgressModalProps> = ({
  progress,
  thickness,
  resolutionMultiplier,
  onClose,
}) => {
  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-content" onClick={(e) => e.stopPropagation()}>
        <button className="popup-close" onClick={onClose}>
          ×
        </button>

        <div className="processing-status">
          <div className="spinner"></div>
          <p>{progress?.message || 'Generating high-quality STL file...'}</p>
          {progress && (
            <div className="progress-bar-container">
              <div className="progress-bar" style={{ width: `${progress.progress}%` }}></div>
              <span className="progress-text">{Math.round(progress.progress)}%</span>
            </div>
          )}
          <p className="settings-info">
            Using thickness: {thickness} mm, resolution: {resolutionMultiplier}x
          </p>
        </div>
      </div>
    </div>
  );
};

