import { isTrustedAppBaseUrl } from './trustedOrigin.js';

const isNode = typeof window === 'undefined';
const windowObj = isNode ? { localStorage: new Map() } : window;
// Every call site below is reached only through getAppParamValue, which
// returns early `if (isNode)` before ever touching `storage` — so in
// practice this is always the real Storage, never the Map placeholder used
// just to keep `windowObj.localStorage` non-null in a Node/SSR context.
// TS can't see that cross-function guarantee, hence the cast.
const storage = /** @type {Storage} */ (windowObj.localStorage);

// Fallback backend origin, used only when nothing else supplies one.
//
// Without this the app is unusable on a fresh clone. Every env file is
// gitignored, so `import.meta.env.VITE_BASE44_APP_BASE_URL` is undefined by
// default, and `appBaseUrl` came out as null — which the SDK then interpolated
// straight into its URLs, sending "Sign In" to `null/login` and logout to
// `null/api/apps/auth/logout`. Verified against @base44/sdk's auth module:
// redirectToLogin() and logout() both template appBaseUrl directly.
//
// app.base44.com is the platform API host and is confirmed to serve this app:
// its public-settings endpoint answers 403 auth_required for this app id, and
// 404 App not found for an id that doesn't exist.
//
// This is the LAST resort — see getAppParams below for the precedence order,
// which keeps a platform-supplied or self-hosted origin ahead of it.
export const DEFAULT_APP_BASE_URL = 'https://app.base44.com';

// Fallback app id, for the same reason as the origin above: with every .env
// file gitignored, `import.meta.env.VITE_BASE44_APP_ID` is undefined on a
// fresh clone, so AuthContext requested
// `/public-settings/by-id/undefined` and sent `X-App-Id: undefined`.
//
// MUST equal the "id" in base44/.app.jsonc, which is the canonical value for
// this app. Guarded by src/lib/app-params.test.js so the two cannot drift.
export const DEFAULT_APP_ID = '69f0913914dfde6303da8626';

const toSnakeCase = (str) => {
	return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

const getAppParamValue = (paramName, { defaultValue = undefined, removeFromUrl = false } = {}) => {
	if (isNode) {
		return defaultValue;
	}
	const storageKey = `base44_${toSnakeCase(paramName)}`;
	const urlParams = new URLSearchParams(window.location.search);
	const searchParam = urlParams.get(paramName);
	if (removeFromUrl) {
		urlParams.delete(paramName);
		const newUrl = `${window.location.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ""
			}${window.location.hash}`;
		window.history.replaceState({}, document.title, newUrl);
	}
	if (searchParam) {
		storage.setItem(storageKey, searchParam);
		return searchParam;
	}
	if (defaultValue) {
		storage.setItem(storageKey, defaultValue);
		return defaultValue;
	}
	const storedValue = storage.getItem(storageKey);
	if (storedValue) {
		return storedValue;
	}
	return null;
}

// Resolves the backend origin and refuses to honour an untrusted one,
// whether it arrived in the URL just now or was persisted by an earlier
// crafted link.
const resolveAppBaseUrl = () => {
	const candidate = getAppParamValue("app_base_url", {
		defaultValue: import.meta.env.VITE_BASE44_APP_BASE_URL,
	});
	const origin = isNode ? null : window.location.origin;
	if (candidate && isTrustedAppBaseUrl(candidate, origin)) {
		return candidate;
	}
	if (candidate && !isNode) {
		// Purge a poisoned value so it cannot keep redirecting on later visits.
		try {
			storage.removeItem("base44_app_base_url");
		} catch {
			// Storage unavailable — the value is being ignored regardless.
		}
		console.warn("Ignoring untrusted app_base_url:", candidate);
	}
	return DEFAULT_APP_BASE_URL;
};

const getAppParams = () => {
	if (getAppParamValue("clear_access_token") === 'true') {
		storage.removeItem('base44_access_token');
		storage.removeItem('token');
	}
	return {
		appId:
			getAppParamValue("app_id", { defaultValue: import.meta.env.VITE_BASE44_APP_ID }) ||
			DEFAULT_APP_ID,
		token: getAppParamValue("access_token", { removeFromUrl: true }),
		fromUrl: getAppParamValue("from_url", { defaultValue: window.location.href }),
		functionsVersion: getAppParamValue("functions_version", { defaultValue: import.meta.env.VITE_BASE44_FUNCTIONS_VERSION }),
		appBaseUrl: resolveAppBaseUrl(),
	}
}


export const appParams = {
	...getAppParams()
}
