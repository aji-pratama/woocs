import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App";

declare global {
  interface Window {
    WooCS?: { store_id: string; api_url: string; store_name?: string; css_url?: string };
  }
}

const rootElement = document.getElementById("woocs-widget-root");
if (rootElement) {
  // Use Shadow DOM for perfect style isolation
  const shadow = rootElement.attachShadow({ mode: "open" });
  const reactRoot = document.createElement("div");
  shadow.appendChild(reactRoot);

  createRoot(reactRoot).render(
    <StrictMode>
      <App />
    </StrictMode>
  );

  // Load styles into Shadow DOM
  // @ts-ignore
  if (import.meta.env.DEV) {
    // In dev mode, Vite injects <style> tags into <head>. Copy them into Shadow DOM.
    const copyDevStyles = () => {
      document.head.querySelectorAll('style').forEach(style => {
        const id = style.getAttribute('data-vite-dev-id');
        const isTailwind = style.textContent?.includes('--color-primary') || style.textContent?.includes('oklch');
        
        if (id) {
          // Standard Vite CSS
          if (!shadow.querySelector(`style[data-vite-dev-id="${id}"]`)) {
            shadow.appendChild(style.cloneNode(true));
          } else {
            // Update for HMR just in case it mutated
            const existing = shadow.querySelector(`style[data-vite-dev-id="${id}"]`);
            if (existing && existing.textContent !== style.textContent) {
              existing.textContent = style.textContent;
            }
          }
        } else if (isTailwind) {
          // Tailwind v4 CSS (often injected without data-vite-dev-id)
          if (!shadow.querySelector(`style[data-tw-fallback="true"]`)) {
            const clone = style.cloneNode(true) as HTMLStyleElement;
            clone.setAttribute('data-tw-fallback', 'true');
            shadow.appendChild(clone);
          } else {
            // Update existing for HMR
            const existing = shadow.querySelector(`style[data-tw-fallback="true"]`);
            if (existing && existing.textContent !== style.textContent) {
              existing.textContent = style.textContent;
            }
          }
        }
      });
    };
    
    copyDevStyles();
    
    // Watch for HMR style updates
    const observer = new MutationObserver(copyDevStyles);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
  } else {
    // In prod mode, load the extracted CSS file
    const cssUrl = window.WooCS?.css_url;
    if (cssUrl) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = cssUrl;
      shadow.appendChild(link);
    }
  }
}
