/*
Copyright 2022 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import type { IChatrixConfig } from "./types/IChatrixConfig";
import { createRouter, Navigation } from "hydrogen-view-sdk";
import { ChatrixPlatform } from "./platform/ChatrixPlatform";
import { RootViewModel } from "./viewmodels/RootViewModel";
import { RootView } from "./ui/views/RootView";
import downloadSandboxPath from "hydrogen-view-sdk/download-sandbox.html?url";
import workerPath from "hydrogen-view-sdk/main.js?url";

const assetPaths = {
    downloadSandbox: downloadSandboxPath,
    worker: workerPath,
};

const rootDivId = "#chatrix";

async function fetchConfig(): Promise<IChatrixConfig> {
    const queryParams = new URLSearchParams(window.location.search);
    const configLink = queryParams.get("config");
    if (!configLink) {
        throw new Error("Root element does not have config specified");
    }
    const config: IChatrixConfig = await (await fetch(configLink)).json();
    return config;
}

function shouldStartMinimized(): boolean {
    return !!new URLSearchParams(window.location.search).get("minimized");
}

function getLoginToken(): string | null {
    return new URLSearchParams(window.location.search).get("loginToken");
}

function getLocalStorageKey(): string | null {
    return new URLSearchParams(window.location.search).get("localStorageKey");
}

async function main() {
    hideOnError();
    const root = document.querySelector(rootDivId) as HTMLDivElement;
    if (!root) {
        throw new Error("No element with id as 'chatrix' found!");
    }
    root.className = "hydrogen";
    const config = await fetchConfig();

    const localStorageKey = getLocalStorageKey();
    const platform = new ChatrixPlatform({container: root, assetPaths, config: {}, options: { development: import.meta.env.DEV }}, localStorageKey);
    attachLogExportToWindow(platform);
    const navigation = new Navigation(allowsChild);
    platform.setNavigation(navigation);
    const urlRouter = createRouter({ navigation, history: platform.history });
    const startMinimized = shouldStartMinimized();
    const loginToken = getLoginToken();
    const rootViewModel = new RootViewModel(config, {platform, navigation, urlCreator: urlRouter, startMinimized, loginToken});
    rootViewModel.start();
    const rootView = new RootView(rootViewModel);
    root.appendChild(rootView.mount());
}

function allowsChild(parent, child) {
    const { type } = child;
    switch (parent?.type) {
        case undefined:
            return type === "start" || type === "login" || type === "settings" || type === "timeline" || type === "minimize";
        default:
            return false;
    }
}

function attachLogExportToWindow(platform): void {
    (window as any).downloadLogs = async () => {
        const logs = await platform.logger.export();
        if (!logs && import.meta.env.DEV) {
            console.error(
                "Dev mode is not currently configured to collect persistent logs! Change the 'development' flag passed to Platform constructor to false or run Chatterbox from a true build."
            );
            return;
        }
        const accepted = confirm(
            "Debug logs contain application usage data including your username, " +
            "the IDs or aliases of the rooms or groups you have visited, " +
            "the usernames of other users and the names of files you send. " +
            "They do not contain messages. For more information, review our " +
            "privacy policy at https://element.io/privacy." +
            "\n\n" +
            "Continue to export logs?"
        );
        if (accepted) {
            platform.saveFileAs(logs.asBlob(), "chatterbox-logs.json");
        }
    }
}

function hideOnError() {
    // When an error occurs, log it and then hide everything!
    const handler = e => {
        if (e.message === "ResizeObserver loop completed with undelivered notifications." ||
            e.message === "ResizeObserver loop limit exceeded" ||
            // hydrogen renders an <img> with src = undefined while the image is being decrypted
            // todo: resolve this
            e.target.tagName === "IMG") {
            // see https://stackoverflow.com/a/64257593
            e.stopImmediatePropagation();
            return false;
        }
        console.error(e.error ?? e.reason);
        (window as any).sendError();
        return false;
    };
    window.addEventListener("error", handler, true);
    window.addEventListener("unhandledrejection", handler, true);
}


(window as any).sendViewChangeToParent = function (view: "timeline" | "login" | "settings") {
    window.parent?.postMessage({
        action: "resize-iframe",
        view
    }, "*");
};

(window as any).sendMinimizeToParent = function () {
    window.parent?.postMessage({ action: "minimize" }, "*");
};

(window as any).sendNotificationCount = function (count: number) {
    window.parent?.postMessage({ action: "unread-message", count }, "*");
};

(window as any).sendError = function () {
    window.parent?.postMessage({ action: "error" }, "*");
};

main();
