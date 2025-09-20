
export type SmoothingMethod = 'geometric' | 'laplacian' | 'none';

export type SmoothingOptions = {
    method: SmoothingMethod;
    strength?: number;
    passes?: number;
};

export type LithophaneSettings = {
    width: number;
    height: number;
    depth: number;
    thickness: number;
    firstLayerHeight: number;
    quality: 'low' | 'medium' | 'high';
    frameEnabled: boolean;
    frameWidth: number;
    numberOfLayers: number;
    layerHeight: number;
    resolutionMultiplier: number;
    orientation: 'horizontal' | 'vertical';
    smoothing?: SmoothingOptions;
    negative?: boolean;
};

export type ImageProcessingResult = {
    success: boolean;
    message: string;
    stlPath?: string;
    stlContent?: string;
    suggestedFilename?: string;
    error?: string;
    processedImageData?: Buffer;
};

export type EventPayloadMapping ={
    processImage: ImageProcessingResult;
    generateSTL: ImageProcessingResult;
    selectImage: string | null;
    getImagePreview: string | null;
};

declare global {
    interface Window{
        electron: {
            processImage: (imagePath: string, settings: LithophaneSettings) => Promise<ImageProcessingResult>;
            generateSTL: (imagePath: string, settings: LithophaneSettings) => Promise<ImageProcessingResult>;
            selectImage: () => Promise<string | null>;
            getImagePreview: (imagePath: string) => Promise<string | null>;
        };
    }
}