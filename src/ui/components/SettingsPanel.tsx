import React from 'react';
import { useSettings } from '../hooks/useSettings';

interface SettingsPanelProps {
  settings: ReturnType<typeof useSettings>;
}

const layerHeightOptions = ['0.12', '0.16', '0.2'];

const smoothingMethods = [
  { value: 'geometric', label: 'Geometric', description: '5x5 kernel with distance weighting' },
  { value: 'laplacian', label: 'Laplacian', description: 'Organic, flowing surfaces' },
  { value: 'none', label: 'None', description: 'No smoothing - maximum detail preservation' },
];

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings }) => {
  return (
    <section className="settings-section">
      <h2>Settings</h2>
      <div className="settings-content">
        <div className="setting-item">
          <label htmlFor="width">Width (mm):</label>
          <input
            id="width"
            type="number"
            step="1"
            min="1"
            max="1000"
            value={settings.width}
            onChange={(e) => settings.setWidth(e.target.value)}
            className={settings.widthError ? 'error' : ''}
            placeholder="300"
          />
          {settings.widthError && (
            <span className="error-message">{settings.widthError}</span>
          )}
        </div>

        <div className="setting-item">
          <label htmlFor="height">Height (mm):</label>
          <input
            id="height"
            type="number"
            step="1"
            min="1"
            max="1000"
            value={settings.height}
            onChange={(e) => settings.setHeight(e.target.value)}
            className={settings.heightError ? 'error' : ''}
            placeholder="290"
          />
          {settings.heightError && (
            <span className="error-message">{settings.heightError}</span>
          )}
        </div>

        <div className="setting-item">
          <label htmlFor="lockAspectRatio" className="checkbox-label">
            <input
              id="lockAspectRatio"
              type="checkbox"
              checked={settings.lockAspectRatio}
              onChange={(e) => settings.setLockAspectRatio(e.target.checked)}
            />
            Lock Ratio
          </label>
          <div className="setting-info">
            <small>
              Maintain the original image proportions
            </small>
          </div>
        </div>

        <div className="setting-item">
          <label htmlFor="layerHeight">Layer Height (mm):</label>
          <select
            id="layerHeight"
            value={settings.layerHeight}
            onChange={(e) => settings.setLayerHeight(e.target.value)}
          >
            {layerHeightOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="setting-item">
          <label htmlFor="layerNumber">Layer Number:</label>
          <input
            id="layerNumber"
            type="number"
            step="1"
            min="1"
            value={settings.layerNumber}
            onChange={(e) => settings.setLayerNumber(e.target.value)}
            className={settings.layerNumberError ? 'error' : ''}
            placeholder="4"
          />
          {settings.layerNumberError && (
            <span className="error-message">{settings.layerNumberError}</span>
          )}
        </div>

        <div className="setting-item">
          <label htmlFor="resolutionMultiplier">Resolution Multiplier:</label>
          <input
            id="resolutionMultiplier"
            type="number"
            step="1"
            min="1"
            max="10"
            value={settings.resolutionMultiplier}
            onChange={(e) => settings.setResolutionMultiplier(e.target.value)}
            className={settings.resolutionMultiplierError ? 'error' : ''}
            placeholder="4"
          />
          {settings.resolutionMultiplierError && (
            <span className="error-message">{settings.resolutionMultiplierError}</span>
          )}
          <div className="setting-info">
            <small>Higher values create smoother surfaces but larger files (1-10x)</small>
          </div>
        </div>

        <div className="setting-item">
          <label htmlFor="firstLayerHeight">First Layer Height (mm):</label>
          <input
            id="firstLayerHeight"
            type="number"
            step="0.1"
            min="0.1"
            max="5"
            value={settings.firstLayerHeight}
            onChange={(e) => settings.setFirstLayerHeight(e.target.value)}
            className={settings.firstLayerHeightError ? 'error' : ''}
            placeholder="0.4"
          />
          {settings.firstLayerHeightError && (
            <span className="error-message">{settings.firstLayerHeightError}</span>
          )}
          <div className="setting-info">
            <small>
              Thickness of the brightest layer (layer 0) - the rest is calculated from remaining
              thickness
            </small>
          </div>
        </div>

        <div className="setting-item">
          <label htmlFor="thickness">Thickness (mm):</label>
          <input
            id="thickness"
            type="number"
            step="0.1"
            min="0.1"
            max="10"
            value={settings.thickness}
            onChange={(e) => settings.setThickness(e.target.value)}
            className={settings.thicknessError ? 'error' : ''}
            placeholder="0.8"
          />
          {settings.thicknessError && (
            <span className="error-message">{settings.thicknessError}</span>
          )}
        </div>

        <div className="setting-item">
          <label htmlFor="smoothingMethod">Smoothing Method:</label>
          <select
            id="smoothingMethod"
            value={settings.smoothingMethod}
            onChange={(e) => settings.setSmoothingMethod(e.target.value)}
          >
            {smoothingMethods.map((method) => (
              <option key={method.value} value={method.value}>
                {method.label}
              </option>
            ))}
          </select>
          <div className="setting-info">
            <small>
              {smoothingMethods.find((m) => m.value === settings.smoothingMethod)?.description}
            </small>
          </div>
        </div>

        {settings.smoothingMethod !== 'none' && (
          <div className="setting-item">
            <label htmlFor="smoothingStrength">Smoothing Strength:</label>
            <input
              id="smoothingStrength"
              type="number"
              step="0.01"
              min="0.01"
              max="1.0"
              value={settings.smoothingStrength}
              onChange={(e) => settings.setSmoothingStrength(e.target.value)}
              className={settings.smoothingStrengthError ? 'error' : ''}
              placeholder="0.1"
            />
            {settings.smoothingStrengthError && (
              <span className="error-message">{settings.smoothingStrengthError}</span>
            )}
            <div className="setting-info">
              <small>Higher values = more smoothing (0.01-1.0)</small>
            </div>
          </div>
        )}

        <div className="setting-item">
          <label htmlFor="negative">
            <input
              id="negative"
              type="checkbox"
              checked={settings.negative}
              onChange={(e) => settings.setNegative(e.target.checked)}
            />
            Invert/Negative
          </label>
          <div className="setting-info">
            <small>
              Invert brightness mapping - bright areas become thick, dark areas become thin
            </small>
          </div>
        </div>

        <div className="setting-item">
          <label htmlFor="allowFrame" className="checkbox-label">
            <input
              id="allowFrame"
              type="checkbox"
              checked={settings.allowFrame}
              onChange={(e) => settings.setAllowFrame(e.target.checked)}
            />
            Allow Frame
          </label>
          <div className="setting-info">
            <small>
              Frame will add a {parseFloat(settings.width) + 4}x{parseFloat(settings.height) + 4}
              mm border around the lithophane
            </small>
          </div>
        </div>
      </div>
    </section>
  );
};

