import { useState, useCallback } from 'react';
import type { ImageProcessingResult } from '../../../types';
import { useSettings } from './useSettings';
import { logger } from '../utils/logger';

export const useSTLGeneration = (
  imagePath: string,
  settings: ReturnType<typeof useSettings>
) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ImageProcessingResult | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{
    progress: number;
    message: string;
  } | null>(null);

  const handleGenerateSTL = useCallback(async () => {
    if (!imagePath) {
      setShowPopup(true);
      setResult({
        success: false,
        message: 'No image selected',
        error: 'Please select an image before generating STL.',
      });
      return;
    }

    // Check all the inputs before we start
    if (!settings.validateThickness(settings.thickness)) {
      setShowPopup(true);
      setResult({
        success: false,
        message: 'Validation Error',
        error: settings.thicknessError || 'Invalid thickness value',
      });
      return;
    }
    if (!settings.validateResolutionMultiplier(settings.resolutionMultiplier)) {
      setShowPopup(true);
      setResult({
        success: false,
        message: 'Validation Error',
        error: settings.resolutionMultiplierError || 'Invalid resolution multiplier value',
      });
      return;
    }
    if (!settings.validateFirstLayerHeight(settings.firstLayerHeight)) {
      setShowPopup(true);
      setResult({
        success: false,
        message: 'Validation Error',
        error: settings.firstLayerHeightError || 'Invalid first layer height value',
      });
      return;
    }

    setIsProcessing(true);
    setResult(null);
    setGenerationProgress({ progress: 0, message: 'Starting STL generation...' });
    setShowPopup(true);

    try {
      // Build settings object for the processor
      const stlSettings = {
        width: parseFloat(settings.width),
        height: parseFloat(settings.height),
        depth: 3,
        thickness: parseFloat(settings.thickness),
        firstLayerHeight: parseFloat(settings.firstLayerHeight),
        quality: 'high' as const,
        frameEnabled: settings.allowFrame,
        frameWidth: 2.0,
        numberOfLayers: parseInt(settings.layerNumber),
        layerHeight: parseFloat(settings.layerHeight),
        resolutionMultiplier: parseInt(settings.resolutionMultiplier),
        smoothing: {
          method: settings.smoothingMethod as any,
          strength: parseFloat(settings.smoothingStrength),
          passes: settings.smoothingMethod === 'geometric' ? 2 : 3,
        },
        orientation: 'horizontal' as const,
        negative: settings.negative,
      };

      const generationResult = await window.electron.generateSTL(imagePath, stlSettings);
      setResult(generationResult);
    } catch (error) {
      setResult({
        success: false,
        message: 'Failed to generate STL',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsProcessing(false);
      setGenerationProgress(null);
    }
  }, [
    imagePath,
    settings.thickness,
    settings.width,
    settings.height,
    settings.allowFrame,
    settings.resolutionMultiplier,
    settings.layerNumber,
    settings.layerHeight,
    settings.firstLayerHeight,
    settings.smoothingMethod,
    settings.smoothingStrength,
    settings.negative,
    settings.validateThickness,
    settings.validateResolutionMultiplier,
    settings.validateFirstLayerHeight,
    settings.thicknessError,
    settings.resolutionMultiplierError,
    settings.firstLayerHeightError,
  ]);

  const handleSaveFile = useCallback(async () => {
    if (result?.stlContent && result?.suggestedFilename) {
      try {
        // Trigger browser download
        const blob = new Blob([result.stlContent], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.suggestedFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setShowPopup(false);
      } catch (error) {
        logger.error('Error saving file:', error);
      }
    }
  }, [result]);

  const handleOpenInSlicer = useCallback(async () => {
    if (!result?.stlContent) {
      setShowPopup(true);
      setResult({
        success: false,
        message: 'No STL file available',
        error: 'Please generate an STL file first before opening in slicer.',
      });
      return;
    }

    try {
      await window.electron.openInSlicer(
        result.stlContent,
        true,
        result.suggestedFilename || 'lithophane.stl'
      );
    } catch (error) {
      setShowPopup(true);
      setResult({
        success: false,
        message: 'Failed to open in slicer',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  }, [result, setShowPopup, setResult]);

  return {
    isProcessing,
    result,
    showPopup,
    generationProgress,
    setResult,
    setShowPopup,
    setGenerationProgress,
    handleGenerateSTL,
    handleSaveFile,
    handleOpenInSlicer,
  };
};

