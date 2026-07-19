if (navigator.userAgent.includes("Firefox")) {
	Object.defineProperty(globalThis, "crossOriginIsolated", {
		value: true,
		writable: false,
	});
}

importScripts("/uv/uv.bundle.js");
importScripts("/uv/uv.config.js");
importScripts("/uv/uv.sw.js");
importScripts("/sj/scramjet.all.js");
const { ScramjetServiceWorker } = $scramjetLoadWorker();
const uvSW = new UVServiceWorker();

const CONFIG = {
	inject: {
		html: "\x3c!-- pr0x1ed by vapor's static sj --\x3e",
	},
	blocked: [
		"youtube.com/get_video_info?*adformat=*",
		"youtube.com/api/stats/ads/*",
		"youtube.com/pagead/*",
		".facebook.com/ads/*",
		".facebook.com/tr/*",
		".fbcdn.net/ads/*",
		"graph.facebook.com/ads/*",
		"ads-api.twitter.com/*",
		"analytics.twitter.com/*",
		".twitter.com/i/ads/*",
		".ads.yahoo.com",
		".advertising.com",
		".adtechus.com",
		".oath.com",
		".verizonmedia.com",
		".amazon-adsystem.com",
		"aax.amazon-adsystem.com/*",
		"c.amazon-adsystem.com/*",
		".adnxs.com",
		".adnxs-simple.com",
		"ab.adnxs.com/*",
		".rubiconproject.com",
		".magnite.com",
		".pubmatic.com",
		"ads.pubmatic.com/*",
		".criteo.com",
		"bidder.criteo.com/*",
		"static.criteo.net/*",
		".openx.net",
		".openx.com",
		".indexexchange.com",
		".casalemedia.com",
		".adcolony.com",
		".chartboost.com",
		".unityads.unity3d.com",
		".inmobiweb.com",
		".tapjoy.com",
		".applovin.com",
		".vungle.com",
		".ironsrc.com",
		".fyber.com",
		".smaato.net",
		".supersoniads.com",
		".startappservice.com",
		".airpush.com",
		".outbrain.com",
		".taboola.com",
		".revcontent.com",
		".zedo.com",
		".mgid.com",
		"*/ads/*",
		"*/adserver/*",
		"*/adclick/*",
		"*/banner_ads/*",
		"*/sponsored/*",
		"*/promotions/*",
		"*/tracking/ads/*",
		"*/promo/*",
		"*/affiliates/*",
		"*/partnerads/*",
	],
};

const SCRAMJET_DB_NAME = "$scramjet";
const SCRAMJET_REQUIRED_STORES = [
	"config",
	"cookies",
	"redirectTrackers",
	"referrerPolicies",
	"publicSuffixList",
];

function openIndexedDb(name, version) {
	return new Promise((resolve, reject) => {
		const request =
			typeof version === "number"
				? indexedDB.open(name, version)
				: indexedDB.open(name);

		request.onsuccess  = () => resolve(request.result);
		request.onerror    = () => reject(request.error || new Error(`Failed to open IndexedDB database: ${name}`));
		request.onblocked  = () => reject(new Error(`IndexedDB open blocked for ${name}`));
	});
}

function deleteIndexedDb(name) {
	return new Promise((resolve, reject) => {
		const request = indexedDB.deleteDatabase(name);
		request.onsuccess  = () => resolve(true);
		request.onerror    = () => reject(request.error || new Error(`Failed to delete IndexedDB database: ${name}`));
		request.onblocked  = () => reject(new Error(`IndexedDB delete blocked for ${name}`));
	});
}

async function repairScramjetDatabase() {
	let db;

	try {
		db = await openIndexedDb(SCRAMJET_DB_NAME);
	} catch (err) {
		console.warn("Unable to inspect Scramjet database in service worker:", err);
		return;
	}

	const missingStores = SCRAMJET_REQUIRED_STORES.filter(
		(store) => !db.objectStoreNames.contains(store)
	);

	db.close();

	if (missingStores.length === 0) return;

	console.warn("Repairing Scramjet database in service worker, missing stores:", missingStores);
	await deleteIndexedDb(SCRAMJET_DB_NAME);
}

