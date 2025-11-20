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
  - **None**: No smoothing for maximum detail preservation
- **Brightness-to-Thickness Mapping**: Intelligent conversion from image brightness to 3D height

### 🖱️ **User Experience**
- **Drag & Drop Support**: Simply drag and drop image files directly onto the preview area
- **File Picker**: Traditional file selection via button or keyboard shortcut (Ctrl/Cmd+O)
- **Image Preview**: Real-time preview of selected images with automatic dimension detection
- **Theme Support**: Light and dark themes with persistent preferences
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

### Getting Started

1. **Select an Image**
   - Click the "📁 Choose Image File" button, or
   - Use the keyboard shortcut `Ctrl+O` (Windows/Linux) or `Cmd+O` (macOS), or
   - **Drag and drop** an image file directly onto the preview area
   - Supported formats: JPG, JPEG, PNG, BMP, GIF

2. **Configure Settings**
   - **Dimensions**: Set width and height in millimeters (auto-filled from image dimensions)
   - **Thickness**: Total lithophane thickness (0.1-10mm)
   - **Layer Height**: Printing layer height (0.12, 0.16, or 0.2mm)
   - **Layer Number**: Number of layers (automatically calculated from thickness)
   - **Resolution Multiplier**: Quality multiplier (1-10x) - higher values create smoother surfaces
   - **First Layer Height**: Thickness of the brightest layer (0.1-5mm)
   - **Smoothing Method**: Choose between Geometric, Laplacian, or None
   - **Smoothing Strength**: Adjust smoothing intensity (0.01-1.0)
   - **Negative/Invert**: Toggle to invert brightness mapping
   - **Allow Frame**: Add a border around the lithophane

3. **Generate STL**
   - Click "🖨️ Generate STL" or use `Ctrl+G` (Windows/Linux) or `Cmd+G` (macOS)
   - Wait for processing to complete
   - Once generated, you can:
     - **Save STL File**: Download the STL file to your computer
     - **Open in Slicer**: Directly open the STL in your configured slicer application

### Tips for Best Results

- **Image Quality**: Higher resolution images produce better results
- **Contrast**: Images with good contrast work best for lithophanes
- **Resolution Multiplier**: Start with 4x for a good balance of quality and file size
- **Smoothing**: Use Laplacian smoothing for organic subjects, Geometric for technical images
- **Thickness**: Thinner lithophanes (0.8-1.2mm) show more detail but are more fragile

```
halflight/
├── src/
│   ├── ui/                 # React frontend
│   │   ├── App.tsx        # Main application component
│   │   ├── App.css        # Styling and responsive design
│   │   └── main.tsx       # React entry point
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
