/**
 * Image smoothing algorithms for lithophane height maps
 */

export type SmoothingMethod = 'geometric' | 'laplacian' | 'none';

export interface SmoothingOptions {
    method: SmoothingMethod;
    strength?: number;
    passes?: number;
}

/**
 * Applies the selected smoothing method to a height map
 */

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
            // No smoothing applied - preserve maximum detail
            console.log('No smoothing applied - preserving maximum detail');
            break;
    }
}

/**
 * Geometric smoothing with 5x5 kernel and distance-based weighting
 */
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
    
    console.log(`Applied geometric smoothing: ${smoothingPasses} passes with 5x5 kernel`);
}

/**
 * Laplacian smoothing
 * Uses the discrete Laplacian operator to smooth based on local curvature
 */
function applyLaplacianSmoothing(
    heightMap: number[][], 
    width: number, 
    height: number, 
    options: SmoothingOptions
): void {
    const strength = options.strength || 0.1; // How much smoothing to apply
    const passes = options.passes || 3;
    
    for (let pass = 0; pass < passes; pass++) {
        const smoothedMap: number[][] = [];
        
        for (let y = 0; y < height; y++) {
            smoothedMap[y] = [];
            for (let x = 0; x < width; x++) {
                // Calculate Laplacian (second derivative approximation)
                let laplacian = 0;
                
                // 4-connected neighbors (up, down, left, right)
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
                    // Laplacian = 4 * center - sum of neighbors
                    laplacian = 4 * heightMap[y][x] - neighborSum;
                    
                    // Apply smoothing: new_value = old_value - strength * laplacian
                    smoothedMap[y][x] = heightMap[y][x] - strength * laplacian;
                } else {
                    smoothedMap[y][x] = heightMap[y][x];
                }
            }
        }
        
        // Copy smoothed values back
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                heightMap[y][x] = smoothedMap[y][x];
            }
        }
    }
    
    console.log(`Applied Laplacian smoothing: ${passes} passes with strength ${strength}`);
}

