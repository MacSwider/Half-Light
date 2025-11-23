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

  // We need to create a ref to hold the setResult and setShowPopup functions
  // since they come from stlGeneration which depends on imageHandling
  const stlGenerationRef = useRef<{
    setResult: (result: any) => void;
    setShowPopup: (show: boolean) => void;
  } | null>(null);

  const imageHandling = useImageHandling(
    settings.setWidth,
    settings.setHeight,
    (result) => stlGenerationRef.current?.setResult(result),
    (show) => stlGenerationRef.current?.setShowPopup(show)
  );

  const stlGeneration = useSTLGeneration(imageHandling.imagePath, settings);
  
  // Update ref when stlGeneration is available
  useEffect(() => {
    stlGenerationRef.current = {
      setResult: stlGeneration.setResult,
      setShowPopup: stlGeneration.setShowPopup,
    };
  }, [stlGeneration.setResult, stlGeneration.setShowPopup]);

  // Load preferences on startup
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const prefs = await window.electron.getPreferences();

        // Load theme
        const theme = prefs.theme;
        document.documentElement.setAttribute('data-theme', theme);

        // Load default settings
        settings.loadFromPreferences(prefs);

        // Load last image if it exists
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

    // Listen for theme changes from main process
    window.electron.onThemeChanged((newTheme: 'light' | 'dark' | 'high-contrast') => {
      document.documentElement.setAttribute('data-theme', newTheme);
    });
  }, []); // Run only once on mount

  // Save preferences when settings change (debounced)
  useEffect(() => {
    // Don't save on initial load
    if (menuListenersRegistered.current) {
      settings.savePreferences();
    }

    return () => {
      if (settings.savePreferencesTimeoutRef.current) {
        clearTimeout(settings.savePreferencesTimeoutRef.current);
      }
    };
  }, [settings.savePreferences]);

  // Set up menu action listeners
  useEffect(() => {
    // Only register if not already registered
    if (menuListenersRegistered.current) {
      return;
    }

    // Register listeners (preload already removes old listeners as a safety measure)
    window.electron.onMenuSelectImage(() => {
      imageHandling.handleImageSelect();
    });

    window.electron.onMenuGenerateSTL(() => {
      stlGeneration.handleGenerateSTL();
    });

    // Set up progress listener
    window.electron.onSTLGenerationProgress((progressData) => {
      stlGeneration.setGenerationProgress?.(progressData);
    });

    menuListenersRegistered.current = true;

    // Cleanup function (though listeners persist for app lifetime)
    return () => {
      menuListenersRegistered.current = false;
    };
  }, [imageHandling.handleImageSelect, stlGeneration.handleGenerateSTL]);

  const hasValidationErrors =
    !!settings.thicknessError ||
    !!settings.resolutionMultiplierError ||
    !!settings.firstLayerHeightError;

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
