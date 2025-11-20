import sharp from 'sharp';
import * as THREE from 'three';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import type { LithophaneSettings, ImageProcessingResult } from '../../../types.js';
import { applySmoothing } from '../services/smoothing/smoothingAlgorithms.js';


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
            // Load and process the image
            const image = sharp(imagePath);
            const metadata = await image.metadata();
            
            if (!metadata.width || !metadata.height) {
                return {
                    success: false,
                    message: 'Invalid image metadata',
                    error: 'Could not read image dimensions'
                };
            }

            // Convert to grayscale and resize with resolution multiplier for better quality
            const internalWidth = settings.width * (settings.resolutionMultiplier || 4);
            const internalHeight = settings.height * (settings.resolutionMultiplier || 4);
            
            console.log(`DEBUG: processImage - Resizing image to ${internalWidth}x${internalHeight} (${settings.resolutionMultiplier || 4}x resolution)`);
            
            const processedImage = await image
                .grayscale()
                .resize(internalWidth, internalHeight)
                .raw()
                .toBuffer();

            return {
                success: true,
                message: 'Image processed successfully',
                processedImageData: processedImage // Return the processed image data
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
            
            // Process the image first to get the high-resolution data
            const processResult = await this.processImage(imagePath, settings);
            if (!processResult.success) {
                return processResult;
            }

            // Use the processed image data from processImage
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

            console.log(`DEBUG: Using processed image data, buffer size: ${processedImage.length} bytes`);
            console.log(`DEBUG: Expected pixels: ${internalWidth * internalHeight} = ${internalWidth * internalHeight} pixels`);
            console.log(`DEBUG: Buffer per pixel: ${processedImage.length / (internalWidth * internalHeight)} bytes per pixel`);
            console.log(`DEBUG: Image dimensions: ${internalWidth}x${internalHeight} (${settings.resolutionMultiplier || 4}x resolution)`);

            reportProgress(20, 'Generating height map...');

            // Generate STL using Three.js
            const result = await this.generateSTLContent(processedImage, settings, reportProgress);
            
            reportProgress(100, 'STL generation complete!');
            
            // Return STL content
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
        
        console.log(`Generating ${quality} quality lithophane: ${internalWidth}x${internalHeight} (${resolutionMultiplier}x resolution)`);
        console.log(`Using thickness: ${thickness}mm for Z-axis`);
        console.log(`Image dimensions: ${width}x${height}mm (X and Y axes)`);
        console.log(`Final STL will be: ${width}x${height}x${thickness}mm`);
        
        reportProgress(30, 'Processing image data and enhancing edges...');
        
        // Step 1: Process image data to enhanced brightness
        const enhancedBrightness = this.processImageData(imageData, internalWidth, internalHeight);
        
        reportProgress(45, 'Creating height map from brightness values...');
        
        // Step 2: Create height map from brightness values
        const heightMap = this.createHeightMap(
            enhancedBrightness,
            internalWidth,
            internalHeight,
            settings
        );
        
        reportProgress(60, 'Applying smoothing and normalizing...');
        
        // Step 3: Apply smoothing and normalize
        this.applySmoothingAndNormalize(
            heightMap,
            internalWidth,
            internalHeight,
            settings
        );
        
        reportProgress(75, 'Generating 3D geometry...');
        
        // Step 4: Generate geometry (vertices and normals)
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
        
        // Step 5: Convert to STL format
        const stlContent = this.verticesToSTL(vertices, normals);
        
        console.log(`STL generation complete:`);
        console.log(`- Total vertices: ${vertices.length / 3}`);
        console.log(`- Final dimensions: ${width}x${height}x${thickness}mm`);
        console.log(`- First layer height: ${firstLayerHeight}mm`);
        
        return { stlContent };
    }

    /**
     * Process image data to extract and enhance brightness values
     */
    private processImageData(imageData: Buffer, width: number, height: number): Float32Array {
        // Convert image data to normalized brightness array
        const sourceBrightness = new Float32Array(width * height);
        for (let i = 0; i < width * height && i < imageData.length; i++) {
            sourceBrightness[i] = Math.min(1, Math.max(0, imageData[i] / 255));
        }

        // Apply unsharp mask to enhance edges
        // amount: 1.0 (edge strength), radius: 1 (3x3), threshold: 0.02 (ignore tiny noise)
        return this.applyUnsharpMask(sourceBrightness, width, height, 1.0, 1, 0.02);
    }

    /**
     * Create height map from enhanced brightness values using discrete layer approach
     */
    private createHeightMap(
        enhancedBrightness: Float32Array,
        internalWidth: number,
        internalHeight: number,
        settings: LithophaneSettings
    ): number[][] {
        const { thickness, firstLayerHeight } = settings;
        
        // Collect brightness values for normalization
        const brightnessValues: number[] = [];
        for (let i = 0; i < enhancedBrightness.length; i++) {
            brightnessValues.push(enhancedBrightness[i]);
        }
        
        // Calculate min/max brightness for normalization
        let minBrightness = Infinity;
        let maxBrightness = -Infinity;
        for (const value of brightnessValues) {
            minBrightness = Math.min(minBrightness, value);
            maxBrightness = Math.max(maxBrightness, value);
        }
        
        console.log(`Original brightness range: min=${minBrightness.toFixed(3)}, max=${maxBrightness.toFixed(3)}`);
        
        // Calculate discrete layer parameters
        const firstLayerThickness = firstLayerHeight;
        const remainingThickness = thickness - firstLayerHeight;
        const totalUserLayers = typeof settings.numberOfLayers === 'number' && settings.numberOfLayers > 0
            ? settings.numberOfLayers
            : 14;
        const numberOfDiscreteLayers = Math.max(1, totalUserLayers - 1);
        const layerThicknessIncrement = numberOfDiscreteLayers > 0 ? (remainingThickness / numberOfDiscreteLayers) : 0;
        
        console.log(`DISCRETE LAYER APPROACH:`);
        console.log(`- First layer thickness: ${firstLayerThickness.toFixed(3)}mm`);
        console.log(`- Remaining thickness: ${remainingThickness.toFixed(3)}mm`);
        console.log(`- Number of additional discrete layers: ${numberOfDiscreteLayers}`);
        console.log(`- Thickness increment per layer: ${layerThicknessIncrement.toFixed(3)}mm`);
        console.log(`- Total discrete levels: ${numberOfDiscreteLayers + 1} (including first layer)`);
        
        // Create height map
        const heightMap: number[][] = [];
        for (let y = 0; y < internalHeight; y++) {
            heightMap[y] = [];
            for (let x = 0; x < internalWidth; x++) {
                const pixelIndex = y * internalWidth + x;
                
                if (pixelIndex < enhancedBrightness.length) {
                    const brightness = enhancedBrightness[pixelIndex];
                    
                    // Normalize brightness to 0-1 range, then INVERT (brightest = 0, darkest = 1)
                    let normalizedBrightness = 1 - ((brightness - minBrightness) / (maxBrightness - minBrightness));
                    
                    // Apply negative/invert option if enabled
                    if (settings.negative) {
                        normalizedBrightness = 1 - normalizedBrightness;
                    }
                    
                    // Map to discrete layer index
                    const layerIndex = Math.floor(normalizedBrightness * (numberOfDiscreteLayers + 1));
                    const clampedLayerIndex = Math.min(layerIndex, numberOfDiscreteLayers);
                    
                    // Calculate thickness for this discrete layer
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

    /**
     * Apply smoothing to height map and normalize to preserve thickness range
     */
    private applySmoothingAndNormalize(
        heightMap: number[][],
        internalWidth: number,
        internalHeight: number,
        settings: LithophaneSettings
    ): void {
        const { thickness, firstLayerHeight } = settings;
        const firstLayerThickness = firstLayerHeight;
        
        // Apply selected smoothing method
        const smoothingOptions = settings.smoothing || { method: 'geometric', passes: 2 };
        applySmoothing(heightMap, internalWidth, internalHeight, smoothingOptions);

        // Renormalize to preserve requested min/max thickness
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
            // Degenerate case: clamp into target bounds
            for (let y = 0; y < internalHeight; y++) {
                for (let x = 0; x < internalWidth; x++) {
                    heightMap[y][x] = Math.min(targetMax, Math.max(targetMin, heightMap[y][x]));
                }
            }
        }
    }

    /**
     * Generate 3D geometry (vertices and normals) from height map
     */
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
        
        // Generate top surface
        this.addTopSurface(vertices, normals, heightMap, internalWidth, internalHeight, width, height, resolutionMultiplier);
        
        // Generate bottom surface
        this.addBottomSurface(vertices, normals, width, height);
        
        // Generate side walls
        this.addSideWalls(vertices, normals, heightMap, internalWidth, internalHeight, width, height, resolutionMultiplier);
        
        // Generate frame if enabled
        if (settings.frameEnabled) {
            this.addFrame(vertices, normals, width, height, settings.thickness, settings.frameWidth || 2.0);
        }
        
        console.log('Geometry generated:', { verticesCount: vertices.length, normalsCount: normals.length });
        this.logCoordinateRanges(vertices);
        
        return { vertices, normals };
    }

    /**
     * Add top surface geometry from height map
     */
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
                
                // First triangle
                vertices.push(x1, y1, z1, x2, y2, z2, x3, y3, z3);
                normals.push(0, 0, 1, 0, 0, 1, 0, 0, 1);
                
                // Second triangle
                vertices.push(x2, y2, z2, x4, y4, z4, x3, y3, z3);
                normals.push(0, 0, 1, 0, 0, 1, 0, 0, 1);
            }
        }
    }

    /**
     * Add flat bottom surface geometry
     */
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
        
        // First triangle
        vertices.push(
            bottomLeft[0], bottomLeft[1], bottomLeft[2],
            topLeft[0], topLeft[1], topLeft[2],
            bottomRight[0], bottomRight[1], bottomRight[2]
        );
        normals.push(0, 0, -1, 0, 0, -1, 0, 0, -1);
        
        // Second triangle
        vertices.push(
            bottomRight[0], bottomRight[1], bottomRight[2],
            topLeft[0], topLeft[1], topLeft[2],
            topRight[0], topRight[1], topRight[2]
        );
        normals.push(0, 0, -1, 0, 0, -1, 0, 0, -1);
    }

    /**
     * Add side walls geometry (left, right, top, bottom)
     */
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
        // Left wall (negative X)
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

        // Right wall (positive X)
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

        // Bottom wall (negative Y)
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

        // Top wall (positive Y)
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

    /**
     * Add frame geometry around the edges
     */
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
        
        // Frame bottom surface
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
        
        // Frame top surface
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
        
        // Frame side walls
        for (let i = 0; i < 4; i++) {
            const next = (i + 1) % 4;
            
            // Outer wall
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
            
            // Inner wall
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

    /**
     * Log coordinate ranges for debugging
     */
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
        
        console.log('STL coordinate ranges:', {
            X: `${minX.toFixed(2)} to ${maxX.toFixed(2)} (span: ${(maxX - minX).toFixed(2)}mm)`,
            Y: `${minY.toFixed(2)} to ${maxY.toFixed(2)} (span: ${(maxY - minY).toFixed(2)}mm)`,
            Z: `${minZ.toFixed(2)} to ${maxZ.toFixed(2)} (span: ${(maxZ - minZ).toFixed(2)}mm)`
        });
    }

    /**
     * Apply unsharp mask to a normalized grayscale buffer (0..1) to enhance edges.
     * amount controls edge boost, radius defines blur radius in pixels (1 => 3x3),
     * threshold (0..1) suppresses enhancement for low-contrast noise.
     */
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

    /**
     * Simple separable Gaussian-like blur for Float32 grayscale buffers.
     * radius=1 uses kernel [1,2,1]/4; radius=2 uses [1,4,6,4,1]/16.
     */
    private gaussianBlurFloat(src: Float32Array, width: number, height: number, radius: number): Float32Array {
        const tmp = new Float32Array(width * height);
        const dst = new Float32Array(width * height);

        // Define kernels
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

        // Horizontal pass
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

        // Vertical pass
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

    private verticesToSTL(vertices: number[], normals: number[]): string {
        let stl = 'solid lithophane\n';
        
        // Process vertices in groups of 9 (3 vertices × 3 coordinates each)
        for (let i = 0; i < vertices.length; i += 9) {
            // Get the normal for this triangle (first normal value)
            const nx = normals[i];
            const ny = normals[i + 1];
            const nz = normals[i + 2];
            
            stl += '  facet normal ';
            stl += `${nx.toFixed(6)} ${ny.toFixed(6)} ${nz.toFixed(6)}\n`;
            stl += '    outer loop\n';
            
            // Add the three vertices of the triangle
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

