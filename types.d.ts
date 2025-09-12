export type Statistics ={
    cpuUsage:number,
    ramUsage:number,
    storageUsage: number
};

export type StaticData ={
    totalStorage: number;
    cpuModel: string;
    totalMemoryGB: number;
};

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
    statistics: Statistics;
    getStaticData: StaticData;
    processImage: ImageProcessingResult;
    generateSTL: ImageProcessingResult;
    selectImage: string | null;
    getImagePreview: string | null;
};

declare global {
    interface Window{
        electron: {
            subscribeStatistic: (callback: (statistic: Statistics) => void ) => void,
            getStaticData:() => Promise <StaticData>;
            processImage: (imagePath: string, settings: LithophaneSettings) => Promise<ImageProcessingResult>;
            generateSTL: (imagePath: string, settings: LithophaneSettings) => Promise<ImageProcessingResult>;
            selectImage: () => Promise<string | null>;
            getImagePreview: (imagePath: string) => Promise<string | null>;
        };
    }
}