let scramjetPromise = null;

async function getScramjet() {
	if (!scramjetPromise) {
		scramjetPromise = (async () => {
			await repairScramjetDatabase();
			const scramjet = new ScramjetServiceWorker();
			scramjet.addEventListener("request", handleScramjetRequest);
			return scramjet;
		})().catch((err) => {
			scramjetPromise = null;
			throw err;
		});
	}
	return scramjetPromise;
}

function toRegex(pattern) {
	return new RegExp(
		`^${pattern
			.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
			.replace(/\*\*/g, "{{DS}}")
			.replace(/\*/g,   "[^/]*")
			.replace(/{{DS}}/g, ".*")}$`
	);
}

function isBlocked(hostname, pathname) {
	return CONFIG.blocked.some((raw) => {
		let pattern = raw.startsWith("#") ? raw.slice(1) : raw;
		if (pattern.startsWith("*")) pattern = pattern.slice(1);

		if (pattern.includes("/")) {
			const slash = pattern.indexOf("/");
			const hostRegex = toRegex(pattern.slice(0, slash));
			const pathRegex = toRegex(`/${pattern.slice(slash + 1)}`);
			return hostRegex.test(hostname) && pathRegex.test(pathname);
		}

		return toRegex(pattern).test(hostname);
	});
}

function inject(html) {
	return html.replace(/<head[^>]*>/i, (match) => `${match}${CONFIG.inject.html}`);
}

let playgroundData;

async function handleRequest(event) {
	const scramjet = await getScramjet();
	await scramjet.loadConfig();

	if (!scramjet.route(event)) {
		return fetch(event.request);
	}

	const response    = await scramjet.fetch(event);
	const contentType = response.headers.get("content-type") || "";

	if (!contentType.includes("text/html")) return response;

	const modified   = inject(await response.text());
	const byteLength = new TextEncoder().encode(modified).length;
	const headers    = new Headers(response.headers);
	headers.set("content-length", byteLength.toString());

	return new Response(modified, {
		status:     response.status,
		statusText: response.statusText,
		headers,
	});
}

function handleScramjetRequest(e) {
	if (isBlocked(e.url.hostname, e.url.pathname)) {
		e.response = new Response("Site Blocked", { status: 403 });
		return;
	}

	if (!playgroundData || !e.url.href.startsWith(playgroundData.origin)) return;

	const routes = {
		"/":          { content: playgroundData.html, type: "text/html" },
		"/style.css": { content: playgroundData.css,  type: "text/css" },
		"/script.js": { content: playgroundData.js,   type: "application/javascript" },
	};

	const route = routes[e.url.pathname];

	if (!route) {
		e.response = new Response("empty response", { headers: {} });
		return;
	}

	const content = route.type === "text/html" ? inject(route.content) : route.content;
	const headers = { "content-type": route.type };

	e.response = new Response(content, { headers });
	e.response.rawHeaders  = headers;
	e.response.rawResponse = {
		body:       e.response.body,
		headers,
		status:     e.response.status,
		statusText: e.response.statusText,
	};
	e.response.finalURL = e.url.toString();
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
	event.waitUntil(self.clients.claim());
});

const UV_PREFIX = "/uv/service/";
const SJ_PREFIX = "/sj/service/";

self.addEventListener("fetch", (event) => {
	const url = event.request.url;
	// UV proxy requests
	if (url.includes(UV_PREFIX)) {
		event.respondWith(uvSW.fetch(event));
		return;
	}
	// SJ proxy requests
	if (url.includes(SJ_PREFIX)) {
		event.respondWith(handleRequest(event));
		return;
	}
	// Everything else — let the browser handle natively
});

self.addEventListener("message", ({ data }) => {
	if (data.type === "playgroundData") {
		playgroundData = data;
	}
});