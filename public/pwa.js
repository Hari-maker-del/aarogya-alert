(() => {
  const standalone = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  if ("serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" })
        .catch((error) => console.warn("AAROGYA ALERT offline shell is unavailable:", error));
    });
  }

  const style = document.createElement("style");
  style.textContent = `
    #aarogya-pwa-tools{position:fixed;right:16px;bottom:16px;z-index:10000;display:flex;align-items:center;gap:10px;max-width:min(420px,calc(100vw - 32px));padding:10px 12px;border:1px solid #d9ddd5;border-radius:14px;background:#fffdf8;color:#243b38;box-shadow:0 8px 28px #102a271f;font:500 13px/1.4 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    #aarogya-pwa-tools[hidden]{display:none}
    #aarogya-pwa-tools .pwa-message{flex:1}
    #aarogya-pwa-tools .pwa-action{border:0;border-radius:9px;background:#123c3a;color:white;padding:9px 12px;font:600 13px system-ui;cursor:pointer;white-space:nowrap}
    #aarogya-pwa-tools .pwa-close{border:0;background:transparent;color:#53625e;padding:4px;cursor:pointer;font-size:18px}
    #aarogya-pwa-tools .pwa-status{display:inline-block;width:8px;height:8px;border-radius:50%;background:#22845b;margin-right:7px}
    #aarogya-pwa-tools .pwa-status.offline{background:#c45b38}
    @media(max-width:480px){#aarogya-pwa-tools{right:10px;bottom:10px;max-width:calc(100vw - 20px)}}
  `;
  document.head.appendChild(style);

  const tools = document.createElement("aside");
  tools.id = "aarogya-pwa-tools";
  tools.setAttribute("aria-live", "polite");
  tools.hidden = true;
  tools.innerHTML = '<span class="pwa-status" aria-hidden="true"></span><span class="pwa-message"></span><button class="pwa-action" type="button"></button><button class="pwa-close" type="button" aria-label="Dismiss message">×</button>';
  document.addEventListener("DOMContentLoaded", () => document.body.appendChild(tools));

  const message = tools.querySelector(".pwa-message");
  const action = tools.querySelector(".pwa-action");
  const close = tools.querySelector(".pwa-close");
  const status = tools.querySelector(".pwa-status");
  let installPrompt = null;
  let dismissedInstall = false;

  function show(text, buttonText, onAction, isOffline = false) {
    if (!tools.isConnected) {
      if (document.body) document.body.appendChild(tools);
      else return;
    }
    message.textContent = text;
    action.textContent = buttonText || "";
    action.hidden = !buttonText;
    action.onclick = onAction || null;
    status.classList.toggle("offline", isOffline);
    tools.hidden = false;
  }

  function updateConnection() {
    if (!navigator.onLine) {
      show("You’re offline. Live alerts and investigation updates are unavailable.", "", null, true);
    } else if (tools.dataset.offline === "true") {
      tools.dataset.offline = "false";
      tools.hidden = true;
    }
  }

  window.addEventListener("offline", () => {
    tools.dataset.offline = "true";
    show("You’re offline. Live alerts and investigation updates are unavailable.", "", null, true);
  });
  window.addEventListener("online", () => {
    tools.dataset.offline = "false";
    show("Connection restored. Refresh data before making decisions.", "Dismiss", () => { tools.hidden = true; });
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    if (!standalone() && !dismissedInstall) {
      show("Install AAROGYA ALERT for quick access.", "Install", async () => {
        if (!installPrompt) return;
        installPrompt.prompt();
        await installPrompt.userChoice.catch(() => null);
        installPrompt = null;
        tools.hidden = true;
      });
    }
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    tools.hidden = true;
  });

  close.addEventListener("click", () => {
    if (installPrompt) dismissedInstall = true;
    tools.hidden = true;
  });

  if (standalone()) tools.hidden = true;
  else if (!navigator.onLine) updateConnection();
  else {
    // Safari/iOS does not fire beforeinstallprompt. Offer concise manual instructions.
    window.setTimeout(() => {
      if (!standalone() && !installPrompt && !dismissedInstall && tools.hidden) {
        show("Add this app to your home screen for app-like access.", "How to install", () => {
          const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
          const instructions = ios
            ? "On iPhone/iPad: open this page in Safari, tap Share, then Add to Home Screen."
            : "In your browser menu, choose Install app or Add to Home screen if available.";
          show(instructions, "Got it", () => { dismissedInstall = true; tools.hidden = true; });
        });
      }
    }, 1800);
  }
})();
