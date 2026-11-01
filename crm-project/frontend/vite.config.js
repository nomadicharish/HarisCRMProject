import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || "https://talent-aquisition-dev.web.app";

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
          // Preserve the deployed Dev API's expected origin, while local
          // targets use their own same-origin request.
          ...(apiProxyTarget.startsWith("http://127.0.0.1") || apiProxyTarget.startsWith("http://localhost")
            ? {}
            : { headers: { origin: "https://talent-aquisition-dev.web.app" } })
        }
      }
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (id.includes("firebase")) return "firebase";
            if (id.includes("react-select")) return "react-select";
            if (id.includes("react-datepicker") || id.includes("react-phone-input-2") || id.includes("libphonenumber-js")) {
              return "form-controls";
            }
            if (id.includes("@tanstack/react-query") || id.includes("axios")) return "data-client";
            return undefined;
          }
        }
      }
    }
  };
})
