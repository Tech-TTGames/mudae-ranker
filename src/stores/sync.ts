import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { AppSavePayload } from '@/types/app';

export const useSyncStore = defineStore('sync', () => {
    // --- Configuration ---
    const APP_CLIENT_ID = "Iv23likoa1dq7SF8pdRm";
    const WORKER_URL = "/a/token";
    const GIST_FILENAME = 'mudae_ranker_sync.json';

    // --- State ---
    const githubToken = ref(localStorage.getItem('gh_sync_token') || '');
    const gistId = ref(localStorage.getItem('gh_sync_gist_id') || '');
    const deviceId = ref(getOrCreateDeviceId());

    const isSyncing = ref(false);
    const syncError = ref<string | null>(null);
    const lastSyncedCloudState = ref<string | null>(null);

    // --- Helpers ---
    function getOrCreateDeviceId(): string {
        let id = localStorage.getItem('mudr_device_id');
        if (!id) {
            id = 'device_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
            localStorage.setItem('mudr_device_id', id);
        }
        return id;
    }

    // --- Actions: Authentication & Initialization ---

    /**
     * Redirects the user to GitHub for OAuth consent.
     */
    function redirectToGitHub() {
        const redirectUri = window.location.origin + window.location.pathname;
        window.location.href = `https://github.com/login/oauth/authorize?client_id=${APP_CLIENT_ID}&scope=gist&redirect_uri=${encodeURIComponent(redirectUri)}`;
    }

    /**
     * Exchanges the URL auth code for an access token via the backend worker.
     */
    async function exchangeAuthCodeForToken(authCode: string): Promise<string> {
        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: authCode })
        });

        const data = await response.json();

        if (data && data.access_token) {
            return data.access_token;
        }
        throw new Error(data.error_description || 'Token retrieval failed.');
    }

    /**
     * Scans the user's Gists for the sync file, or creates a private one if it doesn't exist.
     */
    async function findOrCreateSyncGist(token: string, initialPayload: string): Promise<{ id: string, isNew: boolean }> {
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json'
        };

        // 1. Search for existing Gist
        const getResponse = await fetch('https://api.github.com/gists?per_page=100', { headers });
        const gists = await getResponse.json();

        const existingGist = Array.isArray(gists) ? gists.find(g => g.files && g.files[GIST_FILENAME]) : null;

        if (existingGist) {
            return { id: existingGist.id, isNew: false };
        }

        // 2. Create new Gist if not found
        const createResponse = await fetch('https://api.github.com/gists', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                description: "Mudae Ranker Cross-device Sync Data",
                public: false,
                files: {
                    [GIST_FILENAME]: {
                        content: initialPayload
                    }
                }
            })
        });

        const createData = await createResponse.json();
        return { id: createData.id, isNew: true };
    }

    function setCredentials(token: string, id: string) {
        githubToken.value = token;
        gistId.value = id;
        localStorage.setItem('gh_sync_token', token);
        localStorage.setItem('gh_sync_gist_id', id);
    }

    function clearCredentials() {
        githubToken.value = '';
        gistId.value = '';
        localStorage.removeItem('gh_sync_token');
        localStorage.removeItem('gh_sync_gist_id');
    }

    // --- Actions: Data I/O ---

    async function pullFromGist(): Promise<AppSavePayload | null> {
        if (!githubToken.value || !gistId.value) return null;

        isSyncing.value = true;
        syncError.value = null;
        const cacheBuster = new Date().getTime();

        try {
            const response = await fetch(`https://api.github.com/gists/${gistId.value}?t=${cacheBuster}`, {
                headers: {
                    Authorization: `Bearer ${githubToken.value}`,
                    Accept: 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) throw new Error(`GitHub API Error: ${response.status}`);

            const data = await response.json();
            const file = data.files[GIST_FILENAME];

            if (file && file.content) {
                lastSyncedCloudState.value = file.content;
                return JSON.parse(file.content) as AppSavePayload;
            }
            throw new Error("Sync file missing inside target Gist.");
        } catch (error: any) {
            console.error("Gist Pull Error:", error);
            syncError.value = error.message;
            return null;
        } finally {
            isSyncing.value = false;
        }
    }

    async function pushToGist(payload: AppSavePayload): Promise<boolean> {
        if (!githubToken.value || !gistId.value) return false;

        const payloadString = JSON.stringify(payload);

        // OPTIMIZATION: Skip the PATCH request if the data hasn't mutated
        if (lastSyncedCloudState.value === payloadString) {
            return true;
        }

        isSyncing.value = true;
        syncError.value = null;

        try {
            const requestBody = {
                files: {
                    [GIST_FILENAME]: {
                        content: payloadString
                    }
                }
            };

            const response = await fetch(`https://api.github.com/gists/${gistId.value}`, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${githubToken.value}`,
                    Accept: 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) throw new Error(`GitHub API Error: ${response.status}`);

            lastSyncedCloudState.value = payloadString;
            return true;
        } catch (error: any) {
            console.error("Gist Push Error:", error);
            syncError.value = error.message;
            return false;
        } finally {
            isSyncing.value = false;
        }
    }

    return {
        githubToken,
        gistId,
        deviceId,
        isSyncing,
        syncError,
        redirectToGitHub,
        exchangeAuthCodeForToken,
        findOrCreateSyncGist,
        setCredentials,
        clearCredentials,
        pullFromGist,
        pushToGist
    };
});
