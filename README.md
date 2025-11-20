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


### 🔧 **Technical Excellence**
- **Cross-Platform**: Windows, macOS, and Linux support
- **Type Safety**: Full TypeScript implementation
- **Modern Architecture**: Electron + React + Vite stack
- **Performance Optimized**: Efficient memory usage and processing

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

T.B.A

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
