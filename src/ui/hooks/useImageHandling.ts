import { useState, useCallback, useRef } from 'react';
import type { ImageProcessingResult } from '../../../types';
import { logger } from '../utils/logger';

export const useImageHandling = (
  setWidth: (width: string) => void,
  setHeight: (height: string) => void,
  setResult: (result: ImageProcessingResult | null) => void,
  setShowPopup: (show: boolean) => void
) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imagePath, setImagePath] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);

  const loadImageFromPath = useCallback(async (path: string) => {
    setImagePath(path);
    // Save the image path to preferences
    try {
      await window.electron.setPreference('lastImagePath', path);
    } catch (error) {
      logger.error('Error saving image path:', error);
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
        };
        img.src = previewUrl;
      } else {
        setSelectedImage(null);
      }
    } catch (error) {
      logger.error('Error getting image preview:', error);
      setSelectedImage(null);
    }
    setResult(null);
  }, [setWidth, setHeight, setResult]);

  const handleImageSelect = useCallback(async () => {
    try {
      const path = await window.electron.selectImage();
      if (path) {
        await loadImageFromPath(path);
      }
    } catch (error) {
      logger.error('Error selecting image:', error);
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

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        const file = files[0];

        // Check if it's an image file
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.bmp', '.gif'];
        const fileName = file.name.toLowerCase();
        const isImage = imageExtensions.some((ext) => fileName.endsWith(ext));

        if (!isImage) {
          setShowPopup(true);
          setResult({
            success: false,
            message: 'Invalid file type',
            error: 'Please drop an image file (jpg, jpeg, png, bmp, or gif).',
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
          logger.error('Error handling dropped file:', error);
          setShowPopup(true);
          setResult({
            success: false,
            message: 'Error loading file',
            error:
              error instanceof Error
                ? error.message
                : 'Could not load the dropped file. Please use the file picker instead.',
          });
        }
      }
    },
    [loadImageFromPath, setShowPopup, setResult]
  );

  return {
    selectedImage,
    imagePath,
    isDragging,
    handleImageSelect,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    loadImageFromPath,
  };
};

