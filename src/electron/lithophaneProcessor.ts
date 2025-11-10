import sharp from 'sharp';
import * as THREE from 'three';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import type { LithophaneSettings, ImageProcessingResult } from '../../types.js';
import { applySmoothing } from './smoothing/smoothingAlgorithms.js';


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
        const { width, height, depth, thickness, firstLayerHeight, quality, layerHeight } = settings;
        
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
        
        console.log(`Original brightness range: min=${minBrightness.toFixed(3)}, max=${maxBrightness.toFixed(3)}`);
        
        // DISCRETE LAYER APPROACH: Create quantized thickness levels
        // First layer (brightest) gets exactly firstLayerHeight thickness, remaining thickness is split into discrete layers
        const firstLayerThickness = firstLayerHeight; // Brightest layer thickness (e.g., 0.4mm)
        const remainingThickness = thickness - firstLayerHeight; // Remaining thickness to distribute (e.g., 2.6mm)
        // Align discrete layers to user's intended count if provided
        const totalUserLayers = typeof settings.numberOfLayers === 'number' && settings.numberOfLayers > 0
            ? settings.numberOfLayers
            : 14; // fallback similar to previous 13+first

        // totalUserLayers includes the first layer. We split the remaining thickness across (totalUserLayers - 1)
        const numberOfDiscreteLayers = Math.max(1, totalUserLayers - 1);
        const layerThicknessIncrement = numberOfDiscreteLayers > 0 ? (remainingThickness / numberOfDiscreteLayers) : 0;
        
        console.log(`DISCRETE LAYER APPROACH:`);
        console.log(`- First layer thickness: ${firstLayerThickness.toFixed(3)}mm`);
        console.log(`- Remaining thickness: ${remainingThickness.toFixed(3)}mm`);
        console.log(`- Number of additional discrete layers: ${numberOfDiscreteLayers}`);
        console.log(`- Thickness increment per layer: ${layerThicknessIncrement.toFixed(3)}mm`);
        console.log(`- Total discrete levels: ${numberOfDiscreteLayers + 1} (including first layer)`);
        console.log(`- Layer 0 (brightest): ${firstLayerThickness.toFixed(3)}mm`);
        console.log(`- Layer ${numberOfDiscreteLayers} (darkest): ${thickness.toFixed(3)}mm`);
        console.log(`Total pixels processed: ${brightnessValues.length}`);
        
        // Create continuous height map - smooth brightness-to-thickness mapping
        for (let y = 0; y < internalHeight; y++) {
            for (let x = 0; x < internalWidth; x++) {
                const pixelIndex = y * internalWidth + x;
                
                // Ensure we don't go out of bounds
                if (pixelIndex < enhancedBrightness.length) {
                    const brightness = enhancedBrightness[pixelIndex];
                    
                    // DISCRETE LAYER APPROACH: Map brightness to quantized thickness levels
                    // Normalize brightness to 0-1 range, then INVERT (brightest = 0, darkest = 1)
                    let normalizedBrightness = 1 - ((brightness - minBrightness) / (maxBrightness - minBrightness));
                    
                    // Apply negative/invert option if enabled
                    if (settings.negative) {
                        // Invert: bright areas become thick, dark areas become thin
                        normalizedBrightness = 1 - normalizedBrightness;
                    }
                    
                    // Map normalized brightness to discrete layer index (0 to numberOfDiscreteLayers)
                    // 0 (brightest) -> layer 0 (first layer) - gets firstLayerThickness
                    // 1 (darkest) -> layer numberOfDiscreteLayers (thickest layer) - gets full thickness
                    const layerIndex = Math.floor(normalizedBrightness * (numberOfDiscreteLayers + 1));
                    const clampedLayerIndex = Math.min(layerIndex, numberOfDiscreteLayers);
                    
                    // Calculate thickness for this discrete layer
                    // Layer 0 (brightest): firstLayerThickness (e.g., 1.0mm)
                    // Layer 1: firstLayerThickness + layerThicknessIncrement (e.g., 1.2mm)
                    // Layer 2: firstLayerThickness + 2 * layerThicknessIncrement (e.g., 1.4mm)
                    // ... and so on
                    // Layer numberOfDiscreteLayers (darkest): thickness (e.g., 3.0mm)
                    let heightValue;
                    if (clampedLayerIndex === 0) {
                        // Brightest areas get exactly firstLayerThickness
                        heightValue = firstLayerThickness;
                    } else {
                        // Other areas get firstLayerThickness + additional layers
                        heightValue = firstLayerThickness + (clampedLayerIndex * layerThicknessIncrement);
                    }
                    heightMap[y][x] = heightValue;
                } else {
                    heightMap[y][x] = firstLayerHeight;
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
        console.log(`DEBUG: Height range after discrete layer mapping: min=${minHeight.toFixed(3)}mm, max=${maxHeight.toFixed(3)}mm`);
        console.log(`DEBUG: Expected thickness range: ${firstLayerThickness.toFixed(3)}mm to ${thickness.toFixed(3)}mm`);
        console.log(`DEBUG: Thickness achieved: ${(maxHeight - minHeight).toFixed(3)}mm (target: ${thickness}mm)`);
        console.log(`DEBUG: DISCRETE LAYERS - Layer 0 (brightest): ${firstLayerThickness.toFixed(3)}mm, Layer ${numberOfDiscreteLayers} (darkest): ${thickness.toFixed(3)}mm`);
        console.log(`DEBUG: Layer thickness increment: ${layerThicknessIncrement.toFixed(3)}mm per layer`);
        console.log(`DEBUG: Total discrete levels: ${numberOfDiscreteLayers + 1} (including first layer)`);
        
                // Note: Preview generation moved to processImage method
        // No need to generate preview here for STL generation
        
        // Apply selected smoothing method for better 3D printing
        const smoothingOptions = settings.smoothing || { method: 'geometric', passes: 2 };
        applySmoothing(heightMap, internalWidth, internalHeight, smoothingOptions);

        // After smoothing, renormalize to preserve requested min/max thickness
        // Compute current min/max
        let currentMin = Infinity;
        let currentMax = -Infinity;
        for (let y = 0; y < internalHeight; y++) {
            for (let x = 0; x < internalWidth; x++) {
                const v = heightMap[y][x];
                if (v < currentMin) currentMin = v;
                if (v > currentMax) currentMax = v;
            }
        }
        // Target range is [firstLayerThickness, thickness]
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
        
        // Define the four corners of the rectangular bottom surface (at Z=0)
        const bottomLeft = [-halfWidth, -halfHeight, 0];
        const bottomRight = [halfWidth, -halfHeight, 0];
        const topLeft = [-halfWidth, halfHeight, 0];
        const topRight = [halfWidth, halfHeight, 0];
        
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
            const z1 = 0; // Start from bottom (Z=0)
            
            const x2 = -width / 2;
            const y2 = ((y + 1) / resolutionMultiplier - height / 2);
            const z2 = 0; // Start from bottom (Z=0)
            
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
            const z1 = 0; // Start from bottom (Z=0)
            
            const x2 = width / 2;
            const y2 = ((y + 1) / resolutionMultiplier - height / 2);
            const z2 = 0; // Start from bottom (Z=0)
            
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
            const z1 = 0; // Start from bottom (Z=0)
            
            const x2 = ((x + 1) / resolutionMultiplier - width / 2);
            const y2 = -height / 2;
            const z2 = 0; // Start from bottom (Z=0)
            
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
            const z1 = 0; // Start from bottom (Z=0)
            
            const x2 = ((x + 1) / resolutionMultiplier - width / 2);
            const y2 = height / 2;
            const z2 = 0; // Start from bottom (Z=0)
            
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
                [-outerWidth/2, -outerHeight/2, 0],           // Bottom-left
                [outerWidth/2, -outerHeight/2, 0],            // Bottom-right
                [outerWidth/2, outerHeight/2, 0],             // Top-right
                [-outerWidth/2, outerHeight/2, 0]             // Top-left
            ];
            
            // Frame corners (inner - where lithophane sits) - aligned with actual image dimensions
            const innerCorners = [
                [-width/2, -height/2, 0],  // Bottom-left
                [width/2, -height/2, 0],   // Bottom-right
                [width/2, height/2, 0],   // Top-right
                [-width/2, height/2, 0]   // Top-left
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
        console.log(`- First layer height: ${firstLayerHeight}mm`);
        console.log(`- Height range achieved: ${minHeight.toFixed(3)}mm to ${maxHeight.toFixed(3)}mm`);
        
        return {
            stlContent: stlContent
        };
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
