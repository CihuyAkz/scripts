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
            background: #090306 !important;
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
            overflow: auto !important;
            background:
                radial-gradient(ellipse at 50% 0%, rgba(170, 16, 42, .35), transparent 52%),
                radial-gradient(ellipse at 100% 100%, rgba(102, 6, 26, .3), transparent 48%),
                #090306 !important;
            color: #f7f0f2 !important;
            font: 15px/1.55 Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
            visibility: visible !important;
        }
        #ca-session-overlay * { box-sizing: border-box; }
        #ca-session-card {
            position: relative;
            isolation: isolate;
            width: min(100%, 460px);
            padding: clamp(28px, 6vw, 42px);
            overflow: hidden;
            border: 1px solid rgba(255, 91, 111, .31);
            border-radius: 24px;
            background: linear-gradient(150deg, rgba(39, 8, 16, .98), rgba(17, 5, 9, .99) 68%);
            box-shadow: 0 28px 100px rgba(0, 0, 0, .58), 0 0 0 1px rgba(255, 64, 87, .05), 0 0 72px rgba(165, 12, 40, .13);
            text-align: center;
            animation: ca-session-enter .38s cubic-bezier(.2,.75,.25,1) both;
        }
        #ca-session-card::before {
            position: absolute;
            z-index: -1;
            top: -100px;
            left: 50%;
            width: 270px;
            height: 160px;
            content: "";
            transform: translateX(-50%);
            border-radius: 50%;
            background: rgba(229, 36, 67, .2);
            filter: blur(48px);
            pointer-events: none;
        }
        @keyframes ca-session-enter {
            from { opacity: 0; transform: translateY(12px) scale(.985); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .ca-session-mark {
            display: grid;
            place-items: center;
            width: 68px;
            height: 68px;
            margin: 0 auto 22px;
            border: 1px solid rgba(255, 108, 126, .4);
            border-radius: 22px;
            background: linear-gradient(145deg, rgba(255, 55, 83, .2), rgba(133, 10, 34, .22));
            color: #ff727f;
            box-shadow: inset 0 1px 0 rgba(255,255,255,.05), 0 12px 38px rgba(150, 5, 30, .18);
        }
        .ca-session-mark svg { width: 30px; height: 30px; display: block; }
        .ca-session-kicker {
            margin: 0 0 9px !important;
            color: #ff8b98 !important;
            font-size: 10px !important;
            font-weight: 800 !important;
            letter-spacing: .2em !important;
            text-transform: uppercase;
        }
        #ca-session-card h2 {
            margin: 0 0 12px;
            color: #fff !important;
            font-size: clamp(23px, 5vw, 29px);
            font-weight: 750;
            line-height: 1.2;
            letter-spacing: -.035em;
        }
        #ca-session-card p { margin: 0; color: #d2b9bf; font-size: 14px; }
        #ca-session-card button {
            display: block;
            width: 100%;
            margin-top: 24px;
            padding: 13px 18px;
            border: 1px solid rgba(255, 171, 181, .2);
            border-radius: 12px;
            background: linear-gradient(135deg, #f0445d, #bd1739);
            color: #fff;
            font: inherit;
            font-weight: 750;
            letter-spacing: .01em;
            cursor: pointer;
            box-shadow: 0 12px 28px rgba(195, 20, 49, .22);
            transition: transform .18s ease, filter .18s ease, box-shadow .18s ease;
        }
        #ca-session-card button:hover { filter: brightness(1.08); box-shadow: 0 14px 32px rgba(195, 20, 49, .32); }
        #ca-session-card button:active { transform: scale(.985); }
        #ca-session-footnote {
            margin-top: 18px !important;
            color: #92727a !important;
            font-size: 11px !important;
        }
        @media (max-width: 480px) {
            #ca-session-overlay { padding: 16px !important; }
            #ca-session-card { border-radius: 20px; }
        }
        @media (prefers-reduced-motion: reduce) {
            #ca-session-card { animation: none; }
            #ca-session-card button { transition: none; }
        }
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
                const mark = document.createElement('div');
                mark.className = 'ca-session-mark';
                mark.setAttribute('aria-hidden', 'true');
                mark.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 21 7v5c0 5-3.8 8.2-9 9-5.2-.8-9-4-9-9V7l9-4Z"></path><path d="M12 8v4M12 16h.01"></path></svg>';
                const kicker = document.createElement('p');
                kicker.className = 'ca-session-kicker';
                kicker.textContent = 'Session Security';
                const title = document.createElement('h2');
                title.id = 'ca-session-title';
                const message = document.createElement('p');
                message.id = 'ca-session-message';
                const button = document.createElement('button');
                button.id = 'ca-session-renew';
                button.type = 'button';
                const footnote = document.createElement('p');
                footnote.id = 'ca-session-footnote';
                card.append(mark, kicker, title, message, button, footnote);
                overlay.appendChild(card);
                document.body.appendChild(overlay);
            }
            const title = document.getElementById('ca-session-title');
            const message = document.getElementById('ca-session-message');
            const button = document.getElementById('ca-session-renew');
            const footnote = document.getElementById('ca-session-footnote');
            button.onclick = null;
            button.style.display = 'none';
            footnote.textContent = 'Session duration: 6 hours.';

            if (mode === 'expired') {
                title.textContent = 'Session Expired';
                message.textContent = 'This 6-hour session has expired. Renew your session to continue browsing.';
                button.textContent = 'Renew Session';
                button.style.display = 'block';
                button.onclick = startNewSession;
            } else if (mode === 'device') {
                title.textContent = 'Other Device Detected';
                message.textContent = 'This session link is tied to another browser profile. Return to the main website and start a session on this browser.';
                footnote.textContent = 'Session links can only continue in the browser profile that created them.';
            } else if (mode === 'changed') {
                title.textContent = 'Invalid Session Link';
                message.textContent = 'This link no longer matches the active browser session. Open the main website to start a new session.';
                footnote.textContent = 'The session link is no longer active in this browser.';
            } else {
                title.textContent = 'Browser Storage Unavailable';
                message.textContent = 'This website needs browser storage to create your session. Enable site storage and reload the page.';
                footnote.textContent = 'A session cannot be created while browser storage is disabled.';
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
