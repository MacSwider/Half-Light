import { normalize, resolve, isAbsolute } from 'path';
import { existsSync } from 'fs';

/**
 * Validates file paths to prevent security issues like path traversal attacks
 */
export class PathValidator {
    /**
     * Validates that a path is safe and doesn't contain path traversal sequences
     * @param filePath The file path to validate
     * @param allowedExtensions Optional array of allowed file extensions (e.g., ['.jpg', '.png'])
     * @returns Object with isValid flag and error message if invalid
     */
    static validatePath(
        filePath: string,
        allowedExtensions?: string[]
    ): { isValid: boolean; error?: string } {
        if (!filePath || typeof filePath !== 'string') {
            return { isValid: false, error: 'Invalid path: path must be a non-empty string' };
        }

        // Check for path traversal attacks (../, ..\, etc.)
        // Only reject if the path contains suspicious .. patterns
        // Note: normalize() resolves .. segments, so we check the original path
        const suspiciousPattern = /\.\.(\/|\\)/;
        if (suspiciousPattern.test(filePath)) {
            return { isValid: false, error: 'Invalid path: path traversal detected' };
        }

        // Check for null bytes (potential security issue)
        if (filePath.includes('\0')) {
            return { isValid: false, error: 'Invalid path: null byte detected' };
        }

        // Validate file extension if provided
        if (allowedExtensions && allowedExtensions.length > 0) {
            const ext = this.getFileExtension(filePath);
            const normalizedExt = ext.toLowerCase().replace(/^\./, ''); // Remove leading dot for comparison
            const normalizedAllowed = allowedExtensions.map(e => e.toLowerCase().replace(/^\./, ''));
            
            if (!normalizedExt || !normalizedAllowed.includes(normalizedExt)) {
                return {
                    isValid: false,
                    error: `Invalid file extension. Allowed: ${allowedExtensions.join(', ')}`
                };
            }
        }

        return { isValid: true };
    }

    /**
     * Validates that a path exists and is accessible
     * @param filePath The file path to check
     * @returns Object with isValid flag and error message if invalid
     */
    static validatePathExists(filePath: string): { isValid: boolean; error?: string } {
        const pathValidation = this.validatePath(filePath);
        if (!pathValidation.isValid) {
            return pathValidation;
        }

        if (!existsSync(filePath)) {
            return { isValid: false, error: 'File does not exist' };
        }

        return { isValid: true };
    }

    /**
     * Validates that a path is within an allowed directory
     * @param filePath The file path to validate
     * @param allowedDirectory The directory that the path must be within
     * @returns Object with isValid flag and error message if invalid
     */
    static validatePathInDirectory(
        filePath: string,
        allowedDirectory: string
    ): { isValid: boolean; error?: string } {
        const pathValidation = this.validatePath(filePath);
        if (!pathValidation.isValid) {
            return pathValidation;
        }

        try {
            const resolvedPath = resolve(filePath);
            const resolvedAllowed = resolve(allowedDirectory);

            if (!resolvedPath.startsWith(resolvedAllowed)) {
                return {
                    isValid: false,
                    error: 'Path is outside allowed directory'
                };
            }

            return { isValid: true };
        } catch (error) {
            return {
                isValid: false,
                error: `Error validating path: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    /**
     * Gets the file extension from a path
     * @param filePath The file path
     * @returns The file extension (including the dot, e.g., '.jpg')
     */
    static getFileExtension(filePath: string): string {
        const lastDot = filePath.lastIndexOf('.');
        const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
        
        if (lastDot > lastSlash && lastDot !== -1) {
            return filePath.substring(lastDot);
        }
        
        return '';
    }

    /**
     * Sanitizes a filename by removing dangerous characters
     * @param filename The filename to sanitize
     * @returns Sanitized filename
     */
    static sanitizeFilename(filename: string): string {
        // Remove path separators, null bytes, and other dangerous characters
        return filename
            .replace(/[<>:"|?*\x00-\x1f]/g, '')
            .replace(/\.\./g, '')
            .trim();
    }
}

