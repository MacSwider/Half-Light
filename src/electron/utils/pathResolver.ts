import {isDev} from "./util.js";
import path from "path";
import {app} from "electron";

export function getPreloadPath(){
    return path.join(
        app.getAppPath(),
        isDev() ? '.' : '..',
        '/dist-electron/preload.cjs',
    );
}

export function getUIPath(){
    return path.join(app.getAppPath(), "/dist-react/index.html");
}

export function getSettingsWindowPath(){
    return path.join(app.getAppPath(), isDev() ? 'src/electron/windows' : 'dist-electron/windows', 'settings.html');
}

export function getIconPath(){
    if (isDev()) {
        return path.join(app.getAppPath(), 'src/ui/assets/icon.png');
    } else {
        return path.join(app.getAppPath(), 'dist-react/assets/icon.png');
    }
}

