#  Half-Light - Lithophane STL Generator

> **Just turn it** - Transform your images into beautiful 3D printable lithophanes

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-191970?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)](https://reactjs.org/)

A sophisticated desktop application that converts digital images into high-quality STL files for 3D printing lithophanes. Built with modern web technologies and advanced image processing algorithms.

## ✨ Features

### 🎨 **Advanced Image Processing**
- **High-Resolution Processing**: Configurable resolution multiplier (1x-10x) for optimal quality
- **Edge Enhancement**: Unsharp mask algorithm for crisp detail preservation
- **Multiple Smoothing Methods**:
    - **Geometric**: 5x5 kernel with distance weighting (original)
    - **Laplacian**: Organic, flowing surfaces with curvature-based smoothing
    - **None**: No smoothing for maximum image preservation
- **Brightness-to-Thickness Mapping**: Intelligent conversion from image brightness to 3D height

### 🖱️ **User Experience**
- **Drag & Drop Support**: Simply drag and drop image files directly onto the preview area
- **File Picker**: Traditional file selection via button or keyboard shortcut (Ctrl/Cmd+O)
- **Image Preview**: Real-time preview of selected images with automatic dimension detection
- **Theme Support**: Light and dark and high-contrast themes with persistent preferences
- **Settings Persistence**: All settings and preferences are automatically saved


### 🔧 **Technical Excellence**
- **Cross-Platform**: Windows, macOS, and Linux support
- **Type Safety**: Full TypeScript implementation
- **Modern Architecture**: Electron + React + Vite stack
- **Performance Optimized**: Efficient memory usage and processing
- **IPC Communication**: Secure context isolation with preload scripts
- **Preferences Management**: Persistent user settings and window state

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/MacSwider/Half-Light.git
   cd Half-Light
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

4. **Build for production**
   ```bash
   npm run build
   ```

### Building Executables

```bash
# Windows
npm run dist:win

# macOS (ARM64)
npm run dist:mac

# Linux
npm run dist:linux
```

## 📖 Usage Guide

### Quick Start

1. **Select Image**: Drag & drop an image onto the preview area, or click "Choose Image File" (or press `Ctrl+O` / `Cmd+O`)
    - Supported formats: JPG, JPEG, PNG, BMP, GIF

2. **Configure Settings**:
    - **Dimensions**: Width and height in mm (auto-filled from image)
    - **Thickness**: Total lithophane thickness (0.1-10mm) - thinner = more detail but fragile
    - **Layer Height**: Your printer's layer height (0.12, 0.16, or 0.2mm)
    - **Resolution Multiplier**: Quality setting (1-10x) - start with 4x for best balance
    - **First Layer Height**: Thickness of brightest layer (0.1-5mm) - typically 0.8-1.0mm
    - **Smoothing Method**:
        - **Laplacian**: Best for photos/portraits (organic surfaces)
        - **Geometric**: Best for technical images/text (preserves edges)
        - **None**: Maximum image preservation
    - **Smoothing Strength**: 0.1 recommended, adjust as needed (0.01-1.0)
    - **Negative/Invert**: Invert brightness mapping
    - **Allow Frame**: Add 2mm border around lithophane

3. **Generate STL**: Click "Generate STL" (or press `Ctrl+G` / `Cmd+G`) and wait for processing

4. **Save or Open**: Download the STL file or open directly in your slicer (configure slicer path in Settings → Preferences)

### Recommended Settings

**Portraits/Photos**: Resolution 4x, Laplacian smoothing (0.1), Thickness 1.0mm, First Layer 0.8mm  
**Technical/Text**: Resolution 6x, Geometric smoothing (0.2), Thickness 1.2mm, First Layer 0.8mm

### Tips

- Use high-resolution, high-contrast images (1000x1000+ pixels)
- Black & white images often work better than color
- Print vertically with white/light filament, 100% infill, slow speed (30-50mm/s)
- Try to print with a brim to make sure the the model will not seperate
- **Too dark?** Increase First Layer Height or reduce thickness
- **Not enough detail?** Increase Resolution Multiplier or use "None" smoothing
- **Too rough?** Increase Resolution Multiplier or use Laplacian smoothing

```
halflight/
├── src/
│   ├── ui/                 # React frontend
│   │   ├── App.tsx        # Main application component
│   │   ├── main.tsx       # React entry point
│   │   └── styles/        # Modular CSS architecture
│   │       ├── index.css  # Main styles entry point
│   │       ├── base.css   # Base styles and reset
│   │       ├── components/ # Component-specific styles
│   │       │   ├── header.css
│   │       │   ├── image-preview.css
│   │       │   ├── settings.css
│   │       │   ├── controls.css
│   │       │   └── popup.css
│   │       └── themes/    # Theme definitions
│   │           ├── light.css
│   │           ├── dark.css
│   │           └── high-contrast.css
│   └── electron/          # Electron backend
│       ├── main.ts        # Main process entry point
│       ├── preload.cts    # IPC bridge
│       ├── core/          # Core processing logic
│       │   └── lithophaneProcessor.ts  # STL generation engine
│       ├── services/      # Application services
│       │   ├── preferences.ts  # User preferences management
│       │   └── smoothing/     # Image smoothing algorithms
│       │       └── smoothingAlgorithms.ts  # Multiple smoothing methods
│       └── utils/         # Utility functions
│           ├── pathResolver.ts  # Path resolution utilities
│           └── util.ts          # General utilities
├── dist/                  # Built application
├── dist-electron/         # Compiled Electron code
├── dist-react/           # Built React app
└── package.json          # Dependencies and scripts
```
