import { useState, useCallback, useRef } from 'react';
import { logger } from '../utils/logger';

export interface Settings {
  thickness: string;
  width: string;
  height: string;
  allowFrame: boolean;
  layerHeight: string;
  layerNumber: string;
  resolutionMultiplier: string;
  firstLayerHeight: string;
  smoothingMethod: string;
  smoothingStrength: string;
  negative: boolean;
}

export interface SettingsErrors {
  thickness: string;
  resolutionMultiplier: string;
  firstLayerHeight: string;
}

export const useSettings = () => {
  const [thickness, setThickness] = useState<string>('0.8');
  const [thicknessError, setThicknessError] = useState<string>('');
  const [width, setWidth] = useState<string>('300');
  const [height, setHeight] = useState<string>('290');
  const [allowFrame, setAllowFrame] = useState<boolean>(false);
  const [layerHeight, setLayerHeight] = useState<string>('0.2');
  const [layerNumber, setLayerNumber] = useState<string>('8');
  const [resolutionMultiplier, setResolutionMultiplier] = useState<string>('4');
  const [resolutionMultiplierError, setResolutionMultiplierError] = useState<string>('');
  const [firstLayerHeight, setFirstLayerHeight] = useState<string>('0.8');
  const [firstLayerHeightError, setFirstLayerHeightError] = useState<string>('');
  const [smoothingMethod, setSmoothingMethod] = useState<string>('laplacian');
  const [smoothingStrength, setSmoothingStrength] = useState<string>('0.1');
  const [negative, setNegative] = useState<boolean>(false);

  // Auto-calculate thickness from layer height/number
  const calculateThickness = useCallback(
    (height: string, number: string): string => {
      const h = parseFloat(height);
      const n = parseFloat(number);
      const flh = parseFloat(firstLayerHeight);
      if (!isNaN(h) && !isNaN(n) && !isNaN(flh) && h > 0 && n > 0) {
        // First layer + (remaining layers × layer height)
        return (flh + h * Math.max(0, n - 1)).toFixed(2);
      }
      return thickness;
    },
    [firstLayerHeight, thickness]
  );

  // Auto-calculate layer number from thickness
  const calculateLayerNumber = useCallback(
    (thick: string, height: string): string => {
      const t = parseFloat(thick);
      const h = parseFloat(height);
      const flh = parseFloat(firstLayerHeight);
      if (!isNaN(t) && !isNaN(h) && !isNaN(flh) && h > 0 && t > 0) {
        if (t <= flh) {
          return '1';
        }
        // 1 (first layer) + ceil(remaining thickness / layer height)
        const remaining = Math.max(0, t - flh);
        return Math.max(1, 1 + Math.round(remaining / h)).toString();
      }
      return layerNumber;
    },
    [firstLayerHeight, layerNumber]
  );

  const validateThickness = useCallback((value: string): boolean => {
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
  }, []);

  const validateResolutionMultiplier = useCallback((value: string): boolean => {
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
  }, []);

  const validateFirstLayerHeight = useCallback((value: string): boolean => {
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
  }, []);

  const handleThicknessChange = useCallback(
    (value: string) => {
      setThickness(value);
      if (value.trim() === '') {
        setThicknessError('');
      } else {
        validateThickness(value);
        // Recalculate layer count
        const newLayerNumber = calculateLayerNumber(value, layerHeight);
        setLayerNumber(newLayerNumber);
      }
    },
    [validateThickness, calculateLayerNumber, layerHeight]
  );

  const handleLayerHeightChange = useCallback(
    (value: string) => {
      setLayerHeight(value);
      // Recalculate everything
      const newThickness = calculateThickness(value, layerNumber);
      setThickness(newThickness);
      setThicknessError(''); // Clear errors
    },
    [calculateThickness, layerNumber]
  );

  const handleLayerNumberChange = useCallback(
    (value: string) => {
      setLayerNumber(value);
      // Recalculate thickness
      const newThickness = calculateThickness(layerHeight, value);
      setThickness(newThickness);
      setThicknessError(''); // Clear errors
    },
    [calculateThickness, layerHeight]
  );

  const handleResolutionMultiplierChange = useCallback(
    (value: string) => {
      setResolutionMultiplier(value);
      if (value.trim() === '') {
        setResolutionMultiplierError('');
      } else {
        validateResolutionMultiplier(value);
      }
    },
    [validateResolutionMultiplier]
  );

  const handleFirstLayerHeightChange = useCallback(
    (value: string) => {
      setFirstLayerHeight(value);
      if (value.trim() === '') {
        setFirstLayerHeightError('');
      } else {
        validateFirstLayerHeight(value);
      }
    },
    [validateFirstLayerHeight]
  );

  // Auto-save preferences (debounced to avoid too many writes)
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
        logger.error('Error saving preferences:', error);
      }
    }, 1000); // Wait 1 second after last change
  }, [
    thickness,
    width,
    height,
    layerHeight,
    layerNumber,
    resolutionMultiplier,
    firstLayerHeight,
    smoothingMethod,
    smoothingStrength,
    allowFrame,
    negative,
  ]);

  return {
    // State values
    thickness,
    thicknessError,
    width,
    height,
    allowFrame,
    layerHeight,
    layerNumber,
    resolutionMultiplier,
    resolutionMultiplierError,
    firstLayerHeight,
    firstLayerHeightError,
    smoothingMethod,
    smoothingStrength,
    negative,
    // Setters
    setThickness: handleThicknessChange,
    setWidth,
    setHeight,
    setAllowFrame,
    setLayerHeight: handleLayerHeightChange,
    setLayerNumber: handleLayerNumberChange,
    setResolutionMultiplier: handleResolutionMultiplierChange,
    setFirstLayerHeight: handleFirstLayerHeightChange,
    setSmoothingMethod,
    setSmoothingStrength,
    setNegative,
    // Validation functions
    validateThickness,
    validateResolutionMultiplier,
    validateFirstLayerHeight,
    // Load saved preferences
    loadFromPreferences: (prefs: any) => {
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
    },
    // Save function
    savePreferences,
    savePreferencesTimeoutRef,
  };
};

