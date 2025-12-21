import Store from 'electron-store';

export interface UserPreferences {
    // Theme
    theme: 'light' | 'dark' | 'high-contrast';
    
    // Default lithophane settings
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
    defaultLockAspectRatio: boolean;
    
    // Window state
    windowBounds?: {
        width: number;
        height: number;
        x?: number;
        y?: number;
    };
    
    // Last used paths
    lastImagePath?: string;
    lastSaveDirectory?: string;
    
    // Slicer configuration
    slicerPath?: string;
}

const defaultPreferences: UserPreferences = {
    theme: 'light',
    defaultThickness: '0.8',
    defaultWidth: '300',
    defaultHeight: '290',
    defaultLayerHeight: '0.2',
    defaultLayerNumber: '8',
    defaultResolutionMultiplier: '4',
    defaultFirstLayerHeight: '0.8',
    defaultSmoothingMethod: 'laplacian',
    defaultSmoothingStrength: '0.1',
    defaultAllowFrame: false,
    defaultNegative: false,
    defaultLockAspectRatio: false,
};

class PreferencesManager {
    private store: Store<UserPreferences>;

    constructor() {
        this.store = new Store<UserPreferences>({
            name: 'preferences',
            defaults: defaultPreferences,
        });
    }

    getPreferences(): UserPreferences {
        return this.store.store;
    }

    getPreference<K extends keyof UserPreferences>(key: K): UserPreferences[K] {
        const value = this.store.get(key);
        return value !== undefined ? value : defaultPreferences[key];
    }

    setPreference<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]): void {
        this.store.set(key, value);
    }

    setPreferences(preferences: Partial<UserPreferences>): void {
        for (const [key, value] of Object.entries(preferences)) {
            if (value !== undefined) {
                this.store.set(key as keyof UserPreferences, value as UserPreferences[keyof UserPreferences]);
            }
        }
    }

    resetPreferences(): void {
        this.store.clear();
        this.store.set(defaultPreferences);
    }
}

export const preferencesManager = new PreferencesManager();

