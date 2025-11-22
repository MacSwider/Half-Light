import { useState, useCallback, useEffect, useRef } from 'react';
import './styles/index.css';
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
  const [firstLayerHeight, setFirstLayerHeight] = useState<string>('0.8');
  const [smoothingMethod, setSmoothingMethod] = useState<string>('laplacian');
  const [smoothingStrength, setSmoothingStrength] = useState<string>('0.1');
  const [negative, setNegative] = useState<boolean>(false);
  const [theme, setTheme] = useState<'light' | 'dark' | 'high-contrast'>('light');
  const [isDragging, setIsDragging] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{ progress: number; message: string } | null>(null);
  
  // Track if menu listeners are registered to prevent duplicates
  const menuListenersRegistered = useRef(false);

  // Load preferences on startup
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const prefs = await window.electron.getPreferences();
        
        // Load theme
        setTheme(prefs.theme);
        document.documentElement.setAttribute('data-theme', prefs.theme);
        
        // Load default settings (only if not already set by user interaction)
        // We'll use these as initial values
        if (prefs.defaultThickness) setThickness(prefs.defaultThickness);
        if (prefs.defaultWidth) setWidth(prefs.defaultWidth);
        if (prefs.defaultHeight) setHeight(prefs.defaultHeight);
        if (prefs.defaultLayerHeight) setLayerHeight(prefs.defaultLayerHeight);
        if (prefs.defaultLayerNumber) setLayerNumber(prefs.defaultLayerNumber);
        if (prefs.defaultResolutionMultiplier) setResolutionMultiplier(prefs.defaultResolutionMultiplier);
        if (prefs.defaultFirstLayerHeight) setFirstLayerHeight(prefs.defaultFirstLayerHeight);
        if (prefs.defaultSmoothingMethod) setSmoothingMethod(prefs.defaultSmoothingMethod);
        if (prefs.defaultSmoothingStrength) setSmoothingStrength(prefs.defaultSmoothingStrength);
        if (prefs.defaultAllowFrame !== undefined) setAllowFrame(prefs.defaultAllowFrame);
        if (prefs.defaultNegative !== undefined) setNegative(prefs.defaultNegative);
        
        // Load last image if it exists
        if (prefs.lastImagePath) {
          setImagePath(prefs.lastImagePath);
          try {
            const previewUrl = await window.electron.getImagePreview(prefs.lastImagePath);
            if (previewUrl) {
              setSelectedImage(previewUrl);
              const img = new Image();
              img.onload = () => {
                setWidth(img.width.toString());
                setHeight(img.height.toString());
              };
              img.src = previewUrl;
            }
          } catch (error) {
            console.error('Error loading last image:', error);
          }
        }
      } catch (error) {
        console.error('Error loading preferences:', error);
      }
    };

    loadPreferences();

    // Listen for theme changes from main process
    window.electron.onThemeChanged((newTheme: 'light' | 'dark' | 'high-contrast') => {
      setTheme(newTheme);
      document.documentElement.setAttribute('data-theme', newTheme);
    });
  }, []); // Run only once on mount

  // Update theme when it changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Save preferences when settings change (debounced)
  const savePreferencesTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const savePreferences = useCallback(async () => {
    if (savePreferencesTimeoutRef.current) {
      clearTimeout(savePreferencesTimeoutRef.current);
    }
    
    savePreferencesTimeoutRef.current = setTimeout(async () => {
      try {
        await window.electron.setPreferences({
          defaultThickness: thickness,
          defaultWidth: width,
          defaultHeight: height,
          defaultLayerHeight: layerHeight,
          defaultLayerNumber: layerNumber,
          defaultResolutionMultiplier: resolutionMultiplier,
          defaultFirstLayerHeight: firstLayerHeight,
          defaultSmoothingMethod: smoothingMethod,
          defaultSmoothingStrength: smoothingStrength,
          defaultAllowFrame: allowFrame,
          defaultNegative: negative,
        });
      } catch (error) {
        console.error('Error saving preferences:', error);
      }
    }, 1000); // Debounce: save 1 second after last change
  }, [thickness, width, height, layerHeight, layerNumber, resolutionMultiplier, 
      firstLayerHeight, smoothingMethod, smoothingStrength, allowFrame, negative]);

  // Save preferences when any setting changes
  useEffect(() => {
    // Don't save on initial load
    if (menuListenersRegistered.current) {
      savePreferences();
    }
    
    return () => {
      if (savePreferencesTimeoutRef.current) {
        clearTimeout(savePreferencesTimeoutRef.current);
      }
    };
  }, [savePreferences]);

  // Available layer height options
  const layerHeightOptions = ['0.12', '0.16', '0.2'];
  
  // Available smoothing methods
  const smoothingMethods = [
    { value: 'geometric', label: 'Geometric', description: '5x5 kernel with distance weighting' },
    { value: 'laplacian', label: 'Laplacian', description: 'Organic, flowing surfaces' },
    { value: 'none', label: 'None', description: 'No smoothing - maximum detail preservation' }
  ];

  // Calculate thickness when layer height or layer number changes
  const calculateThickness = (height: string, number: string): string => {
    const h = parseFloat(height);
    const n = parseFloat(number);
    const flh = parseFloat(firstLayerHeight);
    if (!isNaN(h) && !isNaN(n) && !isNaN(flh) && h > 0 && n > 0) {
      // Total thickness = first layer height + remaining layers * layer height
      return (flh + h * Math.max(0, n - 1)).toFixed(2);
    }
    return thickness;
  };

  // Calculate layer number when thickness or layer height changes
  const calculateLayerNumber = (thick: string, height: string): string => {
    const t = parseFloat(thick);
    const h = parseFloat(height);
    const flh = parseFloat(firstLayerHeight);
    if (!isNaN(t) && !isNaN(h) && !isNaN(flh) && h > 0 && t > 0) {
      if (t <= flh) {
        return '1';
      }
      // layers = 1 (first layer) + remaining thickness divided by layer height
      const remaining = Math.max(0, t - flh);
      return Math.max(1, 1 + Math.round(remaining / h)).toString();
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



  const loadImageFromPath = useCallback(async (path: string) => {
    setImagePath(path);
    // Save the image path to preferences
    try {
      await window.electron.setPreference('lastImagePath', path);
    } catch (error) {
      console.error('Error saving image path:', error);
    }
    
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
  }, []);

  const handleImageSelect = useCallback(async () => {
    try {
      const path = await window.electron.selectImage();
      if (path) {
        await loadImageFromPath(path);
      }
    } catch (error) {
      console.error('Error selecting image:', error);
    }
  }, [loadImageFromPath]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set dragging to false if we're actually leaving the drop zone
    // (not just moving between child elements)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      
      // Check if it's an image file
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.bmp', '.gif'];
      const fileName = file.name.toLowerCase();
      const isImage = imageExtensions.some(ext => fileName.endsWith(ext));
      
      if (!isImage) {
        setShowPopup(true);
        setResult({
          success: false,
          message: 'Invalid file type',
          error: 'Please drop an image file (jpg, jpeg, png, bmp, or gif).'
        });
        return;
      }

      try {
        // Try to get the file path directly (works in Electron)
        const filePath = (file as any).path;
        
        if (filePath) {
          // Direct path access works - use it
          await loadImageFromPath(filePath);
        } else {
          // Fallback: read file and send to main process to save temporarily
          const arrayBuffer = await file.arrayBuffer();
          // Convert ArrayBuffer to base64 string for reliable IPC transmission
          // Use chunked approach to avoid call stack overflow for large files
          const uint8Array = new Uint8Array(arrayBuffer);
          let binaryString = '';
          const chunkSize = 8192; // Process in chunks
          for (let i = 0; i < uint8Array.length; i += chunkSize) {
            const chunk = uint8Array.subarray(i, i + chunkSize);
            binaryString += String.fromCharCode.apply(null, Array.from(chunk));
          }
          const base64String = btoa(binaryString);
          const tempPath = await window.electron.handleDroppedFile(base64String, file.name);
          await loadImageFromPath(tempPath);
        }
      } catch (error) {
        console.error('Error handling dropped file:', error);
        setShowPopup(true);
        setResult({
          success: false,
          message: 'Error loading file',
          error: error instanceof Error ? error.message : 'Could not load the dropped file. Please use the file picker instead.'
        });
      }
    }
  }, [loadImageFromPath]);

  const handleGenerateSTL = useCallback(async () => {
    if (!imagePath) {
      setShowPopup(true);
      setResult({
        success: false,
        message: 'No image selected',
        error: 'Please select an image before generating STL.'
      });
      return;
    }
    
    // Validate thickness, resolution multiplier, and first layer height before proceeding
    if (!validateThickness(thickness)) {
      setShowPopup(true);
      setResult({
        success: false,
        message: 'Validation Error',
        error: thicknessError || 'Invalid thickness value'
      });
      return;
    }
    if (!validateResolutionMultiplier(resolutionMultiplier)) {
      setShowPopup(true);
      setResult({
        success: false,
        message: 'Validation Error',
        error: resolutionMultiplierError || 'Invalid resolution multiplier value'
      });
      return;
    }
    if (!validateFirstLayerHeight(firstLayerHeight)) {
      setShowPopup(true);
      setResult({
        success: false,
        message: 'Validation Error',
        error: firstLayerHeightError || 'Invalid first layer height value'
      });
      return;
    }
    
    setIsProcessing(true);
    setResult(null);
    setGenerationProgress({ progress: 0, message: 'Starting STL generation...' });
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
        orientation: 'horizontal' as const,
        negative: negative
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
      setGenerationProgress(null);
    }
  }, [imagePath, thickness, width, height, allowFrame, resolutionMultiplier, layerNumber, layerHeight, firstLayerHeight, smoothingMethod, smoothingStrength, negative]);

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
    if (!result?.stlContent) {
      setShowPopup(true);
      setResult({
        success: false,
        message: 'No STL file available',
        error: 'Please generate an STL file first before opening in slicer.'
      });
      return;
    }

    try {
      await window.electron.openInSlicer(result.stlContent, true, result.suggestedFilename || 'lithophane.stl');
      // Optionally close the popup after opening in slicer
      // closePopup();
    } catch (error) {
      setShowPopup(true);
      setResult({
        success: false,
        message: 'Failed to open in slicer',
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    }
  };

    // Set up menu action listeners after handlers are defined
  // Use useRef to ensure we only register once, even if dependencies change
  useEffect(() => {
    // Only register if not already registered
    if (menuListenersRegistered.current) {
      return;
    }

    // Register listeners (preload already removes old listeners as a safety measure)
    window.electron.onMenuSelectImage(() => {
      handleImageSelect();
    });

    window.electron.onMenuGenerateSTL(() => {
      handleGenerateSTL();
    });

    // Set up progress listener
    window.electron.onSTLGenerationProgress((progressData) => {
      setGenerationProgress(progressData);
    });

    menuListenersRegistered.current = true;

    // Cleanup function (though listeners persist for app lifetime)
    return () => {
      menuListenersRegistered.current = false;
    };
  }, [handleImageSelect, handleGenerateSTL]);

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
          <section 
            className={`image-preview-section ${isDragging ? 'drag-over' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {selectedImage ? (
              <div className="image-preview">
                {isDragging && (
                  <div className="drag-overlay">
                    <p>📥 Drop image here to replace</p>
                  </div>
                )}
                <img src={selectedImage} alt="Selected" />
              </div>
            ) : (
              <div className="no-image-placeholder">
                <p>{isDragging ? '📥 Drop image here' : 'No image selected'}</p>
                {!isDragging && (
                  <p className="drag-hint">💡 Drag and drop an image here or use the button below</p>
                )}
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
                <label htmlFor="negative">
                  <input
                    id="negative"
                    type="checkbox"
                    checked={negative}
                    onChange={(e) => setNegative(e.target.checked)}
                  />
                  Invert/Negative
                </label>
                <div className="setting-info">
                  <small>Invert brightness mapping - bright areas become thick, dark areas become thin</small>
                </div>
              </div>

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
                <p>{generationProgress?.message || 'Generating high-quality STL file...'}</p>
                {generationProgress && (
                  <div className="progress-bar-container">
                    <div className="progress-bar" style={{ width: `${generationProgress.progress}%` }}></div>
                    <span className="progress-text">{Math.round(generationProgress.progress)}%</span>
                  </div>
                )}
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
