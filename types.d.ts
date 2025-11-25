
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

export type UserPreferences = {
    theme: 'light' | 'dark' | 'high-contrast';
    defaultThickness: string;
    defaultWidth: string;
    defaultHeight: string;
    defaultLayerHeight: string;
    defaultLayerNumber: string;
    defaultResolutionMultiplier: string;
    defaultFirstLayerHeight: string;
    defaultSmoothingMethod: string;
    defaultSmoothingStrength: string;
    defaultAllowFrame: boolean;
    defaultNegative: boolean;
    windowBounds?: {
        width: number;
        height: number;
        x?: number;
        y?: number;
    };
    lastImagePath?: string;
    lastSaveDirectory?: string;
    
    // Slicer configuration
    slicerPath?: string;
};

export type EventPayloadMapping ={
    processImage: ImageProcessingResult;
    generateSTL: ImageProcessingResult;
    selectImage: string | null;
    getImagePreview: string | null;
    getTheme: 'light' | 'dark' | 'high-contrast';
    setTheme: 'light' | 'dark' | 'high-contrast';
    openSettings: void;
    getPreferences: UserPreferences;
    getPreference: any;
    setPreference: any;
    setPreferences: UserPreferences;
    resetPreferences: UserPreferences;
    selectSlicer: string | null;
    openInSlicer: { success: boolean; filePath?: string };
    handleDroppedFile: string;
};

declare global {
    interface Window{
        electron: {
            processImage: (imagePath: string, settings: LithophaneSettings) => Promise<ImageProcessingResult>;
            generateSTL: (imagePath: string, settings: LithophaneSettings) => Promise<ImageProcessingResult>;
            selectImage: () => Promise<string | null>;
            getImagePreview: (imagePath: string) => Promise<string | null>;
    getTheme: () => Promise<'light' | 'dark' | 'high-contrast'>;
    setTheme: (theme: 'light' | 'dark' | 'high-contrast') => Promise<'light' | 'dark' | 'high-contrast'>;
            openSettings: () => Promise<void>;
            getPreferences: () => Promise<UserPreferences>;
            getPreference: (key: keyof UserPreferences) => Promise<any>;
            setPreference: (key: keyof UserPreferences, value: any) => Promise<any>;
            setPreferences: (preferences: Partial<UserPreferences>) => Promise<UserPreferences>;
            resetPreferences: () => Promise<UserPreferences>;
            selectSlicer: () => Promise<string | null>;
            openInSlicer: (filePathOrContent: string, isContent?: boolean, filename?: string) => Promise<{ success: boolean; filePath?: string }>;
            handleDroppedFile: (fileDataBase64: string, fileName: string) => Promise<string>;
            onThemeChanged: (callback: (theme: 'light' | 'dark' | 'high-contrast') => void) => void;
            onMenuSelectImage: (callback: () => void) => void;
            onMenuGenerateSTL: (callback: () => void) => void;
            onSTLGenerationProgress: (callback: (progress: { progress: number; message: string }) => void) => void;
        };
    }
}