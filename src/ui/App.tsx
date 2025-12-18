import { useEffect, useRef } from 'react';
import './styles/index.css';
import { AppHeader } from './components/AppHeader';
import { ImagePreviewSection } from './components/ImagePreviewSection';
import { SettingsPanel } from './components/SettingsPanel';
import { ControlsPanel } from './components/ControlsPanel';
import { ProgressModal } from './components/ProgressModal';
import { ResultModal } from './components/ResultModal';
import { useSettings } from './hooks/useSettings';
import { useImageHandling } from './hooks/useImageHandling';
import { useSTLGeneration } from './hooks/useSTLGeneration';
import { logger } from './utils/logger';


function App() {
  const settings = useSettings();
  const menuListenersRegistered = useRef(false);

  // Workaround: need a ref because stlGeneration depends on imageHandling
  // but imageHandling needs callbacks from stlGeneration - circular dependency fun!
  const stlGenerationRef = useRef<{
    setResult: (result: any) => void;
    setShowPopup: (show: boolean) => void;
  } | null>(null);

  const imageHandling = useImageHandling(
    settings.setWidth,
    settings.setHeight,
    (result) => stlGenerationRef.current?.setResult(result),
    (show) => stlGenerationRef.current?.setShowPopup(show),
    settings.setAspectRatio
  );

  const stlGeneration = useSTLGeneration(imageHandling.imagePath, settings);
  
  // Keep the ref in sync
  useEffect(() => {
    stlGenerationRef.current = {
      setResult: stlGeneration.setResult,
      setShowPopup: stlGeneration.setShowPopup,
    };
  }, [stlGeneration.setResult, stlGeneration.setShowPopup]);

  // Load saved preferences when app starts
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const prefs = await window.electron.getPreferences();

        // Apply theme
        const theme = prefs.theme;
        document.documentElement.setAttribute('data-theme', theme);

        // Restore settings
        settings.loadFromPreferences(prefs);

        // Try to load the last image
        if (prefs.lastImagePath) {
          try {
            await imageHandling.loadImageFromPath(prefs.lastImagePath);
          } catch (error) {
            logger.error('Error loading last image:', error);
          }
        }
      } catch (error) {
        logger.error('Error loading preferences:', error);
      }
    };

    loadPreferences();

    // Theme can change from menu
    window.electron.onThemeChanged((newTheme: 'light' | 'dark' | 'high-contrast') => {
      document.documentElement.setAttribute('data-theme', newTheme);
    });
  }, []); // Only run once

  // Auto-save preferences (debounced so we don't spam writes)
  useEffect(() => {
    // Skip the initial load
    if (menuListenersRegistered.current) {
      settings.savePreferences();
    }

    return () => {
      if (settings.savePreferencesTimeoutRef.current) {
        clearTimeout(settings.savePreferencesTimeoutRef.current);
      }
    };
  }, [settings.savePreferences]);

  // Hook up menu shortcuts
  useEffect(() => {
    // Prevent duplicate listeners
    if (menuListenersRegistered.current) {
      return;
    }

    // Menu -> UI communication
    window.electron.onMenuSelectImage(() => {
      imageHandling.handleImageSelect();
    });

    window.electron.onMenuGenerateSTL(() => {
      stlGeneration.handleGenerateSTL();
    });

    // Listen for progress updates from the main process
    window.electron.onSTLGenerationProgress((progressData) => {
      stlGeneration.setGenerationProgress?.(progressData);
    });

    menuListenersRegistered.current = true;

    // Cleanup (though these persist for the app lifetime anyway)
    return () => {
      menuListenersRegistered.current = false;
    };
  }, [imageHandling.handleImageSelect, stlGeneration.handleGenerateSTL]);

  const hasValidationErrors =
    !!settings.thicknessError ||
    !!settings.resolutionMultiplierError ||
    !!settings.firstLayerHeightError ||
    !!settings.layerNumberError ||
    !!settings.widthError ||
    !!settings.heightError ||
    !!settings.smoothingStrengthError;

  return (
    <div className="app">
      <AppHeader />

      <main className="app-main">
        <div className="content-grid">
          <ImagePreviewSection
            selectedImage={imageHandling.selectedImage}
            isDragging={imageHandling.isDragging}
            onDragOver={imageHandling.handleDragOver}
            onDragLeave={imageHandling.handleDragLeave}
            onDrop={imageHandling.handleDrop}
          />

          <SettingsPanel settings={settings} />

          <ControlsPanel
            selectedImage={imageHandling.selectedImage}
            imagePath={imageHandling.imagePath}
            isProcessing={stlGeneration.isProcessing}
            hasValidationErrors={hasValidationErrors}
            onImageSelect={imageHandling.handleImageSelect}
            onGenerateSTL={stlGeneration.handleGenerateSTL}
          />
        </div>
      </main>

      {/* Progress Modal */}
      {stlGeneration.showPopup && stlGeneration.isProcessing && (
        <ProgressModal
          progress={stlGeneration.generationProgress}
          thickness={settings.thickness}
          resolutionMultiplier={settings.resolutionMultiplier}
          onClose={() => stlGeneration.setShowPopup(false)}
        />
      )}

      {/* Result Modal */}
      {stlGeneration.showPopup && stlGeneration.result && !stlGeneration.isProcessing && (
        <ResultModal
          result={stlGeneration.result}
          onClose={() => stlGeneration.setShowPopup(false)}
          onSaveFile={stlGeneration.handleSaveFile}
          onOpenInSlicer={stlGeneration.handleOpenInSlicer}
        />
      )}
    </div>
  );
}

export default App;
