(function () {
    'use strict';

    const SESSION_KEY = 'cihuyakz_browser_session_v1';
    const DEVICE_KEY = 'cihuyakz_browser_device_v1';
    const SESSION_PARAM = '__ca_session';
    const DEVICE_PARAM = '__ca_device';
    const SESSION_TTL = 6 * 60 * 60 * 1000;
    const REDIRECT_DELAY = 450;
    let activeSession = null;
    let expirationTimer = null;

    document.documentElement.classList.add('ca-session-locked');

    const gateStyle = document.createElement('style');
    gateStyle.textContent = `
        html.ca-session-locked, html.ca-session-locked body {
            background: #fff !important;
        }
        html.ca-session-locked body > :not(#ca-session-overlay) {
            visibility: hidden !important;
        }
        #ca-session-overlay {
            position: fixed !important;
            inset: 0 !important;
            z-index: 2147483647 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 24px !important;
            box-sizing: border-box !important;
            background: #0d0d10 !important;
            color: #f4f4f5 !important;
            font: 15px/1.55 Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
            visibility: visible !important;
        }
        #ca-session-overlay * { box-sizing: border-box; }
        #ca-session-card {
            width: min(100%, 420px);
            padding: 28px;
            border: 1px solid #34343c;
            border-radius: 18px;
            background: #17171c;
            box-shadow: 0 24px 80px rgba(0,0,0,.42);
            text-align: center;
        }
        #ca-session-card h2 { margin: 0 0 10px; color: #fff; font-size: 22px; line-height: 1.25; }
        #ca-session-card p { margin: 0; color: #bcbcc5; font-size: 14px; }
        #ca-session-card button {
            width: 100%; margin-top: 22px; padding: 12px 16px; border: 0; border-radius: 10px;
            background: #e5484d; color: #fff; font: inherit; font-weight: 700; cursor: pointer;
        }
        #ca-session-card button:hover { background: #f15b61; }
        #ca-session-footnote { margin-top: 14px !important; color: #777783 !important; font-size: 12px !important; }
    `;
    document.head.appendChild(gateStyle);

    function randomHex(bytes) {
        const values = new Uint8Array(bytes);
        if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
            window.crypto.getRandomValues(values);
            return Array.from(values, value => value.toString(16).padStart(2, '0')).join('');
        }
        let output = '';
        for (let i = 0; i < bytes; i++) output += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
        return output;
    }

    function storageGet(key) {
        try { return window.localStorage.getItem(key); } catch (_) { return null; }
    }

    function storageSet(key, value) {
        try { window.localStorage.setItem(key, value); return true; } catch (_) { return false; }
    }

    function readSession() {
        try {
            const value = JSON.parse(storageGet(SESSION_KEY) || 'null');
            if (!value || typeof value.token !== 'string' || typeof value.deviceId !== 'string' || !Number.isFinite(value.expiresAt)) return null;
            return value;
        } catch (_) { return null; }
    }

    function getDeviceId() {
        let deviceId = storageGet(DEVICE_KEY);
        if (!deviceId) {
            deviceId = randomHex(16);
            storageSet(DEVICE_KEY, deviceId);
        }
        return deviceId;
    }

    function updateUrl(token, deviceId) {
        const url = new URL(window.location.href);
        url.searchParams.set(SESSION_PARAM, token);
        url.searchParams.set(DEVICE_PARAM, deviceId);
        window.location.replace(url.href);
    }

    function startNewSession() {
        const deviceId = getDeviceId();
        const session = {
            token: randomHex(20),
            deviceId,
            issuedAt: Date.now(),
            expiresAt: Date.now() + SESSION_TTL
        };
        if (!storageSet(SESSION_KEY, JSON.stringify(session))) {
            showPanel('storage');
            return;
        }
        updateUrl(session.token, deviceId);
    }

    function lockPage() {
        document.documentElement.classList.add('ca-session-locked');
    }

    function unlockPage() {
        document.documentElement.classList.remove('ca-session-locked');
        const overlay = document.getElementById('ca-session-overlay');
        if (overlay) overlay.remove();
    }

    function showPanel(mode) {
        lockPage();
        const render = function () {
            if (!document.body) return;
            let overlay = document.getElementById('ca-session-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'ca-session-overlay';
                overlay.setAttribute('role', 'dialog');
                overlay.setAttribute('aria-modal', 'true');
                const card = document.createElement('div');
                card.id = 'ca-session-card';
                const title = document.createElement('h2');
                title.id = 'ca-session-title';
                const message = document.createElement('p');
                message.id = 'ca-session-message';
                const button = document.createElement('button');
                button.id = 'ca-session-renew';
                button.type = 'button';
                const footnote = document.createElement('p');
                footnote.id = 'ca-session-footnote';
                card.append(title, message, button, footnote);
                overlay.appendChild(card);
                document.body.appendChild(overlay);
            }
            const title = document.getElementById('ca-session-title');
            const message = document.getElementById('ca-session-message');
            const button = document.getElementById('ca-session-renew');
            const footnote = document.getElementById('ca-session-footnote');
            button.onclick = null;
            button.style.display = 'none';
            footnote.textContent = 'Masa sesi: 30 menit sejak sesi dibuat.';

            if (mode === 'expired') {
                title.textContent = 'Sesi sudah kedaluwarsa';
                message.textContent = 'Sesi ini sudah melewati batas 30 menit. Perbarui sesi untuk membuka website lagi.';
                button.textContent = 'Perbarui Sesi';
                button.style.display = 'block';
                button.onclick = startNewSession;
            } else if (mode === 'device') {
                title.textContent = 'Tautan ini terikat ke browser lain';
                message.textContent = 'Buka tautan sesi dari profil browser yang pertama kali membuatnya. URL saja tidak dapat memindahkan sesi ini.';
                footnote.textContent = 'Mode sederhana: penguncian hanya berlaku pada profil browser, bukan pemeriksaan server.';
            } else if (mode === 'changed') {
                title.textContent = 'Tautan sesi tidak berlaku';
                message.textContent = 'URL ini sudah bukan sesi aktif di browser ini. Buka alamat website utama untuk memulai atau memperbarui sesi.';
                footnote.textContent = 'Mode sederhana: perlindungan dilakukan di browser.';
            } else {
                title.textContent = 'Penyimpanan browser tidak tersedia';
                message.textContent = 'Website perlu menyimpan sesi di browser. Aktifkan penyimpanan situs lalu muat ulang halaman.';
                footnote.textContent = 'Sesi tidak dapat dibuat tanpa localStorage.';
            }
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once: true });
        else render();
    }

    function attachSessionToLink(link) {
        if (!activeSession || !link || !link.getAttribute('href')) return;
        const rawHref = link.getAttribute('href').trim();
        if (!rawHref || rawHref.startsWith('#') || /^(javascript:|mailto:|tel:|data:)/i.test(rawHref)) return;
        try {
            const target = new URL(rawHref, window.location.href);
            if (target.origin !== window.location.origin) return;
            if (/\.(?:css|js|mjs|json|lua|png|jpe?g|gif|svg|ico|webp|woff2?|ttf|otf|map|pdf|zip)$/i.test(target.pathname)) return;
            target.searchParams.set(SESSION_PARAM, activeSession.token);
            target.searchParams.set(DEVICE_PARAM, activeSession.deviceId);
            link.href = target.href;
        } catch (_) {}
    }

    function propagateSessionToLinks() {
        if (!activeSession || !document.body) return;
        document.querySelectorAll('a[href]').forEach(attachSessionToLink);
        if (window.MutationObserver) {
            const observer = new MutationObserver(records => {
                records.forEach(record => record.addedNodes.forEach(node => {
                    if (node.nodeType !== 1) return;
                    if (node.matches && node.matches('a[href]')) attachSessionToLink(node);
                    if (node.querySelectorAll) node.querySelectorAll('a[href]').forEach(attachSessionToLink);
                }));
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
        document.addEventListener('click', event => {
            const link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
            if (link) attachSessionToLink(link);
        }, true);
    }

    const deviceId = getDeviceId();
    const params = new URLSearchParams(window.location.search);
    const suppliedToken = params.get(SESSION_PARAM);
    const suppliedDevice = params.get(DEVICE_PARAM);
    const session = readSession();
    const now = Date.now();

    if (!storageGet(DEVICE_KEY)) {
        showPanel('storage');
        return;
    }

    if (!suppliedToken) {
        if (session && session.expiresAt <= now) {
            showPanel('expired');
            return;
        }
        if (session && session.expiresAt > now) {
            window.setTimeout(() => updateUrl(session.token, session.deviceId), REDIRECT_DELAY);
            return;
        }
        window.setTimeout(startNewSession, REDIRECT_DELAY);
        return;
    }

    if (!suppliedDevice || suppliedDevice !== deviceId || (session && suppliedDevice !== session.deviceId)) {
        showPanel('device');
        return;
    }

    if (!session) {
        showPanel('expired');
        return;
    }

    if (session.token !== suppliedToken) {
        showPanel('changed');
        return;
    }

    if (session.expiresAt <= now) {
        showPanel('expired');
        return;
    }

    activeSession = session;
    unlockPage();
    propagateSessionToLinks();
    expirationTimer = window.setInterval(() => {
        const current = readSession();
        if (!current || current.token !== activeSession.token || current.expiresAt <= Date.now()) {
            if (expirationTimer) window.clearInterval(expirationTimer);
            showPanel('expired');
        }
    }, 1000);
    window.addEventListener('pageshow', () => {
        const current = readSession();
        if (!current || current.token !== activeSession.token || current.expiresAt <= Date.now()) showPanel('expired');
    });
})();
