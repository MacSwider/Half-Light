import { useState, useCallback } from 'react';
import './App.css';
import type { ImageProcessingResult } from '../../types';

function App() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imagePath, setImagePath] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ImageProcessingResult | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [thickness, setThickness] = useState<string>('0.8');
  const [thicknessError, setThicknessError] = useState<string>('');
  const [width, setWidth] = useState<string>('300');
  const [height, setHeight] = useState<string>('290');
  const [allowFrame, setAllowFrame] = useState(false);
  const [layerHeight, setLayerHeight] = useState<string>('0.2');
  const [layerNumber, setLayerNumber] = useState<string>('8');
  const [resolutionMultiplier, setResolutionMultiplier] = useState<string>('4');
  const [resolutionMultiplierError, setResolutionMultiplierError] = useState<string>('');
  const [firstLayerHeight, setFirstLayerHeight] = useState<string>('0.4');
  const [smoothingMethod, setSmoothingMethod] = useState<string>('geometric');
  const [smoothingStrength, setSmoothingStrength] = useState<string>('0.1');

  // Available layer height options
  const layerHeightOptions = ['0.12', '0.16', '0.2'];
  
  // Available smoothing methods
  const smoothingMethods = [
    { value: 'geometric', label: 'Geometric (default)', description: '5x5 kernel with distance weighting' },
    { value: 'laplacian', label: 'Laplacian', description: 'Organic, flowing surfaces' },
    { value: 'none', label: 'None', description: 'No smoothing - maximum detail preservation' }
  ];

  // Calculate thickness when layer height or layer number changes
  const calculateThickness = (height: string, number: string): string => {
    const h = parseFloat(height);
    const n = parseFloat(number);
    if (!isNaN(h) && !isNaN(n) && h > 0 && n > 0) {
      return (h * n).toFixed(2);
    }
    return thickness;
  };

  // Calculate layer number when thickness or layer height changes
  const calculateLayerNumber = (thick: string, height: string): string => {
    const t = parseFloat(thick);
    const h = parseFloat(height);
    if (!isNaN(t) && !isNaN(h) && h > 0 && t > 0) {
      return Math.round(t / h).toString();
    }
    return layerNumber;
  };

  const validateThickness = (value: string): boolean => {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      setThicknessError('Thickness must be a number');
      return false;
    }
    if (numValue <= 0) {
      setThicknessError('Thickness must be greater than 0');
      return false;
    }
    if (numValue > 10) {
      setThicknessError('Thickness must be less than or equal to 10');
      return false;
    }
    setThicknessError('');
    return true;
  };

  const validateResolutionMultiplier = (value: string): boolean => {
    const numValue = parseInt(value);
    if (isNaN(numValue)) {
      setResolutionMultiplierError('Resolution multiplier must be a number');
      return false;
    }
    if (numValue < 1) {
      setResolutionMultiplierError('Resolution multiplier must be at least 1');
      return false;
    }
    if (numValue > 10) {
      setResolutionMultiplierError('Resolution multiplier must be at most 10');
      return false;
    }
    setResolutionMultiplierError('');
    return true;
  }

  const [firstLayerHeightError, setFirstLayerHeightError] = useState<string>('');

  const validateFirstLayerHeight = (value: string): boolean => {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      setFirstLayerHeightError('First layer height must be a number');
      return false;
    }
    if (numValue <= 0) {
      setFirstLayerHeightError('First layer height must be greater than 0');
      return false;
    }
    if (numValue > 5) {
      setFirstLayerHeightError('First layer height must be at most 5mm');
      return false;
    }
    setFirstLayerHeightError('');
    return true;
  }

  const handleThicknessChange = (value: string) => {
    setThickness(value);
    if (value.trim() === '') {
      setThicknessError('');
    } else {
      validateThickness(value);
      // Update layer number based on new thickness
      const newLayerNumber = calculateLayerNumber(value, layerHeight);
      setLayerNumber(newLayerNumber);
    }
  };

  const handleWidthChange = (value: string) => {
    setWidth(value);
  };

  const handleHeightChange = (value: string) => {
    setHeight(value);
  };

  const handleLayerHeightChange = (value: string) => {
    setLayerHeight(value);
    // Update thickness and layer number based on new layer height
    const newThickness = calculateThickness(value, layerNumber);
    setThickness(newThickness);
    setThicknessError(''); // Clear any previous errors
  };

  const handleLayerNumberChange = (value: string) => {
    setLayerNumber(value);
    // Update thickness based on new layer number
    const newThickness = calculateThickness(layerHeight, value);
    setThickness(newThickness);
    setThicknessError(''); // Clear any previous errors
  };

  const handleResolutionMultiplierChange = (value: string) => {
    setResolutionMultiplier(value);
    if (value.trim() === '') {
      setResolutionMultiplierError('');
    } else {
      validateResolutionMultiplier(value);
    }
  };

  const handleFirstLayerHeightChange = (value: string) => {
    setFirstLayerHeight(value);
    if (value.trim() === '') {
      setFirstLayerHeightError('');
    } else {
      validateFirstLayerHeight(value);
    }
  };



  const handleImageSelect = useCallback(async () => {
    try {
      const path = await window.electron.selectImage();
      if (path) {
        setImagePath(path);
        // Get image preview as base64 data URL
        try {
          const previewUrl = await window.electron.getImagePreview(path);
          if (previewUrl) {
            setSelectedImage(previewUrl);
            
            // Get image dimensions and update width/height fields
            const img = new Image();
            img.onload = () => {
              // Set width and height to match image dimensions
              setWidth(img.width.toString());
              setHeight(img.height.toString());
              console.log(`Image loaded: ${img.width}x${img.height} pixels`);
            };
            img.src = previewUrl;
          } else {
            setSelectedImage(null);
          }
        } catch (error) {
          console.error('Error getting image preview:', error);
          setSelectedImage(null);
        }
        setResult(null);
      }
    } catch (error) {
      console.error('Error selecting image:', error);
    }
  }, []);

  const handleGenerateSTL = useCallback(async () => {
    if (!imagePath) return;
    
    // Validate thickness, resolution multiplier, and first layer height before proceeding
    if (!validateThickness(thickness)) {
      return;
    }
    if (!validateResolutionMultiplier(resolutionMultiplier)) {
      return;
    }
    if (!validateFirstLayerHeight(firstLayerHeight)) {
      return;
    }
    
    setIsProcessing(true);
    setResult(null);
    setShowPopup(true);
    
    try {
      // Use thickness from settings
      const settings = {
        width: parseFloat(width),
        height: parseFloat(height),
        depth: 3,
        thickness: parseFloat(thickness),
        firstLayerHeight: parseFloat(firstLayerHeight), // User-configurable first layer height for brightest layer thickness
        quality: 'high' as const,
        frameEnabled: allowFrame,
        frameWidth: 2.0,
        numberOfLayers: parseInt(layerNumber),
        layerHeight: parseFloat(layerHeight),
        resolutionMultiplier: parseInt(resolutionMultiplier),
        smoothing: {
          method: smoothingMethod as any,
          strength: parseFloat(smoothingStrength),
          passes: smoothingMethod === 'geometric' ? 2 : 3
        },
        orientation: 'horizontal' as const
      };
      
      console.log('Using settings:', settings); // Test log
      console.log('DEBUG: resolutionMultiplier value:', resolutionMultiplier, 'parsed as:', parseInt(resolutionMultiplier));
      
      const result = await window.electron.generateSTL(imagePath, settings);
      console.log('STL generation result received:', result); // Debug log
      console.log('Result properties:', {
        success: result.success,
        message: result.message,
        hasStlContent: !!result.stlContent,
        hasStlPath: !!result.stlPath,
        suggestedFilename: result.suggestedFilename
      });
      setResult(result);
    } catch (error) {
      setResult({
        success: false,
        message: 'Failed to generate STL',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsProcessing(false);
    }
  }, [imagePath, thickness, width, height, allowFrame, resolutionMultiplier, layerNumber, layerHeight, firstLayerHeight, smoothingMethod, smoothingStrength]);

  const closePopup = () => {
    setShowPopup(false);
  };

  const handleSaveFile = async () => {
    if (result?.stlContent && result?.suggestedFilename) {
      try {
        // Create a blob from the STL content
        const blob = new Blob([result.stlContent], { type: 'application/octet-stream' });
        
        // Create a download link
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.suggestedFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        // Close the popup after saving
        closePopup();
      } catch (error) {
        console.error('Error saving file:', error);
      }
    }
  };

  const handleOpenInSlicer = async () => {
    // TODO: Implement slicer integration
    console.log('Open in Slicer functionality - to be implemented');
    alert('Open in Slicer functionality will be implemented in a future update!');
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="header-left">
            <h1>🖼️ Half-Light</h1>
            <p>Just turn it</p>
          </div>
        </div>
      </header>

      <main className="app-main">
        <div className="content-grid">
          {/* Image Preview Section */}
          <section className="image-preview-section">
            {selectedImage ? (
              <div className="image-preview">
                <img src={selectedImage} alt="Selected" />
              </div>
            ) : (
              <div className="no-image-placeholder">
                <p>No image selected</p>
              </div>
            )}
          </section>



          {/* Settings Section */}
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
                  value={width}
                  onChange={(e) => handleWidthChange(e.target.value)}
                  placeholder="300"
                />
              </div>
              
              <div className="setting-item">
                <label htmlFor="height">Height (mm):</label>
                <input
                  id="height"
                  type="number"
                  step="1"
                  min="1"
                  max="1000"
                  value={height}
                  onChange={(e) => handleHeightChange(e.target.value)}
                  placeholder="290"
                />
              </div>
              
              <div className="setting-item">
                <label htmlFor="layerHeight">Layer Height (mm):</label>
                <select
                  id="layerHeight"
                  value={layerHeight}
                  onChange={(e) => handleLayerHeightChange(e.target.value)}
                >
                  {layerHeightOptions.map(option => (
                    <option key={option} value={option}>{option}</option>
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
                  max="1000"
                  value={layerNumber}
                  onChange={(e) => handleLayerNumberChange(e.target.value)}
                  placeholder="4"
                />
              </div>
              
              <div className="setting-item">
                <label htmlFor="resolutionMultiplier">Resolution Multiplier:</label>
                <input
                  id="resolutionMultiplier"
                  type="number"
                  step="1"
                  min="1"
                  max="10"
                  value={resolutionMultiplier}
                  onChange={(e) => handleResolutionMultiplierChange(e.target.value)}
                  className={resolutionMultiplierError ? 'error' : ''}
                  placeholder="4"
                />
                {resolutionMultiplierError && (
                  <span className="error-message">{resolutionMultiplierError}</span>
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
                  value={firstLayerHeight}
                  onChange={(e) => handleFirstLayerHeightChange(e.target.value)}
                  className={firstLayerHeightError ? 'error' : ''}
                  placeholder="0.4"
                />
                {firstLayerHeightError && (
                  <span className="error-message">{firstLayerHeightError}</span>
                )}
                <div className="setting-info">
                  <small>Thickness of the brightest layer (layer 0) - the rest is calculated from remaining thickness</small>
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
                  value={thickness}
                  onChange={(e) => handleThicknessChange(e.target.value)}
                  className={thicknessError ? 'error' : ''}
                  placeholder="0.8"
                />
                {thicknessError && (
                  <span className="error-message">{thicknessError}</span>
                )}
              </div>
              
              <div className="setting-item">
                <label htmlFor="smoothingMethod">Smoothing Method:</label>
                <select
                  id="smoothingMethod"
                  value={smoothingMethod}
                  onChange={(e) => setSmoothingMethod(e.target.value)}
                >
                  {smoothingMethods.map(method => (
                    <option key={method.value} value={method.value}>
                      {method.label}
                    </option>
                  ))}
                </select>
                <div className="setting-info">
                  <small>{smoothingMethods.find(m => m.value === smoothingMethod)?.description}</small>
                </div>
              </div>

              {smoothingMethod !== 'none' && (
                <div className="setting-item">
                  <label htmlFor="smoothingStrength">Smoothing Strength:</label>
                  <input
                    id="smoothingStrength"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="1.0"
                    value={smoothingStrength}
                    onChange={(e) => setSmoothingStrength(e.target.value)}
                    placeholder="0.1"
                  />
                  <div className="setting-info">
                    <small>Higher values = more smoothing (0.01-1.0)</small>
                  </div>
                </div>
              )}

              <div className="setting-item">
                <label htmlFor="allowFrame" className="checkbox-label">
                  <input
                    id="allowFrame"
                    type="checkbox"
                    checked={allowFrame}
                    onChange={(e) => setAllowFrame(e.target.checked)}
                  />
                  Allow Frame
                </label>
                <div className="setting-info">
                  <small>Frame will add a {parseFloat(width) + 4}x{parseFloat(height) + 4}mm border around the lithophane</small>
                </div>
              </div>
            </div>
          </section>

          {/* Bottom Left Controls */}
          <section className="bottom-controls">
            <div className="image-selection">
              <button 
                className="select-image-btn"
                onClick={handleImageSelect}
              >
                📁 Choose Image File
              </button>
              {selectedImage && (
                <button 
                  className="change-image-btn"
                  onClick={handleImageSelect}
                >
                  Change Image
                </button>
              )}
            </div>
            
            <div className="generate-controls">
              <button
                className="generate-btn"
                onClick={handleGenerateSTL}
                disabled={!imagePath || isProcessing || !!thicknessError || !!resolutionMultiplierError || !!firstLayerHeightError}
              >
                🖨️ Generate STL
              </button>
            </div>
          </section>
        </div>
      </main>

      {/* Popup for Status and Results */}
      {showPopup && (
        <div className="popup-overlay" onClick={closePopup}>
          <div className="popup-content" onClick={(e) => e.stopPropagation()}>
            <button className="popup-close" onClick={closePopup}>×</button>
            
            {isProcessing && (
              <div className="processing-status">
                <div className="spinner"></div>
                <p>Generating high-quality STL file...</p>
                <p className="settings-info">Using thickness: {thickness} mm, resolution: {resolutionMultiplier}x</p>
              </div>
            )}

            {result && (
              <div className={`result ${result.success ? 'success' : 'error'}`}>
                <h3>{result.success ? '✅ Success!' : '❌ Error'}</h3>
                <p>{result.message}</p>
                {result.stlPath && (
                  <p className="stl-path">STL saved to: {result.stlPath}</p>
                )}
                {result.error && (
                  <p className="error-details">Error: {result.error}</p>
                )}
                {result.success && result.stlContent && (
                  <div className="success-actions">
                    <button className="save-file-btn" onClick={handleSaveFile}>
                      💾 Save STL File
                    </button>
                    <button className="open-slicer-btn" onClick={handleOpenInSlicer}>
                      🔗 Open in Slicer
                    </button>
                    <p className="file-info">
                      <small>File: {result.suggestedFilename || 'lithophane.stl'}</small>
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
