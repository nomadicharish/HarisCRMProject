import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        // Dev Firebase authentication is paired with the deployed Dev API by
        // default. Set VITE_API_PROXY_TARGET=http://127.0.0.1:5000 only when
        // the local backend has Dev Firebase credentials configured.
        target: process.env.VITE_API_PROXY_TARGET || "https://talent-aquisition-dev.web.app",
        changeOrigin: true,
        headers: {
          origin: "https://talent-aquisition-dev.web.app"
        }
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
})
