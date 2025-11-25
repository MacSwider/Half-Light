// Smoothing algorithms for height maps
import { logger } from '../../utils/logger.js';

export type SmoothingMethod = 'geometric' | 'laplacian' | 'none';

export interface SmoothingOptions {
    method: SmoothingMethod;
    strength?: number;
    passes?: number;
}

// Apply the chosen smoothing method
export function applySmoothing(
    heightMap: number[][], 
    width: number, 
    height: number, 
    options: SmoothingOptions
): void {
    switch (options.method) {
        case 'geometric':
            applyGeometricSmoothing(heightMap, width, height, options);
            break;
        case 'laplacian':
            applyLaplacianSmoothing(heightMap, width, height, options);
            break;

        case 'none':
            // Skip smoothing - keep all the detail
            logger.debug('No smoothing applied - preserving maximum detail');
            break;
    }
}

// Geometric smoothing - uses 5x5 kernel with distance weighting
function applyGeometricSmoothing(
    heightMap: number[][], 
    width: number, 
    height: number, 
    options: SmoothingOptions
): void {
    const smoothingPasses = options.passes || 2;
    
    for (let pass = 0; pass < smoothingPasses; pass++) {
        const smoothedMap: number[][] = [];
        
        for (let y = 0; y < height; y++) {
            smoothedMap[y] = [];
            for (let x = 0; x < width; x++) {
                let sum = 0;
                let count = 0;
                
                // 5x5 kernel - neighbors further away contribute less
                for (let ky = -2; ky <= 2; ky++) {
                    for (let kx = -2; kx <= 2; kx++) {
                        const nx = x + kx;
                        const ny = y + ky;
                        
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            // Weight by distance (center pixel gets weight 8)
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
        
        // Update height map
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                heightMap[y][x] = smoothedMap[y][x];
            }
        }
    }
    
    logger.debug(`Applied geometric smoothing: ${smoothingPasses} passes with 5x5 kernel`);
}

// Laplacian smoothing - smooths based on local curvature
// Gives more organic, flowing surfaces
function applyLaplacianSmoothing(
    heightMap: number[][], 
    width: number, 
    height: number, 
    options: SmoothingOptions
): void {
    const strength = options.strength || 0.1; // How strong the smoothing is
    const passes = options.passes || 3;
    
    for (let pass = 0; pass < passes; pass++) {
        const smoothedMap: number[][] = [];
        
        for (let y = 0; y < height; y++) {
            smoothedMap[y] = [];
            for (let x = 0; x < width; x++) {
                // Laplacian = second derivative (curvature)
                let laplacian = 0;
                
                // Check the 4 neighbors
                const neighbors = [
                    { x: x, y: y - 1 },     // up
                    { x: x, y: y + 1 },     // down
                    { x: x - 1, y: y },     // left
                    { x: x + 1, y: y }      // right
                ];
                
                let validNeighbors = 0;
                let neighborSum = 0;
                
                for (const neighbor of neighbors) {
                    if (neighbor.x >= 0 && neighbor.x < width && 
                        neighbor.y >= 0 && neighbor.y < height) {
                        neighborSum += heightMap[neighbor.y][neighbor.x];
                        validNeighbors++;
                    }
                }
                
                if (validNeighbors > 0) {
                    // Standard discrete Laplacian formula
                    laplacian = 4 * heightMap[y][x] - neighborSum;
                    
                    // Reduce curvature = smoother surface
                    smoothedMap[y][x] = heightMap[y][x] - strength * laplacian;
                } else {
                    smoothedMap[y][x] = heightMap[y][x];
                }
            }
        }
        
        // Update the height map with smoothed values
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                heightMap[y][x] = smoothedMap[y][x];
            }
        }
    }
    
    logger.debug(`Applied Laplacian smoothing: ${passes} passes with strength ${strength}`);
}

