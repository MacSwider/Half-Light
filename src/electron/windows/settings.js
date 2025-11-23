// Settings Window Script
let currentTheme = 'light';
let currentSlicerPath = null;

// Get initial theme
window.electron.getTheme().then(theme => {
    currentTheme = theme;
    updateUI();
});

// Get initial slicer path
window.electron.getPreference('slicerPath').then(path => {
    currentSlicerPath = path;
    updateSlicerPath();
});

// Listen for theme changes
window.electron.onThemeChanged((theme) => {
    currentTheme = theme;
    updateUI();
});

function updateUI() {
    document.documentElement.setAttribute('data-theme', currentTheme);
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) {
        themeSelect.value = currentTheme;
    }
}

function updateSlicerPath() {
    const display = document.getElementById('slicer-path-display');
    if (currentSlicerPath) {
        display.textContent = currentSlicerPath;
        display.classList.remove('empty');
    } else {
        display.textContent = 'No slicer selected';
        display.classList.add('empty');
    }
}

const themeSelect = document.getElementById('theme-select');
if (themeSelect) {
    themeSelect.addEventListener('change', (e) => {
        const selectedTheme = e.target.value;
        window.electron.setTheme(selectedTheme);
    });
}

document.getElementById('select-slicer-btn').addEventListener('click', async () => {
    try {
        const path = await window.electron.selectSlicer();
        if (path) {
            currentSlicerPath = path;
            updateSlicerPath();
        }
    } catch (error) {
        // Error logging handled by main process
        alert('Error selecting slicer: ' + (error.message || 'Unknown error'));
    }
});

