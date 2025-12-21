import { useState, useCallback, useRef } from 'react';
import { logger } from '../utils/logger';
import type { UserPreferences } from '../../../types';

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
  lockAspectRatio: boolean;
}

export interface SettingsErrors {
  thickness: string;
  resolutionMultiplier: string;
  firstLayerHeight: string;
  layerNumber: string;
  width: string;
  height: string;
  smoothingStrength: string;
}

export const useSettings = () => {
  const [thickness, setThickness] = useState<string>('0.8');
  const [thicknessError, setThicknessError] = useState<string>('');
  const [width, setWidth] = useState<string>('250');
  const [widthError, setWidthError] = useState<string>('');
  const [height, setHeight] = useState<string>('250');
  const [heightError, setHeightError] = useState<string>('');
  const [allowFrame, setAllowFrame] = useState<boolean>(false);
  const [layerHeight, setLayerHeight] = useState<string>('0.2');
  const [layerNumber, setLayerNumber] = useState<string>('8');
  const [layerNumberError, setLayerNumberError] = useState<string>('');
  const [resolutionMultiplier, setResolutionMultiplier] = useState<string>('4');
  const [resolutionMultiplierError, setResolutionMultiplierError] = useState<string>('');
  const [firstLayerHeight, setFirstLayerHeight] = useState<string>('0.8');
  const [firstLayerHeightError, setFirstLayerHeightError] = useState<string>('');
  const [smoothingMethod, setSmoothingMethod] = useState<string>('laplacian');
  const [smoothingStrength, setSmoothingStrength] = useState<string>('0.1');
  const [smoothingStrengthError, setSmoothingStrengthError] = useState<string>('');
  const [negative, setNegative] = useState<boolean>(false);
  const [lockAspectRatio, setLockAspectRatio] = useState<boolean>(false);
  const aspectRatioRef = useRef<number | null>(null);

  // Handle lock aspect ratio toggle
  const handleLockAspectRatioChange = useCallback(
    (locked: boolean) => {
      setLockAspectRatio(locked);
      // When enabling the lock, capture the current aspect ratio
      if (locked) {
        const widthNum = parseFloat(width);
        const heightNum = parseFloat(height);
        if (!isNaN(widthNum) && !isNaN(heightNum) && widthNum > 0 && heightNum > 0) {
          aspectRatioRef.current = widthNum / heightNum;
        }
      }
    },
    [width, height]
  );

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

  const validateLayerNumber = useCallback((value: string): boolean => {
    const numValue = parseInt(value);
    if (isNaN(numValue)) {
      setLayerNumberError('Layer number must be a number');
      return false;
    }
    if (numValue < 1) {
      setLayerNumberError('Layer number must be at least 1');
      return false;
    }
    setLayerNumberError('');
    return true;
  }, []);

  const validateWidth = useCallback((value: string): boolean => {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      setWidthError('Width must be a number');
      return false;
    }
    if (numValue < 1) {
      setWidthError('Width must be at least 1mm');
      return false;
    }
    if (numValue > 250) {
      setWidthError('Width must be at most 250 mm');
      return false;
    }
    setWidthError('');
    return true;
  }, []);

  const validateHeight = useCallback((value: string): boolean => {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      setHeightError('Height must be a number');
      return false;
    }
    if (numValue < 1) {
      setHeightError('Height must be at least 1mm');
      return false;
    }
    if (numValue > 300) {
      setHeightError('Height must be at most 250 mm');
      return false;
    }
    setHeightError('');
    return true;
  }, []);

  const validateSmoothingStrength = useCallback((value: string): boolean => {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      setSmoothingStrengthError('Smoothing strength must be a number');
      return false;
    }
    if (numValue < 0.01) {
      setSmoothingStrengthError('Smoothing strength must be at least 0.01');
      return false;
    }
    if (numValue > 1.0) {
      setSmoothingStrengthError('Smoothing strength must be at most 1.0');
      return false;
    }
    setSmoothingStrengthError('');
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
      if (value.trim() === '') {
        setLayerNumberError('');
      } else {
        validateLayerNumber(value);
      }
      // Recalculate thickness
      const newThickness = calculateThickness(layerHeight, value);
      setThickness(newThickness);
      setThicknessError(''); // Clear errors
    },
    [calculateThickness, layerHeight, validateLayerNumber]
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

  const handleSmoothingStrengthChange = useCallback(
    (value: string) => {
      setSmoothingStrength(value);
      if (value.trim() === '') {
        setSmoothingStrengthError('');
      } else {
        validateSmoothingStrength(value);
      }
    },
    [validateSmoothingStrength]
  );

  // Set aspect ratio from current width/height
  const setAspectRatio = useCallback((w: string, h: string) => {
    const widthNum = parseFloat(w);
    const heightNum = parseFloat(h);
    if (!isNaN(widthNum) && !isNaN(heightNum) && widthNum > 0 && heightNum > 0) {
      aspectRatioRef.current = widthNum / heightNum;
    }
  }, []);

  // Handle width change with aspect ratio locking
  const handleWidthChange = useCallback(
    (value: string) => {
      if (value.trim() === '') {
        setWidthError('');
      } else {
        validateWidth(value);
      }
      if (lockAspectRatio && aspectRatioRef.current !== null) {
        const widthNum = parseFloat(value);
        if (!isNaN(widthNum) && widthNum > 0) {
          const newHeight = (widthNum / aspectRatioRef.current).toFixed(0);
          setWidth(value);
          setHeight(newHeight);
        } else {
          setWidth(value);
        }
      } else {
        setWidth(value);
      }
    },
    [lockAspectRatio, validateWidth]
  );

  // Handle height change with aspect ratio locking
  const handleHeightChange = useCallback(
    (value: string) => {
      if (value.trim() === '') {
        setHeightError('');
      } else {
        validateHeight(value);
      }
      if (lockAspectRatio && aspectRatioRef.current !== null) {
        const heightNum = parseFloat(value);
        if (!isNaN(heightNum) && heightNum > 0) {
          const newWidth = (heightNum * aspectRatioRef.current).toFixed(0);
          setHeight(value);
          setWidth(newWidth);
        } else {
          setHeight(value);
        }
      } else {
        setHeight(value);
      }
    },
    [lockAspectRatio, validateHeight]
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
        defaultLockAspectRatio: lockAspectRatio,
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
    lockAspectRatio,
  ]);

  return {
    // State values
    thickness,
    thicknessError,
    width,
    widthError,
    height,
    heightError,
    allowFrame,
    layerHeight,
    layerNumber,
    layerNumberError,
    resolutionMultiplier,
    resolutionMultiplierError,
    firstLayerHeight,
    firstLayerHeightError,
    smoothingMethod,
    smoothingStrength,
    smoothingStrengthError,
    negative,
    lockAspectRatio,
    // Setters
    setThickness: handleThicknessChange,
    setWidth: handleWidthChange,
    setHeight: handleHeightChange,
    setAllowFrame,
    setLockAspectRatio: handleLockAspectRatioChange,
    setAspectRatio,
    setLayerHeight: handleLayerHeightChange,
    setLayerNumber: handleLayerNumberChange,
    setResolutionMultiplier: handleResolutionMultiplierChange,
    setFirstLayerHeight: handleFirstLayerHeightChange,
    setSmoothingMethod,
    setSmoothingStrength: handleSmoothingStrengthChange,
    setNegative,
    // Validation functions
    validateThickness,
    validateResolutionMultiplier,
    validateFirstLayerHeight,
    validateLayerNumber,
    validateWidth,
    validateHeight,
    validateSmoothingStrength,
    // Load saved preferences
    loadFromPreferences: (prefs: UserPreferences) => {
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
      if (prefs.defaultLockAspectRatio !== undefined) setLockAspectRatio(prefs.defaultLockAspectRatio);
    },
    // Save function
    savePreferences,
    savePreferencesTimeoutRef,
  };
};

