import sharp from 'sharp';
import type { LithophaneSettings, ImageProcessingResult } from '../../../types.js';
import { applySmoothing } from '../services/smoothing/smoothingAlgorithms.js';
import { logger } from '../utils/logger.js';


export class LithophaneProcessor {
    private static instance: LithophaneProcessor;

    private constructor() {}

    public static getInstance(): LithophaneProcessor {
        if (!LithophaneProcessor.instance) {
            LithophaneProcessor.instance = new LithophaneProcessor();
        }
        return LithophaneProcessor.instance;
    }

    public async processImage(imagePath: string, settings: LithophaneSettings): Promise<ImageProcessingResult> {
        try {
            const image = sharp(imagePath);
            const metadata = await image.metadata();
            
            if (!metadata.width || !metadata.height) {
                return {
                    success: false,
                    message: 'Invalid image metadata',
                    error: 'Could not read image dimensions'
                };
            }

            // Scale up resolution for smoother surfaces (default 4x)
            const internalWidth = settings.width * (settings.resolutionMultiplier || 4);
            const internalHeight = settings.height * (settings.resolutionMultiplier || 4);
            
            logger.debug(`processImage - Resizing image to ${internalWidth}x${internalHeight} (${settings.resolutionMultiplier || 4}x resolution)`);
            
            const processedImage = await image
                .grayscale()
                .resize(internalWidth, internalHeight)
                .raw()
                .toBuffer();

            return {
                success: true,
                message: 'Image processed successfully',
                processedImageData: processedImage
            };
        } catch (error) {
            return {
                success: false,
                message: 'Failed to process image',
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    public async generateSTL(
        imagePath: string,
        settings: LithophaneSettings,
        progressCallback?: (progress: number, message: string) => void
    ): Promise<ImageProcessingResult> {
        try {
            const reportProgress = (progress: number, message: string) => {
                if (progressCallback) {
                    progressCallback(progress, message);
                }
            };

            reportProgress(5, 'Loading and processing image...');
            
            // Get the processed image data first
            const processResult = await this.processImage(imagePath, settings);
            if (!processResult.success) {
                return processResult;
            }

            if (!processResult.processedImageData) {
                return {
                    success: false,
                    message: 'Failed to get processed image data',
                    error: 'No processed image data available'
                };
            }

            const processedImage = processResult.processedImageData;
            const internalWidth = settings.width * (settings.resolutionMultiplier || 4);
            const internalHeight = settings.height * (settings.resolutionMultiplier || 4);

            logger.debug(`Using processed image data, buffer size: ${processedImage.length} bytes`);
            logger.debug(`Expected pixels: ${internalWidth * internalHeight} = ${internalWidth * internalHeight} pixels`);
            logger.debug(`Buffer per pixel: ${processedImage.length / (internalWidth * internalHeight)} bytes per pixel`);
            logger.debug(`Image dimensions: ${internalWidth}x${internalHeight} (${settings.resolutionMultiplier || 4}x resolution)`);

            reportProgress(20, 'Generating height map...');

            const result = await this.generateSTLContent(processedImage, settings, reportProgress);
            
            reportProgress(100, 'STL generation complete!');
            
            return {
                success: true,
                message: 'STL file generated successfully',
                stlContent: result.stlContent,
                suggestedFilename: `lithophane_${settings.width}x${settings.height}x${settings.thickness}mm.stl`
            };
        } catch (error) {
            return {
                success: false,
                message: 'Failed to generate STL',
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    private async generateSTLContent(
        imageData: Buffer,
        settings: LithophaneSettings,
        progressCallback?: (progress: number, message: string) => void
    ): Promise<{
        stlContent: string;
    }> {
        const reportProgress = (progress: number, message: string) => {
            if (progressCallback) {
                progressCallback(progress, message);
            }
        };

        const { width, height, thickness, firstLayerHeight, quality } = settings;
        const resolutionMultiplier = settings.resolutionMultiplier || 4;
        const internalWidth = width * resolutionMultiplier;
        const internalHeight = height * resolutionMultiplier;
        
        logger.info(`Generating ${quality} quality lithophane: ${internalWidth}x${internalHeight} (${resolutionMultiplier}x resolution)`);
        logger.info(`Using thickness: ${thickness}mm for Z-axis`);
        logger.info(`Image dimensions: ${width}x${height}mm (X and Y axes)`);
        logger.info(`Final STL will be: ${width}x${height}x${thickness}mm`);
        
        reportProgress(30, 'Processing image data and enhancing edges...');
        
        // Enhance edges with unsharp mask
        const enhancedBrightness = this.processImageData(imageData, internalWidth, internalHeight);
        
        reportProgress(45, 'Creating height map from brightness values...');
        
        // Convert brightness to height values
        const heightMap = this.createHeightMap(
            enhancedBrightness,
            internalWidth,
            internalHeight,
            settings
        );
        
        reportProgress(60, 'Applying smoothing and normalizing...');
        
        // Smooth it out and make sure thickness is correct
        this.applySmoothingAndNormalize(
            heightMap,
            internalWidth,
            internalHeight,
            settings
        );
        
        reportProgress(75, 'Generating 3D geometry...');
        
        // Build the mesh
        const { vertices, normals } = this.generateGeometry(
            heightMap,
            internalWidth,
            internalHeight,
            width,
            height,
            resolutionMultiplier,
            settings
        );
        
        reportProgress(90, 'Converting to STL format...');
        
        // Write out the STL file
        const stlContent = this.verticesToSTL(vertices, normals);
        
        logger.info(`STL generation complete:`);
        logger.info(`- Total vertices: ${vertices.length / 3}`);
        logger.info(`- Final dimensions: ${width}x${height}x${thickness}mm`);
        logger.info(`- First layer height: ${firstLayerHeight}mm`);
        
        return { stlContent };
    }

    // Convert raw image data to brightness values and sharpen edges
    private processImageData(imageData: Buffer, width: number, height: number): Float32Array {
        const sourceBrightness = new Float32Array(width * height);
        for (let i = 0; i < width * height && i < imageData.length; i++) {
            sourceBrightness[i] = Math.min(1, Math.max(0, imageData[i] / 255));
        }

        // Unsharp mask: amount=1.0, radius=1 (3x3 kernel), threshold=0.02 to skip noise
        return this.applyUnsharpMask(sourceBrightness, width, height, 1.0, 1, 0.02);
    }

    // Map brightness to height using discrete layers (works better for 3D printing)
    private createHeightMap(
        enhancedBrightness: Float32Array,
        internalWidth: number,
        internalHeight: number,
        settings: LithophaneSettings
    ): number[][] {
        const { thickness, firstLayerHeight } = settings;
        
        // Find min/max for normalization
        const brightnessValues: number[] = [];
        for (let i = 0; i < enhancedBrightness.length; i++) {
            brightnessValues.push(enhancedBrightness[i]);
        }
        
        let minBrightness = Infinity;
        let maxBrightness = -Infinity;
        for (const value of brightnessValues) {
            minBrightness = Math.min(minBrightness, value);
            maxBrightness = Math.max(maxBrightness, value);
        }
        
        logger.debug(`Original brightness range: min=${minBrightness.toFixed(3)}, max=${maxBrightness.toFixed(3)}`);
        
        // Set up discrete layers (first layer is thicker, rest are evenly spaced)
        const firstLayerThickness = firstLayerHeight;
        const remainingThickness = thickness - firstLayerHeight;
        const totalUserLayers = typeof settings.numberOfLayers === 'number' && settings.numberOfLayers > 0
            ? settings.numberOfLayers
            : 14;
        const numberOfDiscreteLayers = Math.max(1, totalUserLayers - 1);
        const layerThicknessIncrement = numberOfDiscreteLayers > 0 ? (remainingThickness / numberOfDiscreteLayers) : 0;
        
        logger.debug(`DISCRETE LAYER APPROACH:`);
        logger.debug(`- First layer thickness: ${firstLayerThickness.toFixed(3)}mm`);
        logger.debug(`- Remaining thickness: ${remainingThickness.toFixed(3)}mm`);
        logger.debug(`- Number of additional discrete layers: ${numberOfDiscreteLayers}`);
        logger.debug(`- Thickness increment per layer: ${layerThicknessIncrement.toFixed(3)}mm`);
        logger.debug(`- Total discrete levels: ${numberOfDiscreteLayers + 1} (including first layer)`);
        
        // Create height map
        const heightMap: number[][] = [];
        for (let y = 0; y < internalHeight; y++) {
            heightMap[y] = [];
            for (let x = 0; x < internalWidth; x++) {
                const pixelIndex = y * internalWidth + x;
                
                if (pixelIndex < enhancedBrightness.length) {
                    const brightness = enhancedBrightness[pixelIndex];
                    
                    // Invert: bright pixels = thin (layer 0), dark pixels = thick
                    let normalizedBrightness = 1 - ((brightness - minBrightness) / (maxBrightness - minBrightness));
                    
                    // Flip if negative mode is on
                    if (settings.negative) {
                        normalizedBrightness = 1 - normalizedBrightness;
                    }
                    
                    // Figure out which layer this pixel belongs to
                    const layerIndex = Math.floor(normalizedBrightness * (numberOfDiscreteLayers + 1));
                    const clampedLayerIndex = Math.min(layerIndex, numberOfDiscreteLayers);
                    
                    // Calculate the actual height for this layer
                    const heightValue = clampedLayerIndex === 0
                        ? firstLayerThickness
                        : firstLayerThickness + (clampedLayerIndex * layerThicknessIncrement);
                    
                    heightMap[y][x] = heightValue;
                } else {
                    heightMap[y][x] = firstLayerHeight;
                }
            }
        }
        
        return heightMap;
    }

    // Smooth the height map and make sure it fits the requested thickness range
    private applySmoothingAndNormalize(
        heightMap: number[][],
        internalWidth: number,
        internalHeight: number,
        settings: LithophaneSettings
    ): void {
        const { thickness, firstLayerHeight } = settings;
        const firstLayerThickness = firstLayerHeight;
        
        // Smooth it out
        const smoothingOptions = settings.smoothing || { method: 'geometric', passes: 2 };
        applySmoothing(heightMap, internalWidth, internalHeight, smoothingOptions);

        // Make sure the thickness range is correct after smoothing
        let currentMin = Infinity;
        let currentMax = -Infinity;
        for (let y = 0; y < internalHeight; y++) {
            for (let x = 0; x < internalWidth; x++) {
                const v = heightMap[y][x];
                if (v < currentMin) currentMin = v;
                if (v > currentMax) currentMax = v;
            }
        }
        
        const targetMin = firstLayerThickness;
        const targetMax = thickness;
        const srcSpan = currentMax - currentMin;
        const dstSpan = targetMax - targetMin;
        
        if (srcSpan > 1e-6 && dstSpan > 0) {
            const scale = dstSpan / srcSpan;
            for (let y = 0; y < internalHeight; y++) {
                for (let x = 0; x < internalWidth; x++) {
                    heightMap[y][x] = targetMin + (heightMap[y][x] - currentMin) * scale;
                }
            }
        } else {
            // Edge case: just clamp everything
            for (let y = 0; y < internalHeight; y++) {
                for (let x = 0; x < internalWidth; x++) {
                    heightMap[y][x] = Math.min(targetMax, Math.max(targetMin, heightMap[y][x]));
                }
            }
        }
    }

    // Build the 3D mesh from the height map
    private generateGeometry(
        heightMap: number[][],
        internalWidth: number,
        internalHeight: number,
        width: number,
        height: number,
        resolutionMultiplier: number,
        settings: LithophaneSettings
    ): { vertices: number[]; normals: number[] } {
        const vertices: number[] = [];
        const normals: number[] = [];
        
        // Build all the surfaces
        this.addTopSurface(vertices, normals, heightMap, internalWidth, internalHeight, width, height, resolutionMultiplier);
        this.addBottomSurface(vertices, normals, width, height);
        this.addSideWalls(vertices, normals, heightMap, internalWidth, internalHeight, width, height, resolutionMultiplier);
        
        // Add frame if requested
        if (settings.frameEnabled) {
            this.addFrame(vertices, normals, width, height, settings.thickness, settings.frameWidth || 2.0);
        }
        
        logger.debug('Geometry generated:', { verticesCount: vertices.length, normalsCount: normals.length });
        this.logCoordinateRanges(vertices);
        
        return { vertices, normals };
    }

    // Create the top surface triangles from the height map
    private addTopSurface(
        vertices: number[],
        normals: number[],
        heightMap: number[][],
        internalWidth: number,
        internalHeight: number,
        width: number,
        height: number,
        resolutionMultiplier: number
    ): void {
        for (let y = 0; y < internalHeight - 1; y++) {
            for (let x = 0; x < internalWidth - 1; x++) {
                const x1 = (x / resolutionMultiplier - width / 2);
                const y1 = (y / resolutionMultiplier - height / 2);
                const z1 = heightMap[y][x];
                
                const x2 = ((x + 1) / resolutionMultiplier - width / 2);
                const y2 = (y / resolutionMultiplier - height / 2);
                const z2 = heightMap[y][x + 1];
                
                const x3 = (x / resolutionMultiplier - width / 2);
                const y3 = ((y + 1) / resolutionMultiplier - height / 2);
                const z3 = heightMap[y + 1][x];
                
                const x4 = ((x + 1) / resolutionMultiplier - width / 2);
                const y4 = ((y + 1) / resolutionMultiplier - height / 2);
                const z4 = heightMap[y + 1][x + 1];
                
                // Split quad into two triangles
                vertices.push(x1, y1, z1, x2, y2, z2, x3, y3, z3);
                normals.push(0, 0, 1, 0, 0, 1, 0, 0, 1);
                
                vertices.push(x2, y2, z2, x4, y4, z4, x3, y3, z3);
                normals.push(0, 0, 1, 0, 0, 1, 0, 0, 1);
            }
        }
    }

    // Flat bottom surface (z=0)
    private addBottomSurface(
        vertices: number[],
        normals: number[],
        width: number,
        height: number
    ): void {
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        
        const bottomLeft = [-halfWidth, -halfHeight, 0];
        const bottomRight = [halfWidth, -halfHeight, 0];
        const topLeft = [-halfWidth, halfHeight, 0];
        const topRight = [halfWidth, halfHeight, 0];
        
        // Two triangles for the flat bottom
        vertices.push(
            bottomLeft[0], bottomLeft[1], bottomLeft[2],
            topLeft[0], topLeft[1], topLeft[2],
            bottomRight[0], bottomRight[1], bottomRight[2]
        );
        normals.push(0, 0, -1, 0, 0, -1, 0, 0, -1);
        
        vertices.push(
            bottomRight[0], bottomRight[1], bottomRight[2],
            topLeft[0], topLeft[1], topLeft[2],
            topRight[0], topRight[1], topRight[2]
        );
        normals.push(0, 0, -1, 0, 0, -1, 0, 0, -1);
    }

    // Build the four side walls
    private addSideWalls(
        vertices: number[],
        normals: number[],
        heightMap: number[][],
        internalWidth: number,
        internalHeight: number,
        width: number,
        height: number,
        resolutionMultiplier: number
    ): void {
        // Left side
        for (let y = 0; y < internalHeight - 1; y++) {
            const x1 = -width / 2;
            const y1 = (y / resolutionMultiplier - height / 2);
            const z1 = 0;
            
            const x2 = -width / 2;
            const y2 = ((y + 1) / resolutionMultiplier - height / 2);
            const z2 = 0;
            
            const x3 = -width / 2;
            const y3 = (y / resolutionMultiplier - height / 2);
            const z3 = heightMap[y][0];
            
            const x4 = -width / 2;
            const y4 = ((y + 1) / resolutionMultiplier - height / 2);
            const z4 = heightMap[y + 1][0];
            
            vertices.push(x1, y1, z1, x2, y2, z2, x3, y3, z3);
            normals.push(-1, 0, 0, -1, 0, 0, -1, 0, 0);
            
            vertices.push(x2, y2, z2, x4, y4, z4, x3, y3, z3);
            normals.push(-1, 0, 0, -1, 0, 0, -1, 0, 0);
        }

        // Right side
        for (let y = 0; y < internalHeight - 1; y++) {
            const x1 = width / 2;
            const y1 = (y / resolutionMultiplier - height / 2);
            const z1 = 0;
            
            const x2 = width / 2;
            const y2 = ((y + 1) / resolutionMultiplier - height / 2);
            const z2 = 0;
            
            const x3 = width / 2;
            const y3 = (y / resolutionMultiplier - height / 2);
            const z3 = heightMap[y][internalWidth - 1];
            
            const x4 = width / 2;
            const y4 = ((y + 1) / resolutionMultiplier - height / 2);
            const z4 = heightMap[y + 1][internalWidth - 1];
            
            vertices.push(x1, y1, z1, x3, y3, z3, x2, y2, z2);
            normals.push(1, 0, 0, 1, 0, 0, 1, 0, 0);
            
            vertices.push(x2, y2, z2, x3, y3, z3, x4, y4, z4);
            normals.push(1, 0, 0, 1, 0, 0, 1, 0, 0);
        }

        // Bottom edge
        for (let x = 0; x < internalWidth - 1; x++) {
            const x1 = (x / resolutionMultiplier - width / 2);
            const y1 = -height / 2;
            const z1 = 0;
            
            const x2 = ((x + 1) / resolutionMultiplier - width / 2);
            const y2 = -height / 2;
            const z2 = 0;
            
            const x3 = (x / resolutionMultiplier - width / 2);
            const y3 = -height / 2;
            const z3 = heightMap[0][x];
            
            const x4 = ((x + 1) / resolutionMultiplier - width / 2);
            const y4 = -height / 2;
            const z4 = heightMap[0][x + 1];
            
            vertices.push(x1, y1, z1, x3, y3, z3, x2, y2, z2);
            normals.push(0, -1, 0, 0, -1, 0, 0, -1, 0);
            
            vertices.push(x2, y2, z2, x3, y3, z3, x4, y4, z4);
            normals.push(0, -1, 0, 0, -1, 0, 0, -1, 0);
        }

        // Top edge
        for (let x = 0; x < internalWidth - 1; x++) {
            const x1 = (x / resolutionMultiplier - width / 2);
            const y1 = height / 2;
            const z1 = 0;
            
            const x2 = ((x + 1) / resolutionMultiplier - width / 2);
            const y2 = height / 2;
            const z2 = 0;
            
            const x3 = (x / resolutionMultiplier - width / 2);
            const y3 = height / 2;
            const z3 = heightMap[internalHeight - 1][x];
            
            const x4 = ((x + 1) / resolutionMultiplier - width / 2);
            const y4 = height / 2;
            const z4 = heightMap[internalHeight - 1][x + 1];
            
            vertices.push(x1, y1, z1, x2, y2, z2, x3, y3, z3);
            normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
            
            vertices.push(x2, y2, z2, x4, y4, z4, x3, y3, z3);
            normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
        }
    }

    // Add a frame border around the lithophane
    private addFrame(
        vertices: number[],
        normals: number[],
        width: number,
        height: number,
        thickness: number,
        frameWidth: number
    ): void {
        const frameHeight = thickness + 1.0;
        const outerWidth = width + frameWidth * 2;
        const outerHeight = height + frameWidth * 2;
        
        const outerCorners = [
            [-outerWidth/2, -outerHeight/2, 0],
            [outerWidth/2, -outerHeight/2, 0],
            [outerWidth/2, outerHeight/2, 0],
            [-outerWidth/2, outerHeight/2, 0]
        ];
        
        const innerCorners = [
            [-width/2, -height/2, 0],
            [width/2, -height/2, 0],
            [width/2, height/2, 0],
            [-width/2, height/2, 0]
        ];
        
        // Bottom of the frame
        for (let i = 0; i < 4; i++) {
            const next = (i + 1) % 4;
            
            vertices.push(
                outerCorners[i][0], outerCorners[i][1], outerCorners[i][2],
                outerCorners[next][0], outerCorners[next][1], outerCorners[next][2],
                innerCorners[i][0], innerCorners[i][1], innerCorners[i][2]
            );
            normals.push(0, 0, -1, 0, 0, -1, 0, 0, -1);
            
            vertices.push(
                outerCorners[next][0], outerCorners[next][1], outerCorners[next][2],
                innerCorners[next][0], innerCorners[next][1], innerCorners[next][2],
                innerCorners[i][0], innerCorners[i][1], innerCorners[i][2]
            );
            normals.push(0, 0, -1, 0, 0, -1, 0, 0, -1);
        }
        
        // Top of the frame
        for (let i = 0; i < 4; i++) {
            const next = (i + 1) % 4;
            
            vertices.push(
                outerCorners[i][0], outerCorners[i][1], outerCorners[i][2] + frameHeight,
                innerCorners[i][0], innerCorners[i][1], innerCorners[i][2] + frameHeight,
                outerCorners[next][0], outerCorners[next][1], outerCorners[next][2] + frameHeight
            );
            normals.push(0, 0, 1, 0, 0, 1, 0, 0, 1);
            
            vertices.push(
                outerCorners[next][0], outerCorners[next][1], outerCorners[next][2] + frameHeight,
                innerCorners[next][0], innerCorners[next][1], innerCorners[next][2] + frameHeight,
                innerCorners[i][0], innerCorners[i][1], innerCorners[i][2] + frameHeight
            );
            normals.push(0, 0, 1, 0, 0, 1, 0, 0, 1);
        }
        
        // Frame sides
        for (let i = 0; i < 4; i++) {
            const next = (i + 1) % 4;
            
            // Outer edge
            vertices.push(
                outerCorners[i][0], outerCorners[i][1], outerCorners[i][2],
                outerCorners[i][0], outerCorners[i][1], outerCorners[i][2] + frameHeight,
                outerCorners[next][0], outerCorners[next][1], outerCorners[next][2]
            );
            normals.push(-1, 0, 0, -1, 0, 0, -1, 0, 0);
            
            vertices.push(
                outerCorners[next][0], outerCorners[next][1], outerCorners[next][2],
                outerCorners[i][0], outerCorners[i][1], outerCorners[i][2] + frameHeight,
                outerCorners[next][0], outerCorners[next][1], outerCorners[next][2] + frameHeight
            );
            normals.push(-1, 0, 0, -1, 0, 0, -1, 0, 0);
            
            // Inner edge
            vertices.push(
                innerCorners[i][0], innerCorners[i][1], innerCorners[i][2],
                innerCorners[next][0], innerCorners[next][1], innerCorners[next][2],
                innerCorners[i][0], innerCorners[i][1], innerCorners[i][2] + frameHeight
            );
            normals.push(1, 0, 0, 1, 0, 0, 1, 0, 0);
            
            vertices.push(
                innerCorners[next][0], innerCorners[next][1], innerCorners[next][2],
                innerCorners[next][0], innerCorners[next][1], innerCorners[next][2] + frameHeight,
                innerCorners[i][0], innerCorners[i][1], innerCorners[i][2] + frameHeight
            );
            normals.push(1, 0, 0, 1, 0, 0, 1, 0, 0);
        }
    }

    // Debug helper - log the bounds of the generated mesh
    private logCoordinateRanges(vertices: number[]): void {
        if (vertices.length === 0) return;
        
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        
        for (let i = 0; i < vertices.length; i += 3) {
            minX = Math.min(minX, vertices[i]);
            maxX = Math.max(maxX, vertices[i]);
            minY = Math.min(minY, vertices[i + 1]);
            maxY = Math.max(maxY, vertices[i + 1]);
            minZ = Math.min(minZ, vertices[i + 2]);
            maxZ = Math.max(maxZ, vertices[i + 2]);
        }
        
        logger.debug('STL coordinate ranges:', {
            X: `${minX.toFixed(2)} to ${maxX.toFixed(2)} (span: ${(maxX - minX).toFixed(2)}mm)`,
            Y: `${minY.toFixed(2)} to ${maxY.toFixed(2)} (span: ${(maxY - minY).toFixed(2)}mm)`,
            Z: `${minZ.toFixed(2)} to ${maxZ.toFixed(2)} (span: ${(maxZ - minZ).toFixed(2)}mm)`
        });
    }

    // Unsharp mask for edge enhancement
    // amount=how much to boost edges, radius=blur size (1=3x3), threshold=ignore small changes
    private applyUnsharpMask(
        src: Float32Array,
        width: number,
        height: number,
        amount: number = 1.0,
        radius: number = 1,
        threshold: number = 0.02
    ): Float32Array {
        const blurred = this.gaussianBlurFloat(src, width, height, radius);
        const out = new Float32Array(width * height);
        for (let i = 0; i < out.length; i++) {
            const highFreq = src[i] - blurred[i];
            const boosted = Math.abs(highFreq) < threshold ? 0 : highFreq;
            const enhanced = src[i] + amount * boosted;
            out[i] = Math.min(1, Math.max(0, enhanced));
        }
        return out;
    }

    // Simple Gaussian blur (separable, so it's fast)
    // radius=1: [1,2,1]/4, radius=2: [1,4,6,4,1]/16
    private gaussianBlurFloat(src: Float32Array, width: number, height: number, radius: number): Float32Array {
        const tmp = new Float32Array(width * height);
        const dst = new Float32Array(width * height);

        // Pick the kernel
        let kernel: number[];
        let norm: number;
        if (radius <= 1) {
            kernel = [1, 2, 1];
            norm = 4;
        } else {
            kernel = [1, 4, 6, 4, 1];
            norm = 16;
        }
        const k = kernel.length;
        const r = Math.floor(k / 2);

        // Blur horizontally first
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let acc = 0;
                for (let i = -r; i <= r; i++) {
                    const xx = Math.min(width - 1, Math.max(0, x + i));
                    acc += src[y * width + xx] * kernel[i + r];
                }
                tmp[y * width + x] = acc / norm;
            }
        }

        // Then blur vertically
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let acc = 0;
                for (let i = -r; i <= r; i++) {
                    const yy = Math.min(height - 1, Math.max(0, y + i));
                    acc += tmp[yy * width + x] * kernel[i + r];
                }
                dst[y * width + x] = acc / norm;
            }
        }

        return dst;
    }

    // Convert vertices/normals to ASCII STL format
    // This took me forever to get right - STL format is picky about normals
    private verticesToSTL(vertices: number[], normals: number[]): string {
        let stl = 'solid lithophane\n';
        
        // Each triangle is 9 floats (3 vertices × 3 coords)
        for (let i = 0; i < vertices.length; i += 9) {
            const nx = normals[i];
            const ny = normals[i + 1];
            const nz = normals[i + 2];
            
            stl += '  facet normal ';
            stl += `${nx.toFixed(6)} ${ny.toFixed(6)} ${nz.toFixed(6)}\n`;
            stl += '    outer loop\n';
            
            // Write the three vertices
            for (let j = 0; j < 3; j++) {
                const vIndex = i + j * 3;
                const x = vertices[vIndex];
                const y = vertices[vIndex + 1];
                const z = vertices[vIndex + 2];
                stl += `      vertex ${x.toFixed(6)} ${y.toFixed(6)} ${z.toFixed(6)}\n`;
            }
            
            stl += '    endloop\n';
            stl += '  endfacet\n';
        }
        
        stl += 'endsolid lithophane\n';
        return stl;
    }
}

