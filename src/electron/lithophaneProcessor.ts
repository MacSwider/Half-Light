import sharp from 'sharp';
import * as THREE from 'three';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import type { LithophaneSettings, ImageProcessingResult } from '../../types.js';


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

    public async generateSTL(imagePath: string, settings: LithophaneSettings): Promise<ImageProcessingResult> {
        try {
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

            // Generate STL using Three.js
            const result = await this.generateSTLContent(processedImage, settings);
            
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

    private async generateSTLContent(imageData: Buffer, settings: LithophaneSettings): Promise<{
        stlContent: string;
    }> {
        const { width, height, depth, thickness, baseHeight, quality } = settings;
        
        // Resolution multiplier for higher quality
        console.log(`DEBUG: Received resolutionMultiplier from settings: ${settings.resolutionMultiplier} (type: ${typeof settings.resolutionMultiplier})`);
        const resolutionMultiplier = settings.resolutionMultiplier || 4; // Use setting from UI, fallback to 4
        console.log(`DEBUG: Using resolutionMultiplier: ${resolutionMultiplier}`);
        const internalWidth = width * resolutionMultiplier;
        const internalHeight = height * resolutionMultiplier;
        const internalThickness = thickness; // Use thickness directly for Z-axis, don't scale XY dimensions
        
        console.log(`Generating ${quality} quality lithophane: ${internalWidth}x${internalHeight} (${resolutionMultiplier}x resolution from user setting)`);
        console.log(`Using thickness: ${thickness}mm for Z-axis`);
        console.log(`Image dimensions: ${width}x${height}mm (X and Y axes)`);
        console.log(`Final STL will be: ${width}x${height}x${thickness}mm`);
        
        // Precompute enhanced brightness from the high-resolution image data
        const sourceBrightness = new Float32Array(internalWidth * internalHeight);
        for (let i = 0; i < internalWidth * internalHeight && i < imageData.length; i++) {
            sourceBrightness[i] = Math.min(1, Math.max(0, imageData[i] / 255));
        }

        // Apply unsharp mask to boost edges (hardcoded for now)
        // amount: 1.0 (edge strength), radius: 1 (3x3), threshold: 0.02 (ignore tiny noise)
        const enhancedBrightness = this.applyUnsharpMask(sourceBrightness, internalWidth, internalHeight, 1.0, 1, 0.02);

        // Process image data to create height map
        const heightMap: number[][] = [];
        
        // First pass: collect all brightness values for normalization
        const brightnessValues: number[] = [];
        for (let y = 0; y < internalHeight; y++) {
            heightMap[y] = [];
            for (let x = 0; x < internalWidth; x++) {
                const pixelIndex = y * internalWidth + x;
                
                if (pixelIndex < enhancedBrightness.length) {
                    const brightness = enhancedBrightness[pixelIndex];
                    brightnessValues.push(brightness);
                }
            }
        }
        
        // Calculate min/max brightness for normalization - avoid stack overflow with large arrays
        let minBrightness = Infinity;
        let maxBrightness = -Infinity;
        for (const value of brightnessValues) {
            minBrightness = Math.min(minBrightness, value);
            maxBrightness = Math.max(maxBrightness, value);
        }
        
        console.log(`Brightness normalization: min=${minBrightness.toFixed(3)}, max=${maxBrightness.toFixed(3)}`);
        console.log(`Creating continuous height map with smooth brightness-to-thickness mapping`);
        console.log(`Total pixels processed: ${brightnessValues.length}`);
        
        // Create continuous height map - smooth brightness-to-thickness mapping
        for (let y = 0; y < internalHeight; y++) {
            for (let x = 0; x < internalWidth; x++) {
                const pixelIndex = y * internalWidth + x;
                
                // Ensure we don't go out of bounds
                if (pixelIndex < enhancedBrightness.length) {
                    const brightness = enhancedBrightness[pixelIndex];
                    
                    // Map brightness to continuous height
                    // CORRECTED: brightest pixels get thinnest parts (but still need minimum thickness)
                    // Normalize brightness to 0-1 range, then INVERT
                    const normalizedBrightness = 1 - ((brightness - minBrightness) / (maxBrightness - minBrightness));
                    
                    // Add minimum thickness for brightest pixels (e.g., 0.2mm) so they have actual volume
                    const minThickness = 0.2; // Minimum thickness for brightest pixels
                    const effectiveThickness = thickness - minThickness; // Remaining thickness for variation
                    
                    // Map inverted brightness to height: 0 (brightest) -> baseHeight + minThickness, 1 (darkest) -> baseHeight + thickness
                    const heightValue = baseHeight + minThickness + (normalizedBrightness * effectiveThickness);
                    heightMap[y][x] = heightValue;
                } else {
                    heightMap[y][x] = baseHeight;
                }
            }
        }
        
        // Log height range for debugging - avoid stack overflow with large arrays
        const heightValues: number[] = [];
        for (let y = 0; y < internalHeight; y++) {
            for (let x = 0; x < internalWidth; x++) {
                heightValues.push(heightMap[y][x]);
            }
        }
        // Calculate min/max without spread operator to avoid stack overflow
        let minHeight = Infinity;
        let maxHeight = -Infinity;
        for (const value of heightValues) {
            minHeight = Math.min(minHeight, value);
            maxHeight = Math.max(maxHeight, value);
        }
        console.log(`DEBUG: Height range after continuous mapping: min=${minHeight.toFixed(3)}mm, max=${maxHeight.toFixed(3)}mm`);
        console.log(`DEBUG: Expected thickness range: ${(baseHeight + 0.2).toFixed(3)}mm to ${(baseHeight + thickness).toFixed(3)}mm`);
        console.log(`DEBUG: Thickness achieved: ${(maxHeight - minHeight).toFixed(3)}mm (target: ${thickness}mm)`);
        console.log(`DEBUG: Continuous mapping - brightest pixels (0.0) -> ${(baseHeight + 0.2).toFixed(3)}mm (min thickness), darkest pixels (1.0) -> ${(baseHeight + thickness).toFixed(3)}mm`);
        
                // Note: Preview generation moved to processImage method
        // No need to generate preview here for STL generation
        
        // Apply geometric smoothing for better 3D printing (continuous surface smoothing)
        this.applyGeometricSmoothing(heightMap, internalWidth, internalHeight);

        // Temporary: Use simple geometry generation to get it working
        const vertices: number[] = [];
        const normals: number[] = [];
        
        // Simple top surface generation - use high-res coordinates scaled to actual dimensions
        for (let y = 0; y < internalHeight - 1; y++) {
            for (let x = 0; x < internalWidth - 1; x++) {
                // Scale high-res coordinates to actual image dimensions
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
        
        // Add bottom surface (flat base) - optimized to use only 2 triangles for the entire rectangular surface
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        
        // Define the four corners of the rectangular bottom surface
        const bottomLeft = [-halfWidth, -halfHeight, baseHeight];
        const bottomRight = [halfWidth, -halfHeight, baseHeight];
        const topLeft = [-halfWidth, halfHeight, baseHeight];
        const topRight = [halfWidth, halfHeight, baseHeight];
        
        // First triangle (bottom-left to top-left to bottom-right)
        vertices.push(
            bottomLeft[0], bottomLeft[1], bottomLeft[2],
            topLeft[0], topLeft[1], topLeft[2],
            bottomRight[0], bottomRight[1], bottomRight[2]
        );
        normals.push(0, 0, -1, 0, 0, -1, 0, 0, -1);
        
        // Second triangle (bottom-right to top-left to top-right)
        vertices.push(
            bottomRight[0], bottomRight[1], bottomRight[2],
            topLeft[0], topLeft[1], topLeft[2],
            topRight[0], topRight[1], topRight[2]
        );
        normals.push(0, 0, -1, 0, 0, -1, 0, 0, -1);

        // Add side walls to create a solid volume (essential for 3D printing)
        // Left wall (negative X) - use high-res coordinates scaled to actual dimensions
        for (let y = 0; y < internalHeight - 1; y++) {
            const x1 = -width / 2;
            const y1 = (y / resolutionMultiplier - height / 2);
            const z1 = baseHeight;
            
            const x2 = -width / 2;
            const y2 = ((y + 1) / resolutionMultiplier - height / 2);
            const z2 = baseHeight;
            
            const x3 = -width / 2;
            const y3 = (y / resolutionMultiplier - height / 2);
            const z3 = heightMap[y][0];
            
            const x4 = -width / 2;
            const y4 = ((y + 1) / resolutionMultiplier - height / 2);
            const z4 = heightMap[y + 1][0];
            
            // First triangle (facing negative X)
            vertices.push(x1, y1, z1, x2, y2, z2, x3, y3, z3);
            normals.push(-1, 0, 0, -1, 0, 0, -1, 0, 0);
            
            // Second triangle
            vertices.push(x2, y2, z2, x4, y4, z4, x3, y3, z3);
            normals.push(-1, 0, 0, -1, 0, 0, -1, 0, 0);
        }

        // Right wall (positive X) - use high-res coordinates scaled to actual dimensions
        for (let y = 0; y < internalHeight - 1; y++) {
            const x1 = width / 2;
            const y1 = (y / resolutionMultiplier - height / 2);
            const z1 = baseHeight;
            
            const x2 = width / 2;
            const y2 = ((y + 1) / resolutionMultiplier - height / 2);
            const z2 = baseHeight;
            
            const x3 = width / 2;
            const y3 = (y / resolutionMultiplier - height / 2);
            const z3 = heightMap[y][internalWidth - 1];
            
            const x4 = width / 2;
            const y4 = ((y + 1) / resolutionMultiplier - height / 2);
            const z4 = heightMap[y + 1][internalWidth - 1];
            
            // First triangle (facing positive X)
            vertices.push(x1, y1, z1, x3, y3, z3, x2, y2, z2);
            normals.push(1, 0, 0, 1, 0, 0, 1, 0, 0);
            
            // Second triangle
            vertices.push(x2, y2, z2, x3, y3, z3, x4, y4, z4);
            normals.push(1, 0, 0, 1, 0, 0, 1, 0, 0);
        }

        // Bottom wall (negative Y) - use actual image dimensions for XY, thickness for Z
        for (let x = 0; x < internalWidth - 1; x++) {
            const x1 = (x / resolutionMultiplier - width / 2);
            const y1 = -height / 2;
            const z1 = baseHeight;
            
            const x2 = ((x + 1) / resolutionMultiplier - width / 2);
            const y2 = -height / 2;
            const z2 = baseHeight;
            
            const x3 = (x / resolutionMultiplier - width / 2);
            const y3 = -height / 2;
            const z3 = heightMap[0][x];
            
            const x4 = ((x + 1) / resolutionMultiplier - width / 2);
            const y4 = -height / 2;
            const z4 = heightMap[0][x + 1];
            
            // First triangle (facing negative Y)
            vertices.push(x1, y1, z1, x3, y3, z3, x2, y2, z2);
            normals.push(0, -1, 0, 0, -1, 0, 0, -1, 0);
            
            // Second triangle
            vertices.push(x2, y2, z2, x3, y3, z3, x4, y4, z4);
            normals.push(0, -1, 0, 0, -1, 0, 0, -1, 0);
        }

        // Top wall (positive Y) - use actual image dimensions for XY, thickness for Z
        for (let x = 0; x < internalWidth - 1; x++) {
            const x1 = (x / resolutionMultiplier - width / 2);
            const y1 = height / 2;
            const z1 = baseHeight;
            
            const x2 = ((x + 1) / resolutionMultiplier - width / 2);
            const y2 = height / 2;
            const z2 = baseHeight;
            
            const x3 = (x / resolutionMultiplier - width / 2);
            const y3 = height / 2;
            const z3 = heightMap[internalHeight - 1][x];
            
            const x4 = ((x + 1) / resolutionMultiplier - width / 2);
            const y4 = height / 2;
            const z4 = heightMap[internalHeight - 1][x + 1];
            
            // First triangle (facing positive Y)
            vertices.push(x1, y1, z1, x2, y2, z2, x3, y3, z3);
            normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
            
            // Second triangle
            vertices.push(x2, y2, z2, x4, y4, z4, x3, y3, z3);
            normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
        }
        
        // Add frame around the edges - use thickness setting instead of hardcoded 5mm
        if (settings.frameEnabled) {
            const frameWidth = settings.frameWidth || 2.0; // Use frameWidth from settings
            const frameHeight = thickness + 1.0; // Frame height: model thickness + 1mm
            
            // Frame dimensions based on internal lithophane size (actual image dimensions)
            const outerWidth = width + frameWidth * 2;
            const outerHeight = height + frameWidth * 2;
            
            // Frame corners (outer) - aligned with actual image dimensions
            const outerCorners = [
                [-outerWidth/2, -outerHeight/2, baseHeight],           // Bottom-left
                [outerWidth/2, -outerHeight/2, baseHeight],            // Bottom-right
                [outerWidth/2, outerHeight/2, baseHeight],             // Top-right
                [-outerWidth/2, outerHeight/2, baseHeight]             // Top-left
            ];
            
            // Frame corners (inner - where lithophane sits) - aligned with actual image dimensions
            const innerCorners = [
                [-width/2, -height/2, baseHeight],  // Bottom-left
                [width/2, -height/2, baseHeight],   // Bottom-right
                [width/2, height/2, baseHeight],   // Top-right
                [-width/2, height/2, baseHeight]   // Top-left
            ];
            
            // Generate frame bottom surface (triangulated)
            for (let i = 0; i < 4; i++) {
                const next = (i + 1) % 4;
                
                // First triangle
                vertices.push(
                    outerCorners[i][0], outerCorners[i][1], outerCorners[i][2],
                    outerCorners[next][0], outerCorners[next][1], outerCorners[next][2],
                    innerCorners[i][0], innerCorners[i][1], innerCorners[i][2]
                );
                normals.push(0, 0, -1, 0, 0, -1, 0, 0, -1); // Facing down
                
                // Second triangle
                vertices.push(
                    outerCorners[next][0], outerCorners[next][1], outerCorners[next][2],
                    innerCorners[next][0], innerCorners[next][1], innerCorners[next][2],
                    innerCorners[i][0], innerCorners[i][1], innerCorners[i][2]
                );
                normals.push(0, 0, -1, 0, 0, -1, 0, 0, -1); // Facing down
            }
            
            // Generate frame top surface (raised)
            for (let i = 0; i < 4; i++) {
                const next = (i + 1) % 4;
                
                // First triangle
                vertices.push(
                    outerCorners[i][0], outerCorners[i][1], outerCorners[i][2] + frameHeight,
                    innerCorners[i][0], innerCorners[i][1], innerCorners[i][2] + frameHeight,
                    outerCorners[next][0], outerCorners[next][1], outerCorners[next][2] + frameHeight
                );
                normals.push(0, 0, 1, 0, 0, 1, 0, 0, 1); // Facing up
                
                // Second triangle
                vertices.push(
                    outerCorners[next][0], outerCorners[next][1], outerCorners[next][2] + frameHeight,
                    innerCorners[next][0], innerCorners[next][1], innerCorners[next][2] + frameHeight,
                    innerCorners[i][0], innerCorners[i][1], innerCorners[i][2] + frameHeight
                );
                normals.push(0, 0, 1, 0, 0, 1, 0, 0, 1); // Facing up
            }
            
            // Generate frame side walls
            for (let i = 0; i < 4; i++) {
                const next = (i + 1) % 4;
                
                // Outer wall
                vertices.push(
                    outerCorners[i][0], outerCorners[i][1], outerCorners[i][2],
                    outerCorners[i][0], outerCorners[i][1], outerCorners[i][2] + frameHeight,
                    outerCorners[next][0], outerCorners[next][1], outerCorners[next][2]
                );
                normals.push(-1, 0, 0, -1, 0, 0, -1, 0, 0); // Simple normal
                
                vertices.push(
                    outerCorners[next][0], outerCorners[next][1], outerCorners[next][2],
                    outerCorners[i][0], outerCorners[i][1], outerCorners[i][2] + frameHeight,
                    outerCorners[next][0], outerCorners[next][1], outerCorners[next][2] + frameHeight
                );
                normals.push(-1, 0, 0, -1, 0, 0, -1, 0, 0); // Simple normal
                
                // Inner wall
                vertices.push(
                    innerCorners[i][0], innerCorners[i][1], innerCorners[i][2],
                    innerCorners[next][0], innerCorners[next][1], innerCorners[next][2],
                    innerCorners[i][0], innerCorners[i][1], innerCorners[i][2] + frameHeight
                );
                normals.push(1, 0, 0, 1, 0, 0, 1, 0, 0); // Simple normal
                
                vertices.push(
                    innerCorners[next][0], innerCorners[next][1], innerCorners[next][2],
                    innerCorners[next][0], innerCorners[next][1], innerCorners[next][2] + frameHeight,
                    innerCorners[i][0], innerCorners[i][1], innerCorners[i][2] + frameHeight
                );
                normals.push(1, 0, 0, 1, 0, 0, 1, 0, 0); // Simple normal
            }
        }
        
        console.log('Geometry with frame generated:', { verticesCount: vertices.length, normalsCount: normals.length });
        
        // Debug: Log coordinate ranges
        if (vertices.length > 0) {
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
        
        // Generate STL content from vertices and normals
        const stlContent = this.verticesToSTL(vertices, normals);
        
        console.log(`STL generation complete:`);
        console.log(`- Total vertices: ${vertices.length / 3}`);
        console.log(`- Final dimensions: ${width}x${height}x${thickness}mm`);
        console.log(`- Base height: ${baseHeight}mm`);
        console.log(`- Height range achieved: ${minHeight.toFixed(3)}mm to ${maxHeight.toFixed(3)}mm`);
        
        return {
            stlContent: stlContent
        };
    }



    /**
     * Applies broad geometric smoothing to continuous height maps.
     * This reduces isolated pixels and creates smoother surfaces for 3D printing.
     */
    private applyGeometricSmoothing(heightMap: number[][], width: number, height: number): void {
        const smoothingPasses = 2;
        
        for (let pass = 0; pass < smoothingPasses; pass++) {
            const smoothedMap: number[][] = [];
            
            for (let y = 0; y < height; y++) {
                smoothedMap[y] = [];
                for (let x = 0; x < width; x++) {
                    let sum = 0;
                    let count = 0;
                    
                    // Use a larger 5x5 kernel for broader smoothing
                    for (let ky = -2; ky <= 2; ky++) {
                        for (let kx = -2; kx <= 2; kx++) {
                            const nx = x + kx;
                            const ny = y + ky;
                            
                            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                                // Distance-based weighting with falloff
                                const distance = Math.sqrt(kx * kx + ky * ky);
                                const weight = distance === 0 ? 8 : 1 / (1 + distance * 0.3);
                                
                                sum += heightMap[ny][nx] * weight;
                                count += weight;
                            }
                        }
                    }
                    
                    smoothedMap[y][x] = sum / count;
                }
            }
            
            // Copy smoothed values back
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    heightMap[y][x] = smoothedMap[y][x];
                }
            }
        }
        
        console.log(`Applied geometric smoothing: ${smoothingPasses} passes with 5x5 kernel for 3D printing optimization`);
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
